"use client";

import { generateClientUploadId, isApiError, letterToOption, type UploadItem, type UploadPurpose } from "@lgs/api";
import { fileMutations, topicsQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, Images, Loader2, Send, Trash2, WifiOff } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { OptionPicker } from "@/components/ui/option-picker";
import { SelectField } from "@/components/ui/select-field";
import { toProblemState } from "@/features/student/comment-node";
import { useBeforeUnload, useObjectUrl, useOnline, useQueueItems, useUploadQueue } from "@/features/upload/hooks";
import { UploadStatus } from "@/features/upload/upload-status";
import { api } from "@/lib/api/client";
import { CARD_DESCRIPTION_MAX, cardsSelectable, validateComposerCard } from "@/lib/teacher/composer";

type Phase = "editing" | "creating" | "created";

interface CardState {
  key: string;
  topicId: number | null;
  option: string | undefined;
  description: string;
  phase: Phase;
  resultId: number | null;
  error: string | null;
  note: string | null;
  repeated: boolean;
  requestId: string;
  uncertain: CardValues | null;
}

interface CardValues {
  topicId: number | null;
  option: string | undefined;
  description: string;
}

type SendOutcome =
  | { ok: true; id: number | null; repeated: boolean; note: string | null }
  | { ok: false; state: ProblemState; message: string; stop: boolean; uncertain: CardValues | null };

export interface ComposerSubmitInput {
  fileId: number;
  topicId: number | null;
  correctOption: number;
  description: string;
  requestId: string;
}

export type ComposerSubmitResult = { ok: true; id: number | null; alreadyPresent?: boolean } | { ok: false; state: ProblemState; message?: string };

interface ComposerProps {
  lessonId: number;
  purpose: UploadPurpose;
  maxCards: number;
  disabled?: boolean;
  submitCard: (input: ComposerSubmitInput) => Promise<ComposerSubmitResult>;
  onCreated: (count: number) => void | Promise<void>;
  validateExtra?: () => string | null;
  footerSlot?: ReactNode;
  successLabel: (count: number) => string;
  repeatLabel?: (count: number) => string;
  reconcileCard?: (id: number, input: ComposerSubmitInput) => Promise<ComposerSubmitResult>;
  onDiscard?: (count: number) => void;
  createdNote?: (id: number | null) => ReactNode;
}

const MAX_ATTEMPTS = 4;

const UNCERTAIN_NOTE_EDITED = "Önceki gönderimin sonucu belirsiz. Gönderirken önce önceki gönderim aynı bilgilerle kesinleştirilir, ardından yaptığın değişiklik uygulanır.";
const UNCERTAIN_NOTE_EDITED_NO_RECONCILE = "Önceki gönderimin sonucu belirsiz. Gönderirken önce önceki gönderim aynı bilgilerle kesinleştirilir. Yaptığın değişiklik uygulanmaz; gerekirse soruyu sonradan düzenleyebilirsin.";
const UNCERTAIN_NOTE_PLAIN = "Önceki gönderimin sonucu belirsiz. Tekrar göndermek aynı soruyu ikinci kez oluşturmaz.";
const DIVERGED_NOTE = "Önceki gönderim tamamlanmıştı; sonradan yaptığın değişiklik uygulanmadı. Gerekirse soruyu açıp düzenle.";

function sameValues(a: CardValues, b: CardValues): boolean {
  return a.topicId === b.topicId && a.option === b.option && a.description.trim() === b.description.trim();
}

