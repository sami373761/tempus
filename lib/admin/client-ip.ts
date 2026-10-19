/**
 * The client's IP, for the sign-in throttle.
 *
 * The reverse proxy in front of the VPS is not decided yet (nginx, Caddy or
 * none). Until it is, the first `x-forwarded-for` hop is trusted, then
 * `x-real-ip`, then nothing. When the proxy is known, set
 * TRUSTED_PROXY_HEADER to the one header it sets (and make sure it overwrites
 * any value the client sent) — that is the whole change.
 *
 * A wrong choice here does not open the panel; it only makes the per-IP
 * counter easier to spread. The per-username counter does not depend on it.
 */
export const TRUSTED_PROXY_HEADER: "x-forwarded-for" | "x-real-ip" | "cf-connecting-ip" =
  "x-forwarded-for";

const FALLBACK_IP = "0.0.0.0";

export function clientIp(headers: Pick<Headers, "get">): string {
  const chain =
    TRUSTED_PROXY_HEADER === "x-forwarded-for"
      ? [headers.get("x-forwarded-for")?.split(",")[0], headers.get("x-real-ip")]
      : [headers.get(TRUSTED_PROXY_HEADER), headers.get("x-real-ip")];
  for (const raw of chain) {
    const value = raw?.trim();
    if (value && isIp(value)) return value;
  }
  return FALLBACK_IP;
}

/** Loose: Postgres' inet is the real parser; this only keeps junk out of it. */
function isIp(value: string): boolean {
  return /^[0-9.]{7,15}$/.test(value) || /^[0-9a-f:]{2,39}$/i.test(value);
}
