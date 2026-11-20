import { clearAllDrafts } from "@/lib/session/draft";
import { createApiClient, parseProblem, type ApiClient, type ParsedProblem } from "@lgs/api";

let client: ApiClient | null = null;
let expiring = false;

const SESSION_EXEMPT = ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/auth/forgot-password", "/api/auth/recover"];

export function endSession(reason: "oturum" | null = "oturum") {
  if (typeof window === "undefined" || expiring) return;
  expiring = true;
  clearAllDrafts();
  const target = reason ? `/giris?neden=${reason}` : "/giris";
  fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" } })
    .catch(() => null)
    .finally(() => {
      window.location.assign(target);
    });
}

export function api(): ApiClient {
  if (typeof window === "undefined") return createApiClient({ baseUrl: "http://localhost" });
  if (!client) {
    client = createApiClient({ baseUrl: window.location.origin });
    client.use({
      onResponse({ request, response }) {
        if (response.status !== 401) return undefined;
        if (response.headers.get("x-session-refreshed") === "1") return undefined;
        const pathname = new URL(request.url).pathname.toLowerCase();
        if (!SESSION_EXEMPT.includes(pathname)) endSession("oturum");
        return undefined;
      },
    });
  }
  return client;
}

export type ApiOutcome<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; problem: ParsedProblem; network: boolean };

interface RawResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

export async function run<T>(operation: () => Promise<RawResult<T>>): Promise<ApiOutcome<T>> {
  try {
    const result = await operation();
    if (result.response.ok) {
      return { ok: true, data: result.data as T, status: result.response.status };
    }
    return {
      ok: false,
      status: result.response.status,
      network: false,
      problem: parseProblem(result.error, result.response.headers.get("retry-after")),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      network: true,
      problem: {
        message: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
        fieldErrors: {},
        formError: null,
        retryAfter: null,
      },
    };
  }
}
