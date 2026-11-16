import { TransportError, type TransportRequest, type TransportResponse, type UploadTransport } from "./types";

export interface XhrTransportOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createXhrTransport(options: XhrTransportOptions = {}): UploadTransport {
  const baseUrl = options.baseUrl ?? "";
  const timeoutMs = options.timeoutMs ?? 120_000;

  return (request: TransportRequest) =>
    new Promise<TransportResponse>((resolve, reject) => {
      if (request.signal.aborted) {
        reject(new TransportError("aborted"));
        return;
      }

      const xhr = new XMLHttpRequest();
      const form = new FormData();
      for (const [name, value] of Object.entries(request.fields)) form.append(name, value);
      form.append("file", request.file, request.fileName);

      const onAbort = () => xhr.abort();
      request.signal.addEventListener("abort", onAbort, { once: true });
      const cleanup = () => request.signal.removeEventListener("abort", onAbort);

      xhr.open("POST", `${baseUrl}${request.url}`);
      xhr.timeout = timeoutMs;
      xhr.responseType = "text";
      xhr.setRequestHeader("accept", "application/json");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) request.onProgress(event.loaded, event.total);
      };
      xhr.onload = () => {
        cleanup();
        resolve({
          status: xhr.status,
          body: parseBody(xhr.responseText),
          retryAfter: xhr.getResponseHeader("retry-after"),
          sessionRefreshed: xhr.getResponseHeader("x-session-refreshed") === "1",
        });
      };
      xhr.onerror = () => {
        cleanup();
        reject(new TransportError("network"));
      };
      xhr.ontimeout = () => {
        cleanup();
        reject(new TransportError("timeout"));
      };
      xhr.onabort = () => {
        cleanup();
        reject(new TransportError("aborted"));
      };

      xhr.send(form);
    });
}
