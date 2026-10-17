"use client";

import { useState } from "react";

import { submitDateChallenge } from "@/app/actions/challenges";
import type { ChallengeDirection } from "@/lib/db/challenges";
import type { SupportedLocale } from "@/lib/db/types";
import type { GuessAccuracy, Verdict } from "@/lib/game/scoring";
import {
  VERDICT_COLORS,
  VERDICT_LABEL_KEYS,
  verdictDeckFoot,
  verdictDeckHead,
  verdictEdge,
  verdictSweep,
} from "@/lib/game/verdict-style";
import { formatYear, formatYearCount } from "@/lib/historical-date";
import { dateLabels, format, type Dict } from "@/lib/i18n/dictionary";

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
 * Below that the verdict goes back on the photograph (`RoundVerdict` at the
 * foot of this file, which hides itself at the same width), and the
 * note is simply not shown: a phone has no sides, and a second overlay on the
 * picture would bury the picture.
 *
 * **The two are deliberately not equally transparent**, which they were until
 * 2026-10-07. Both were ~50% glass over whatever photograph the round had
 * dealt, and the result panel's own colour was the casualty: the tier's hue
 * reached the eye as a 14% tint over a 50% scrim over an arbitrary picture,
 * which for the yellow tier is not a colour anybody could name. The result is
 * the one thing on this screen that has to be read at a glance, so it is the
 * less transparent of the two: 90% (`DECK_ALPHA` in
 * lib/game/verdict-style.ts, chosen on 2026-10-08) against the note panel's
 * 80%. The size of neither has ever changed.
 *
 * Nothing here decides anything. The grade is `gradeGuess`'s and arrives as a
 * prop; the only thing either panel writes is a challenge, and that goes
 * through the one validated Server Action.
 */

/**
 * The box both panels share, so they are a matched pair rather than two boxes
 * that happen to be the same size.
 *
 * It is the box and nothing else. The padding and the centring used to live
 * here too, and moved into `NoteFlank` on 2026-10-08 when the result became a
 * card with a coloured head: that head has to reach all four of its own edges,
 * so a panel-wide `p-5` is the one thing it cannot have.
 *
 * `overflow-hidden` is what rounds the head's top corners — it has a square
 * box of its own and is clipped by the card, which is also why the card's
 * radius is the only place that radius is written.
 */
const FLANK =
  "absolute inset-y-0 z-20 hidden w-60 flex-col overflow-hidden rounded-3xl border text-center shadow-2xl shadow-black/60 backdrop-blur-2xl min-[1120px]:flex";

/**
 * The result, in the colour of the guess.
 *
 * **The hue is a block, not a tint.** The panel was a dark surface whose fill
 * carried about a sixth of the tier's colour until 2026-10-08, with the word
 * on it printed in a gradient of the same hue — so two neighbouring rungs of a
 * five-step ladder differed by the colour of thirty-odd pixels of type. The
 * card is now a saturated head over a dark foot: ~110px of the tier's own
 * colour, which is read before the word is, and the word itself is plain
 * near-black on it rather than a gradient competing with its own background.
 * `verdictDeckHead` is where that colour is mixed; this file picks none.
 *
 * **The foot is the two numbers, labelled.** The distance and the guess used
 * to be a sentence and a caption under the word; as a pair of labelled rows
 * they are the same two facts with the hierarchy stated rather than implied,
 * and the row rule between them is the only line the card needs.
 *
 * **It is 10% transparent, like a ticket held up to the light**, which is also
 * why the notches between head and foot are punched out of the head rather
 * than painted on it — see `.verdict-deck-head` in app/globals.css. At 90% the
 * round's photograph is present behind the card without being legible through
 * it, which is the whole difference between a card on a picture and a card cut
 * from one.
 *
 * The actual year is deliberately absent. It is marked on the rail, under the
 * camera that has just flown to it, and printing it here as well would be two
 * reveals of one answer — the same rule the round's caption follows.
 */
