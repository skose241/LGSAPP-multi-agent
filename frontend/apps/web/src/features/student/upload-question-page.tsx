"use client";

import { generateClientUploadId, isApiError, letterToOption, type UploadItem } from "@lgs/api";
import { lessonsQuery, meStatsQuery, questionKeys, questionMutations, studentQuestionBody, studentKeys, topicsQuery, fileMutations, type Lesson } from "@lgs/api/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, ImagePlus, Images, Loader2, Send, Trash2, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { OptionPicker } from "@/components/ui/option-picker";
import { SelectField } from "@/components/ui/select-field";
import { useMe } from "@/features/auth/use-me";
import { toProblemState } from "@/features/student/comment-node";
import { usePublicSettings } from "@/features/student/use-settings";
import { useBeforeUnload, useObjectUrl, useOnline, useQueueItems, useUploadQueue } from "@/features/upload/hooks";
import { UploadStatus } from "@/features/upload/upload-status";
import { api } from "@/lib/api/client";
import {
  QUESTION_DESCRIPTION_MAX,
  hasErrors,
  scoredSentence,
  selectableSlots,
  validateQuestionCard,
} from "@/lib/student/upload-rules";
import { cn } from "@/lib/utils";

type Phase = "editing" | "creating" | "created";

interface CardState {
  key: string;
  lessonId: number | null;
  topicId: number | null;
  option: string | undefined;
  description: string;
  phase: Phase;
  questionId: number | null;
  error: string | null;
  requestId: string;
  mineLink: boolean;
}

const MAX_CARDS = 20;
const MAX_CREATE_ATTEMPTS = 4;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(state: ProblemState): string {
  const first = Object.values(state.problem.fieldErrors).find((messages) => messages.length > 0)?.[0];
  if (state.status === 0) return "Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.";
  if (state.status >= 500) return "Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.";
  return first ?? state.problem.formError ?? state.problem.message;
}

