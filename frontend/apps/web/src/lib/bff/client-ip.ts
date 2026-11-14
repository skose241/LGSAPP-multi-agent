import { isIP } from "node:net";

export function clientIpFromForwardedFor(value: string | null | undefined, hops = 1): string | null {
  if (!value) return null;
  const entries = value.split(",").map((item) => item.trim()).filter(Boolean);
  const entry = entries[entries.length - hops];
  if (!entry || hops < 1) return null;

  let candidate = entry;
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate);
  if (bracket?.[1]) {
    candidate = bracket[1];
  } else if (/^[^:]+:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }

  return isIP(candidate) !== 0 ? candidate : null;
}

export function resolveClientIp(
  forwardedFor: string | null | undefined,
  settings: { trustProxy: boolean; hops: number },
): string | null {
  return settings.trustProxy ? clientIpFromForwardedFor(forwardedFor, settings.hops) : null;
}