export function VerdictFlank({
  accuracy,
  guess,
  locale,
  tp = null,
  t,
}: {
  accuracy: GuessAccuracy;
  guess: number;
  locale: SupportedLocale;
  /** What the round was worth, or null where TP is not shown. */
  tp?: number | null;
  t: Dict;
}) {
  return (
    <VerdictDeck
      accuracy={accuracy}
      guess={guess}
      locale={locale}
      tp={tp}
      t={t}
      className={`round-flank-left right-full mr-4 ${FLANK}`}
    />
  );
}

/**
 * The result card itself, with no opinion about where it stands.
 *
 * Split out of `VerdictFlank` when the film & TV game arrived: that layout
 * puts the poster down the left and the rail down the right, so its result has
 * no flank to hang off and lands in a row under the rail instead — but it is
 * the *same card*, and a second implementation of it would be a second place
 * the tier's colour, the notches and the two facts have to be kept in step.
 *
 * So the box is the caller's (`className` carries the position, the size and
 * the entrance animation) and everything inside it is here. The two facts are
 * fixed rather than a prop, because every game that shows this card is a
 * date-guessing game and reports the same two things: how far off, and what
 * was guessed. The comparison game measures something else entirely and has
 * its own card (`VerdictDeckRow` below) for exactly that reason.
 *
 * `headShare` is the one dimension the caller can move, and it has to be: the
 * head is a share of the card's height rather than a fixed number of pixels,
 * and the two callers' cards are different shapes — a 15rem-wide flank as tall
 * as a photograph, and a wider, shorter card in a reserved row.
 */