interface PhotoCardProps {
  index: number;
  card: CardState;
  item: UploadItem<undefined> | undefined;
  lessons: Lesson[];
  minDescription: number;
  showErrors: boolean;
  disabled: boolean;
  onChange: (patch: Partial<CardState>) => void;
  onRemove: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

function PhotoCard({ index, card, item, lessons, minDescription, showErrors, disabled, onChange, onRemove, onRetry, onCancel }: PhotoCardProps) {
  const previewUrl = useObjectUrl(item?.previewBlob ?? null);
  const topics = useQuery(topicsQuery(api(), card.lessonId ?? undefined));
  const textId = useId();
  const number = index + 1;
  const errors = validateQuestionCard({ lessonId: card.lessonId, option: card.option, description: card.description }, minDescription);
  const visibleErrors = showErrors ? errors : {};
  const length = card.description.trim().length;

  if (card.phase === "created") {
    return (
      <li data-testid="upload-card" data-phase="created" className="flex items-center gap-3 rounded-lg border border-success bg-success-soft p-3 text-success-soft-foreground">
        {previewUrl ? <img src={previewUrl} alt="" className="size-16 rounded-md object-cover" /> : null}
        <div className="flex-1 text-sm">
          <p className="font-semibold">Fotoğraf {number} yüklendi</p>
          {card.questionId ? (
            <Link href={`/sorular/${card.questionId}`} className="font-semibold underline">
              Soruyu aç
            </Link>
          ) : (
            <p>Bu soru daha önce yüklenmiş görünüyor. Sorularım sayfasından kontrol edebilirsin.</p>
          )}
        </div>
        <CheckCircle2 className="size-6 shrink-0" aria-hidden="true" />
      </li>
    );
  }

  const locked = disabled || card.phase === "creating";

  return (
    <li data-testid="upload-card" data-phase={card.phase} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm md:flex-row">
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
            {card.mineLink ? (
              <>
                {" "}
                <Link href="/sorularim" className="underline">
                  Sorularım
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Ders"
            required
            value={card.lessonId ?? ""}
            disabled={locked}
            error={visibleErrors.lesson}
            onChange={(event) => onChange({ lessonId: event.target.value ? Number(event.target.value) : null, topicId: null })}
          >
            <option value="">Ders seç</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Konu (isteğe bağlı)"
            value={card.topicId ?? ""}
            disabled={locked || card.lessonId === null || topics.isPending}
            onChange={(event) => onChange({ topicId: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">Konu seç</option>
            {(topics.data ?? []).map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">
            Doğru cevap
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          </p>
          <OptionPicker value={card.option} onValueChange={(option) => onChange({ option })} disabled={locked} label={`Fotoğraf ${number} için doğru cevap`} />
          {visibleErrors.option ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {visibleErrors.option}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={textId} className="text-sm font-semibold">
            Nerede takıldın?
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          </label>
          <textarea
            id={textId}
            value={card.description}
            disabled={locked}
            onChange={(event) => onChange({ description: event.target.value })}
            aria-invalid={Boolean(visibleErrors.description) || undefined}
            aria-describedby={`${textId}-hint`}
            placeholder="Soruyu çözerken nerede takıldığını, neyi anlamadığını yaz."
            className="min-h-28 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary disabled:bg-surface-muted aria-invalid:border-danger aria-invalid:bg-danger-soft"
          />
          <p
            id={`${textId}-hint`}
            data-testid="description-counter"
            className={cn("text-xs", length < minDescription || length > QUESTION_DESCRIPTION_MAX ? "font-semibold text-warning-soft-foreground" : "text-muted-foreground")}
          >
            {length} / en az {minDescription}, en fazla {QUESTION_DESCRIPTION_MAX} karakter
          </p>
          {visibleErrors.description ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {visibleErrors.description}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function UploadQuestionPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const settings = usePublicSettings();
  const lessons = useQuery(lessonsQuery(api()));
  const stats = useQuery(meStatsQuery(api()));
  const queue = useUploadQueue<undefined>();
  const items = useQueueItems(queue);
  const online = useOnline();
  const inputId = useId();

  const [cards, setCards] = useState<CardState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<{ seconds: number; token: number } | null>(null);
  const cooldownLeft = useCountdown(cooldown?.seconds, cooldown?.token);
  const mounted = useRef(true);
  const cardsRef = useRef<CardState[]>([]);
  cardsRef.current = cards;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const upload = stats.data?.uploadToday;
  const limit = upload?.dailyLimit;
  const used = upload?.uploaded;
  const remaining = upload ? upload.remaining : null;
  const scored = scoredSentence(upload);
  const pendingCards = cards.filter((card) => card.phase !== "created").length;
  const slots = selectableSlots(remaining, pendingCards, MAX_CARDS);
  const uploading = items.some((item) => item.status === "queued" || item.status === "preparing" || item.status === "uploading" || item.status === "waiting");
  const editing = cards.filter((card) => card.phase === "editing");
  const createdCount = cards.length - pendingCards;

  useBeforeUnload(uploading || submitting);

  function patchCard(key: string, patch: Partial<CardState>) {
    setCards((current) => current.map((card) => (card.key === key ? { ...card, ...patch } : card)));
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setNotice(null);
    setLimitMessage(null);

    const accepted = files.slice(0, slots);
    if (accepted.length < files.length) {
      setNotice(
        slots === 0
          ? "Bugün için soru yükleme hakkın doldu."
          : `En fazla ${slots} fotoğraf daha ekleyebilirsin. ${files.length - accepted.length} fotoğraf eklenmedi.`,
      );
    }

    const last = cards[cards.length - 1];
    const fresh: CardState[] = accepted.map((file) => ({
      key: queue.add(file, "QuestionImage", undefined),
      lessonId: last?.lessonId ?? null,
      topicId: last?.topicId ?? null,
      option: undefined,
      description: "",
      phase: "editing",
      questionId: null,
      error: null,
      requestId: generateClientUploadId(),
      mineLink: false,
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

  async function createOne(card: CardState, fileId: number): Promise<{ ok: true; id: number } | { ok: false; state: ProblemState; stop: boolean }> {
    const body = studentQuestionBody({
      lessonId: card.lessonId ?? 0,
      topicId: card.topicId,
      imageFileId: fileId,
      correctOption: card.option ? (letterToOption(card.option) ?? 0) : 0,
      description: card.description.trim(),
      clientRequestId: card.requestId,
    });
    for (let attempt = 1; ; attempt += 1) {
      try {
        const created = await questionMutations.create(api(), body);
        return { ok: true, id: created.id };
      } catch (error) {
        const state = toProblemState(error);
        const retryAfter = state.problem.retryAfter;
        if (isApiError(error) && error.status === 429 && retryAfter !== null && attempt < MAX_CREATE_ATTEMPTS && mounted.current) {
          setCooldown({ seconds: retryAfter, token: Date.now() });
          await wait(retryAfter * 1000);
          setCooldown(null);
          continue;
        }
        const uncertain = state.status === 0 || state.status >= 500;
        return { ok: false, state, stop: uncertain || state.status === 429 };
      }
    }
  }

  async function submit() {
    setSubmitting(true);
    setShowErrors(true);
    setNotice(null);
    setLimitMessage(null);

    const minDescription = settings.data?.aciklamaMinKarakter ?? 20;
    let created = 0;
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
      const problems = validateQuestionCard({ lessonId: card.lessonId, option: card.option, description: card.description }, minDescription);
      if (!item || item.status !== "done" || !item.result || hasErrors(problems)) {
        skipped += 1;
        continue;
      }

      patchCard(card.key, { phase: "creating", error: null });
      const outcome = await createOne(card, item.result.id);
      if (!mounted.current) break;

      if (outcome.ok) {
        created += 1;
        patchCard(card.key, { phase: "created", questionId: outcome.id, error: null });
        continue;
      }

      failed += 1;
      const duplicate = outcome.state.status === 409;
      const message = duplicate ? "Bu fotoğrafla bir soru zaten oluşturulmuş olabilir. Sorularım sayfasından kontrol et." : errorText(outcome.state);
      patchCard(card.key, { phase: "editing", error: message, mineLink: duplicate });
      if (outcome.stop) {
        stopped = true;
        if (outcome.state.status === 429) setLimitMessage(message);
      }
    }

    if (!mounted.current) return;
    setSubmitting(false);
    setCooldown(null);

    if (created > 0) {
      toast.success(created === 1 ? "Soru yüklendi." : `${created} soru yüklendi.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: questionKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.stats }),
      ]);
    }
    if (skipped > 0) {
      setNotice(`${skipped} fotoğraf gönderilmedi. Eksik bilgileri tamamlayıp ya da yüklemesi bitince tekrar gönder.`);
    } else if (failed > 0) {
      setNotice(`${failed} fotoğraf gönderilemedi. Kartlardaki uyarıları kontrol edip tekrar gönder.`);
    }
  }

  if (me.data && me.data.role !== "ogrenci") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl">Soru Yükle</h1>
        <EmptyState icon={ImagePlus} as="h2" title="Bu sayfa öğrenciler için" description="Öğretmenler havuza soru eklemeyi kendi menüsünden yapar." />
      </div>
    );
  }

  const minDescription = settings.data?.aciklamaMinKarakter ?? 20;
  const quotaKnown = upload !== undefined;
  const pendingUploads = items.filter((item) => item.status === "queued" || item.status === "preparing" || item.status === "uploading" || item.status === "waiting").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Soru Yükle</h1>
          <p className="text-muted-foreground">Çözemediğin sorunun fotoğrafını yükle, doğru cevabı seç ve nerede takıldığını anlat.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/sorularim">
            <Images aria-hidden="true" />
            Sorularım
          </Link>
        </Button>
      </div>

      {!online ? (
        <div role="status" data-testid="offline-banner" className="flex items-start gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground">
          <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          Çevrimdışısın. Bağlantı gelince başarısız olan yüklemeler için Tekrar dene düğmesini kullanabilirsin.
        </div>
      ) : null}

      <div role="status" data-testid="quota" className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
        {quotaKnown ? (
          <>
            <p>
              Bugün <strong>{used}</strong> / {limit} soru yükledin.{" "}
              <strong data-testid="quota-remaining">{remaining}</strong> hakkın kaldı.
            </p>
            {scored ? (
              <p className="mt-1 text-muted-foreground" data-testid="quota-scored">
                {scored}
              </p>
            ) : null}
          </>
        ) : stats.isError ? (
          <p className="text-muted-foreground">Günlük hakkın şu an gösterilemiyor.</p>
        ) : (
          <p className="text-muted-foreground">Günlük hakkın yükleniyor.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input id={inputId} type="file" accept="image/*" multiple className="peer sr-only" onChange={onFiles} disabled={slots === 0 || submitting} data-testid="photo-input" />
        <label
          htmlFor={inputId}
          className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong bg-surface px-4 py-6 text-center hover:bg-surface-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
        >
          <ImagePlus className="size-7 text-primary" aria-hidden="true" />
          <span className="text-base font-semibold">Fotoğraf seç</span>
          <span className="text-sm text-muted-foreground">Birden fazla fotoğrafı bir seferde seçebilirsin. En fazla {slots} fotoğraf daha ekleyebilirsin.</span>
        </label>
      </div>

      {notice ? (
        <p role="status" data-testid="upload-notice" className="rounded-md border border-info bg-info-soft p-3 text-sm font-medium text-info-soft-foreground">
          {notice}
        </p>
      ) : null}
      {limitMessage ? (
        <p role="alert" data-testid="limit-message" className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground">
          {limitMessage}
        </p>
      ) : null}
      {cooldownLeft > 0 ? (
        <p role="status" data-testid="cooldown" className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground">
          Çok hızlı gönderiyorsun. {cooldownLeft} saniye sonra kalan sorular gönderilecek.
        </p>
      ) : null}

      {cards.length === 0 ? (
        lessons.isError ? (
          <EmptyState icon={CloudOff} as="h2" title="Dersler yüklenemedi" description={lessons.error.message} action={<Button onClick={() => lessons.refetch()}>Tekrar Dene</Button>} />
        ) : (
          <EmptyState icon={Images} as="h2" title="Henüz fotoğraf seçmedin" description="Yukarıdan bir ya da birkaç fotoğraf seç. Her fotoğraf ayrı bir soru olarak yüklenir." />
        )
      ) : (
        <section aria-label="Yüklenecek sorular" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl">Yüklenecek sorular ({cards.length})</h2>
            {createdCount > 0 ? (
              <Button type="button" variant="ghost" onClick={clearCreated}>
                Yüklenenleri temizle
              </Button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-4" aria-label="Seçilen fotoğraflar">
            {cards.map((card, index) => (
              <PhotoCard
                key={card.key}
                index={index}
                card={card}
                item={items.find((item) => item.id === card.key)}
                lessons={lessons.data ?? []}
                minDescription={minDescription}
                showErrors={showErrors}
                disabled={submitting}
                onChange={(patch) => patchCard(card.key, { ...patch, error: null, mineLink: false, requestId: generateClientUploadId() })}
                onRemove={() => removeCard(card)}
                onRetry={() => queue.retry(card.key)}
                onCancel={() => queue.cancel(card.key)}
              />
            ))}
          </ul>

          {editing.length > 0 ? (
            <div className="flex flex-col gap-2 max-lg:sticky max-lg:bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+0.5rem)] max-lg:z-10 max-lg:rounded-lg max-lg:border max-lg:border-border max-lg:bg-surface max-lg:p-3 max-lg:shadow-md">
              {uploading ? (
                <p role="status" className="text-sm text-muted-foreground" data-testid="pending-uploads">
                  {pendingUploads} fotoğraf yükleniyor, bitince gönderebilirsin.
                </p>
              ) : null}
              <Button type="button" size="lg" onClick={submit} loading={submitting} disabled={uploading || submitting} data-testid="submit-questions">
                <Send aria-hidden="true" />
                {editing.length === 1 ? "Soruyu gönder" : `${editing.length} soruyu gönder`}
              </Button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
