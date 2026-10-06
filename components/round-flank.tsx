"use client";

import { useState } from "react";

import { submitDateChallenge } from "@/app/actions/challenges";
import { VERDICT_COLORS, VERDICT_LABEL_KEYS } from "@/components/timeline-stage";
import type { ChallengeDirection } from "@/lib/db/challenges";
import type { SupportedLocale } from "@/lib/db/types";
import type { GuessAccuracy } from "@/lib/game/scoring";
import { formatYear, formatYearCount } from "@/lib/historical-date";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The two panels that flank the event card once a guess is locked in: the
 * result on the left, what the event was on the right.
 *
 * **They are beside the picture, not on it.** The result used to be painted
 * over the foot of the photograph, which kept it out of the column's height
 * budget but put a verdict across the one thing the round is actually about.
 * The flanks cost the budget nothing for a different reason: they are
 * absolutely positioned against the card's own box, so the card does not move
 * when they arrive and the column's height is exactly what it was before the
 * guess.
 *
 * **There are only sides on a wide screen**, which is what the breakpoint is.
 * The card is 32rem at `sm` and up, a flank is 15rem, and the gap is 1rem, so
 * the three want 512 + 2x256 = 1024px of content — the page's column is the
 * viewport less its `px-6`, so 1120px of viewport leaves ~48px of slack.
 * Below that the verdict goes back on the photograph (`RoundVerdict` in
 * components/timeline-game.tsx, which hides itself at the same width), and the
 * note is simply not shown: a phone has no sides, and a second overlay on the
 * picture would bury the picture.
 *
 * Nothing here decides anything. The grade is `gradeGuess`'s and arrives as a
 * prop; the only thing either panel writes is a challenge, and that goes
 * through the one validated Server Action.
 */

/** Geometry both panels share, so they are a matched pair rather than two
 *  boxes that happen to be the same size. */
const FLANK =
  "absolute inset-y-0 z-20 hidden w-60 flex-col justify-center gap-4 overflow-hidden rounded-3xl border p-5 text-left shadow-2xl shadow-black/60 backdrop-blur-2xl min-[1120px]:flex";

/**
 * The result, in the colour of the guess.
 *
 * The verdict's own colour carries the whole panel — border, fill and the word
 * itself — which is what "the area appears in the colour of the guess" means
 * here. `VERDICT_COLORS` stays the one place those are chosen, so the panel
 * can never disagree with the pip on the summary screen.
 *
 * The actual year is deliberately absent. It is marked on the rail, under the
 * camera that has just flown to it, and printing it here as well would be two
 * reveals of one answer — the same rule the round's caption follows.
 */
export function VerdictFlank({
  accuracy,
  guess,
  eventId,
  locale,
  t,
}: {
  accuracy: GuessAccuracy;
  guess: number;
  /** What a challenge from this panel would be about. */
  eventId: string;
  locale: SupportedLocale;
  t: Dict;
}) {
  const color = VERDICT_COLORS[accuracy.verdict];

  return (
    <aside
      role="status"
      className={`round-flank-left right-full mr-4 ${FLANK}`}
      style={{
        // Mixed rather than two hand-picked colours per verdict: the tint is
        // defined once as a share of whatever `VERDICT_COLORS` holds, so
        // retuning a verdict's colour retunes its panel with it.
        borderColor: `color-mix(in srgb, ${color} 38%, transparent)`,
        background: `color-mix(in srgb, ${color} 14%, rgba(0, 0, 0, 0.5))`,
      }}
    >
      <p
        className="on-photo font-display text-4xl font-semibold leading-none tracking-tight"
        style={{ color }}
      >
        {t[VERDICT_LABEL_KEYS[accuracy.verdict]]}
      </p>

      <div className="space-y-1 text-sm">
        <p className="on-photo text-white/85">
          {accuracy.distance === 0
            ? t.correct
            : format(t.yearsOff, {
                n: formatYearCount(accuracy.distance, locale),
              })}
        </p>
        <p className="on-photo text-white/60">
          {t.yourGuess}: <span className="tabular-nums">{formatYear(guess)}</span>
        </p>
      </div>

      <DateChallenge eventId={eventId} t={t} />
    </aside>
  );
}

/**
 * What the event was, opposite the result.
 *
 * The dataset has no descriptions yet — `event_translation.description` is
 * null for all 497 rows — so this shows placeholder prose until they are
 * written, in five languages like every other piece of event text. The
 * fallback is on the *value*, not on a flag, so the day the real descriptions
 * land they simply start appearing here with nothing to switch over.
 */
