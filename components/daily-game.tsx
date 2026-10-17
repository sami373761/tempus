"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchDailyAttempt, submitDailyGuess } from "@/app/actions/daily";
import { DailySummary } from "@/components/daily-summary";
import {
  NoteFlank,
  RoundVerdict,
  VerdictFlank,
} from "@/components/round-flank";
import { SoloRoundTimer, useSoloRoundClock } from "@/components/round-timer";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import {
  openingFractions,
  panDuration,
  PAN_MS,
  railGap,
  REVEAL_HOLD_MS,
  RoundCard,
  ROUND_BUTTON,
  TimelinePaneView,
} from "@/components/timeline-stage";
import type { SupportedLocale } from "@/lib/db/types";
import {
  accuracyOf,
  DAILY_GUEST_STORE_KEY,
  parseGuestStore,
  QUESTIONS_PER_DAILY,
  serializeGuestStore,
  type DailyAnswer,
  type DailyAudience,
  type DailyGuestStore,
} from "@/lib/game/daily";
import {
  DEFAULT_PANE,
  entryFraction,
  paneForYear,
  TIMELINE_PANES,
  type TimelinePane,
  yearAtFraction,
} from "@/lib/game/timeline";
import type { MaskedEvent } from "@/lib/game/versus";
import { VERDICT_COLORS } from "@/lib/game/verdict-style";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * Daily mode: the date-guessing screen, playing a fixed ten, once a day.
 *
 * It is the solo game's screen with the queue taken out of it. The backdrop,
 * the photograph, the ruler, the marker, the result panels and the button are
 * all the same components (components/timeline-stage.tsx,
 * components/round-flank.tsx); what this file adds is only what "once a day,
 * the same for everybody, and it counts" makes necessary.
 *
 * **The questions are masked and the grading is the server's.** A
 * `MaskedEvent` is `LocalizedEvent` with the date fields absent *from the
 * type*, so there is no year on this client until it has guessed — the year
 * comes back in the reply to its own locked-in guess (`submitDailyGuess`).
 * That is the head-to-head mode's rule and it is here for the same reason: a
 * member's daily score is durable, and a client that knew the answers could
 * write a perfect one.
 *
 * **The note is part of the answer, so it arrives with it.** A description is
 * prose about the event and names its date as often as not, so the page sends
 * it only for questions already answered; the one for the question on screen
 * comes back in the same reply as its year and is kept in `notes`, keyed by
 * question. A guest keeps theirs beside the attempt in `localStorage`, so a
 * reload loses neither.
 *
 * **`answers` is the attempt, and `shownIdx` is the screen.** They are two
 * pieces of state rather than one because an answer is *final the moment it is
 * graded*, while the player is still looking at the reveal. Banking it
 * immediately — to the row for a member, to `localStorage` for a guest — is
 * what closes the obvious loophole: answer, see the verdict, refresh, answer
 * again. `shownIdx` only moves when the player presses on, so the reveal is
 * still on screen while the answer behind it is already spent.
 *
 * **A refresh resumes; it does not restart.** The attempt is read on mount
 * (from props for a member, from storage for a guest), `shownIdx` starts at
 * however many answers it holds, and a full ten goes straight to the result
 * screen. The one thing a refresh costs is the reveal that was on screen when
 * it happened, which is the right thing to lose.
 *
 * **What a guest's one attempt is worth saying plainly.** It is
 * `localStorage`, so it survives a reload, a new tab and a restarted browser,
 * and it is lost if they clear site data or open a private window. That is the
 * strongest promise a browser with no identity in it can make, and it is why
 * the two audiences get disjoint questions (see lib/game/daily.ts): the thing
 * that must not be bypassable is not "a guest replaying a game that records
 * nothing", it is "a guest learning the answers an account would be asked".
 */
