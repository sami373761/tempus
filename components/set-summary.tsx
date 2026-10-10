"use client";

import { useEffect, useRef, useState } from "react";

import type { Verdict } from "@/lib/game/scoring";
import {
  gradeSet,
  shareText,
  summarizeSet,
  type SetGrade,
  type SetResult,
} from "@/lib/game/set";
import { VERDICT_LABEL_KEYS, verdictPip } from "@/lib/game/verdict-style";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The screen at the end of a ten-question set, shared by both games.
 *
 * One component rather than two because a set is the same object in both: the
 * games differ in how they grade a question, not in what a finished set *is*,
 * and `SetResult` already absorbs that difference (see lib/game/set.ts). The
 * only thing that varies here is the per-tier breakdown, which appears for the
 * date-guessing game and not for the comparison game — and it appears because
 * `summary.byVerdict` is non-null, not because the caller said which game it is.
 *
 * **Styled for a photograph, not for the page.** Both games stand on a backdrop
 * image, so this is the same dark glass their own panels use rather than an
 * opaque `bg-card`, which over a picture reads as a leftover from another
 * screen. The one chroma in here is the verdict itself — the date-guessing
 * game's five-tier ladder, blue down to red (lib/game/verdict-style.ts) — which
 * is the one thing on the screen that must not read as decoration. The
 * comparison game grades no tiers, so on that page the only colours are its own
 * green and the dim of a miss.
 *
 * **It is sized to a viewport that must not scroll.** Both pages are exactly
 * `100dvh` less the bar, so this caps its own height and scrolls internally if
 * a short window ever leaves it no room — a scrollbar inside the panel is
 * recoverable, the Play again button below the fold is not.
 */
export function SetSummary({
  results,
  title,
  otherHref,
  otherLabel,
  onPlayAgain,
  t,
}: {
  results: readonly SetResult[];
  /** The game's own name, for the heading and the first line of the share text. */
  title: string;
  /** The other game mode — the one natural thing to do next besides replaying. */
  otherHref: string;
  otherLabel: string;
  onPlayAgain: () => void;
  t: Dict;
}) {
  const summary = summarizeSet(results);
  const grade = gradeSet(summary);
  const panel = useRef<HTMLDivElement>(null);

  // The set ending is a change of screen, not of round, and nothing the player
  // pressed is still on the page — so focus has to be moved or it is left on a
  // button that no longer exists, which drops a keyboard user back to the top
  // of the document and tells a screen reader nothing. The panel takes it
  // rather than a button: landing on "Play again" would make Enter restart a
  // set the player has not been told the result of yet.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center py-2">
      <div
        ref={panel}
        tabIndex={-1}
        role="group"
        aria-label={`${t.setComplete} — ${title}`}
        className="set-summary-in flex max-h-full w-full max-w-md flex-col gap-5 overflow-y-auto rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl focus:outline-none"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {t.setComplete}
          </p>
          <h2 className="mt-1 font-display text-base font-semibold text-ink">
            {title}
          </h2>
        </div>

        {/* The headline number. `tabular-nums` so it cannot shift width between
            a two- and three-digit percentage on replay. */}
        <div>
          <p
            className="font-display text-6xl font-semibold leading-none tracking-tight tabular-nums"
            style={{ color: GRADE_COLOR[grade] }}
          >
            {summary.percent}%
          </p>
          <p className="mt-2 text-sm text-white/75">
            {format(t.setScore, {
              hits: summary.hits,
              total: summary.total,
            })}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {t[GRADE_LABEL_KEYS[grade]]}
          </p>
        </div>

        <Pips results={results} />

        {/* Best streak earns its line only once it is worth something: at one,
            it says nothing the percentage has not already said. */}
        {summary.bestStreak > 1 && (
          <p className="text-xs text-white/55">
            {t.setBestStreak}:{" "}
            <span className="font-semibold text-ink tabular-nums">
              {summary.bestStreak}
            </span>
          </p>
        )}

        {summary.byVerdict && <Breakdown byVerdict={summary.byVerdict} t={t} />}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className={`${SUMMARY_BUTTON} bg-ink text-page hover:opacity-85`}
          >
            {t.playAgain}
          </button>

          <ShareButton
            buildText={() =>
              shareText({
                title,
                results,
                summary,
                url: window.location.href,
              })
            }
            t={t}
          />
        </div>

        <a
          href={otherHref}
          className="text-xs text-white/55 underline-offset-4 transition hover:text-ink hover:underline"
        >
          {otherLabel}
        </a>
      </div>
    </div>
  );
}

