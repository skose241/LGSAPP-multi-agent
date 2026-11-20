import {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_RETRY_AFTER_MS,
  DEFAULT_RETRY_DELAYS_MS,
  classifyFailure,
  generateClientUploadId,
  retryDelayMs,
  uploadProgress,
  type UploadFailure,
} from "./policy";
import {
  PrepareError,
  TransportError,
  type PrepareFn,
  type PreparedImage,
  type UploadItem,
  type UploadPurpose,
  type UploadTransport,
  type UploadedFile,
} from "./types";

export interface UploadQueueOptions {
  transport: UploadTransport;
  prepare?: PrepareFn;
  endpoint?: string;
  concurrency?: number;
  retryDelaysMs?: readonly number[];
  maxRetryAfterMs?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  newId?: () => string;
  newClientUploadId?: () => string;
  onUnauthorized?: () => void;
}

interface Entry<TMeta> {
  item: UploadItem<TMeta>;
  source: Blob;
  prepared: PreparedImage | null;
  controller: AbortController | null;
  active: boolean;
}

type Outcome = { ok: true; file: UploadedFile } | { ok: false; failure: UploadFailure };

export function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

type Listener = () => void;

function hasErrorCode(body: unknown, code: string): boolean {
  return typeof body === "object" && body !== null && (body as { code?: unknown }).code === code;
}

function isPending(status: UploadItem["status"]): boolean {
  return status === "queued" || status === "preparing" || status === "uploading" || status === "waiting";
}

export class UploadQueue<TMeta = undefined> {
  private readonly transport: UploadTransport;
  private readonly prepare: PrepareFn | undefined;
  private readonly onUnauthorized: (() => void) | undefined;
  private readonly endpoint: string;
  private readonly concurrency: number;
  private readonly retryDelays: readonly number[];
  private readonly maxRetryAfterMs: number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly newClientUploadId: () => string;

  private readonly entries = new Map<string, Entry<TMeta>>();
  private order: string[] = [];
  private snapshot: readonly UploadItem<TMeta>[] = [];
  private readonly listeners = new Set<Listener>();
  private idleWaiters: (() => void)[] = [];
  private prepareChain: Promise<unknown> = Promise.resolve();
  private counter = 0;
  private disposed = false;

  constructor(options: UploadQueueOptions) {
    this.transport = options.transport;
    this.prepare = options.prepare;
    this.onUnauthorized = options.onUnauthorized;
    this.endpoint = options.endpoint ?? "/api/files";
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
    this.retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.maxRetryAfterMs = options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? (() => `u${(this.counter += 1)}`);
    this.newClientUploadId = options.newClientUploadId ?? (() => generateClientUploadId());
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly UploadItem<TMeta>[] => this.snapshot;

  get maxAttempts(): number {
    return this.retryDelays.length + 1;
  }

  add(source: Blob & { name?: string }, purpose: UploadPurpose, meta: TMeta): string {
    const id = this.newId();
    const item: UploadItem<TMeta> = {
      id,
      clientUploadId: this.newClientUploadId(),
      purpose,
      name: source.name && source.name !== "" ? source.name : "foto.jpg",
      status: "queued",
      progress: 0,
      attempt: 0,
      maxAttempts: this.maxAttempts,
      nextRetryAt: null,
      sourceBytes: source.size,
      preparedBytes: null,
      previewBlob: null,
      result: null,
      failure: null,
      meta,
    };
    this.entries.set(id, { item, source, prepared: null, controller: null, active: false });
    this.order.push(id);
    this.publish();
    this.pump();
    return id;
  }

  retry(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.active) return false;
    if (entry.item.status !== "failed" && entry.item.status !== "cancelled") return false;
    this.patch(entry, { status: "queued", progress: 0, attempt: 0, nextRetryAt: null, failure: null });
    this.pump();
    return true;
  }

