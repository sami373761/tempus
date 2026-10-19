/**
 * Year entry for the panel: "MÖ 500", "500", "MS 500" (also "500 MÖ",
 * "-499", "BC 500", "500 BCE") -> astronomical year.
 *
 * CLAUDE.md's rule: 1 BCE = 0, so N BCE = 1 - N. A bare number is CE, a
 * leading minus is already astronomical. Returns null for anything else —
 * the caller shows the error, it never guesses.
 */
const BCE = /^(?:MÖ|M\.Ö\.|BC|BCE|M\.O\.)$/i;
const CE = /^(?:MS|M\.S\.|AD|CE)$/i;

export function parseYearInput(raw: string): number | null {
  const text = raw.trim().replace(/\s+/g, " ").replace(/(\d)[.,](?=\d{3}\b)/g, "$1");
  if (text === "") return null;

  if (/^-\d+$/.test(text)) return Number(text);

  const parts = text.split(" ");
  let era: "bce" | "ce" = "ce";
  let digits: string | undefined;
  if (parts.length === 1) {
    digits = parts[0];
  } else if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    if (BCE.test(a) || CE.test(a)) {
      era = BCE.test(a) ? "bce" : "ce";
      digits = b;
    } else if (BCE.test(b) || CE.test(b)) {
      era = BCE.test(b) ? "bce" : "ce";
      digits = a;
    }
  }
  if (!digits || !/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n)) return null;
  if (era === "bce") return n === 0 ? null : 1 - n;
  return n;
}