export function NoteFlank({
  note,
  t,
}: {
  /** The event's own description, or null while the dataset has none. */
  note: string | null;
  t: Dict;
}) {
  return (
    <aside
      className={`round-flank-right left-full ml-4 border-white/12 bg-black/50 ${FLANK}`}
    >
      <p className="on-photo text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
        {t.eventNoteTitle}
      </p>
      {/* Its own scroll container rather than letting the panel grow: the
          flanks are pinned to the card's height, and a long description must
          not be the thing that decides how tall the round is. */}
      <div className="min-h-0 overflow-y-auto">
        <p className="on-photo text-sm leading-relaxed text-white/75">
          {note?.trim() || PLACEHOLDER_NOTE}
        </p>
      </div>
    </aside>
  );
}

/**
 * Stand-in prose, until the five-language descriptions are in the database.
 *
 * Deliberately Lorem Ipsum rather than a plausible sentence about the event:
 * this is a history game, and invented filler that reads as fact is the one
 * kind of placeholder it must not ship. Nonsense Latin cannot be mistaken for
 * something the game is teaching.
 */
const PLACEHOLDER_NOTE =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

/**
 * "Is this date wrong?" — four steps behind one question mark.
 *
 *   idle   the mark alone, so the panel is a result first and a form second
 *   ask    the question, and the button that commits to answering it
 *   choose earlier or later, which is the whole of the report
 *   done   thanks, and nothing further to press
 *
 * The two answers are a signed vote (`later` = +1, `earlier` = -1) that the
 * admin panel ranks events by; lib/db/challenges.ts is where the word becomes
 * the number, and this component never sees it.
 *
 * It is deliberately not latched optimistically. The player is thanked once
 * the row is in, and a failed send offers the choice again rather than
 * claiming a correction that was never recorded — the same rule the rest of
 * the codebase follows about latching before a request is known to have
 * succeeded.
 *
 * It unmounts with the panel at the end of a round, which is what resets it:
 * there is no state to clear because there is no state that outlives the
 * event it was about.
 */
export function DateChallenge({
  eventId,
  t,
}: {
  eventId: string;
  t: Dict;
}) {
  const [stage, setStage] = useState<
    "idle" | "ask" | "choose" | "sending" | "done" | "failed"
  >("idle");

  async function send(direction: ChallengeDirection) {
    setStage("sending");
    try {
      const result = await submitDateChallenge(eventId, direction);
      setStage(result.ok ? "done" : "failed");
    } catch {
      setStage("failed");
    }
  }

  if (stage === "idle") {
    return (
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={() => setStage("ask")}
          aria-label={t.challengeOpen}
          title={t.challengeOpen}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/10 text-sm font-semibold text-white/70 transition hover:bg-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          ?
        </button>
      </div>
    );
  }

  return (
    <div className="challenge-in pointer-events-auto space-y-2 rounded-2xl border border-white/15 bg-black/35 p-3">
      {stage === "ask" && (
        <>
          <p className="on-photo text-xs text-white/75">{t.challengeAsk}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStage("choose")}
              className={CHALLENGE_BUTTON}
            >
              {t.challengeAction}
            </button>
            <button
              type="button"
              onClick={() => setStage("idle")}
              className="text-xs text-white/45 underline-offset-2 transition hover:text-white/75 hover:underline"
            >
              {t.challengeDismiss}
            </button>
          </div>
        </>
      )}

      {(stage === "choose" || stage === "failed") && (
        <>
          <p className="on-photo text-xs text-white/75">
            {stage === "failed" ? t.challengeFailed : t.challengeDirection}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => send("earlier")}
              className={`flex-1 ${CHALLENGE_BUTTON}`}
            >
              {t.challengeEarlier}
            </button>
            <button
              type="button"
              onClick={() => send("later")}
              className={`flex-1 ${CHALLENGE_BUTTON}`}
            >
              {t.challengeLater}
            </button>
          </div>
        </>
      )}

      {stage === "sending" && (
        <p className="on-photo text-xs text-white/55">{t.challengeSending}</p>
      )}

      {stage === "done" && (
        <p className="on-photo text-xs text-white/80">{t.challengeThanks}</p>
      )}
    </div>
  );
}

const CHALLENGE_BUTTON =
  "rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
