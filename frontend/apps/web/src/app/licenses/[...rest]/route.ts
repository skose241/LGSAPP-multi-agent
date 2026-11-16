export function GET() {
  return new Response("Bulunamadı", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const HEAD = GET;
