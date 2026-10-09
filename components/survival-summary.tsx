"use client";

import { useEffect, useRef } from "react";

import { ShareButton, SUMMARY_BUTTON } from "@/components/set-summary";
import { VERDICTS, type Verdict } from "@/lib/game/scoring";
import type { SetResult } from "@/lib/game/set";
import {
  gradeSurvival,
  summarizeSurvival,
  survivalShareText,
  survivalSquaresOmitted,
  type SurvivalGrade,
  type SurvivalSummary as Summary,
} from "@/lib/game/survival";
import { VERDICT_LABEL_KEYS, verdictPip } from "@/lib/game/verdict-style";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The screen a survival run ends on.
 *
 * A screen of its own rather than a flag on `SetSummary`, because the two have
 * almost no sentence in common: a set's headline is a percentage of a fixed ten
 * and a run's is a count with no ceiling, a set reports a best streak where
 * every answer in a run is already consecutive, and a set's ten pips are a
 * strip where a run's two hundred have to be a block. What they do share is the
 * dark glass, the two stacked buttons and the share flow, and those are
 * imported rather than restated.
 *
 * **Three readings of one run, coarse to fine**, which is the whole structure:
 * the count ("23"), then the shape of it (precision, and the tier bars), then
 * every answer individually (the dots). A player who only glances gets the
 * number; one who reads gets where the run was accurate and where it was
 * lucky; one who studies it gets the moment it started going wrong.
 *
 * **It is built for 200 answers, not for 20.** A run has no upper bound, so
 * nothing here may grow without bound either: the dot grid re-columns and
 * shrinks itself in steps as the run gets longer (`pipLayout`), the breakdown
 * is five rows whatever the count, and the panel caps its own height and
 * scrolls internally — both game screens are exactly one viewport and must
 * never scroll the page itself.
 *
 * **Styled for a photograph**, like every other panel on these two screens:
 * dark glass rather than an opaque `bg-card`, which over a picture reads as a
 * leftover from another page. The chroma is the verdict ladder and nothing
 * else — blue down to red, straight off the five `--color-tier-*` tokens, so
 * the dots, the bars and the result card the player saw a moment ago are all
 * the same five colours.
 */
export function SurvivalSummary({
  results,
  onPlayAgain,
  t,
}: {
  results: readonly SetResult[];
  onPlayAgain: () => void;
  t: Dict;
}) {
  const summary = summarizeSurvival(results);
  const grade = gradeSurvival(summary);
  const panel = useRef<HTMLDivElement>(null);

  // The run ending is a change of screen, not of round, and the button the
  // player pressed is gone — so focus has to be moved or a keyboard user is
  // dropped back to the top of the document with nothing announced. The panel
  // takes it rather than "Play again", which would make Enter start a new run
  // before the player has been told how the last one went. Same reasoning as
  // the set summary's.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center py-2">
      <div
        ref={panel}
        tabIndex={-1}
        role="group"
        aria-label={`${t.survivalOver} — ${t.survivalTitle}`}
        // Wider than the set summary's `max-w-md`, which is the dot grid's
        // doing: at 20 columns a 13px dot wants more than a phone-width column
        // to sit in without the rows reading as a wall.
        className="set-summary-in flex max-h-full w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl focus:outline-none"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {t.survivalOver}
          </p>
          <h2 className="mt-1 font-display text-base font-semibold text-ink">
            {t.survivalTitle}
          </h2>
        </div>

        {/* The score, and the one number the mode was ever about. `tabular-nums`
            so three digits cannot shift the block's width against two. */}
        <div>
          <p
            className="font-display text-6xl font-semibold leading-none tracking-tight tabular-nums"
            style={{ color: GRADE_COLOR[grade] }}
          >
            {summary.cleared}
          </p>
          <p className="mt-2 text-sm text-white/75">{t.survivalCorrect}</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {t[GRADE_LABEL_KEYS[grade]]}
          </p>
        </div>

        {/* The shape of the run, in three numbers the headline cannot carry:
            how accurate it was, how long it lasted including the answer that
            ended it, and the best unbroken run of exact answers inside it. */}
        <dl className="grid grid-cols-3 gap-2">
          <Stat
            value={`${summary.precision}%`}
            label={t.survivalPrecision}
            bright
          />
          <Stat value={summary.total} label={t.survivalAnswered} />
          <Stat value={summary.bestExact} label={t.survivalBestExact} />
        </dl>

        <Breakdown summary={summary} t={t} />

        <Sequence results={results} t={t} />

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className={`${SUMMARY_BUTTON} bg-ink text-page hover:opacity-85`}
          >
            {t.playAgain}
          </button>

          <ShareButton
            buildText={() => {
              const omitted = survivalSquaresOmitted(results);
              return survivalShareText({
                title: t.survivalTitle,
                results,
                summary,
                url: window.location.href,
                moreLabel:
                  omitted > 0
                    ? format(t.survivalShareMore, { n: omitted })
                    : null,
              });
            }}
            t={t}
          />
        </div>

        <a
          href="/compare"
          className="text-xs text-white/55 underline-offset-4 transition hover:text-ink hover:underline"
        >
          {t.tryComparison}
        </a>
      </div>
    </div>
  );
}

