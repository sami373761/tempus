/**
 * A category's tolerance ladder, computed from its timeline (§7.4). The panel
 * has no difficulty input: the rails decide.
 *
 * Derived from the hand-tuned subject ladders (lib/game/scoring.ts):
 *
 *   * One rail no wider than 400 years — a thin slice of time where every
 *     event is roughly as old as every other, so an event's age carries no
 *     information (FOOTBALL_BANDS' argument). Plain years, as a share of the
 *     rail: great 1.5%, good 4.7%, bad 13%. On football's 176-year rail
 *     that is 3/8/23 (tuned: 3/8/25), on film's 126 2/6/16 (2/6/15), on
 *     basketball's 151 2/7/20 (2/7/20).
 *   * Anything else — several rails, or one long one — is graded by depth
 *     like Born When? (WHEN_BORN_BANDS), whose three rails are the case
 *     that ladder was built for.
 *
 * `perfect` is the exact year everywhere. The built-in four never pass
 * through here automatically: their tuned ladders stay until an admin
 * presses "Uygula" on a recomputed one.
 *
 * Pure; paired with nothing in SQL (the database stores whatever this
 * returns).
 */

import type { BandSet } from "./scoring.ts";
import type { PaneSpec } from "./timeline.ts";

type SpecLike = PaneSpec;

export const SHORT_SPAN_YEARS = 400;

/** Astronomical [min, max] a rail covers — yearAtFraction(…, 0/1). */
export function paneYearRange(spec: SpecLike): { min: number; max: number } {
  if (spec.scale === "year") return { min: spec.minYear, max: spec.maxYear };
  const bce = (d: number) => (d === 0 ? 0 : 1 - d);
  return { min: bce(spec.maxDisplay), max: bce(spec.minDisplay) };
}

export function timelineSpan(panes: readonly SpecLike[]): number {
  const ranges = panes.map(paneYearRange);
  return Math.max(...ranges.map((r) => r.max)) - Math.min(...ranges.map((r) => r.min));
}

export function autoBands(panes: readonly SpecLike[]): BandSet {
  const span = timelineSpan(panes);
  if (panes.length === 1 && span <= SHORT_SPAN_YEARS) {
    const great = Math.max(1, Math.round(span * 0.015));
    const good = Math.max(great + 1, Math.round(span * 0.047));
    const bad = Math.max(good + 1, Math.round(span * 0.13));
    return [
      { verdict: "perfect", relative: 0, floorYears: 0 },
      { verdict: "great", relative: 0, floorYears: great },
      { verdict: "good", relative: 0, floorYears: good },
      { verdict: "bad", relative: 0, floorYears: bad },
    ];
  }
  return [
    { verdict: "perfect", relative: 0, floorYears: 0 },
    { verdict: "great", relative: 0.025, floorYears: 12 },
    { verdict: "good", relative: 0.1, floorYears: 30 },
    { verdict: "bad", relative: 0.2, floorYears: 75 },
  ];
}

/** "Harika ±2 yıl, İyi ±6, Kötü ±16" — the read-only summary the editor shows. */
export function describeBands(bands: BandSet): string {
  const name: Record<string, string> = { great: "Harika", good: "İyi", bad: "Kötü" };
  return bands
    .filter((b) => b.verdict !== "perfect")
    .map((b) =>
      b.relative > 0
        ? `${name[b.verdict]} ±max(${b.floorYears} yıl, yaşın %${(b.relative * 100).toFixed(1)}'i)`
        : `${name[b.verdict]} ±${b.floorYears} yıl`,
    )
    .join(", ");
}

/**
 * A round tick step near span/6 (§7.3): 1, 2, 2.5, 5 × 10^n.
 */
export function suggestTickStep(span: number): number {
  const raw = Math.max(1, span / 6);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const steps = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  return steps.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), steps[0]!);
}

/**
 * The editor's density hint: if the densest 60% of the category's events
 * fits in less than 20% of the timeline, suggest a separate rail for it.
 */
export function densityHint(years: readonly number[], panes: readonly SpecLike[]): string | null {
  if (years.length < 10) return null;
  const sorted = [...years].sort((a, b) => a - b);
  const take = Math.ceil(sorted.length * 0.6);
  let best = Infinity;
  let at = 0;
  for (let i = 0; i + take - 1 < sorted.length; i += 1) {
    const width = sorted[i + take - 1]! - sorted[i]!;
    if (width < best) {
      best = width;
      at = i;
    }
  }
  const span = timelineSpan(panes);
  if (span <= 0 || best / span >= 0.2) return null;
  const end = sorted[at + take - 1]!;
  const latest = sorted[sorted.length - 1]!;
  const lastYears = Math.max(1, latest - sorted[at]!);
  return `Olayların %60'ı ${end === latest ? `son ${lastYears} yılda` : `${sorted[at]}–${end} arasında`}; ayrı bir dönem düşünün.`;
}

/**
 * Validation the SQL also does (panes_problem), here so the editor can say
 * which rule failed before saving.
 */
export function panesProblem(panes: readonly ({ key: string } & SpecLike)[], defaultPane: string): string | null {
  if (panes.length === 0) return "En az bir dönem gerekli.";
  const keys = new Set<string>();
  let prev: number | null = null;
  for (const p of panes) {
    if (!p.key || keys.has(p.key)) return "Dönem anahtarları benzersiz olmalı.";
    keys.add(p.key);
    const { min, max } = paneYearRange(p);
    if (!(min < max)) return "Her dönemin başı sonundan önce olmalı.";
    if (prev !== null && min !== prev) return min < prev ? "Dönemler çakışıyor." : "Dönemler arasında boşluk var.";
    prev = max;
  }
  if (!keys.has(defaultPane)) return "Açılış dönemi listede değil.";
  return null;
}

/**
 * A rail from the editor's form: start and end in astronomical years. A rail
 * that is wholly CE (≥ 0) is a `year` scale; wholly BCE (≤ 0) is
 * `bce-linear`, which reads in display years so its ticks are round (see
 * lib/game/timeline.ts). A rail crossing 0 must be split there, as Born
 * When?'s are — a single scale cannot print round ticks on both sides.
 */
export function paneFromRange(input: {
  key: string;
  label: Record<string, string>;
  start: number;
  end: number;
  tickStep: number;
  stepYears?: number;
}): ({ key: string; label: Record<string, string> } & PaneSpec) | string {
  const { key, label, start, end, tickStep } = input;
  if (!(start < end)) return "Başlangıç yılı bitişten önce olmalı.";
  if (!(tickStep > 0)) return "Çizgi aralığı pozitif olmalı.";
  if (start >= 0) return { key, label, scale: "year", minYear: start, maxYear: end, tickStep };
  if (end <= 0) {
    const display = (y: number) => (y === 0 ? 0 : 1 - y);
    return {
      key,
      label,
      scale: "bce-linear",
      minDisplay: display(end),
      maxDisplay: display(start),
      stepYears: Math.max(1, input.stepYears ?? 1),
      tickStep,
    };
  }
  return "MÖ ve MS aynı dönemde olamaz; dönemi 1 BCE (0) yılında ikiye bölün.";
}
