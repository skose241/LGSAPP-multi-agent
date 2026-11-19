import { backend } from "./backend";

export interface RunBody {
  id: number;
  kind: string;
  status: string;
  summary: string | null;
}

export async function startRun(token: string, kind: string) {
  return backend<RunBody>("POST", "/api/admin/scheduler/runs", { token, body: { kind } });
}

export async function waitRun(token: string, id: number, timeoutMs = 60_000): Promise<RunBody> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await backend<RunBody>("GET", `/api/admin/scheduler/runs/${id}`, { token });
    if (result.status === 200 && result.body.status !== "running") return result.body;
    if (Date.now() > deadline) throw new Error(`Çalıştırma ${id} bitmedi.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