/**
 * The headline colour tracks the grade and stops short of red, exactly as the
 * set summary's does: red is the colour of a wrong answer, and a whole run is
 * not an answer — painting a short one in it would read as a scolding rather
 * than as a score. A short run is dimmed instead, which says it quietly.
 */
const GRADE_COLOR: Record<SurvivalGrade, string> = {
  legendary: "var(--color-good)",
  deep: "var(--color-good)",
  solid: "var(--color-ink)",
  short: "var(--color-ink-dim)",
};

const GRADE_LABEL_KEYS: Record<SurvivalGrade, keyof Dict> = {
  legendary: "survivalGradeLegendary",
  deep: "survivalGradeDeep",
  solid: "survivalGradeSolid",
  short: "survivalGradeShort",
};

/** One of the three figures under the headline. */
function Stat({
  value,
  label,
  bright = false,
}: {
  value: string | number;
  label: string;
  /** The precision, which is the one of the three worth reading first. */
  bright?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2.5">
      <dd
        className={`font-display text-xl font-semibold leading-none tabular-nums ${
          bright ? "text-ink" : "text-white/80"
        }`}
      >
        {value}
      </dd>
      {/* `leading-tight` and no truncation: three of these labels sit side by
          side in five languages, and the German ones wrap to two lines rather
          than being cut off. */}
      <dt className="mt-1.5 text-[11px] leading-tight text-white/50">
        {label}
      </dt>
    </div>
  );
}

/**
 * How the answers landed, as a bar per tier.
 *
 * This is the accessible reading of the dot grid below — same five tiers, same
 * five colours, but with the words and the counts — which is why that grid can
 * be `aria-hidden` without anything being lost. A bar rather than a bare count
 * because a run's counts are not comparable at a glance the way a set's are:
 * "31" means nothing until it is seen as most of the run or a tenth of it.
 *
 * Empty tiers are dropped rather than printed as zero, so the rows that remain
 * are the ones the player actually earned — the same rule the set summary's
 * breakdown follows. The ladder's own order is kept, best at the top, rather
 * than sorting by count: it is a scale, and a scale that reorders itself per
 * run is one nobody learns.
 */
