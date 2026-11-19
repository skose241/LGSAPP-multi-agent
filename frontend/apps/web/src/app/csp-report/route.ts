import {
  MAX_REPORT_BYTES,
  allowReport,
  clientIp,
  parseCspReports,
  readLimited,
} from "@/lib/csp-report";

export const dynamic = "force-dynamic";

const noContent = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!allowReport(clientIp(request.headers))) return noContent();
  const body = await readLimited(request, MAX_REPORT_BYTES);
  if (body === null) return new Response(null, { status: 413, headers: { "cache-control": "no-store" } });
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!/application\/(csp-report|reports\+json|json)/.test(type)) return noContent();
  for (const line of parseCspReports(body)) {
    console.warn("[csp]", JSON.stringify(line));
  }
  return noContent();
}
