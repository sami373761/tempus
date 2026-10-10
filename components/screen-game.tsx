"use client";

import { useCallback, useEffect, useState } from "react";

import { dealScreenEvents } from "@/app/actions/rounds";
import { DateEntry, InputModeToggle } from "@/components/date-entry";
import {
  NoteDeck,
  RoundVerdict,
  VerdictDeck,
} from "@/components/round-flank";
import { SetProgress, SetSummary } from "@/components/set-summary";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import {
  PosterCard,
  railGap,
  ROUND_BUTTON_LG,
  TimelinePaneView,
} from "@/components/timeline-stage";
import type { SupportedLocale } from "@/lib/db/types";
import {
  directYear,
  EMPTY_DATE_ENTRY,
  type DateEntryValue,
} from "@/lib/game/date-entry";
import {
  EXCLUDED_EVENT_LIMIT,
  ROUND_QUEUE_DEPTH,
  ROUND_QUEUE_TARGET,
} from "@/lib/game/rounds";
import type { ScreenEvent } from "@/lib/game/screen";
import { gradeGuess, SCREEN_BANDS } from "@/lib/game/scoring";
import {
  QUESTIONS_PER_SET,
  timelineResult,
  type SetResult,
} from "@/lib/game/set";
import {
  fractionAtYear,
  paneBounds,
  SCREEN_DEFAULT_PANE,
  SCREEN_PANES,
  yearAtFraction,
} from "@/lib/game/timeline";
import { VERDICT_COLORS } from "@/lib/game/verdict-style";
import type { Dict } from "@/lib/i18n/dictionary";

/** How long to wait before trying again when topping the queue up fails. */
const REFILL_RETRY_MS = 1500;

/**
 * How long the answer waits before it lands on the rail.
 *
 * The general game holds for 700ms (`REVEAL_HOLD_MS`) because its camera is
 * about to fly to another era and the player has to be given a moment with
 * their own marker first. There is one rail here and nothing travels, so this
 * is only the beat between the press and the answer — long enough that the two
 * read as cause and effect rather than as one frame.
 */
const REVEAL_DELAY_MS = 240;

/**
 * The film & television game: a poster down the left, the rail down the right.
 *
 * **Why this is a layout of its own rather than `TimelineGame` with a flag.**
 * Every other date-guessing screen on the site is one column — picture,
 * caption, rail, button — and that column is built around a landscape
 * photograph whose height is the thing that gives. A poster is 2:3. Put one in
 * that column and either the picture is cropped to a letterbox (which cuts off
 * the title, the credit block and usually the artwork, i.e. everything the
 * player is being asked to read) or it is left tall and there is no room below
 * it for a rail at all. The poster has to go beside the rail, not above it.
 *
 * Two things follow from the split, and both are improvements rather than
 * compromises:
 *
 *   * **The rail is much wider.** It gets a whole column instead of sharing
 *     one with a picture, which on a 1680px window is ~690px of line for 126
 *     years — about 5px per year, against 1px per year for the same span on
 *     the general timeline's common-era pane.
 *   * **The result has somewhere to go.** On `/guess` the two panels have to
 *     hang off the card's box as flanks, because the column has no spare
 *     height and the screen must not scroll. Here the right-hand column has a
 *     row reserved under the button, so they are laid out in flow — the same
 *     two panels, in the same order, from the same components (`VerdictDeck`
 *     and `NoteDeck`).
 *
 * **It is still exactly one viewport.** The page wrapper is `100dvh` less the
 * bar, like `/guess` and `/compare`, and every part of this that cannot shrink
 * says so (`shrink-0`). Two things give: the poster takes whatever height the
 * left column has left, and the rail is centred in whatever the right column
 * has left. Nothing moves when a round is answered, because the result's row
 * is reserved before there is a result to put in it.
 *
 * **Below 1120px it is one column again** — the width at which `/guess`'s
 * flanks appear, reused deliberately so the two screens change shape at the
 * same place. Stacked, the poster still takes the slack, the rail still gets
 * the full width, and the result goes back onto the poster as `RoundVerdict`,
 * which hides itself at exactly that width.
 *
 * **Rounds are a queue, not a route**, exactly as in the other games: the page
 * deals the first two and this tops the queue back up from the server while
 * the current poster is still being guessed. See `TimelineGame` for the full
 * note; the only difference here is that there is one pane, so "next round" is
 * a dissolve with no camera move behind it.
 *
 * **The rail does not fold away when the date is typed.** The one-column games
 * collapse it to make room for the entry, because they have no spare height;
 * this layout has the entry in its own row and keeps the rail — and the marker
 * tracks what is being typed, so the rail becomes a live readout of the guess
 * instead of disappearing. It is `locked` rather than hidden: shown, but not
 * draggable, so the two ways of answering cannot disagree about which one the
 * guess came from.
 */
