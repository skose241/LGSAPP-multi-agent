import { describe, expect, it } from "vitest";
import { UploadQueue, type UploadQueueOptions } from "../upload/queue";
import { PrepareError, TransportError, type TransportRequest, type TransportResponse } from "../upload/types";

const FILE_VIEW = { id: 11, purpose: "questionImage", contentType: "image/jpeg", sizeBytes: 10, width: 800, height: 600, url: "u", urlExpiresAt: "2026-01-01T00:00:00Z" };

function ok(): TransportResponse {
  return { status: 201, body: FILE_VIEW, retryAfter: null, sessionRefreshed: false };
}

function fail(status: number, body: unknown = { title: "Hata", detail: "Hata" }, retryAfter: string | null = null): TransportResponse {
  return { status, body, retryAfter, sessionRefreshed: false };
}

function blob(name = "a.jpg") {
  return Object.assign(new Blob(["x".repeat(10)], { type: "image/jpeg" }), { name });
}

function build(options: Partial<UploadQueueOptions> & Pick<UploadQueueOptions, "transport">) {
  const sleeps: number[] = [];
  const queue = new UploadQueue<undefined>({
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  return { queue, sleeps };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("UploadQueue yeniden deneme", () => {
  it("503'te 1, 3, 9 sn bekleyip aynı clientUploadId ile yeniden dener", async () => {
    const calls: TransportRequest[] = [];
    const responses = [fail(503), fail(503), fail(503), ok()];
    const { queue, sleeps } = build({
      transport: async (request) => {
        calls.push(request);
        return responses.shift()!;
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();

    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 3000, 9000]);
    const ids = new Set(calls.map((call) => call.fields.clientUploadId));
    expect(ids.size).toBe(1);
    expect(calls[0]!.fields.purpose).toBe("QuestionImage");
    const item = queue.getSnapshot()[0]!;
    expect(item.status).toBe("done");
    expect(item.result?.id).toBe(11);
    expect(item.attempt).toBe(4);
  });

  it("tüm denemeler bitince failed olur ve elle yeniden denemede aynı kimliği korur", async () => {
    const calls: TransportRequest[] = [];
    let healthy = false;
    const { queue, sleeps } = build({
      transport: async (request) => {
        calls.push(request);
        return healthy ? ok() : fail(503);
      },
    });
    const id = queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();

    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 3000, 9000]);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "failed", failure: { kind: "server", manualRetry: true } });

    healthy = true;
    expect(queue.retry(id)).toBe(true);
    await queue.whenIdle();

    expect(calls).toHaveLength(5);
    expect(new Set(calls.map((call) => call.fields.clientUploadId)).size).toBe(1);
    expect(queue.getSnapshot()[0]!.status).toBe("done");
  });

  it("Retry-After varsa sabit gecikmenin yerine kullanılır", async () => {
    const responses = [fail(429, { detail: "Lütfen bekleyin." }, "7"), ok()];
    const { queue, sleeps } = build({ transport: async () => responses.shift()! });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(sleeps).toEqual([7000]);
    expect(queue.getSnapshot()[0]!.status).toBe("done");
  });

  it("her yanıt Retry-After taşısa da toplam 4 denemede durur", async () => {
    let count = 0;
    const { queue, sleeps } = build({
      transport: async () => {
        count += 1;
        return fail(429, { detail: "Lütfen bekleyin." }, "0");
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(count).toBe(4);
    expect(sleeps).toEqual([1000, 1000, 1000]);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "failed", attempt: 4 });
  });

  it("ağ hatasında yeniden dener", async () => {
    let count = 0;
    const { queue, sleeps } = build({
      transport: async () => {
        count += 1;
        if (count < 3) throw new TransportError("network");
        return ok();
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(sleeps).toEqual([1000, 3000]);
    expect(queue.getSnapshot()[0]!.status).toBe("done");
  });

  it("zaman aşımında yeniden dener", async () => {
    let count = 0;
    const { queue } = build({
      transport: async () => {
        count += 1;
        if (count === 1) throw new TransportError("timeout");
        return ok();
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(count).toBe(2);
  });

  it("dolu dosya için sunucunun 'Dosya zorunludur' demesi geçici sayılır ve aynı dosya yeniden gönderilir", async () => {
    const calls: TransportRequest[] = [];
    const responses = [fail(400, { title: "Doğrulama", errors: { file: ["Dosya zorunludur."] }, code: "file_empty" }), ok()];
    const { queue, sleeps } = build({
      transport: async (request) => {
        calls.push(request);
        return responses.shift()!;
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();

    expect(calls).toHaveLength(2);
    expect(calls[1]!.file.size).toBe(10);
    expect(new Set(calls.map((call) => call.fields.clientUploadId)).size).toBe(1);
    expect(sleeps).toEqual([1000]);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "done" });
  });

  it("gerçekten boş dosyada 'Dosya zorunludur' yeniden denenmez", async () => {
    let count = 0;
    const { queue } = build({
      transport: async () => {
        count += 1;
        return fail(400, { title: "Doğrulama", errors: { file: ["Dosya zorunludur."] }, code: "file_empty" });
      },
    });
    queue.add(Object.assign(new Blob([], { type: "image/jpeg" }), { name: "bos.jpg" }), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(count).toBe(1);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "failed", failure: { kind: "validation" } });
  });

  it("kodsuz 'Dosya zorunludur' mesajı geçici sayılmaz", async () => {
    let count = 0;
    const { queue } = build({
      transport: async () => {
        count += 1;
        return fail(400, { title: "Doğrulama", errors: { file: ["Dosya zorunludur."] } });
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(count).toBe(1);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "failed", failure: { kind: "validation" } });
  });

  it("400'de tekrar denemez ve backend mesajını gösterir", async () => {
    let count = 0;
    const { queue, sleeps } = build({
      transport: async () => {
        count += 1;
        return fail(400, { title: "Doğrulama", errors: { file: ["Fotoğraf okunamadı veya bozuk."] } });
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(count).toBe(1);
    expect(sleeps).toEqual([]);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "failed", failure: { kind: "validation", message: "Fotoğraf okunamadı veya bozuk.", manualRetry: false } });
  });

  it("413'te tekrar denemez", async () => {
    let count = 0;
    const { queue } = build({
      transport: async () => {
        count += 1;
        return fail(413, { detail: "Dosya çok büyük." });
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(count).toBe(1);
    expect(queue.getSnapshot()[0]!.failure?.kind).toBe("tooLarge");
  });

  it("günlük kota 429'unda (Retry-After yok) tekrar denemez", async () => {
    let count = 0;
    const { queue } = build({
      transport: async () => {
        count += 1;
        return fail(429, { detail: "Günlük dosya yükleme sınırına ulaştınız." });
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(count).toBe(1);
    expect(queue.getSnapshot()[0]!.failure).toMatchObject({ kind: "quota", message: "Günlük dosya yükleme sınırına ulaştınız." });
  });

  it("401'de oturum bitti geri çağrısını çalıştırır", async () => {
    let unauthorized = 0;
    const { queue } = build({ transport: async () => fail(401, null), onUnauthorized: () => (unauthorized += 1) });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(unauthorized).toBe(1);
  });
});

describe("UploadQueue eşzamanlılık", () => {
  it("aynı anda en fazla 3 yükleme yapar", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates: ReturnType<typeof deferred<TransportResponse>>[] = [];
    const { queue } = build({
      transport: () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const gate = deferred<TransportResponse>();
        gates.push(gate);
        return gate.promise.finally(() => {
          inFlight -= 1;
        });
      },
    });
    for (let index = 0; index < 8; index += 1) queue.add(blob(`f${index}.jpg`), "QuestionImage", undefined);

    await Promise.resolve();
    expect(gates).toHaveLength(3);
    expect(queue.getSnapshot().filter((item) => item.status === "uploading")).toHaveLength(3);
    expect(queue.getSnapshot().filter((item) => item.status === "queued")).toHaveLength(5);

    let released = 0;
    while (released < 8) {
      const gate = gates[released]!;
      gate.resolve(ok());
      released += 1;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await queue.whenIdle();

    expect(maxInFlight).toBe(3);
    expect(queue.getSnapshot().every((item) => item.status === "done")).toBe(true);
  });

  it("özel eşzamanlılık sınırına uyar", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { queue } = build({
      concurrency: 1,
      transport: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return ok();
      },
    });
    for (let index = 0; index < 4; index += 1) queue.add(blob(), "SolutionImage", undefined);
    await queue.whenIdle();
    expect(maxInFlight).toBe(1);
  });

  it("hazırlama sırayla yapılır ve yükleme ile boru hattı oluşturur", async () => {
    let preparing = 0;
    let maxPreparing = 0;
    const order: string[] = [];
    const { queue } = build({
      prepare: async (source) => {
        preparing += 1;
        maxPreparing = Math.max(maxPreparing, preparing);
        order.push((source as Blob & { name: string }).name);
        await new Promise((resolve) => setTimeout(resolve, 2));
        preparing -= 1;
        return { blob: new Blob(["p"]), width: 10, height: 10, previewBlob: new Blob(["v"]) };
      },
      transport: async () => ok(),
    });
    for (let index = 0; index < 5; index += 1) queue.add(blob(`p${index}.jpg`), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(maxPreparing).toBe(1);
    expect(order).toEqual(["p0.jpg", "p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg"]);
    const item = queue.getSnapshot()[0]!;
    expect(item.preparedBytes).toBe(1);
    expect(item.previewBlob).not.toBeNull();
  });

  it("hazırlama başarısızsa mesajı gösterir ve yüklemez", async () => {
    let uploads = 0;
    const { queue } = build({
      prepare: async () => {
        throw new PrepareError("tooSmall", "Fotoğraf çok küçük.");
      },
      transport: async () => {
        uploads += 1;
        return ok();
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(uploads).toBe(0);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "failed", failure: { kind: "prepare", message: "Fotoğraf çok küçük.", manualRetry: false } });
  });

  it("elle yeniden denemede hazırlanmış görseli yeniden hazırlamaz", async () => {
    let prepares = 0;
    let healthy = false;
    const { queue } = build({
      retryDelaysMs: [],
      prepare: async () => {
        prepares += 1;
        return { blob: new Blob(["p"]), width: 1, height: 1 };
      },
      transport: async () => (healthy ? ok() : fail(503)),
    });
    const id = queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(queue.getSnapshot()[0]!.status).toBe("failed");
    healthy = true;
    queue.retry(id);
    await queue.whenIdle();
    expect(prepares).toBe(1);
    expect(queue.getSnapshot()[0]!.status).toBe("done");
  });
});

describe("UploadQueue iptal ve kaldırma", () => {
  it("iptal sürmekte olan isteği keser ve elle yeniden denenebilir", async () => {
    const signals: AbortSignal[] = [];
    let healthy = false;
    const { queue } = build({
      transport: (request) => {
        signals.push(request.signal);
        if (healthy) return Promise.resolve(ok());
        return new Promise<TransportResponse>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(new TransportError("aborted")));
        });
      },
    });
    const id = queue.add(blob(), "QuestionImage", undefined);
    await Promise.resolve();
    expect(queue.getSnapshot()[0]!.status).toBe("uploading");

    expect(queue.cancel(id)).toBe(true);
    expect(signals[0]!.aborted).toBe(true);
    expect(queue.getSnapshot()[0]!.status).toBe("cancelled");
    await queue.whenIdle();

    healthy = true;
    expect(queue.retry(id)).toBe(true);
    await queue.whenIdle();
    expect(queue.getSnapshot()[0]!.status).toBe("done");
  });

  it("kaldırma isteği keser ve listeden çıkarır", async () => {
    let aborted = false;
    const { queue } = build({
      transport: (request) =>
        new Promise<TransportResponse>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new TransportError("aborted"));
          });
        }),
    });
    const id = queue.add(blob(), "QuestionImage", undefined);
    await Promise.resolve();
    const removed = queue.remove(id);
    expect(removed?.id).toBe(id);
    expect(aborted).toBe(true);
    expect(queue.getSnapshot()).toHaveLength(0);
    await queue.whenIdle();
  });

  it("kaldırma sıradaki öğenin başlamasına yer açar", async () => {
    const started: string[] = [];
    const gates: ReturnType<typeof deferred<TransportResponse>>[] = [];
    const { queue } = build({
      concurrency: 1,
      transport: (request) => {
        started.push(request.fields.clientUploadId!);
        const gate = deferred<TransportResponse>();
        gates.push(gate);
        request.signal.addEventListener("abort", () => gate.reject(new TransportError("aborted")));
        return gate.promise;
      },
    });
    const first = queue.add(blob(), "QuestionImage", undefined);
    queue.add(blob(), "QuestionImage", undefined);
    await Promise.resolve();
    expect(started).toHaveLength(1);
    queue.remove(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toHaveLength(2);
    gates[1]!.resolve(ok());
    await queue.whenIdle();
  });

  it("bekleme sırasındaki iptal sonraki denemeyi yapmaz", async () => {
    let calls = 0;
    const waiting = deferred<void>();
    const { queue } = build({
      sleep: (_ms, signal) =>
        new Promise<void>((resolve) => {
          waiting.resolve();
          signal.addEventListener("abort", () => resolve());
        }),
      transport: async () => {
        calls += 1;
        return fail(503);
      },
    });
    const id = queue.add(blob(), "QuestionImage", undefined);
    await waiting.promise;
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "waiting" });
    expect(queue.getSnapshot()[0]!.nextRetryAt).not.toBeNull();
    queue.cancel(id);
    await queue.whenIdle();
    expect(calls).toBe(1);
    expect(queue.getSnapshot()[0]!.status).toBe("cancelled");
  });

  it("abortAll tüm bekleyenleri iptal eder ve sonra yeniden kullanılabilir", async () => {
    const { queue } = build({
      concurrency: 1,
      transport: (request) =>
        new Promise<TransportResponse>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(new TransportError("aborted")));
        }),
    });
    queue.add(blob(), "QuestionImage", undefined);
    queue.add(blob(), "QuestionImage", undefined);
    await Promise.resolve();
    queue.abortAll();
    expect(queue.getSnapshot().map((item) => item.status)).toEqual(["cancelled", "cancelled"]);
    expect(queue.isBusy()).toBe(false);
  });

  it("ilerleme bildirimi öğeye yansır", async () => {
    const seen: number[] = [];
    const { queue } = build({
      transport: async (request) => {
        request.onProgress(25, 100);
        seen.push(queue.getSnapshot()[0]!.progress);
        request.onProgress(100, 100);
        seen.push(queue.getSnapshot()[0]!.progress);
        return ok();
      },
    });
    queue.add(blob(), "QuestionImage", undefined);
    await queue.whenIdle();
    expect(seen).toEqual([0.25, 0.99]);
    expect(queue.getSnapshot()[0]!.progress).toBe(1);
  });
});
