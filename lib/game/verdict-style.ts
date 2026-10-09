/**
 * What each verdict looks like and what it is called.
 *
 * The five tiers of `gradeGuess` are drawn in four different places — the
 * result panel beside the card, the narrow-screen overlay on the photograph,
 * the head-to-head result row and the set summary's pips and breakdown — and
 * every one of them needs the same two things: the dictionary key for the word
 * and the colour it is printed in. They lived in components/timeline-stage.tsx
 * until 2026-10-07, which meant the summary screen (shared with the comparison
 * game, which has no stage) carried a second copy of the label map. One
 * module, no copies.
 *
 * **A tier is a hue, and a hue is three shades of itself.** Every surface here
 * is a gradient rather than a flat fill, which is what the five tiers needed to
 * read as a ladder rather than as four reds and a green. The shades are
 * *derived* from the one colour in the palette — `color-mix` toward white and
 * toward black — so a tier is still a single value to retune and the three
 * stops cannot drift apart from each other.
 *
 * Nothing here decides anything. `BANDS` in lib/game/scoring.ts owns which tier
 * a guess earns; this file owns nothing but its appearance.
 */

import type { Dict } from "../i18n/dictionary.ts";
import type { Verdict } from "./scoring.ts";

/** Which dictionary entry each tier of `gradeGuess` prints. */
export const VERDICT_LABEL_KEYS: Record<Verdict, keyof Dict> = {
  perfect: "verdictPerfect",
  great: "verdictGreat",
  good: "verdictGood",
  bad: "verdictBad",
  wayOff: "verdictWayOff",
};

/**
 * One hue per tier, blue down to red, resolved from the palette in
 * app/globals.css rather than written here — the five `--color-tier-*` tokens
 * are the ordered ladder and this is the map onto it.
 *
 * It was three colours for four tiers until 2026-10-07 (green for the top two,
 * plain ink for "good", red for the bottom), which worked while the ladder was
 * short enough for the words to carry the difference. At five rungs it is a
 * scale, and a scale has to be readable without reading.
 */
export const VERDICT_COLORS: Record<Verdict, string> = {
  perfect: "var(--color-tier-perfect)",
  great: "var(--color-tier-great)",
  good: "var(--color-tier-good)",
  bad: "var(--color-tier-bad)",
  wayOff: "var(--color-tier-wayoff)",
};

/** A shade of a tier's hue: `keep`% of it, the rest of the way to `into`. */
function shade(verdict: Verdict, keep: number, into: string): string {
  return `color-mix(in srgb, ${VERDICT_COLORS[verdict]} ${keep}%, ${into})`;
}

/**
 * The bright sweep, for the verdict's own word and for the rule under it.
 *
 * **Vertical by default**, which is the one part of this that was decided by
 * looking rather than by arithmetic: a verdict is one or two words, so a
 * near-horizontal ramp has only the word's own length to vary over and reads
 * as a flat colour that has gone slightly wrong at one end. Top-lit and
 * deepening through the cap height reads as the thing it is.
 *
 * It **stops short of the dark end** — 72% of the hue rather than running down
 * to a true shade — for the same reason `.contact-sweep` does in
 * app/globals.css: the page behind it is pure black, and a gradient that
 * reaches a genuine dark tone takes the foot of the glyphs down to around 2:1
 * with it. At this depth the darkest tier's tail is still above 3:1, which is
 * the floor for type this size.
 */
export function verdictSweep(verdict: Verdict, angle = "170deg"): string {
  return `linear-gradient(${angle}, ${shade(verdict, 50, "#ffffff")} 0%, ${
    VERDICT_COLORS[verdict]
  } 52%, ${shade(verdict, 72, "#000000")} 100%)`;
}

/**
 * How opaque the result card is: 90%, so a tenth of the round's photograph
 * reads through it. Asked for on 2026-10-08, with the design below.
 *
 * It is one number for both halves of the card on purpose — a head and a foot
 * at different alphas over the same photograph read as two cards that have
 * been stacked rather than as one card with a coloured head.
 */
const DECK_ALPHA = "90%";

/** `colour` at the card's own transparency. */
function sheer(colour: string): string {
  return `color-mix(in srgb, ${colour} ${DECK_ALPHA}, transparent)`;
}

/**
 * The card's head: the tier's hue at full strength, which is the whole of what
 * says which verdict this is.
 *
 * The result panel was a dark surface with a faintly tinted fill until
 * 2026-10-08 — the hue reached the eye only through the word and a rule under
 * it, which at five tiers meant two neighbouring rungs differed by the colour
 * of 30-odd pixels of type. The head is ~110px of saturated colour instead, so
 * the tier is legible from across the room and the word on it can be plain
 * near-black rather than a gradient competing with its own background.
 *
 * **Mixed in oklch, not srgb.** The two ends are a lightened and a darkened
 * copy of one hue, and srgb's naive interpolation takes the light end through
 * a visibly desaturated grey on the orange and yellow tiers. Everything else
 * in this file mixes toward white or black at low proportions, where the
 * difference does not show.
 *
 * `background-size` and the slow drift across it belong to
 * `.verdict-deck-head` in app/globals.css — a keyframe cannot be set inline,
 * and that rule is also what punches the ticket notches out of the lower
 * corners.
 */
export function verdictDeckHead(verdict: Verdict): string {
  const hue = VERDICT_COLORS[verdict];

  return `linear-gradient(145deg, ${sheer(
    `color-mix(in oklch, ${hue} 50%, #ffffff)`,
  )} 0%, ${sheer(hue)} 48%, ${sheer(
    `color-mix(in oklch, ${hue} 55%, #07070b)`,
  )} 100%)`;
}

/**
 * The card's foot, where the two numbers are: near-black and untinted.
 *
 * It carries no hue at all, which is what keeps the head reading as the one
 * saturated thing on the card. The numbers under it are white; only the
 * guessed year takes the tier's colour.
 */
export function verdictDeckFoot(): string {
  return sheer("#070707");
}

/** The panel's edge: enough of the hue to name it, over the glass border. */
export function verdictEdge(verdict: Verdict): string {
  return shade(verdict, 46, "rgba(255, 255, 255, 0.14)");
}

/**
 * A flat, legible tint of the hue for small marks — the summary's pips and the
 * dots in its breakdown, which are 10 to 14px and have no room for a gradient
 * to be seen in.
 */
export function verdictPip(verdict: Verdict): string {
  return shade(verdict, 88, "#ffffff");
}