/**
 * Shared geometry, so the two stacked buttons cannot differ by a pixel.
 *
 * Exported because the survival run's results screen stacks the same two
 * buttons (components/survival-summary.tsx) and a second copy of these numbers
 * is a second place for them to drift.
 */
export const SUMMARY_BUTTON =
  "w-full rounded-full border px-6 py-2.5 text-sm font-semibold transition";

/**
 * The headline colour tracks the grade, but stops short of red.
 *
 * Red is the colour of a wrong answer in both games, and a whole set is not an
 * answer — painting a weak set in it would read as a scolding rather than as a
 * score. A rough set is dimmed instead, which says the same thing quietly.
 */
export const GRADE_COLOR: Record<SetGrade, string> = {
  flawless: "var(--color-good)",
  strong: "var(--color-good)",
  fair: "var(--color-ink)",
  rough: "var(--color-ink-dim)",
};

/** Exported with `GRADE_COLOR` for the daily, which grades a ten the same way. */
export const GRADE_LABEL_KEYS: Record<SetGrade, keyof Dict> = {
  flawless: "gradeFlawless",
  strong: "gradeStrong",
  fair: "gradeFair",
  rough: "gradeRough",
};

/**
 * One pip per question, in the order they were played.
 *
 * It is the only part of the screen that says *where* the set went wrong rather
 * than how much — a run of misses at the end reads differently from three
 * scattered ones, and the player can see which they had.
 *
 * Exported for the daily mode's results screen, which is a ten-question set
 * and so wants exactly this strip — the same reasoning as `ShareButton` and
 * `SUMMARY_BUTTON` below. The survival run writes its own, because two hundred
 * answers have to be a block rather than a row.
 */