export function DailyGame({
  puzzleDate,
  audience,
  questions,
  answers: bankedAnswers,
  bankedPoints,
  completed,
  t,
  locale,
}: {
  /** The server's day, `YYYY-MM-DD`. Never computed in the browser. */
  puzzleDate: string;
  audience: DailyAudience;
  /** The day's ten, in the order everybody is asked them. */
  questions: MaskedEvent[];
  /** A member's answers so far. Always empty for a guest — see `hydrated`. */
  answers: DailyAnswer[];
  bankedPoints: number;
  completed: boolean;
  t: Dict;
  locale: SupportedLocale;
}) {
  const member = audience === "member";

  const [answers, setAnswers] = useState<DailyAnswer[]>(bankedAnswers);
  // Which question is on screen. Behind `answers` by one while a reveal is
  // being read, and equal to it otherwise.
  const [shownIdx, setShownIdx] = useState(bankedAnswers.length);
  /**
   * Whether the attempt has been read.
   *
   * A member's arrives with the first render, so it is true immediately. A
   * guest's is in `localStorage`, which a server render cannot see, so it has
   * to be read in an effect — and the game must not be drawn before then, or a
   * player who finished this morning gets a frame of question 1 before the
   * result screen replaces it.
   */
  const [hydrated, setHydrated] = useState(member);
  /**
   * Whether the day was *already* finished when this page opened, as opposed
   * to being finished on it.
   *
   * It decides one line on the result screen ("you have already played
   * today"), and it has to be state rather than the `completed` prop because a
   * guest's attempt is not known until the effect below has read it — the prop
   * is only ever about a member.
   */
  const [resumedComplete, setResumedComplete] = useState(
    completed || bankedAnswers.length >= QUESTIONS_PER_DAILY,
  );

  const [pane, setPane] = useState<TimelinePane>(DEFAULT_PANE);
  // One position per pane, exactly as the solo game keeps it: panning away and
  // back must not lose the marker.
  const [fractions, setFractions] =
    useState<Record<TimelinePane, number>>(openingFractions);
  // The year locked in for the question on screen. Set the moment the button
  // is pressed, so the marker stops moving before the server has replied.
  const [guess, setGuess] = useState<number | null>(null);
  const [guessPane, setGuessPane] = useState<TimelinePane | null>(null);
  const [panMs, setPanMs] = useState(PAN_MS);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [points, setPoints] = useState(bankedPoints);
  /**
   * Each answered question's note, as its reveal brought it back — on this
   * page, or (for a guest) on an earlier visit, read back from the store.
   *
   * Absent means nothing has said, which is not the same as null ("it has
   * none"), though both read the same way below: they fall back to the
   * event's own description, which the page filled in for a member's earlier
   * answers and left null for everything else.
   */
  const [notes, setNotes] = useState<RevealNotes>({});

  const travelTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (travelTimer.current !== null)
        window.clearTimeout(travelTimer.current);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  /* ----------------------------------------------------------------------
     A guest's attempt
     ---------------------------------------------------------------------- */

  // Read once, on mount. The stored day is compared against the server's
  // `puzzleDate` inside `parseGuestStore`, which is what makes a new day a
  // fresh attempt without the browser's own clock getting a say.
  useEffect(() => {
    if (member) return;

    let stored: DailyAnswer[] = [];
    let storedNotes: RevealNotes = {};
    try {
      const raw = window.localStorage.getItem(DAILY_GUEST_STORE_KEY);
      stored = parseGuestStore(raw, puzzleDate);
      storedNotes = parseRevealNotes(raw, puzzleDate, stored.length);
    } catch {
      // Storage can be unavailable outright (private mode in some browsers,
      // or a blocked origin). The honest consequence is that a guest there can
      // replay the day, and there is nothing client-side that could prevent
      // it — so the game is played rather than refused.
      stored = [];
      storedNotes = {};
    }

    setAnswers(stored);
    setNotes(storedNotes);
    setShownIdx(stored.length);
    setResumedComplete(stored.length >= QUESTIONS_PER_DAILY);
    setHydrated(true);
  }, [member, puzzleDate]);

  // Write back on every change, so the attempt is durable from the instant an
  // answer is graded rather than from when the player presses on. Guarded on
  // `hydrated`, or the empty initial state would overwrite the real one before
  // the effect above has read it.
  //
  // The notes ride in the same record rather than a key of their own, so they
  // are replaced with the day they belong to and there is still nothing to
  // prune. `parseGuestStore` reads only `answers`, and a record written before
  // notes existed reads back as having none, so the stored attempt's shape is
  // untouched either way.
  useEffect(() => {
    if (member || !hydrated) return;
    try {
      const store: DailyGuestStore & { notes: (string | null)[] } = {
        puzzleDate,
        answers,
        // One per answer, in order, so a note can never outlive the answer it
        // came with — the store is truncated at the first gap on the way in,
        // and this keeps the two lists the same length on the way out.
        notes: answers.map((answer) => notes[answer.idx] ?? null),
      };
      window.localStorage.setItem(
        DAILY_GUEST_STORE_KEY,
        serializeGuestStore(store),
      );
    } catch {
      // See above: nothing to recover, and nothing worth telling the player.
    }
  }, [member, hydrated, puzzleDate, answers, notes]);

  /* ----------------------------------------------------------------------
     The round
     ---------------------------------------------------------------------- */

  const event = questions[shownIdx] ?? null;
  const upcoming = questions[shownIdx + 1] ?? null;
  // The answer to the question on screen, if it has been graded. Null is "the
  // guess is still to be made", which is also the state a resumed attempt
  // opens in.
  const revealed = answers[shownIdx] ?? null;
  const accuracy = revealed ? accuracyOf(revealed) : null;
  const answered = revealed !== null;
  const done = answers.length >= QUESTIONS_PER_DAILY && shownIdx >= QUESTIONS_PER_DAILY;
  const lastQuestion = shownIdx === QUESTIONS_PER_DAILY - 1;

  // Focus follows the button swap, so a keyboard player is not dropped to
  // <body> when the pressed button turns `inert` — see the solo game's copy
  // in components/timeline-game.tsx for the rule.
  const lockButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const wasAnswered = useRef(answered);
  useEffect(() => {
    if (wasAnswered.current === answered) return;
    wasAnswered.current = answered;
    const from = answered ? lockButton.current : nextButton.current;
    const to = answered ? nextButton.current : lockButton.current;
    const active = document.activeElement;
    if (!active || active === document.body || active === from) {
      to?.focus({ preventScroll: true });
    }
  }, [answered]);

  // Pull the next question's photograph while this one is being guessed, so
  // the dissolve has something to dissolve to.
  useEffect(() => {
    const url = upcoming?.image?.url;
    if (!url) return;
    const preload = new window.Image();
    preload.src = url;
  }, [upcoming?.image?.url]);

  const answerPane = revealed ? paneForYear(revealed.year) : null;
  // The answer appears when the camera gets there: the hold plus the journey.
  const answerDelayMs =
    guessPane === null || answerPane === null || guessPane === answerPane
      ? 0
      : REVEAL_HOLD_MS + panDuration(guessPane, answerPane);

  /**
   * Fly to the era the answer lives in, once the server has said which one
   * that is.
   *
   * An effect rather than part of `submit`, which is the one structural
   * difference from the solo game: there the year is already in hand when the
   * guess is locked, here it arrives a round trip later. So the camera leaves
   * when the answer does, and the hold is measured from that moment rather
   * than from the press.
   */
  useEffect(() => {
    if (!revealed || guessPane === null) return;
    const target = paneForYear(revealed.year);
    if (target === guessPane) return;

    travelTimer.current = window.setTimeout(() => {
      setPanMs(panDuration(guessPane, target));
      setPane(target);
    }, REVEAL_HOLD_MS);

    return () => {
      if (travelTimer.current !== null) {
        window.clearTimeout(travelTimer.current);
        travelTimer.current = null;
      }
    };
  }, [revealed, guessPane]);

  const move = useCallback((nextPane: TimelinePane, nextFraction: number) => {
    setFractions((current) => ({ ...current, [nextPane]: nextFraction }));
  }, []);

  function enter(nextPane: TimelinePane) {
    move(nextPane, entryFraction(nextPane, pane));
    setPanMs(PAN_MS);
    setPane(nextPane);
  }

  async function submit() {
    if (answered || sending || !event) return;

    const year = yearAtFraction(pane, fractions[pane]);
    setGuess(year);
    setGuessPane(pane);
    setSending(true);
    setFailed(false);

    try {
      const result = await submitDailyGuess(shownIdx, year);

      if (result.ok) {
        // Appended only if it is genuinely the next one, so a reply that
        // arrives after the state has moved on cannot insert itself at the
        // wrong index.
        setAnswers((current) =>
          current.length === result.answer.idx
            ? [...current, result.answer]
            : current,
        );
        // Keyed by the reply's own index rather than `shownIdx`, for the
        // reason the append above is guarded: it is the answer's note, not the
        // screen's.
        setNotes((current) => ({
          ...current,
          [result.answer.idx]: result.note,
        }));
        if (result.banked) setPoints(result.banked.points);
        return;
      }

      // "Stale" means the row moved under this tab — the same account playing
      // in two of them. The database is right by definition, so adopt what it
      // holds rather than showing a result it never recorded.
      if (result.reason === "stale") {
        const fresh = await fetchDailyAttempt();
        if (fresh) {
          setAnswers(fresh.answers);
          setShownIdx(fresh.answers.length);
          setPoints(fresh.points);
          setGuess(null);
          setGuessPane(null);
          return;
        }
      }

      throw new Error(result.reason);
    } catch {
      // The guess is handed back rather than kept: an answer that was not
      // graded is not an answer, and the one thing this must never do is leave
      // the player locked out of a question nothing was recorded for. The same
      // rule as the challenge panel's — never latch before a request is known
      // to have succeeded.
      setGuess(null);
      setGuessPane(null);
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  /**
   * On to the next question — or to the result screen, on the tenth.
   *
   * The camera flies back to the common era rather than cutting to it, which
   * carries the backdrop through its own crossfade, and the rails are reset in
   * two parts for the solo game's reason: the pane being landed on is reset
   * now (it is off camera, or already on screen where the marker simply glides
   * home), and every other pane keeps its marker until the journey is over, or
   * the rails the camera is about to fly past visibly jump.
   */
  function advance() {
    if (!answered) return;

    const from = pane;
    const travel = from === DEFAULT_PANE ? 0 : panDuration(from, DEFAULT_PANE);

    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);

    setShownIdx((at) => at + 1);
    setGuess(null);
    setGuessPane(null);
    setFailed(false);
    setFractions((current) => ({ ...current, [DEFAULT_PANE]: 0.5 }));

    if (travel > 0) {
      setPanMs(travel);
      setPane(DEFAULT_PANE);
    }

    resetTimer.current = window.setTimeout(
      () => setFractions(openingFractions()),
      travel,
    );
  }

  /* ----------------------------------------------------------------------
     Render
     ---------------------------------------------------------------------- */

  // Thirty seconds a question, kept across a reload: the day's ten questions
  // are the same on every load, so a clock that restarted would be a reload's
  // worth of time to look the answer up (see `useSoloRoundClock`).
  const clockKey = `daily:${puzzleDate}:${shownIdx}`;
  const clock = useSoloRoundClock({
    round: clockKey,
    picture: event?.image?.url ?? null,
    live: hydrated && event !== null && !done && !answered && guess === null,
    onExpire: () => void submit(),
    persistKey: clockKey,
  });

  // A guest before their store has been read. The backdrop is already mounted
  // behind it, so this is a held frame rather than a blank page — and it is
  // one tick in practice.
  if (!hydrated) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        <TimelineBackdrop pane={DEFAULT_PANE} />
        {/* The menu button's own arc (`.pending-ring` in app/globals.css)
            rather than a second spinner, with `--ring-inset: 0` because this
            one owns its box instead of hanging off a control — the explorer's
            coin does the same. */}
        <span
          aria-hidden="true"
          className="relative block h-9 w-9 text-ink/45"
        >
          <span
            className="pending-ring"
            data-busy="true"
            style={{ ["--ring-inset" as string]: "0px" }}
          />
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4 sm:gap-5">
      {/* Full-bleed and fixed, so it must stay out of any transformed
          ancestor; see the component itself. */}
      <TimelineBackdrop pane={pane} />

      {done || !event ? (
        <DailySummary
          answers={answers}
          puzzleDate={puzzleDate}
          audience={audience}
          points={points}
          // True when the page was opened into a finished day rather than
          // having just finished one — the line that says so is the whole of
          // what tells a revisit from an ending.
          revisit={resumedComplete}
          locale={locale}
          t={t}
        />
      ) : (
        <>
          <div className="relative flex min-h-[9.625rem] w-full max-w-[25rem] flex-1 flex-col items-stretch sm:max-h-[26rem] sm:max-w-[32rem]">
            {accuracy && revealed && (
              <>
                <VerdictFlank
                  accuracy={accuracy}
                  guess={revealed.guess}
                  locale={locale}
                  t={t}
                />
                <NoteFlank
                  note={notes[shownIdx] ?? event.description}
                  eventId={event.id}
                  t={t}
                />
              </>
            )}

            <RoundCard
              event={event}
              t={t}
              // Both corners are overlays on the photograph rather than rows
              // of their own: this screen is the solo game's height budget and
              // has nothing spare. The left says which game and where you are
              // in it — the daily has no masthead of its own for the same
              // reason the solo game lost its.
              counter={
                <span className="rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-md">
                  {/* The mode's name is dropped below `sm`, which is what
                      keeps the two chips apart on a 320px phone: the two
                      longest languages leave 7px between them with it
                      (Turkish) and the next word added would overlap. Nothing
                      is lost — the player pressed Daily to get here, the
                      document title says so, and what is left is exactly the
                      counter the solo game draws in the same corner. */}
                  <span className="hidden sm:inline">
                    {t.dailyTitle}
                    <span className="px-1 text-white/40">·</span>
                  </span>
                  <span className="tabular-nums">
                    {format(t.setProgress, {
                      n: Math.min(shownIdx + 1, QUESTIONS_PER_DAILY),
                      total: QUESTIONS_PER_DAILY,
                    })}
                  </span>
                </span>
              }
              // The right says whether it counts. For a member that is the
              // running score, which is the one thing triple points are worth
              // showing live; for a guest it is the fact that nothing is being
              // kept, said once, where it cannot be missed and cannot be
              // mistaken for a score.
              //
              // Top-aligned rather than centred on the 40px timer: centred,
              // the 27px chip would stand 7px lower than the counter chip
              // opposite, and jump up when the timer goes at lock-in.
              aside={
                <span className="flex items-start gap-2">
                  {member ? (
                    <span className="rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-md">
                      <span className="tabular-nums text-ink">
                        {points.toLocaleString(locale)}
                      </span>{" "}
                      {t.dailyPointsLabel}
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/60 backdrop-blur-md">
                      {t.dailyGuestScore}
                    </span>
                  )}
                  {!answered && guess === null && (
                    <SoloRoundTimer clock={clock} t={t} />
                  )}
                </span>
              }
              badge={
                accuracy && revealed ? (
                  <RoundVerdict
                    accuracy={accuracy}
                    guess={revealed.guess}
                    eventId={event.id}
                    locale={locale}
                    t={t}
                  />
                ) : failed ? (
                  // The one failure this screen can have. It takes the slot the
                  // verdict will occupy — which is empty until there is one —
                  // so saying so costs the height budget nothing.
                  <p
                    role="status"
                    className="round-verdict-in absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-10 text-center text-xs font-semibold text-white/85"
                  >
                    {t.dailySubmitFailed}
                  </p>
                ) : null
              }
            />
          </div>

          {/* Stage viewport: clips the panes that are off camera. */}
          <div className="w-full shrink-0 overflow-hidden">
            <div
              className="flex transition-transform ease-[cubic-bezier(0.65,0,0.35,1)]"
              style={{
                transform: `translateX(-${TIMELINE_PANES.indexOf(pane) * 100}%)`,
                transitionDuration: `${panMs}ms`,
              }}
            >
              {TIMELINE_PANES.map((candidate) => (
                <TimelinePaneView
                  key={candidate}
                  pane={candidate}
                  active={candidate === pane}
                  fraction={fractions[candidate]}
                  onFractionChange={(next) => move(candidate, next)}
                  // Locked from the press, not from the reply: the rail must
                  // not be draggable while a guess is in flight, or the marker
                  // the player ends up being graded on is not the one they
                  // left on screen.
                  answered={answered || sending}
                  showGuess={guess === null || guessPane === candidate}
                  answerYear={answerPane === candidate ? revealed!.year : null}
                  answerDelayMs={answerDelayMs}
                  gap={railGap({
                    pane: candidate,
                    guessPane,
                    guessFraction:
                      guessPane === null ? 0 : fractions[guessPane],
                    answerPane,
                    answerYear: revealed?.year ?? null,
                    answerDelayMs,
                  })}
                  gapColor={accuracy ? VERDICT_COLORS[accuracy.verdict] : null}
                  locale={locale}
                  t={t}
                  onEnter={enter}
                />
              ))}
            </div>
          </div>

          {/* One button, one place, all round — the solo game's footer exactly.
              `inert` keeps whichever is hidden off the tab order while it is
              only holding the slot open. */}
          <div className="grid shrink-0 place-items-center">
            {/* Staggered, not crossfaded, so the two labels are never on
                screen on top of each other — see the solo game's. */}
            <div
              className={`col-start-1 row-start-1 transition-opacity ${
                answered
                  ? "opacity-0 duration-150"
                  : "opacity-100 duration-200 delay-150"
              }`}
              inert={answered}
            >
              <button
                ref={lockButton}
                type="button"
                onClick={submit}
                // Never disabled, like every other advance button on the site:
                // a press while the grade is in flight is already ignored by
                // `submit`, and the busy state is what says so.
                aria-busy={sending}
                className={`${ROUND_BUTTON} relative bg-ink text-page hover:opacity-85 ${
                  sending ? "cursor-progress opacity-60" : ""
                }`}
              >
                {t.submitGuess}
                {/* The solo game's "Next round" trace, while the guess is
                    graded. */}
                {sending && (
                  <span aria-hidden="true" className="round-trace">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
            </div>

            <div
              className={`col-start-1 row-start-1 transition-opacity ${
                answered
                  ? "opacity-100 duration-200 delay-150"
                  : "opacity-0 duration-150"
              }`}
              inert={!answered}
            >
              <button
                ref={nextButton}
                type="button"
                onClick={advance}
                className={`${ROUND_BUTTON} border border-white/45 bg-black/45 text-ink backdrop-blur-md hover:bg-black/65`}
              >
                {lastQuestion ? t.seeResults : t.nextRound}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Notes by question index — see `notes` in the component. */
type RevealNotes = Record<number, string | null>;

/**
 * The notes out of a guest's stored record, for the first `count` questions —
 * the answers `parseGuestStore` kept.
 *
 * Read here rather than in lib/game/daily.ts because they are not part of the
 * attempt: nothing is graded, banked or resumed from them, and the stored
 * answer's shape is the database's as well as the browser's. Validated anyway,
 * on the attempt's own rules — the same day, nothing past the answers — and a
 * hand-edited entry that is not a string is dropped, which only ever hands back
 * the placeholder. What a guest can write into their own store is shown to
 * nobody but them, and as text.
 */
function parseRevealNotes(
  raw: string | null,
  puzzleDate: string,
  count: number,
): RevealNotes {
  if (!raw || count === 0) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    if (record.puzzleDate !== puzzleDate || !Array.isArray(record.notes)) {
      return {};
    }

    const notes: RevealNotes = {};
    record.notes.slice(0, count).forEach((note: unknown, idx: number) => {
      if (typeof note === "string") notes[idx] = note;
    });
    return notes;
  } catch {
    return {};
  }
}