function Breakdown({ summary, t }: { summary: Summary; t: Dict }) {
  const rows = VERDICTS.filter((verdict) => summary.byVerdict[verdict] > 0);
  if (rows.length === 0) return null;

  return (
    <div className="border-t border-white/10 pt-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
        {t.setBreakdown}
      </p>
      <dl className="flex flex-col gap-2">
        {rows.map((verdict) => {
          const count = summary.byVerdict[verdict];
          const share = summary.total === 0 ? 0 : (count / summary.total) * 100;
          const color = verdictPip(verdict);

          return (
            <div key={verdict} className="flex items-center gap-3">
              <dt className="flex w-[6.5rem] shrink-0 items-center gap-2 text-left text-xs text-white/75">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{t[VERDICT_LABEL_KEYS[verdict]]}</span>
              </dt>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                {/* A tier the player earned always draws something: at one
                    answer in two hundred the bar rounds to half a percent and
                    would otherwise be a row with an empty track beside a count
                    that says it is not empty. */}
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(share, 1.5)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <dd className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">
                {count}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/**
 * How the dot grid is laid out at a given length, coarse to dense.
 *
 * Three things step together: how many dots make a row, how big a dot is, and
 * how far apart they sit. Columns are multiples of ten throughout, so a row is
 * always countable and the block's shape is comparable between two runs of
 * different lengths — a 60-answer run is three rows of twenty and a 200 is
 * seven, which is the thing an auto-filled grid cannot promise.
 *
 * **The gap belongs to the tier, not to the viewport**, and getting that wrong
 * is what makes a dense grid disappear. A gap set in `vw` does not know how
 * many columns it is being asked to sit between: at 40 columns it was 6px
 * thirty-nine times over, which ate 234px of a 439px grid and left the dots at
 * 5px instead of 8 — and in a phone-width column, 0.5px. Scaled with the dot
 * instead, the ratio between the two is fixed and the block reads the same at
 * every length.
 */
function pipLayout(count: number): {
  columns: number;
  size: number;
  gap: number;
} {
  if (count <= 30) return { columns: 10, size: 18, gap: 6 };
  if (count <= 120) return { columns: 20, size: 13, gap: 5 };
  if (count <= 300) return { columns: 30, size: 10, gap: 4 };
  return { columns: 40, size: 8, gap: 3 };
}

/**
 * Every answer in the run, in order, one dot each.
 *
 * It is the only part of the screen that says *where* rather than *how much*:
 * a run that was exact for forty answers and then fell apart looks nothing
 * like one that was scraping the right side of the rail the whole way, and
 * both can land on the same count and the same precision. The last dot is
 * always the miss that ended the run, and is ringed so the eye finds the end
 * of a long block without counting to it.
 *
 * **It is `aria-hidden` on purpose.** Two hundred unlabelled spans is noise,
 * not information, and everything the dots encode is in the breakdown above as
 * words and counts. The shape is what is visual, and shape is the one thing a
 * list of two hundred readings could not convey anyway.
 */
function Sequence({
  results,
  t,
}: {
  results: readonly SetResult[];
  t: Dict;
}) {
  const { columns, size, gap } = pipLayout(results.length);
  // A short run must not be stretched across the full width: with fewer
  // answers than columns the grid takes only as many as it has, so three dots
  // are three dots rather than three dots spaced a third of the panel apart.
  const cols = Math.min(results.length, columns);
  const last = results.length - 1;
  // The width at which the dots are exactly `size` and the gaps exactly `gap`.
  // It is both the grid's cap and the denominator below, which is what ties
  // the two together.
  const full = cols * size + (cols - 1) * gap;

  return (
    <div className="border-t border-white/10 pt-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
        {t.survivalSequence}
      </p>

      {/* Fluid, and proportional in both directions at once. The grid is
          `w-full` up to `full`, so on a desktop it stops at exactly the width
          that makes every dot its tier's size — and in a narrower column it
          scales down whole, because the gap is a *percentage of the grid's own
          width* rather than a length. Dots and gaps therefore shrink by the
          same factor and the block never collapses into stripes. Measured in a
          327px column at the densest tier: 5.0px dots, 1.9px gaps, still a
          legible grid. */}
      <div
        aria-hidden="true"
        className="mx-auto grid w-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: `${((gap / full) * 100).toFixed(3)}%`,
          maxWidth: full,
        }}
      >
        {results.map((result, at) => (
          <span
            key={at}
            // No width of its own: the dot fills its column, and the column is
            // sized by the cap above. One place decides how big a dot is.
            className="aspect-square w-full rounded-full"
            style={{
              backgroundColor: result.verdict
                ? verdictPip(result.verdict)
                : "rgb(255 255 255 / 0.2)",
              // The end of the run. An outline rather than a border or a ring
              // utility: it is drawn outside the box, so it cannot shrink the
              // dot it marks out of step with its neighbours.
              outline:
                at === last ? "1px solid rgb(255 255 255 / 0.75)" : undefined,
              outlineOffset: at === last ? 2 : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