export function Pips({ results }: { results: readonly SetResult[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {results.map((result, at) => {
        // A tiered game paints the tier; the comparison game, which has no
        // tiers, keeps the plain green pip for a hit and a hollow one for a
        // miss. `setSquares` picks its emoji against exactly this, so a pasted
        // result looks like the screen it came from.
        const color = result.verdict
          ? verdictPip(result.verdict)
          : result.hit
            ? "var(--color-good)"
            : "transparent";

        return (
          <span
            key={at}
            className="h-3.5 w-3.5 rounded-[4px] border"
            style={{
              backgroundColor: color,
              // A hollow pip is the comparison game's miss: nothing to read
              // as a score, but still a slot, so the strip stays ten wide and
              // the shape of the set is legible at a glance. The tiered game
              // has a colour for every rung, its bottom one included.
              borderColor:
                color === "transparent" ? "rgb(255 255 255 / 0.25)" : color,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * How the ten guesses were graded, for the game that grades in tiers.
 *
 * Empty tiers are dropped rather than shown as zero: a set with no perfects
 * should not print a row saying so, and the rows that remain are the ones the
 * player actually earned.
 *
 * Exported for the daily mode, whose ten questions are graded on the same
 * ladder; a second copy of this would be a second place for the rows to drift
 * out of step with the tiers.
 */
export function Breakdown({
  byVerdict,
  t,
}: {
  byVerdict: Record<Verdict, number>;
  t: Dict;
}) {
  const rows = (Object.keys(byVerdict) as Verdict[]).filter(
    (verdict) => byVerdict[verdict] > 0,
  );
  if (rows.length === 0) return null;

  return (
    <div className="border-t border-white/10 pt-4">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
        {t.setBreakdown}
      </p>
      <dl className="flex flex-col gap-1.5">
        {rows.map((verdict) => (
          <div key={verdict} className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-sm text-white/75">
              <span
                className="h-2.5 w-2.5 rounded-full border"
                style={{
                  backgroundColor: verdictPip(verdict),
                  borderColor: verdictPip(verdict),
                }}
              />
              {t[VERDICT_LABEL_KEYS[verdict]]}
            </dt>
            <dd className="text-sm font-semibold text-ink tabular-nums">
              {byVerdict[verdict]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** How long the button holds its "Copied" state before going back. */
const SHARE_FEEDBACK_MS = 2000;

/**
 * Share, by whichever route the browser actually has.
 *
 * The text is built by the caller rather than here, because the two games that
 * end on a results screen say different things in it — a set quotes a
 * percentage of ten and a run quotes a count with no ceiling. Everything that
 * is awkward about sharing is the same for both, though, which is why this is
 * one button: the sheet-then-clipboard fallback, the cancel that must not be
 * reported as a failure, and the URL read at click time.
 *
 * `navigator.share` is the right one on a phone — it opens the OS sheet and the
 * player picks the app — but it does not exist on most desktop browsers and
 * throws on a user cancel, which is not a failure and must not be reported as
 * one. So: try the sheet, fall back to the clipboard, and tell the player which
 * of the two happened. `AbortError` is swallowed on purpose.
 *
 * The URL is read at click time from `window.location` rather than baked in,
 * because the site has no domain yet (CLAUDE.md, gap 1) and a hardcoded one
 * would be wrong on every host it is played from.
 *
 * There is deliberately no preview of the emoji grid here. It carries exactly
 * what the pips above already show, and at the size it would have to be the
 * black squares of a missed question are invisible against the panel — so the
 * one thing a preview would add is the impression that the grid renders badly.
 */
export function ShareButton({
  buildText,
  t,
}: {
  /**
   * Called at click time, not at render: the URL comes from
   * `window.location` (the site has no domain yet) and must be read when the
   * player actually presses the button.
   */
  buildText: () => string;
  t: Dict;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function flash(next: "copied" | "failed") {
    setState(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setState("idle"),
      SHARE_FEEDBACK_MS,
    );
  }

  async function share() {
    const text = buildText();

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // Dismissing the sheet is a choice, not an error — say nothing and
        // leave the button as it was.
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        // Anything else means the sheet is unusable here; the clipboard below
        // is the fallback rather than a second failure.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      flash("copied");
    } catch {
      flash("failed");
    }
  }

  const label =
    state === "copied"
      ? t.shareCopied
      : state === "failed"
        ? t.shareFailed
        : t.shareResult;

  return (
    <button
      type="button"
      onClick={share}
      className={`${SUMMARY_BUTTON} border-white/45 bg-black/45 text-ink backdrop-blur-md hover:bg-black/65`}
    >
      {label}
    </button>
  );
}

/**
 * The live "question 3 of 10" counter.
 *
 * Both game screens are exactly one viewport and must not scroll, and their
 * height budgets are already spoken for — so this is built to be positioned
 * absolutely over something, never to take a row of its own. The date-guessing
 * game puts it on the photograph (where the verdict already lives, for the same
 * reason); the comparison game puts it in the empty top of its upper lane.
 */
export function SetProgress({
  played,
  total,
  size = "sm",
  t,
}: {
  /** Questions already answered and advanced past, so the live one is `played + 1`. */
  played: number;
  total: number;
  /**
   * How large the pill is set.
   *
   * A prop rather than a `className` the caller appends, because the two sizes
   * differ in utilities that set the same properties — which of them won would
   * come down to Tailwind's output order. `sm` is the one-column games', where
   * this stands over a photograph in a tight header; `md` is for a screen with
   * the room to read it as a label rather than as a footnote.
   */
  size?: "sm" | "md";
  t: Dict;
}) {
  return (
    <span
      className={`rounded-full border border-white/20 bg-black/55 font-semibold tabular-nums text-white/80 backdrop-blur-md ${
        size === "md" ? "px-3 py-1.5 text-[13px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      {format(t.setProgress, { n: Math.min(played + 1, total), total })}
    </span>
  );
}