  cancel(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry || !isPending(entry.item.status)) return false;
    entry.controller?.abort();
    entry.controller = null;
    entry.active = false;
    this.patch(entry, { status: "cancelled", progress: 0, nextRetryAt: null, failure: null });
    this.pump();
    this.notifyIdle();
    return true;
  }

  remove(id: string): UploadItem<TMeta> | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    entry.controller?.abort();
    this.entries.delete(id);
    this.order = this.order.filter((value) => value !== id);
    this.publish();
    this.pump();
    this.notifyIdle();
    return entry.item;
  }

  setMeta(id: string, meta: TMeta): void {
    const entry = this.entries.get(id);
    if (entry) this.patch(entry, { meta });
  }

  isBusy(): boolean {
    for (const entry of this.entries.values()) {
      if (isPending(entry.item.status)) return true;
    }
    return false;
  }

  whenIdle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  abortAll(): void {
    for (const entry of this.entries.values()) {
      if (!isPending(entry.item.status)) continue;
      entry.controller?.abort();
      entry.controller = null;
      entry.active = false;
      this.patch(entry, { status: "cancelled", progress: 0, nextRetryAt: null, failure: null });
    }
    this.notifyIdle();
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.controller?.abort();
    this.entries.clear();
    this.order = [];
    this.listeners.clear();
    this.snapshot = [];
    this.notifyIdle();
  }

  private activeCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.active) count += 1;
    return count;
  }

  private pump(): void {
    if (this.disposed) return;
    for (const id of this.order) {
      if (this.activeCount() >= this.concurrency) return;
      const entry = this.entries.get(id);
      if (!entry || entry.active || entry.item.status !== "queued") continue;
      const controller = new AbortController();
      entry.active = true;
      entry.controller = controller;
      void this.run(entry, controller);
    }
  }

  private async run(entry: Entry<TMeta>, controller: AbortController): Promise<void> {
    const signal = controller.signal;
    try {
      if (!entry.prepared && this.prepare) {
        const prepared = await this.prepareSerially(entry, signal);
        if (signal.aborted || !prepared) return;
        entry.prepared = prepared;
        this.patch(entry, { preparedBytes: prepared.blob.size, previewBlob: prepared.previewBlob ?? null });
      }
      if (!entry.prepared) {
        entry.prepared = { blob: entry.source, width: 0, height: 0, previewBlob: null };
      }
      await this.sendWithRetry(entry, entry.prepared, signal);
    } finally {
      if (entry.controller === controller) {
        entry.active = false;
        entry.controller = null;
      }
      this.pump();
      this.notifyIdle();
    }
  }

  private prepareSerially(entry: Entry<TMeta>, signal: AbortSignal): Promise<PreparedImage | null> {
    const task = this.prepareChain.then(async (): Promise<PreparedImage | null> => {
      if (signal.aborted) return null;
      this.patch(entry, { status: "preparing", progress: 0, failure: null });
      try {
        return await this.prepare!(entry.source, { signal });
      } catch (error) {
        if (signal.aborted) return null;
        const known = error instanceof PrepareError;
        this.patch(entry, {
          status: "failed",
          failure: {
            kind: "prepare",
            status: 0,
            message: known ? error.message : "Fotoğraf hazırlanamadı. Tekrar deneyin ya da başka bir fotoğraf seçin.",
            retryable: false,
            manualRetry: !(known && (error.kind === "tooSmall" || error.kind === "tooLarge")),
            retryAfterSeconds: null,
          },
        });
        return null;
      }
    });
    this.prepareChain = task.catch(() => null);
    return task;
  }

  private async sendWithRetry(entry: Entry<TMeta>, prepared: PreparedImage, signal: AbortSignal): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      if (signal.aborted) return;
      this.patch(entry, { status: "uploading", attempt: attempt + 1, progress: 0, nextRetryAt: null });

      const outcome = await this.attemptOnce(entry, prepared, signal);
      if (signal.aborted) return;

      if (outcome.ok) {
        this.patch(entry, { status: "done", progress: 1, result: outcome.file, failure: null, nextRetryAt: null });
        return;
      }

      const failure = outcome.failure;
      if (failure.kind === "auth" && !failure.retryable) this.onUnauthorized?.();

      const wait = failure.retryable ? retryDelayMs(attempt, failure.retryAfterSeconds, this.retryDelays, this.maxRetryAfterMs) : null;
      if (wait === null) {
        this.patch(entry, { status: "failed", failure, progress: 0, nextRetryAt: null });
        return;
      }

      this.patch(entry, { status: "waiting", failure, progress: 0, nextRetryAt: this.now() + wait });
      await this.sleep(wait, signal);
    }
  }

  private async attemptOnce(entry: Entry<TMeta>, prepared: PreparedImage, signal: AbortSignal): Promise<Outcome> {
    try {
      const response = await this.transport({
        url: this.endpoint,
        fields: { purpose: entry.item.purpose, clientUploadId: entry.item.clientUploadId },
        file: prepared.blob,
        fileName: "foto.jpg",
        signal,
        onProgress: (loaded, total) => {
          if (signal.aborted || entry.item.status !== "uploading") return;
          this.patch(entry, { progress: uploadProgress(loaded, total) });
        },
      });

      if (response.status === 200 || response.status === 201) {
        return { ok: true, file: response.body as UploadedFile };
      }
      const classified = classifyFailure(
        {
          status: response.status,
          body: response.body,
          retryAfterHeader: response.retryAfter,
          sessionRefreshed: response.sessionRefreshed,
        },
        this.maxRetryAfterMs,
      );
      const emptyOnServer = response.status === 400 && prepared.blob.size > 0 && hasErrorCode(response.body, "file_empty");
      return { ok: false, failure: emptyOnServer ? { ...classified, retryable: true, manualRetry: true } : classified };
    } catch (error) {
      const kind = error instanceof TransportError && error.kind === "timeout" ? "timeout" : "network";
      return { ok: false, failure: classifyFailure({ status: 0, body: null, transport: kind }) };
    }
  }

  private patch(entry: Entry<TMeta>, changes: Partial<UploadItem<TMeta>>): void {
    if (this.disposed || this.entries.get(entry.item.id) !== entry) return;
    entry.item = { ...entry.item, ...changes };
    this.publish();
  }

  private publish(): void {
    this.snapshot = this.order.map((id) => this.entries.get(id)!.item);
    for (const listener of [...this.listeners]) listener();
  }

  private notifyIdle(): void {
    if (this.isBusy()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}
