export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bffStartupWarnings } = await import("@/lib/bff/startup");
  for (const warning of bffStartupWarnings(process.env)) {
    console.warn(`[BFF] ${warning}`);
  }
  const { canonicalHostWarning } = await import("@/lib/canonical-host");
  const canonical = canonicalHostWarning(process.env);
  if (canonical) console.warn(`[BFF] ${canonical}`);
}