function toInput(values: CardValues, fileId: number, requestId: string): ComposerSubmitInput {
  return {
    fileId,
    topicId: values.topicId,
    correctOption: values.option ? (letterToOption(values.option) ?? 0) : 0,
    description: values.description.trim(),
    requestId,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function composerErrorText(state: ProblemState): string {
  const first = Object.values(state.problem.fieldErrors).find((messages) => messages.length > 0)?.[0];
  if (state.status === 0) return "Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.";
  if (state.status >= 500) return "Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.";
  return first ?? state.problem.formError ?? state.problem.message;
}

interface CardViewProps {
  index: number;
  card: CardState;
  item: UploadItem<undefined> | undefined;
  topics: { id: number; name: string }[];
  topicsLoading: boolean;
  showErrors: boolean;
  disabled: boolean;
  createdNote?: (id: number | null) => ReactNode;
  reconcilable: boolean;
  onChange: (patch: Partial<CardState>) => void;
  onRemove: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

function CardView({ index, card, item, topics, topicsLoading, showErrors, disabled, createdNote, reconcilable, onChange, onRemove, onRetry, onCancel }: CardViewProps) {
  const previewUrl = useObjectUrl(item?.previewBlob ?? null);
  const textId = useId();
  const number = index + 1;
  const errors = validateComposerCard({ option: card.option, description: card.description });
  const visible = showErrors ? errors : {};

  if (card.phase === "created") {
    return (
      <li data-testid="composer-card" data-phase="created" className="flex items-center gap-3 rounded-lg border border-success bg-success-soft p-3 text-success-soft-foreground">
        {previewUrl ? <img src={previewUrl} alt="" className="size-16 rounded-md object-cover" /> : null}
        <div className="flex-1 text-sm">
          <p className="font-semibold">Fotoğraf {number} eklendi</p>
          {card.repeated ? <p data-testid="card-repeated">Bu fotoğraf ödevde zaten vardı, tekrar eklenmedi.</p> : null}
          {card.note ? (
            <p role="status" data-testid="card-note" className="font-medium">
              {card.note}
            </p>
          ) : null}
          {createdNote ? createdNote(card.resultId) : null}
        </div>
        <CheckCircle2 className="size-6 shrink-0" aria-hidden="true" />
      </li>
    );
  }

  const locked = disabled || card.phase === "creating";

  return (
    <li data-testid="composer-card" data-phase={card.phase} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm md:flex-row">
      <div className="flex flex-col gap-3 md:w-56 md:shrink-0">
        {previewUrl ? (
          <img src={previewUrl} alt={`Fotoğraf ${number} önizlemesi`} className="aspect-[4/3] w-full rounded-md border border-border bg-surface-muted object-cover" />
        ) : (
          <div role="img" aria-label={`Fotoğraf ${number} hazırlanıyor`} className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground">
            <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          </div>
        )}
        {item ? <UploadStatus item={item} label={`Fotoğraf ${number}`} onRetry={onRetry} onCancel={onCancel} /> : null}
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg">Fotoğraf {number}</h3>
          <Button type="button" variant="secondary" className="h-11" onClick={onRemove} disabled={card.phase === "creating"} aria-label={`Fotoğraf ${number} kaldır`} data-testid="card-remove">
            <Trash2 aria-hidden="true" />
            Kaldır
          </Button>
        </div>

        {card.error ? (
          <p role="alert" data-testid="card-error" className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger-soft-foreground">
            {card.error}
          </p>
        ) : null}

        {card.uncertain ? (
          <p role="status" data-testid="card-uncertain" className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground">
            {sameValues(card.uncertain, card) ? UNCERTAIN_NOTE_PLAIN : reconcilable ? UNCERTAIN_NOTE_EDITED : UNCERTAIN_NOTE_EDITED_NO_RECONCILE}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">
            Doğru cevap
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          </p>
          <OptionPicker value={card.option} onValueChange={(option) => onChange({ option })} disabled={locked} label={`Fotoğraf ${number} için doğru cevap`} />
          {visible.option ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {visible.option}
            </p>
          ) : null}
        </div>

        <SelectField
          label="Konu (isteğe bağlı)"
          value={card.topicId ?? ""}
          disabled={locked || topicsLoading}
          onChange={(event) => onChange({ topicId: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">Konu seç</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={textId} className="text-sm font-semibold">
            Açıklama (isteğe bağlı)
          </label>
          <textarea
            id={textId}
            value={card.description}
            disabled={locked}
            maxLength={CARD_DESCRIPTION_MAX + 200}
            onChange={(event) => onChange({ description: event.target.value })}
            aria-invalid={Boolean(visible.description) || undefined}
            className="min-h-20 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary disabled:bg-surface-muted aria-invalid:border-danger aria-invalid:bg-danger-soft"
          />
          {visible.description ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {visible.description}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function PhotoQuestionComposer({ lessonId, purpose, maxCards, disabled = false, submitCard, onCreated, validateExtra, footerSlot, successLabel, repeatLabel, reconcileCard, onDiscard, createdNote }: ComposerProps) {
  const queue = useUploadQueue<undefined>();
  const items = useQueueItems(queue);
  const online = useOnline();
  const inputId = useId();
  const topics = useQuery(topicsQuery(api(), lessonId));

  const [cards, setCards] = useState<CardState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<{ seconds: number; token: number } | null>(null);
  const cooldownLeft = useCountdown(cooldown?.seconds, cooldown?.token);
  const mounted = useRef(true);
  const cardsRef = useRef<CardState[]>([]);
  cardsRef.current = cards;
  const lessonRef = useRef(lessonId);

  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const dropped = cardsRef.current.filter((card) => card.phase === "editing");
      if (dropped.length === 0) return;
      for (const card of dropped) {
        if (card.uncertain) continue;
        const result = queue.getSnapshot().find((entry) => entry.id === card.key)?.result;
        if (result) void fileMutations.remove(api(), result.id).catch(() => null);
      }
      onDiscardRef.current?.(dropped.length);
    };
  }, [queue]);

  useEffect(() => {
    if (lessonRef.current === lessonId) return;
    lessonRef.current = lessonId;
    setCards((current) => current.map((card) => (card.phase === "created" ? card : { ...card, topicId: null })));
  }, [lessonId]);

  const pending = cards.filter((card) => card.phase !== "created").length;
  const slots = cardsSelectable(pending, maxCards);
  const uploadingCount = items.filter((item) => item.status === "queued" || item.status === "preparing" || item.status === "uploading" || item.status === "waiting").length;
  const uploading = uploadingCount > 0;
  const editing = cards.filter((card) => card.phase === "editing");
  const createdCount = cards.length - pending;

  useBeforeUnload(uploading || submitting);

  function patchCard(key: string, patch: Partial<CardState>) {
    setCards((current) => current.map((card) => (card.key === key ? { ...card, ...patch } : card)));
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setNotice(null);
    const accepted = files.slice(0, slots);
    if (accepted.length < files.length) {
      setNotice(slots === 0 ? `Aynı anda en fazla ${maxCards} fotoğraf hazırlanabilir.` : `En fazla ${slots} fotoğraf daha ekleyebilirsin. ${files.length - accepted.length} fotoğraf eklenmedi.`);
    }
    const last = cards[cards.length - 1];
    const fresh: CardState[] = accepted.map((file) => ({
      key: queue.add(file, purpose, undefined),
      topicId: last?.topicId ?? null,
      option: undefined,
      description: "",
      phase: "editing",
      resultId: null,
      error: null,
      note: null,
      repeated: false,
      requestId: generateClientUploadId(),
      uncertain: null,
    }));
    setCards((current) => [...current, ...fresh]);
  }

  function removeCard(card: CardState) {
    const removed = queue.remove(card.key);
    if (removed?.result && card.phase !== "created") void fileMutations.remove(api(), removed.result.id).catch(() => null);
    setCards((current) => current.filter((entry) => entry.key !== card.key));
  }

  function clearCreated() {
    for (const card of cardsRef.current) {
      if (card.phase === "created") queue.remove(card.key);
    }
    setCards((current) => current.filter((card) => card.phase !== "created"));
  }

  async function sendOne(card: CardState, fileId: number): Promise<SendOutcome> {
    const current: CardValues = { topicId: card.topicId, option: card.option, description: card.description };
    const sent = card.uncertain ?? current;
    const input = toInput(sent, fileId, card.requestId);
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await submitCard(input);
      if (outcome.ok) return finishSend(outcome, sent, current, fileId, card.requestId);
      const retryAfter = outcome.state.problem.retryAfter;
      if (outcome.state.status === 429 && retryAfter !== null && attempt < MAX_ATTEMPTS && mounted.current) {
        setCooldown({ seconds: retryAfter, token: Date.now() });
        await wait(retryAfter * 1000);
        setCooldown(null);
        continue;
      }
      const uncertain = outcome.state.status === 0 || outcome.state.status >= 500;
      return { ok: false, state: outcome.state, message: outcome.message ?? composerErrorText(outcome.state), stop: uncertain || outcome.state.status === 429, uncertain: uncertain ? sent : null };
    }
  }

  async function finishSend(outcome: { id: number | null; alreadyPresent?: boolean }, sent: CardValues, current: CardValues, fileId: number, requestId: string): Promise<SendOutcome> {
    const base = { ok: true as const, id: outcome.id, repeated: outcome.alreadyPresent === true };
    if (sameValues(sent, current)) return { ...base, note: null };
    if (!reconcileCard || outcome.id === null) return { ...base, note: DIVERGED_NOTE };
    const fix = await reconcileCard(outcome.id, toInput(current, fileId, requestId));
    if (fix.ok) return { ...base, note: null };
    const reason = fix.message ?? composerErrorText(fix.state);
    return { ...base, note: `Soru eklendi ancak son düzenlemen uygulanamadı: ${reason}` };
  }

  async function submit() {
    setSubmitting(true);
    setShowErrors(true);
    setNotice(null);

    const extra = validateExtra ? validateExtra() : null;
    if (extra) {
      setNotice(extra);
      setSubmitting(false);
      return;
    }

    let created = 0;
    let repeated = 0;
    let skipped = 0;
    let failed = 0;
    let stopped = false;

    for (const card of cardsRef.current.filter((entry) => entry.phase === "editing")) {
      if (!mounted.current) break;
      if (stopped) {
        skipped += 1;
        continue;
      }
      const item = queue.getSnapshot().find((entry) => entry.id === card.key);
      const problems = validateComposerCard({ option: card.option, description: card.description });
      if (!item || item.status !== "done" || !item.result || Object.keys(problems).length > 0) {
        skipped += 1;
        continue;
      }

      patchCard(card.key, { phase: "creating", error: null });
      const outcome = await sendOne(card, item.result.id);
      if (!mounted.current) break;

      if (outcome.ok) {
        if (outcome.repeated) repeated += 1;
        else created += 1;
        patchCard(card.key, { phase: "created", resultId: outcome.id, error: null, note: outcome.note, repeated: outcome.repeated, uncertain: null });
        continue;
      }

      failed += 1;
      patchCard(card.key, {
        phase: "editing",
        error: outcome.message,
        uncertain: outcome.uncertain,
        requestId: outcome.uncertain || outcome.state.status === 429 ? card.requestId : generateClientUploadId(),
      });
      if (outcome.stop) stopped = true;
    }

    if (!mounted.current) return;
    setSubmitting(false);
    setCooldown(null);

    if (created > 0) toast.success(successLabel(created));
    if (repeated > 0) toast.info(repeatLabel ? repeatLabel(repeated) : repeated === 1 ? "Bu fotoğraf zaten eklenmişti, tekrar eklenmedi." : `${repeated} fotoğraf zaten eklenmişti, tekrar eklenmedi.`);
    if (created + repeated > 0) await onCreated(created + repeated);
    if (skipped > 0) {
      setNotice(`${skipped} fotoğraf gönderilmedi. Eksik bilgileri tamamlayıp ya da yüklemesi bitince tekrar gönder.`);
    } else if (failed > 0) {
      setNotice(`${failed} fotoğraf gönderilemedi. Kartlardaki uyarıları kontrol edip tekrar gönder.`);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="photo-composer">
      {!online ? (
        <div role="status" data-testid="offline-banner" className="flex items-start gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground">
          <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          Çevrimdışısın. Bağlantı gelince başarısız olan yüklemeler için Tekrar dene düğmesini kullanabilirsin.
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <input id={inputId} type="file" accept="image/*" multiple className="peer sr-only" onChange={onFiles} disabled={slots === 0 || submitting || disabled} data-testid="photo-input" />
        <label
          htmlFor={inputId}
          className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong bg-surface px-4 py-6 text-center hover:bg-surface-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
        >
          <ImagePlus className="size-7 text-primary" aria-hidden="true" />
          <span className="text-base font-semibold">Fotoğraf seç</span>
          <span className="text-sm text-muted-foreground">Birden fazla fotoğrafı bir seferde seçebilirsin. Her fotoğraf ayrı bir soru olur. En fazla {slots} fotoğraf daha ekleyebilirsin.</span>
        </label>
      </div>

      {notice ? (
        <p role="status" data-testid="composer-notice" className="rounded-md border border-info bg-info-soft p-3 text-sm font-medium text-info-soft-foreground">
          {notice}
        </p>
      ) : null}
      {cooldownLeft > 0 ? (
        <p role="status" data-testid="cooldown" className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground">
          Çok hızlı gönderiyorsun. {cooldownLeft} saniye sonra kalan sorular gönderilecek.
        </p>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState icon={Images} as="h3" title="Henüz fotoğraf seçmedin" description="Yukarıdan bir ya da birkaç fotoğraf seç. Her fotoğraf için doğru şıkkı işaretle." />
      ) : (
        <section aria-label="Eklenecek sorular" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg">Eklenecek sorular ({cards.length})</h3>
            {createdCount > 0 ? (
              <Button type="button" variant="ghost" onClick={clearCreated}>
                Eklenenleri temizle
              </Button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-4" aria-label="Seçilen fotoğraflar">
            {cards.map((card, index) => (
              <CardView
                key={card.key}
                index={index}
                card={card}
                item={items.find((item) => item.id === card.key)}
                topics={topics.data ?? []}
                topicsLoading={topics.isPending}
                showErrors={showErrors}
                disabled={submitting || disabled}
                createdNote={createdNote}
                reconcilable={Boolean(reconcileCard)}
                onChange={(patch) => patchCard(card.key, { ...patch, error: null })}
                onRemove={() => removeCard(card)}
                onRetry={() => queue.retry(card.key)}
                onCancel={() => queue.cancel(card.key)}
              />
            ))}
          </ul>

          {editing.length > 0 ? (
            <div className="flex flex-col gap-3 max-lg:sticky max-lg:bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+0.5rem)] max-lg:z-10 max-lg:rounded-lg max-lg:border max-lg:border-border max-lg:bg-surface max-lg:p-3 max-lg:shadow-md">
              {footerSlot}
              {uploading ? (
                <p role="status" className="text-sm text-muted-foreground" data-testid="pending-uploads">
                  {uploadingCount} fotoğraf yükleniyor, bitince gönderebilirsin.
                </p>
              ) : null}
              <Button type="button" size="lg" onClick={submit} loading={submitting} disabled={uploading || submitting || disabled} data-testid="composer-submit">
                <Send aria-hidden="true" />
                {editing.length === 1 ? "Soruyu ekle" : `${editing.length} soruyu ekle`}
              </Button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

export function toComposerFailure(error: unknown): ComposerSubmitResult {
  return { ok: false, state: toProblemState(error) };
}

export function isConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409;
}
