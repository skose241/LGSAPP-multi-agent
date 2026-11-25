"use client";

import { ChevronLeft, ChevronRight, FileText, Hand, ImagePlus, Loader2, Merge, MousePointer2, Plus, RotateCw, Scissors, Send, Trash2, Undo2, ZoomIn, ZoomOut, ListChecks } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { OptionPicker } from "@/components/ui/option-picker";
import { Button } from "@/components/ui/button";
import { useBeforeUnload } from "@/features/upload/hooks";
import type { ComposerCardInfo, ComposerHandle, ComposerIncoming } from "@/features/upload/photo-question-composer";
import { loadDraft, saveDraft, type DraftStorage } from "@/lib/page-split/draft-store";
import { displayedSize, mergeRects, rotateBy, unrotateRect, type Rect, type Rotation } from "@/lib/page-split/geometry";
import { mergeKeyPages, type KeySection } from "@/lib/page-split/answer-key-detect";
import { acceptSuggestions, applyAnswers, applySectionKeys, boxLabel, canMerge, confirmedBoxes, cropFileName, newBoxId, numberingOf, pendingBoxes, readingOrder, rejectSuggestions, suggestedBoxes, type SplitBox } from "@/lib/page-split/model";
import { SourceError, type PageSource } from "@/lib/page-split/sources";
import { applyDetections } from "@/lib/page-split/suggest";
import { badgeFor, type PageDetection } from "@/lib/page-split/text-detect";
import { trimBoxRect } from "@/lib/page-split/trim-render";
import { AnswerKeyDialog } from "./answer-key-dialog";
import { AutoDetectPanel, type KeySuggestion } from "./auto-detect-panel";
import { BoxList } from "./box-list";
import { PageCanvas, type CanvasMode } from "./page-canvas";
import { PageStrip } from "./page-strip";
import { useAutoDetect, type AutoDetectScope } from "./use-auto-detect";
import { usePagePreview, usePageSource } from "./use-page-source";

const ZOOM_STEPS = [1, 1.5, 2, 3] as const;
const HISTORY_LIMIT = 50;
const PREVIEW_EDGE = 1800;
const LEAVE_PENDING = "Aktarılmamış çerçeveleriniz var. Sayfadan ayrılırsanız bu çalışma yarım kalabilir. Yine de ayrılmak istiyor musunuz?";
const REPLACE_PENDING = "Aktarılmamış çerçeveleriniz var. Yeni dosya seçerseniz bu çerçeveler silinir. Devam etmek istiyor musunuz?";

function browserStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

interface PageSplitterProps {
  scope: string;
  composerRef: RefObject<ComposerHandle | null>;
  cards: ComposerCardInfo[];
  disabled?: boolean;
}