export function ScreenGame({
  events,
  t,
  locale,
}: {
  events: ScreenEvent[];
  t: Dict;
  locale: SupportedLocale;
}) {
  // One rail, so one position — the general game needs a record keyed by pane
  // because panning away and back must not lose the marker, and there is
  // nowhere to pan to here.
  const [fraction, setFraction] = useState(0.5);
  const [guess, setGuess] = useState<number | null>(null);
  // The round being played is the head of the queue; the one behind it is held
  // only so its poster can be pulled and swapped in instantly.
  const [queue, setQueue] = useState<ScreenEvent[]>(events);
  const [refillAttempt, setRefillAttempt] = useState(0);
  // Latched when the player presses "Next round" before the queue has a round
  // to give them. The button is never dead, only late.
  const [pendingNext, setPendingNext] = useState(false);
  // The set so far: one entry per question already answered *and* advanced
  // past, so its length is both the score and the position in the set.
  const [results, setResults] = useState<SetResult[]>([]);
  // Which events this set has already used, so the draw can be told what not
  // to deal again — see the refill effect.
  const [played, setPlayed] = useState<string[]>([]);
  // Typing the year rather than dragging for it. A preference, not a round's
  // state: a player who wanted to type one year almost certainly wants to type
  // the next.
  const [direct, setDirect] = useState(false);
  const [entry, setEntry] = useState<DateEntryValue>(EMPTY_DATE_ENTRY);
  // Set by a refused lock-in and cleared by the next edit, so the warning
  // answers the press rather than nagging at a half-typed year.
  const [invalid, setInvalid] = useState(false);
  const event = queue[0] ?? null;
  const upcoming = queue[1] ?? null;

  // Top the queue back up in the background, and tell the draw what this set
  // has already used. Keyed on the queue's length rather than on its contents,
  // so playing a round triggers exactly one refill; `refillAttempt` is what
  // lets a failed one be tried again, since a failure leaves the length — and
  // therefore the dependencies — unchanged. The pool is 200 entries and a set
  // spends ten of them, which is well inside the range where chance alone
  // produces duplicates. See `exclude` in lib/db/queries.ts: it is a
  // preference on the server's side, not a filter, so a pool with nothing
  // unseen left still returns a full draw.
  useEffect(() => {
    if (queue.length >= ROUND_QUEUE_TARGET) return;

    let cancelled = false;
    let retry: number | null = null;

    // Everything this set has in play: answered and left behind, plus the
    // rounds still queued ahead of the one on screen. Most recent last, since
    // that is the end `EXCLUDED_EVENT_LIMIT` keeps.
    const dealt = [...played, ...queue.map((held) => held.id)];

    dealScreenEvents(ROUND_QUEUE_DEPTH, dealt.slice(-EXCLUDED_EVENT_LIMIT))
      .then((fresh) => {
        if (cancelled) return;
        setQueue((current) => {
          // Belt and braces for the one case the server cannot honour, and
          // **never the whole batch**: this effect is keyed on the queue's
          // length, so a draw that added nothing would never be retried and
          // the queue would stop growing.
          const added = fresh.filter(
            (candidate) => !current.some((held) => held.id === candidate.id),
          );
          return [...current, ...(added.length > 0 ? added : fresh)];
        });
      })
      .catch(() => {
        if (cancelled) return;
        retry = window.setTimeout(
          () => setRefillAttempt((n) => n + 1),
          REFILL_RETRY_MS,
        );
      });

    return () => {
      cancelled = true;
      if (retry !== null) window.clearTimeout(retry);
    };
    // `queue` and `played` are read for the exclusion list but deliberately
    // not depended on: a draw already in flight has no reason to be restarted
    // because the player answered a question, and the length is what says a
    // refill is owed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, refillAttempt]);

  // Pull the next round's poster while this one is still being guessed, so the
  // dissolve has something to dissolve *to*.
  useEffect(() => {
    const url = upcoming?.image?.url;
    if (!url) return;

    const preload = new window.Image();
    preload.src = url;
  }, [upcoming?.image?.url]);

  // What a typed year may name: the two ends of this game's own rail, so 1750
  // is refused rather than clamped onto an edge it does not stand for.
  const bounds = paneBounds(SCREEN_DEFAULT_PANE);
  const typed = direct ? directYear(entry, bounds) : null;

  const answered = guess !== null;
  // While a year is being typed the marker follows it, which is what makes
  // keeping the rail on screen worth doing. It falls back to wherever the
  // marker was left as soon as the field is empty or holds a year off the
  // rail, rather than jumping to an edge.
  const railFraction =
    direct && !answered && typed !== null
      ? fractionAtYear(SCREEN_DEFAULT_PANE, typed)
      : fraction;
  const railYear = yearAtFraction(SCREEN_DEFAULT_PANE, railFraction);

  // Graded on plain years, not on the event's age: every entry in this pool is
  // between 2 and 95 years old, so an age carries no information. See
  // `SCREEN_BANDS`.
  const accuracy =
    guess !== null && event
      ? gradeGuess(guess, event.year, SCREEN_BANDS)
      : null;
  const setComplete = results.length >= QUESTIONS_PER_SET;
  const lastQuestion = results.length === QUESTIONS_PER_SET - 1;

  const move = useCallback((next: number) => setFraction(next), []);

  /** Lock the guess in. The answer then lands on the rail beside it. */
  function submit() {
    if (answered || !event) return;

    if (direct) {
      if (typed === null) {
        setInvalid(true);
        return;
      }
      // The marker is already standing on the typed year — it has been
      // tracking the field — so this only makes that position the one the
      // round keeps.
      setFraction(fractionAtYear(SCREEN_DEFAULT_PANE, typed));
      setGuess(typed);
      return;
    }

    setGuess(railYear);
  }

  /** Advance for real. Callers are responsible for there being a round to take. */
  function advance() {
    if (!upcoming || !accuracy || !event) return;

    // Banked here rather than at `submit`, so `results.length` is always the
    // number of questions *left behind* — which makes it the index of the one
    // on screen as well as the score.
    setResults((current) => [...current, timelineResult(accuracy.verdict)]);
    // Banked alongside the verdict, so the next refill can ask for something
    // this set has not already shown.
    setPlayed((current) => [...current, event.id].slice(-EXCLUDED_EVENT_LIMIT));

    setGuess(null);
    setFraction(0.5);
    // **Both halves are cleared, era included.** The era used to be carried
    // over on the grounds that it was an opinion about the round rather than
    // an answer to it. It is not: a player who typed a BCE year last round
    // types "1492" into a pill that still says BCE and locks in 1492 BCE,
    // which is the one way this control can take a guess the player did not
    // make. A fresh round asks a fresh question, so it starts at the entry's
    // own zero (`EMPTY_DATE_ENTRY`) — CE, empty — and a BCE answer costs the
    // one press it costs on the first round of a set.
    setEntry(EMPTY_DATE_ENTRY);
    setInvalid(false);
    setQueue((current) => current.slice(1));
  }

  /**
   * What the button calls. If the queue has not caught up the press is
   * remembered rather than dropped, and the effect below plays it the moment a
   * round arrives — so the button is never dead, only late.
   */
  function requestNextRound() {
    if (!accuracy) return;
    if (!upcoming) {
      setPendingNext(true);
      return;
    }
    advance();
  }

  // `advance` is deliberately not a dependency: it is re-created every render
  // and would restart this effect forever. The effect only runs on the render
  // where `upcoming` has just arrived, so the `advance` it closes over is that
  // render's — which is the current one.
  useEffect(() => {
    if (!pendingNext || !upcoming || !accuracy) return;
    setPendingNext(false);
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNext, upcoming, accuracy]);

  if (!event) return null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* Full-bleed and fixed, so it must stay out of any transformed
          ancestor; see the note in the component itself. One pane, so there is
          nothing to crossfade — it holds for the whole game. */}
      <TimelineBackdrop pane={SCREEN_DEFAULT_PANE} panes={SCREEN_PANES} />

      {setComplete ? (
        // The round underneath is already reset to a fresh question, so the
        // summary floats over the game rather than replacing the screen.
        <SetSummary
          results={results}
          title={t.screenTitle}
          otherHref="/guess"
          otherLabel={t.timelineTitle}
          // A new set starts over on which events count as repeats too, or a
          // long session would end up asking the draw to avoid the whole pool.
          onPlayAgain={() => {
            setResults([]);
            setPlayed([]);
          }}
          t={t}
        />
      ) : (
        /* The split. A flex column below 1120px and two columns above it, which
           is one declaration rather than two layouts: the poster block takes
           the slack in the column and stretches to the row's height in the
           grid, and the right-hand block is content-height in the column and
           full-height in the grid.

           **The poster's width sets the height of the whole split.** `2:3` is
           the card's shape, so one number — the width of the left column —
           decides both how tall the poster is and, because the row is that
           tall, where the bottom of the right-hand column falls. That is what
           lands the result decks on the poster's own bottom edge instead of
           somewhere below it, and it is why the block is `flex-none` here:
           taking the slack of the page (`flex-1`, which is what it still does
           stacked) would stretch the row past the poster and put the two
           columns out of register again. `max-h-full` is the brake for a
           window too short for the full 3:2 — the row shrinks, the poster
           with it, and the screen still does not scroll.

           27vw is measured rather than picked: a 2:3 poster fills a 16:9
           window's game area — `100dvh` less the bar and the page's own
           padding — at almost exactly 27% of its width, so on an ordinary
           desktop the poster very nearly reaches the foot of the page. The
           15rem floor keeps it a poster rather than a thumbnail at 1120px;
           the 26rem cap stops it running away on a very wide window, past
           which the rail gets the room instead. */
        <div
          // All three in one place because each is derived from the one above
          // it, and a ratio kept in two spellings is a ratio that drifts.
          //
          // `--result-h` is the row the decks stand in, and it is a share of
          // the split rather than a fixed height for the reason the split is
          // a share of the poster: the column is only as tall as the poster
          // is wide, so a row tall enough to hold a five-line description at
          // 1680px would, at 1120px, leave the rail less room than the rail
          // takes and push it under the button. 44% is the share that reaches
          // the 17rem the longest description in the pool needs (206
          // characters, four lines at this card's width, measured — not
          // picked) on an ordinary desktop, and the 14rem floor is what the
          // row was before, which is the most a narrow window can give it.
          style={
            {
              "--poster-w": "clamp(15rem, 27vw, 26rem)",
              "--poster-h": "calc(var(--poster-w) * 1.5)",
              "--result-h": "clamp(14rem, calc(var(--poster-h) * 0.44), 17rem)",
            } as React.CSSProperties
          }
          className="flex min-h-0 flex-1 flex-col gap-4 min-[1120px]:grid min-[1120px]:h-[var(--poster-h)] min-[1120px]:max-h-full min-[1120px]:flex-none min-[1120px]:grid-cols-[var(--poster-w)_minmax(0,1fr)] min-[1120px]:gap-7">
          <PosterCard
            event={event}
            // Resolved here rather than inside the card: the card is shared
            // with the head-to-head mode and the "Born When?" game, and the
            // fact each of them labels the picture with is its own. See
            // `PosterEvent`.
            pill={
              event.format === null
                ? null
                : event.format === "series"
                  ? t.formatSeries
                  : t.formatFilm
            }
            // On the poster below 1120px for the reason every overlay on these
            // screens is: the stacked layout is a height budget with nothing
            // spare, and the result in the flow would be another row. Above
            // that width it hides itself and the decks in the right-hand
            // column take over — which is also why the title only gives up
            // the poster's foot at the narrow width.
            titleHidden={answered ? "narrow" : false}
            badge={
              accuracy && guess !== null ? (
                <RoundVerdict
                  accuracy={accuracy}
                  guess={guess}
                  eventId={event.id}
                  locale={locale}
                  t={t}
                />
              ) : null
            }
            t={t}
          />

          {/* The right-hand column: what the game is, the rail, the one button
              that answers the round, and the row the result lands in.

              Capped and centred, which is now the stacked layout's business
              rather than the split's: above 1120px the page's own container
              (the site bar's width, see the page) already settles this column
              at ~790px, and the cap is what stops the rail becoming a
              full-width ruler on one column at 1119px. The head and the
              result row carry the same horizontal padding the rail's own pane
              does (`px-8 sm:px-12`, which exists so an end tick label has room
              to centre on its mark), which is what makes the three of them
              line up on the same two edges. */}
          <div className="mx-auto flex w-full min-h-0 max-w-5xl flex-col">
            <div className="flex shrink-0 items-start justify-between gap-4 px-8 pt-1 sm:px-12">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                  {t.screenTitle}
                </h2>
                {/* Not a flourish: the stored year is a release for a film and
                    a premiere for a series, and a player shown the poster of a
                    show that ran eight years has to be told which of the two
                    is being asked. See lib/game/screen.ts. */}
                <p className="on-photo mt-1 text-sm leading-snug text-white/60">
                  {t.screenYearAsked}
                </p>
              </div>
              <div className="shrink-0 pt-0.5">
                <SetProgress
                  played={results.length}
                  total={QUESTIONS_PER_SET}
                  // A size up, like the controls below: this screen reads its
                  // header at the top of a column rather than over a
                  // photograph in a one-column game's tight head.
                  size="md"
                  t={t}
                />
              </div>
            </div>

            {/* The rail, at the **foot** of whatever the column has left over
                rather than centred in it. The button under it is the answer to
                the rail — you drag the marker, you lock it in — and half the
                slack standing between the two read as a gap between two
                unrelated rows. Dropped to the bottom, the three things that
                follow one another (rail, button, result) are one block and the
                air collects in one place, above the rail, where the head has
                it to itself.

                `min-h-fit` so the rail keeps its own height when the column is
                too short for everything: the deficit then falls on the result
                row (which can give back the difference between `--result-h`
                and its floor) instead of on the rail, which would simply
                overflow and print itself over the head.

                The pane is `compact` because a one-pane set has no era doors,
                so the 96px band above the rail that exists to stack a door
                pill over the marker's bubble is holding open a space nothing
                can occupy; and `heading={false}` because this game names
                itself in the row above rather than over its own ruler. */}
            <div className="flex min-h-fit flex-1 items-end">
              <TimelinePaneView
                pane={SCREEN_DEFAULT_PANE}
                panes={SCREEN_PANES}
                active
                compact
                heading={false}
                fraction={railFraction}
                onFractionChange={move}
                answered={answered}
                // Shown but not draggable while a year is being typed: the
                // marker is the readout of the field, so it must not also be
                // something the pointer can move.
                locked={direct && !answered}
                showGuess
                // A typed year is exact; the year this rail reads back at that
                // position is snapped to its grid. The bubble is told the
                // player's own number in both states — while they type it, and
                // after it has been locked in.
                guessYear={direct && typed !== null ? typed : null}
                answerYear={event.year}
                answerDelayMs={REVEAL_DELAY_MS}
                // One pane, so the distance between the guess and the truth is
                // always the ordinary same-rail case: one bar between two
                // markers.
                gap={railGap({
                  pane: SCREEN_DEFAULT_PANE,
                  guessPane: answered ? SCREEN_DEFAULT_PANE : null,
                  guessFraction: fraction,
                  answerPane: answered ? SCREEN_DEFAULT_PANE : null,
                  answerYear: event.year,
                  answerDelayMs: REVEAL_DELAY_MS,
                  panes: SCREEN_PANES,
                })}
                gapColor={accuracy ? VERDICT_COLORS[accuracy.verdict] : null}
                locale={locale}
                t={t}
                // A one-pane set has no doors, so `paneEntrances` returns none
                // and nothing can call this.
                onEnter={() => {}}
              />
            </div>

            {/* The round's controls. A three-column grid with equal flexible
                sides rather than a flex row, for the reason `/guess`'s is one:
                the middle column is the column's own centre whatever the sides
                are holding, so the advance button stands in exactly the same
                place with the entry open as with it folded away. That button
                is the one thing on this screen which must not move.

                `relative` is for the warning, which hangs underneath the row
                rather than taking a row of its own. */}
            <div className="relative grid w-full shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center justify-items-center pt-2">
              {/* Always mounted and collapsed by `data-shown`, like the solo
                  game's: it has to animate out as well as in, and `inert` is
                  what takes a clipped field out of reach. */}
              <div
                className="entry-shell justify-self-end"
                data-shown={direct}
                inert={!direct}
              >
                <div>
                  <div>
                    <DateEntry
                      value={entry}
                      onChange={(next) => {
                        setEntry(next);
                        setInvalid(false);
                      }}
                      onSubmit={submit}
                      // Locked in: it stays on screen reporting the year that
                      // was guessed, but it is no longer a control.
                      disabled={answered}
                      invalid={invalid}
                      shown={direct}
                      // Nothing in this game happened before year 1, so the
                      // era is not part of the question: the pill is a field
                      // for a number and nothing else, and the empty field
                      // states the span it will accept rather than waiting to
                      // refuse a year outside it.
                      eraHidden
                      placeholder={`${bounds.min}\u2013${bounds.max}`}
                      t={t}
                    />
                  </div>
                </div>
              </div>

              {/* One button, one place, all round. Both are in the same grid
                  cell with the same padding, so they share a centre and "Next
                  round" appears exactly where "Lock in guess" was — under the
                  pointer that just pressed it. Only the colour changes. */}
              <div className="grid place-items-center">
                <div
                  className={`col-start-1 row-start-1 transition-opacity duration-300 ${
                    answered ? "opacity-0" : "opacity-100"
                  }`}
                  inert={answered}
                >
                  <button
                    type="button"
                    onClick={submit}
                    className={`${ROUND_BUTTON_LG} bg-ink text-page hover:opacity-85`}
                  >
                    {t.submitGuess}
                  </button>
                </div>

                <div
                  className={`col-start-1 row-start-1 transition-opacity duration-300 ${
                    answered ? "opacity-100" : "opacity-0"
                  }`}
                  inert={!answered}
                >
                  <button
                    type="button"
                    onClick={requestNextRound}
                    // Never disabled. A press with nothing queued is latched
                    // and played as soon as the draw lands.
                    aria-busy={pendingNext}
                    className={`${ROUND_BUTTON_LG} relative border border-white/45 bg-black/45 text-ink backdrop-blur-md hover:bg-black/65 ${
                      pendingNext ? "cursor-progress opacity-60" : ""
                    }`}
                  >
                    {lastQuestion ? t.seeResults : t.nextRound}
                    {/* The home board's loading trace, run around the button
                        rather than a card — see the solo game's copy. Mounted
                        only while latched, so the comet starts from the top. */}
                    {pendingNext && (
                      <span aria-hidden="true" className="round-trace">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Faded and inert once the round is answered rather than
                  unmounted, so its cell keeps its width and the button beside
                  it stays centred.

                  `ml-3` because the two controls are not a pair: one answers
                  the round and the other changes how it is answered, and set
                  flush they read as a split button. The toggle is a size up
                  too, which is what `--menu-btn` is doing here — it is the one
                  number that control's box is built from, so a value set on
                  this cell resizes it without touching the site menu's button
                  the default is shared with. Left alone below `sm`, where that
                  default comes down with the bar. */}
              <div
                className={`ml-3 justify-self-start transition-opacity duration-300 sm:[--menu-btn:46px] ${
                  answered ? "opacity-0" : "opacity-100"
                }`}
                inert={answered}
              >
                <InputModeToggle
                  direct={direct}
                  onToggle={() => {
                    setDirect((current) => !current);
                    setInvalid(false);
                  }}
                  t={t}
                />
              </div>

              {invalid && (
                <p
                  role="alert"
                  // No `-translate-x-1/2`: Tailwind v4 compiles that to the
                  // `translate` property and the keyframe animates
                  // `transform`, so the two would compose and pull it a whole
                  // width left. Both keyframes carry the -50% instead.
                  className="entry-warning on-photo absolute left-1/2 top-full mt-1 whitespace-nowrap text-[12px] font-medium text-bad"
                >
                  {t.invalidDate}
                </p>
              )}
            </div>

            {/* The result's row, reserved before there is a result to put in
                it — which is what stops the button above from moving when a
                round is answered, on a screen built not to scroll. Before the
                guess it holds the instruction, which is the one moment it has
                something better to say than nothing.

                Hidden below 1120px, where the verdict is painted on the poster
                instead (`RoundVerdict`, which hides itself at the same width,
                so the two are never on screen together). */}
            <div className="hidden h-[var(--result-h)] min-h-56 gap-4 px-8 pt-4 sm:px-12 min-[1120px]:flex">
              {accuracy && guess !== null ? (
                <>
                  <VerdictDeck
                    accuracy={accuracy}
                    guess={guess}
                    locale={locale}
                    t={t}
                    // The same card as `/guess`'s left flank, in a shorter
                    // box — so a smaller head share, measured rather than
                    // picked. A share rather than a height because the row is
                    // one (`--result-h`): the card is 13rem tall on a 1120px
                    // window and 16rem on a desktop, and the head has to clear
                    // the foot at the short end, where there is least to go
                    // round. The foot needs 122px for its two labelled rows
                    // and its own padding; 42% of the shortest card leaves it
                    // 121 and gives the head 87, against the 56 its own
                    // content needs (an 11px kicker over a 34px word). Any
                    // larger and the foot's second row is clipped, because the
                    // card clips rather than growing — the row it stands in is
                    // reserved, and a card that grew would push the button
                    // above it.
                    headShare="42%"
                    className="round-flank-left flex w-60 shrink-0 flex-col overflow-hidden rounded-3xl border text-center shadow-2xl shadow-black/60 backdrop-blur-2xl"
                  />
                  {/* The challenge rides with the description, not with the
                      result — it is the event's date being disputed. */}
                  <NoteDeck
                    note={event.description}
                    eventId={event.id}
                    t={t}
                    className="round-flank-right flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border text-center shadow-2xl shadow-black/60 backdrop-blur-2xl"
                  />
                </>
              ) : (
                // Centred in the reserved row rather than sitting at the top
                // of it: the row is a card's height of nothing until a guess
                // is locked in, and a single line pinned to its upper edge
                // reads as the page having run out rather than as the
                // instruction it is.
                <p className="on-photo flex w-full items-center justify-center pb-6 text-center text-sm text-white/60">
                  {t.screenHint}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