export function VerdictDeck({
  accuracy,
  guess,
  locale,
  className = "",
  headShare = "46%",
  tp = null,
  t,
}: {
  accuracy: GuessAccuracy;
  guess: number;
  locale: SupportedLocale;
  /** What the round was worth, printed under the tier; null hides it. */
  tp?: number | null;
  /** The box: position, size, and whatever entrance it arrives with. */
  className?: string;
  /** How much of the card's height the coloured head takes. */
  headShare?: string;
  t: Dict;
}) {
  const { verdict } = accuracy;

  return (
    <aside
      role="status"
      className={className}
      style={{
        borderColor: verdictEdge(verdict),
        background: verdictDeckFoot(),
      }}
    >
      <div
        className="verdict-deck-head flex shrink-0 flex-col items-center justify-center gap-2.5 px-4"
        style={{ height: headShare, backgroundImage: verdictDeckHead(verdict) }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/55">
          {t.resultTitle}
        </p>
        <p className="font-display text-[34px] font-semibold leading-[0.95] tracking-tight text-[#0a0a0a]">
          {t[VERDICT_LABEL_KEYS[verdict]]}
        </p>
        {tp !== null && (
          <p className="text-[13px] font-semibold tabular-nums text-black/60">
            {tpLabel(tp)}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3.5 px-5 py-4">
        <DeckRow label={t.distanceTitle} ruled>
          <span className="text-ink">
            {accuracy.distance === 0
              ? t.correct
              : format(t.yearsOff, {
                  n: formatYearCount(accuracy.distance, locale, dateLabels(t)),
                })}
          </span>
        </DeckRow>

        {/* The one number on the card the player chose themselves, and the only
            thing below the head that takes the tier's colour. */}
        <DeckRow label={t.yourGuess}>
          <span style={{ color: VERDICT_COLORS[verdict] }}>
            {formatYear(guess, dateLabels(t))}
          </span>
        </DeckRow>
      </div>
    </aside>
  );
}

/**
 * One labelled fact on the card's foot.
 *
 * The rule belongs to the row above rather than sitting between the two as an
 * element of its own, so a card with one row — which is what a future verdict
 * with nothing to compare against would be — needs no special case.
 */
function DeckRow({
  label,
  ruled = false,
  children,
}: {
  label: string;
  ruled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-1 ${
        ruled ? "border-b border-white/10 pb-3" : ""
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
        {label}
      </span>
      <span className="text-base font-semibold leading-snug tabular-nums">
        {children}
      </span>
    </div>
  );
}

/**
 * The same result card, lying down: the comparison game's verdict.
 *
 * That screen has no sides to hang a flank off — its two anchors already use
 * the full width — and no spare height either, so the card it gets is the
 * tall one rotated into the row the verdict was always reserved. Everything
 * that makes the flank legible survives the turn: the tier's own colour as a
 * block rather than a tint, the word in near-black on it, the notches that
 * say "ticket", the near-black foot carrying labelled facts. What changes is
 * only the axis and the scale.
 *
 * **It is exactly the height of the box it stands in** (`h-16`, the verdict's
 * reserved block), which is what keeps it free: that screen's height is a
 * hand-maintained sum (`--compare-chrome`), so a card even slightly taller
 * than the room already set aside would come out of the two photographs. The
 * fixed height is also why it clips rather than wraps — a long date in a
 * narrow column must not be the thing that decides how tall the round is.
 *
 * The notches move with the axis: `.verdict-deck-head-row` punches them out
 * of the head's *right* edge, where the perforation of a landscape ticket
 * goes, rather than its lower corners.
 *
 * `facts` rather than named props because the two games measure different
 * things — years there, sections here — and the card's job is to lay out
 * whatever the round has to report, not to know which round it is.
 */
export function VerdictDeckRow({
  verdict,
  facts,
  tp = null,
  t,
}: {
  verdict: Verdict;
  /** Labelled facts for the foot, left to right. Two fit; three is a squeeze. */
  facts: { label: string; value: string }[];
  /**
   * What the round was worth. Rides in the head's label line ("Result · +5
   * TP") rather than as a third fact, which is the squeeze the note above
   * warns about.
   */
  tp?: number | null;
  t: Dict;
}) {
  return (
    <aside
      role="status"
      className="round-verdict-in flex h-16 w-full max-w-[24rem] overflow-hidden rounded-2xl border text-left shadow-xl shadow-black/60 backdrop-blur-2xl"
      style={{
        borderColor: verdictEdge(verdict),
        background: verdictDeckFoot(),
      }}
    >
      <div
        className="verdict-deck-head-row flex w-[7.5rem] shrink-0 flex-col justify-center gap-1 px-3.5 sm:w-[8.75rem]"
        style={{ backgroundImage: verdictDeckHead(verdict) }}
      >
        <p className="whitespace-nowrap text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-black/55">
          {t.resultTitle}
          {tp !== null && <> · {tpLabel(tp)}</>}
        </p>
        {/* Wraps to two lines rather than shrinking: the longest of the five
            languages ("Loin du compte") does not fit this width on one, and a
            per-language size would be a measurement to keep. */}
        <p className="font-display text-[15px] font-semibold leading-[1.05] tracking-tight text-[#0a0a0a] sm:text-base">
          {t[VERDICT_LABEL_KEYS[verdict]]}
        </p>
      </div>

      {/* The first fact is a short count and keeps its natural width; whatever
          follows takes the rest and truncates, because a long date must not be
          what squeezes the number beside it. */}
      <div className="flex min-w-0 flex-1 items-center gap-4 px-4">
        {facts.map((fact, index) => (
          <div
            key={fact.label}
            className={`flex flex-col gap-1 ${
              index === 0 ? "shrink-0" : "min-w-0 flex-1"
            }`}
          >
            <span className="truncate text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-white/40">
              {fact.label}
            </span>
            <span className="truncate text-[13px] font-semibold leading-none tabular-nums text-ink">
              {fact.value}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/**
 * What the event was, opposite the result — and where its date is argued with.
 *
 * The dataset has no descriptions yet — `event_translation.description` is
 * null for all 497 rows — so this shows placeholder prose until they are
 * written, in five languages like every other piece of event text. The
 * fallback is on the *value*, not on a flag, so the day the real descriptions
 * land they simply start appearing here with nothing to switch over.
 *
 * **The challenge lives here now**, under a rule of its own, where it was a
 * 32px "?" in the corner of the result panel until 2026-10-07. Two reasons,
 * and the second is the load-bearing one: it is noticeable instead of being a
 * punctuation mark, and it is on the panel about the *event* rather than on
 * the panel about the player's guess — what is being disputed is the date this
 * panel describes, not the verdict it earned. It takes its space from the
 * description, which is why that stays a scroller: the panel's own size did
 * not change.
 */
export function NoteFlank({
  note,
  eventId,
  t,
}: {
  /**
   * The event's own description, or null for an event that has none.
   *
   * The fallback below is on the *value*, never on a flag or a mode, which is
   * what lets one panel serve a dataset that is half written: football's 97
   * events arrived with five-language descriptions and show them, while the
   * 497 historical events still show the placeholder and will start showing
   * real prose the day theirs are seeded — with nothing here to switch over.
   */
  note: string | null;
  /** What a challenge from this panel would be about. */
  eventId: string;
  t: Dict;
}) {
  return (
    <NoteDeck
      note={note}
      eventId={eventId}
      t={t}
      // The same near-black the result card's foot is mixed from, at 80% —
      className={`round-flank-right left-full ml-4 ${FLANK}`}
    />
  );
}

/**
 * The event panel itself, with no opinion about where it stands — the
 * companion to `VerdictDeck`, split out in the same pass and for the same
 * reason.
 *
 * The description is its own scroll container rather than letting the panel
 * grow, in every layout: a panel pinned to a photograph's height and a panel
 * in a reserved row both have a height decided for them, and a long
 * description must not be the thing that decides it — nor the thing that
 * pushes the challenge below the lower edge.
 */
export function NoteDeck({
  note,
  eventId,
  className = "",
  t,
}: {
  note: string | null;
  eventId: string;
  /**
   * The box: position, size, and **the display mode**.
   *
   * Deliberately not defaulted to `flex flex-col` here, even though both
   * callers want exactly that. The flank's own box is `hidden` until 1120px
   * and turns into a flex column there, and a `flex` written into this
   * component would be a second `display` declaration at the same specificity
   * — so which of the two won would come down to Tailwind's output order, and
   * the panel would be one stylesheet reshuffle away from appearing on a
   * phone.
   */
  className?: string;
  t: Dict;
}) {
  return (
    <aside
      // The near-black the result card's foot is mixed from, at 80% —
      // `bg-black/60` until 2026-10-07. Two changes in one: the fill is a
      // notch denser, and it is now the *pair's* colour rather than pure
      // black, so the two panels flanking the photograph read as one set of
      // chrome at two depths instead of two different darks. At 60% whatever
      // the round had dealt — a pale sky, a lit interior — came through
      // brightly enough to compete with the small type on it. It stays
      // translucent rather than opaque because it is pinned to a picture and
      // has to read as part of it, and it stays below the result card's 90%
      // for the reason it always has: the verdict is the thing read at a
      // glance, so it is the less transparent of the two.
      className={`items-center justify-center gap-3.5 border-white/14 bg-[#070707]/80 p-5 ${className}`}
    >
      <p className="on-photo text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
        {t.eventNoteTitle}
      </p>
      {/* Its own scroll container rather than letting the panel grow: the
          flanks are pinned to the card's height, and a long description must
          not be the thing that decides how tall the round is — nor the thing
          that pushes the challenge below the panel's lower edge. */}
      <div className="min-h-0 w-full overflow-y-auto">
        <p className="on-photo text-sm leading-relaxed text-white/75">
          {note?.trim() || PLACEHOLDER_NOTE}
        </p>
      </div>

      <div className="w-full shrink-0 border-t border-white/12 pt-3.5">
        <DateChallenge eventId={eventId} t={t} />
      </div>
    </aside>
  );
}

/**
 * Stand-in prose, for an event whose description is not written yet.
 *
 * Deliberately Lorem Ipsum rather than a plausible sentence about the event:
 * this is a history game, and invented filler that reads as fact is the one
 * kind of placeholder it must not ship. Nonsense Latin cannot be mistaken for
 * something the game is teaching.
 */
const PLACEHOLDER_NOTE =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

/**
 * "Is this date wrong?" — four steps behind one button.
 *
 *   idle   the invitation, which is a labelled control rather than a "?"
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
          // Was a bare "?" in a 32px circle, which said nothing about what
          // pressing it would do. The question mark is still here, as the
          // badge beside the words rather than instead of them.
          className="flex w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/30 text-[11px]"
          >
            ?
          </span>
          {t.challengeOpen}
        </button>
      </div>
    );
  }

  return (
    <div className="challenge-in pointer-events-auto space-y-2.5 rounded-2xl border border-white/15 bg-black/45 p-3">
      {stage === "ask" && (
        <>
          <p className="on-photo text-xs text-white/75">{t.challengeAsk}</p>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setStage("choose")}
              className={`w-full ${CHALLENGE_BUTTON}`}
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

/**
 * The round's result, painted over the foot of the photograph.
 *
 * **This is the narrow-screen fallback, not the main event.** The result moved
 * out to `VerdictFlank` beside the card on 2026-10-06, because a verdict
 * across the picture covers the one thing the round is about — but the flanks
 * need a screen with sides to it, and below 1120px there are none. So this
 * stays, hidden at exactly the width the panels appear at, and the two are
 * never on screen together.
 *
 * It lives here rather than in components/timeline-game.tsx because it is the
 * same decision the flanks are — what a verdict looks like, and at which width
 * — and there are two callers of it now: the solo game and the daily. Two
 * copies would be two breakpoints to keep in step with one another and with
 * `FLANK` above.
 *
 * It mounts only once a guess is in, which is what makes the pop-in animation
 * run per round rather than once on load. The scrim is what keeps it legible:
 * the picture underneath it is a different photograph every round and cannot
 * be relied on to be dark.
 *
 * The guessed year is repeated here even though the rail marks it, because the
 * camera may have flown several eras away to the answer by the time this is
 * read, taking the player's own marker off screen with it.
 *
 * The challenge sits in here as well as in the flank, so reporting a wrong
 * date is not something only a wide screen can do. The surrounding block is
 * `pointer-events-none` — it is a scrim over a photograph and must not swallow
 * anything — so the one part of it that is a control says so for itself.
 */
export function RoundVerdict({
  accuracy,
  guess,
  eventId,
  locale,
  tp = null,
  t,
}: {
  accuracy: GuessAccuracy;
  guess: number;
  eventId: string;
  locale: SupportedLocale;
  tp?: number | null;
  t: Dict;
}) {
  return (
    <div
      role="status"
      className="round-verdict-in pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-14 text-center min-[1120px]:hidden"
    >
      <p
        className="on-photo font-display text-3xl font-semibold leading-none tracking-tight sm:text-4xl"
        style={{
          // The same gradient the wide-screen panel paints the word in, so a
          // phone and a desktop report a tier in the same colour.
          backgroundImage: verdictSweep(accuracy.verdict),
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        {t[VERDICT_LABEL_KEYS[accuracy.verdict]]}
      </p>
      <p className="on-photo text-xs text-white/80 sm:text-sm">
        {accuracy.distance === 0
          ? t.correct
          : format(t.yearsOff, {
              n: formatYearCount(accuracy.distance, locale, dateLabels(t)),
            })}
        <span className="px-1.5 text-white/40">·</span>
        {t.yourGuess}: {formatYear(guess, dateLabels(t))}
        {tp !== null && (
          <>
            <span className="px-1.5 text-white/40">·</span>
            {tpLabel(tp)}
          </>
        )}
      </p>

      <div className="mt-1 flex justify-center">
        <DateChallenge eventId={eventId} t={t} />
      </div>
    </div>
  );
}

/** A round's TP as it is printed: always signed, so zero reads as a payout. */
export function tpLabel(tp: number): string {
  return `+${tp} TP`;
}