export function PageSplitter({ scope, composerRef, cards, disabled = false }: PageSplitterProps) {
  const pdfInputId = useId();
  const photoInputId = useId();
  const host = usePageSource();
  const source = host.source;
  const auto = useAutoDetect(source);

  const [boxes, setBoxesState] = useState<SplitBox[]>([]);
  const [rotations, setRotations] = useState<Record<number, Rotation>>({});
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("draw");
  const [zoomIndex, setZoomIndex] = useState(0);
  const [startNumber, setStartNumber] = useState(1);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [detections, setDetections] = useState<Record<number, PageDetection>>({});
  const [keySuggestion, setKeySuggestion] = useState<KeySuggestion | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [trimming, setTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState<{ done: number; total: number } | null>(null);
  const trimAbort = useRef<AbortController | null>(null);
  const keyAnswers = useRef<KeySection[] | null>(null);

  const boxesRef = useRef<SplitBox[]>([]);
  const history = useRef<SplitBox[][]>([]);
  const createdIds = useRef(new Set<string>());
  const seenIds = useRef(new Set<string>());
  const hydrated = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      trimAbort.current?.abort();
    };
  }, []);

  const setBoxes = useCallback((next: SplitBox[]) => {
    boxesRef.current = next;
    setBoxesState(next);
  }, []);

  const commit = useCallback(
    (next: SplitBox[]) => {
      history.current = [...history.current.slice(-(HISTORY_LIMIT - 1)), boxesRef.current];
      setBoxes(next);
    },
    [setBoxes],
  );

  const rotation: Rotation = rotations[page] ?? 0;
  const pageSize = source && page < source.pageCount ? source.pageSize(page) : { width: 1, height: 1 };
  const view = displayedSize(pageSize.width, pageSize.height, rotation);
  const preview = usePagePreview(source, page, rotation, PREVIEW_EDGE);

  const confirmed = useMemo(() => confirmedBoxes(boxes), [boxes]);
  const numbering = useMemo(() => numberingOf(confirmed, startNumber), [confirmed, startNumber]);
  const everything = useMemo(() => readingOrder(boxes), [boxes]);
  const numberOf = useCallback(
    (id: string) => {
      const box = boxes.find((entry) => entry.id === id);
      if (box?.suggested) return box.detectedNumber ?? 0;
      return numbering.get(id) ?? 0;
    },
    [boxes, numbering],
  );
  const suggestions = useMemo(() => suggestedBoxes(boxes), [boxes]);
  const pending = confirmed.filter((box) => !box.transferred);
  const [slots, setSlots] = useState(0);
  const ready = Math.min(pending.length, slots);
  const transferredCount = confirmed.length - pending.length;
  const badges = useMemo(() => Object.fromEntries(Object.values(detections).flatMap((entry) => {
    const label = badgeFor(entry);
    return label ? [[entry.page, label] as const] : [];
  })), [detections]);
  const counts = useMemo(() => Array.from({ length: source?.pageCount ?? 0 }, (_, index) => boxes.filter((box) => box.page === index).length), [boxes, source]);

  useBeforeUnload(pending.length > 0, LEAVE_PENDING);

  useEffect(() => {
    setSlots(composerRef.current?.slots() ?? 0);
  }, [cards, composerRef]);

  useEffect(() => {
    if (!source || hydrated.current !== source.key) return;
    const storage = browserStorage();
    if (!storage) return;
    saveDraft(storage, scope, {
      version: 1,
      sourceKey: source.key,
      savedAt: Date.now(),
      pageCount: source.pageCount,
      boxes: boxes.map((box) => ({ ...box, transferred: createdIds.current.has(box.id) })),
      rotations,
    });
  }, [boxes, rotations, scope, source]);

  useEffect(() => {
    const present = new Map(cards.map((card) => [card.sourceKey, card.phase]));
    let changed = false;
    const next = boxesRef.current.map((box) => {
      const phase = present.get(box.id);
      if (phase === "created") createdIds.current.add(box.id);
      if (phase !== undefined) seenIds.current.add(box.id);
      if (box.transferred && phase === undefined && seenIds.current.has(box.id) && !createdIds.current.has(box.id)) {
        seenIds.current.delete(box.id);
        changed = true;
        return { ...box, transferred: false };
      }
      return box;
    });
    if (changed) setBoxes(next);
  }, [cards, setBoxes]);

  function resetWork(next: SplitBox[], nextRotations: Record<number, Rotation>) {
    history.current = [];
    createdIds.current = new Set(next.filter((box) => box.transferred).map((box) => box.id));
    seenIds.current = new Set();
    setBoxes(next);
    setRotations(nextRotations);
    setPage(0);
    setSelectedId(null);
    setZoomIndex(0);
    setProblems([]);
    setDetections({});
    setKeySuggestion(null);
    setWarning(null);
    keyAnswers.current = null;
  }

  async function adopt(opened: PageSource | null) {
    if (!opened) return;
    hydrated.current = null;
    const storage = browserStorage();
    const draft = storage ? loadDraft(storage, scope, opened.key, opened.pageCount) : null;
    if (draft && draft.boxes.length > 0) {
      resetWork(draft.boxes, draft.rotations);
      setNotice("Önceki çalışmanız geri yüklendi. Aktarılmamış çerçeveler yerinde duruyor.");
    } else {
      resetWork([], {});
      setNotice(null);
    }
    hydrated.current = opened.key;
  }

  function confirmReplace(): boolean {
    if (pending.length === 0) return true;
    return window.confirm(REPLACE_PENDING);
  }

  async function onPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!confirmReplace()) return;
    await adopt(await host.openPdf(file));
  }

  async function onPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    if (!confirmReplace()) return;
    await adopt(await host.openPhotos(files));
  }

  function addBox(rect: Rect) {
    const box: SplitBox = { id: newBoxId(), page, rect, option: undefined, transferred: false };
    commit([...boxesRef.current, box]);
    setSelectedId(box.id);
  }

  function changeBox(id: string, rect: Rect) {
    commit(boxesRef.current.map((box) => (box.id === id ? { ...box, rect } : box)));
  }

  function deleteBox(id: string) {
    commit(boxesRef.current.filter((box) => box.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  function setOption(id: string, option: string) {
    commit(boxesRef.current.map((box) => (box.id === id ? { ...box, option } : box)));
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setBoxes(previous);
    setSelectedId((current) => (current && previous.some((box) => box.id === current) ? current : null));
  }

  function selectBox(id: string | null) {
    setSelectedId(id);
    if (!id) return;
    const target = boxesRef.current.find((box) => box.id === id);
    if (target && target.page !== page) setPage(target.page);
  }

  function mergeWithNext(id: string) {
    const samePage = readingOrder(confirmedBoxes(boxesRef.current).filter((box) => box.page === page));
    const index = samePage.findIndex((box) => box.id === id);
    const first = samePage[index];
    const second = samePage[index + 1];
    if (!first || !second) return;
    if (!canMerge(first, second)) {
      setNotice("Aktarılmış çerçeveler birleştirilemez. Yalnız aktarılmamış çerçeveleri birleştirebilirsiniz.");
      return;
    }
    const merged = { ...first, rect: mergeRects(first.rect, second.rect), transferred: false };
    commit(boxesRef.current.filter((box) => box.id !== second.id).map((box) => (box.id === first.id ? merged : box)));
  }

  function rotatePage() {
    const delta = 90 as const;
    const next = rotateBy(rotation, delta);
    setRotations((current) => ({ ...current, [page]: next }));
    history.current = [];
    setBoxes(boxesRef.current.map((box) => (box.page === page ? { ...box, rect: unrotateRect(box.rect, 270) } : box)));
  }

  function applyKey(answers: Map<number, string>) {
    const result = applyAnswers(confirmedBoxes(boxesRef.current), answers, startNumber);
    const updated = new Map(result.boxes.map((box) => [box.id, box]));
    const early = new Set<number>();
    commit(
      boxesRef.current.map((box) => {
        if (!box.suggested) return updated.get(box.id) ?? box;
        const letter = box.detectedNumber === undefined ? undefined : answers.get(box.detectedNumber);
        if (!letter) return box;
        early.add(box.detectedNumber as number);
        return { ...box, option: letter };
      }),
    );
    const missing = result.unmatched.filter((number) => !early.has(number));
    const extra = missing.length > 0 ? ` Çerçevesi olmayan numaralar: ${missing.slice(0, 10).join(", ")}.` : "";
    setNotice(`${result.applied + early.size} çerçeveye cevap uygulandı.${extra}`);
  }

  async function transfer() {
    const handle = composerRef.current;
    const current = source;
    if (!handle || !current || transferring) return;
    const batch = pendingBoxes(boxesRef.current).slice(0, handle.slots());
    if (batch.length === 0) {
      setNotice("Aktarılacak çerçeve yok ya da kartlarda boş yer kalmadı. Kartları gönderince kalanları aktarabilirsiniz.");
      return;
    }
    setTransferring(true);
    setNotice(null);
    setProblems([]);
    try {
      const order = numberingOf(confirmedBoxes(boxesRef.current), startNumber);
      const entries: ComposerIncoming[] = [];
      const used: SplitBox[] = [];
      const failures: string[] = [];
      for (const box of batch) {
        if (!mounted.current) return;
        const number = order.get(box.id) ?? 0;
        try {
          const blob = await current.renderCrop(box.page, box.rect, rotations[box.page] ?? 0);
          entries.push({ file: new File([blob], cropFileName(box.page, number), { type: "image/jpeg" }), option: box.option, label: boxLabel(box, number), sourceKey: box.id });
          used.push(box);
        } catch (failure) {
          failures.push(`${boxLabel(box, number)}: ${failure instanceof SourceError ? failure.message : "Çerçeve kırpılamadı."}`);
        }
      }
      if (!mounted.current) return;
      const added = entries.length > 0 ? handle.addFiles(entries) : 0;
      const taken = new Set(used.slice(0, added).map((box) => box.id));
      history.current = [];
      setBoxes(boxesRef.current.map((box) => (taken.has(box.id) ? { ...box, transferred: true } : box)));
      setProblems(failures);
      const remaining = pendingBoxes(boxesRef.current).length;
      setNotice(added > 0 ? `${added} çerçeve kartlara aktarıldı.${remaining > 0 ? ` ${remaining} çerçeve sırada.` : ""}` : null);
    } finally {
      if (mounted.current) setTransferring(false);
    }
  }

  async function detect(scope: AutoDetectScope) {
    const outcome = await auto.run(scope, page);
    if (!outcome || !mounted.current) return;
    const result = applyDetections(boxesRef.current, outcome.detections);
    commit(result.boxes);
    setDetections((current) => ({ ...current, ...Object.fromEntries(outcome.detections.map((entry) => [entry.page, entry])) }));
    const merged = mergeKeyPages(outcome.keys.pages, outcome.scope);
    const keyPages = outcome.keys.pages.filter((entry) => entry.isKey && outcome.scope.includes(entry.page)).map((entry) => entry.page);
    if (keyPages.length > 0) {
      keyAnswers.current = merged.sections;
      setKeySuggestion({
        pages: keyPages,
        answerCount: merged.sections.reduce((sum, section) => sum + section.answers.size, 0),
        conflicts: merged.conflicts,
        sections: merged.sections.map((section) => ({ name: section.name, count: section.answers.size })),
      });
    } else {
      keyAnswers.current = null;
      setKeySuggestion(null);
    }
    const empty = outcome.detections.filter((entry) => entry.issues.some((issue) => issue.code === "noText"));
    if (empty.length > 0 && empty.length === outcome.detections.length) {
      setWarning(scope === "page" ? "Bu sayfada metin bulunamadı, çerçeveleri elle çizin." : "Bu PDF'te metin bulunamadı, çerçeveleri elle çizin.");
    } else if (empty.length > 0) {
      setWarning(`${empty.length} sayfada metin bulunamadı, bu sayfalarda çerçeveleri elle çizin.`);
    } else {
      setWarning(null);
    }
    const unreliable = outcome.detections.filter((entry) => entry.confidence === "low").length;
    const parts: string[] = [];
    if (result.added > 0) parts.push(`${result.added} çerçeve önerisi bulundu.`);
    else if (empty.length === 0 && keyPages.length === 0) parts.push("Otomatik çerçeve bulunamadı. Çerçeveleri elle çizebilirsiniz.");
    if (result.skipped > 0) parts.push(`${result.skipped} öneri mevcut çerçevelerle çakıştığı için atlandı.`);
    if (unreliable > 0) parts.push(`${unreliable} sayfada numara sırası güvenilir değil, önerileri kontrol edin.`);
    setNotice(parts.length > 0 ? parts.join(" ") : null);
  }

  function acceptAll() {
    const count = suggestedBoxes(boxesRef.current).length;
    if (count === 0) return;
    const next = acceptSuggestions(boxesRef.current);
    commit(next);
    setNotice(`${count} öneri kabul edildi. Metinden gelen çerçeveler okunan soru numarasını taşır.`);
  }

  function acceptOne(id: string) {
    const next = boxesRef.current.map((box) => (box.id === id && box.suggested ? { ...box, suggested: false } : box));
    commit(next);
  }

  function rejectAll() {
    const count = suggestedBoxes(boxesRef.current).length;
    if (count === 0) return;
    commit(rejectSuggestions(boxesRef.current));
    setSelectedId((current) => (current && boxesRef.current.some((box) => box.id === current) ? current : null));
    setNotice(`${count} öneri reddedildi.`);
  }

  function applyDetectedKey() {
    const sections = keyAnswers.current;
    if (!sections || sections.every((section) => section.answers.size === 0)) return;
    const result = applySectionKeys(boxesRef.current, sections);
    let next = result.boxes;
    let manual = 0;
    const only = sections.length === 1 ? sections[0] : undefined;
    if (only) {
      const manualBoxes = confirmedBoxes(next).filter((box) => box.source !== "text");
      if (manualBoxes.length > 0) {
        const positional = applyAnswers(manualBoxes, only.answers, startNumber);
        const byId = new Map(positional.boxes.map((box) => [box.id, box]));
        next = next.map((box) => byId.get(box.id) ?? box);
        manual = positional.applied;
      }
    }
    commit(next);
    const missing = result.unmatched
      .slice(0, 3)
      .map((entry) => `${entry.name ? `${entry.name}: ` : ""}${entry.numbers.slice(0, 6).join(", ")}`)
      .join("; ");
    setNotice(`${result.applied + manual} çerçeveye cevap uygulandı.${missing ? ` Çerçevesi olmayan numaralar: ${missing}.` : ""}`);
    setKeySuggestion(null);
    keyAnswers.current = null;
  }

  async function trim(ids: string[] | null) {
    const current = source;
    if (!current || trimming) return;
    const targets = boxesRef.current.filter((box) => !box.transferred && (ids ? ids.includes(box.id) : !box.suggested));
    if (targets.length === 0) return;
    setTrimming(true);
    setNotice(null);
    const abort = new AbortController();
    trimAbort.current = abort;
    setTrimProgress(targets.length > 1 ? { done: 0, total: targets.length } : null);
    try {
      const updates = new Map<string, Rect>();
      let failed = 0;
      let done = 0;
      for (const box of targets) {
        if (!mounted.current || abort.signal.aborted) break;
        try {
          const result = await trimBoxRect(current, box.page, box.rect, rotations[box.page] ?? 0, abort.signal);
          if (result.changed) updates.set(box.id, result.rect);
        } catch {
          if (abort.signal.aborted) break;
          failed += 1;
        }
        done += 1;
        if (mounted.current) setTrimProgress(targets.length > 1 ? { done, total: targets.length } : null);
      }
      if (!mounted.current) return;
      if (updates.size > 0) commit(boxesRef.current.map((box) => (updates.has(box.id) ? { ...box, rect: updates.get(box.id) as Rect } : box)));
      const failure = failed > 0 ? ` ${failed} çerçeve işlenemedi.` : "";
      if (abort.signal.aborted) setNotice(`İşlem iptal edildi. ${updates.size} çerçevenin kenarları sıkılaştırıldı.${failure}`);
      else setNotice(updates.size > 0 ? `${updates.size} çerçevenin kenarları sıkılaştırıldı.${failure}` : `Sıkılaştırılacak boşluk bulunamadı.${failure}`);
    } finally {
      trimAbort.current = null;
      if (mounted.current) {
        setTrimming(false);
        setTrimProgress(null);
      }
    }
  }

  function cancelTrim() {
    trimAbort.current?.abort();
  }

  const selected = boxes.find((box) => box.id === selectedId) ?? null;
  const pageBoxes = boxes.filter((box) => box.page === page).map((box) => ({ id: box.id, rect: box.rect, number: numberOf(box.id), option: box.option, transferred: box.transferred, suggested: box.suggested === true, section: box.section }));
  const listed = everything.map((box) => ({ id: box.id, number: numberOf(box.id), page: box.page, option: box.option, transferred: box.transferred, suggested: box.suggested === true, section: box.section }));
  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;
  const busy = host.status === "loading";
  const locked = disabled || transferring || trimming || auto.busy;
  const pageDetection = detections[page];
  const canDetect = source?.kind === "pdf" && typeof source.textContent === "function";

  const transferLabel = ready === 0 ? "Kartlara Aktar" : transferredCount > 0 ? `Sonraki ${ready} Çerçeveyi Aktar` : `${ready} Çerçeveyi Kartlara Aktar`;

  return (
    <div className="flex flex-col gap-4" data-testid="page-splitter">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <input id={pdfInputId} type="file" accept="application/pdf,.pdf" className="peer/pdf sr-only" onChange={onPdf} disabled={busy || locked} data-testid="split-pdf-input" />
          <label
            htmlFor={pdfInputId}
            className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-base font-semibold hover:bg-surface-muted peer-focus-visible/pdf:outline-2 peer-focus-visible/pdf:outline-offset-2 peer-focus-visible/pdf:outline-primary peer-disabled/pdf:cursor-not-allowed peer-disabled/pdf:opacity-60"
          >
            <FileText className="size-5 text-primary" aria-hidden="true" />
            PDF Seç
          </label>
          <input id={photoInputId} type="file" accept="image/*" multiple className="peer/photo sr-only" onChange={onPhotos} disabled={busy || locked} data-testid="split-photo-input" />
          <label
            htmlFor={photoInputId}
            className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-base font-semibold hover:bg-surface-muted peer-focus-visible/photo:outline-2 peer-focus-visible/photo:outline-offset-2 peer-focus-visible/photo:outline-primary peer-disabled/photo:cursor-not-allowed peer-disabled/photo:opacity-60"
          >
            <ImagePlus className="size-5 text-primary" aria-hidden="true" />
            Sayfa Fotoğrafları Seç
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          PDF en fazla 60 sayfa ve 50 MB, fotoğraf en fazla 20 adet olabilir. Word ya da PowerPoint dosyalarını önce PDF olarak kaydedin. Her sorunun etrafına çerçeve çizin, sonra çerçeveleri soru kartlarına aktarın.
        </p>
      </div>

      {busy ? (
        <p role="status" className="flex items-center gap-2 text-sm font-medium" data-testid="split-loading">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Dosya Hazırlanıyor
        </p>
      ) : null}
      {host.error ? (
        <p role="alert" data-testid="split-error" className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger-soft-foreground">
          {host.error}
        </p>
      ) : null}
      {warning || auto.error ? (
        <p role="alert" data-testid="auto-warning" className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground">
          {auto.error ?? warning}
        </p>
      ) : null}
      {notice ? (
        <p role="status" data-testid="split-notice" className="rounded-md border border-info bg-info-soft p-3 text-sm font-medium text-info-soft-foreground">
          {notice}
        </p>
      ) : null}
      {problems.length > 0 ? (
        <ul role="alert" data-testid="split-problems" className="list-disc rounded-md border border-danger bg-danger-soft p-3 pl-7 text-sm font-medium text-danger-soft-foreground">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      {source ? (
        <div className="grid gap-4 lg:grid-cols-[7rem_minmax(0,1fr)_18rem]" data-testid="split-workspace" data-source-kind={source.kind}>
          <PageStrip source={source} current={page} rotations={rotations} counts={counts} badges={badges} onSelect={setPage} />

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Sayfa Araçları">
              <Button type="button" variant="secondary" size="icon" aria-label="Önceki Sayfa" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span className="text-sm font-semibold" data-testid="page-indicator" aria-live="polite">
                Sayfa {page + 1} / {source.pageCount}
              </span>
              <Button type="button" variant="secondary" size="icon" aria-label="Sonraki Sayfa" disabled={page >= source.pageCount - 1} onClick={() => setPage((value) => Math.min(source.pageCount - 1, value + 1))}>
                <ChevronRight aria-hidden="true" />
              </Button>
              <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
              <Button type="button" variant={mode === "draw" ? "primary" : "secondary"} aria-pressed={mode === "draw"} onClick={() => setMode("draw")} data-testid="mode-draw">
                <MousePointer2 aria-hidden="true" />
                Çiz
              </Button>
              <Button type="button" variant={mode === "pan" ? "primary" : "secondary"} aria-pressed={mode === "pan"} onClick={() => setMode("pan")} data-testid="mode-pan">
                <Hand aria-hidden="true" />
                Kaydır
              </Button>
              <Button type="button" variant="secondary" size="icon" aria-label="Uzaklaştır" disabled={zoomIndex === 0} onClick={() => setZoomIndex((value) => Math.max(0, value - 1))}>
                <ZoomOut aria-hidden="true" />
              </Button>
              <span className="text-sm font-semibold" data-testid="zoom-level">
                %{Math.round(zoom * 100)}
              </span>
              <Button type="button" variant="secondary" size="icon" aria-label="Yakınlaştır" disabled={zoomIndex >= ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((value) => Math.min(ZOOM_STEPS.length - 1, value + 1))}>
                <ZoomIn aria-hidden="true" />
              </Button>
              <Button type="button" variant="secondary" onClick={() => addBox({ x: 0.1, y: 0.1, width: 0.8, height: 0.3 })} disabled={locked} data-testid="box-add">
                <Plus aria-hidden="true" />
                Çerçeve Ekle
              </Button>
              <Button type="button" variant="secondary" onClick={undo} disabled={locked || history.current.length === 0} data-testid="box-undo">
                <Undo2 aria-hidden="true" />
                Geri Al
              </Button>
              {source.kind === "image" ? (
                <Button type="button" variant="secondary" onClick={rotatePage} disabled={locked} data-testid="page-rotate">
                  <RotateCw aria-hidden="true" />
                  Sayfayı Döndür
                </Button>
              ) : null}
            </div>

            {pageDetection && pageDetection.issues.length > 0 && !pageDetection.skipped ? (
              <div className="flex flex-col gap-1 rounded-md border border-warning bg-warning-soft p-2 text-sm text-warning-soft-foreground" data-testid="page-issues">
                <Badge tone="warning" className="self-start">
                  {badgeFor(pageDetection)}
                </Badge>
                <ul className="list-disc pl-5">
                  {pageDetection.issues.map((issue) => (
                    <li key={issue.message}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <PageCanvas
              imageUrl={preview.url}
              loading={preview.loading}
              error={preview.error}
              aspect={view.width / view.height}
              pageLabel={`Sayfa ${page + 1} önizlemesi`}
              boxes={pageBoxes}
              selectedId={selectedId}
              mode={mode}
              zoom={zoom}
              disabled={locked}
              onSelect={selectBox}
              onCreate={addBox}
              onChange={changeBox}
              onDelete={deleteBox}
              onOption={setOption}
              onUndo={undo}
            />

            {selected ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3" data-testid="selected-controls">
                <p className="text-sm font-semibold">
                  Seçili: {selected.section ?? "Soru"} {numberOf(selected.id)}
                  {selected.suggested ? " (Öneri)" : ""}
                </p>
                <OptionPicker value={selected.option} onValueChange={(option) => setOption(selected.id, option)} disabled={locked} label="Seçili Çerçevenin Doğru Cevabı" />
                <div className="flex flex-wrap gap-2">
                  {selected.suggested ? (
                    <Button type="button" onClick={() => acceptOne(selected.id)} disabled={locked} data-testid="suggestion-accept-one">
                      Bu Öneriyi Kabul Et
                    </Button>
                  ) : (
                    <Button type="button" variant="secondary" onClick={() => mergeWithNext(selected.id)} disabled={locked} data-testid="box-merge">
                      <Merge aria-hidden="true" />
                      Sonrakiyle Birleştir
                    </Button>
                  )}
                  <Button type="button" variant="secondary" onClick={() => void trim([selected.id])} loading={trimming} disabled={locked || selected.transferred} data-testid="trim-selected">
                    <Scissors aria-hidden="true" />
                    Kenarları Sıkılaştır
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => deleteBox(selected.id)} disabled={locked} data-testid="box-delete">
                    <Trash2 aria-hidden="true" />
                    Çerçeveyi Sil
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sayfada bir soru alanını sürükleyerek çerçeveleyin. Çerçeveyi seçince taşıyabilir, kenarlarından boyutlandırabilir ve A–D tuşlarıyla doğru şıkkı işaretleyebilirsiniz.</p>
            )}
          </div>

          <aside className="flex flex-col gap-3" aria-label="Çerçeve Özeti">
            {canDetect ? (
              <AutoDetectPanel
                busy={auto.busy}
                disabled={locked}
                suggestionCount={suggestions.length}
                keySuggestion={keySuggestion}
                trimming={trimming}
                trimProgress={trimProgress}
                onTrimCancel={cancelTrim}
                trimmableCount={confirmed.filter((box) => !box.transferred).length}
                onDetect={(scope) => void detect(scope)}
                onAccept={acceptAll}
                onReject={rejectAll}
                onApplyKey={applyDetectedKey}
                onDismissKey={() => setKeySuggestion(null)}
                onTrimAll={() => void trim(null)}
              />
            ) : null}
            <h3 className="text-lg">Çerçeveler ({boxes.length})</h3>
            <BoxList boxes={listed} selectedId={selectedId} disabled={locked} onSelect={selectBox} onDelete={deleteBox} />
            <Button type="button" variant="secondary" onClick={() => setAnswerOpen(true)} disabled={boxes.length === 0 || locked} data-testid="answer-key-open">
              <ListChecks aria-hidden="true" />
              Cevap Anahtarı
            </Button>
            <Button type="button" onClick={transfer} loading={transferring} disabled={ready === 0 || locked} data-testid="split-transfer">
              <Send aria-hidden="true" />
              {transferLabel}
            </Button>
            {pending.length > ready ? (
              <p className="text-sm text-muted-foreground" data-testid="split-queued">
                {pending.length - ready} çerçeve sırada. Kartlar gönderilip boşaldıkça kalanları aktarabilirsiniz.
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}

      <AnswerKeyDialog open={answerOpen} onOpenChange={setAnswerOpen} boxCount={boxes.length} startNumber={startNumber} onStartNumberChange={setStartNumber} onApply={applyKey} />
    </div>
  );
}
