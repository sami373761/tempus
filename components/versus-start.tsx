"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createVersusMatch } from "@/app/actions/versus";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import {
  FindOpponentError,
  useFindOpponent,
  writeVersusSeat,
} from "@/components/versus-search";
import { signInHref } from "@/lib/auth/paths";
import {
  CHRONO_TIER_LABEL_KEYS,
  type ChronoStanding,
} from "@/lib/game/chrono-rating";
import { DEFAULT_PANE, STILL_PANES } from "@/lib/game/timeline";
import {
  VERSUS_MODE_SPEC,
  VERSUS_MODES,
  type VersusMode,
} from "@/lib/game/versus";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The way in to head-to-head: a stranger at your level, or a friend with a
 * code.
 *
 * **Two cards, stacked, online first.** "1v1" means two different things to a
 * player — be matched against someone, and play the person next to you — and
 * they are different presses with different follow-ups. The online card is one
 * button and nothing to choose: matchmaking only ever plays the general
 * library (`PUBLIC_VERSUS_MODE`), because a rating has to mean one thing. So
 * it is the wide card on top, the press most visitors came for, and the friend
 * card under it is the invitation flow.
 *
 * **The two cards are one shape.** They were not until 2026-10-18 — the
 * friend card was a bare glass panel under a dressed banner — and a choice
 * between two things should not look like one thing and its footnote. They
 * share a shell, a set of art layers and an arrangement now (`CARD_SHELL`,
 * `CardArt`, `CARD_ROW`); what still separates them is the order on the column
 * and a filled button against an outlined one.
 *
 * **The pair is not only this page.** `VersusChoice` is the two cards with no
 * page around them, and the home board opens exactly that in a window rather
 * than sending anyone here first — see components/versus-dialog.tsx. Whichever
 * door it is opened from, the press navigates into the match: the choosing is
 * worth no page load, and the playing is what one is for.
 *
 * **The online card says where the player stands before they press.** A
 * signed-in player is shown their Chrono Rating and league, which is what the
 * search will match on. Online play needs an account, so a guest is told so
 * and the card's button is the way to sign in rather than a search. The
 * standing is read on the server because the rating lives on the profile row,
 * which this Client Component has no business querying; on both doors it rides
 * in the read the chrome already makes (`readProfileChrome`).
 */

/** Every card on the picker, in board order. */
type PickerPhoto = VersusMode | "basketball";

/**
 * The picker's own order, and the one entry on it that is not a mode.
 *
 * Basketball is the one entry here that is not a mode, and it is here for the
 * reason it is on the board: the row of subjects is the answer to "what can we
 * play", and leaving one out makes the list look like the whole list.
 *
 * It is no longer unbuilt — `/basketball` is a game with 105 events behind it.
 * What it does not yet have is a *head-to-head* mode: that needs a slug in
 * `VERSUS_MODES` and a `VERSUS_MODE_SPEC` entry (lib/game/versus.ts), which is
 * the same three parameters the solo game takes. Until then `mode: null` marks
 * it unplayable *here* — one flag rather than a second array to keep in step
 * with `VERSUS_MODES`.
 */
const PICKER: { key: PickerPhoto; mode: VersusMode | null }[] = [
  ...VERSUS_MODES.map((mode) => ({ key: mode as PickerPhoto, mode })),
  { key: "basketball", mode: null },
];

/**
 * What either way in needs to know, and the one type the home page's window
 * and this page both fill in.
 *
 * The photographs are resolved on the server — `lib/storage/images` holds
 * every object key on the site and the cards are a Client Component, so a
 * handful of strings cross that boundary instead of the whole module — and
 * the standing comes from the server for a harder reason: a rating lives on
 * the profile row, which nothing in the browser may query.
 */
export interface VersusChoiceProps {
  t: Dict;
  /**
   * The board's own photograph for each subject on the friend card's picker,
   * the same pictures the home board's cards wear, so a mode looks the same
   * wherever it is offered. `history` doubles as the online card's art: the
   * general game is the only pool matchmaking plays.
   */
  photos: Record<PickerPhoto, string>;
  /** The repeat behind the friend card — see `versusFriendArtUrl`. */
  friendArt: string;
  /** The signed-in player's rating and league; null for a guest. */
  standing: ChronoStanding | null;
  signedIn: boolean;
}

export function VersusStart({
  t,
  photos,
  friendArt,
  standing,
  signedIn,
}: VersusChoiceProps) {
  return (
    // Not `justify-center` on a box pinned to the page's height: once the
    // picker is open the two cards can be taller than a short window, and a
    // centred column that overflows is cut off at the *top*, where no scroll
    // reaches. `my-auto` centres while there is room and gives way when there
    // is not, so the page's own scroll gets the overflow.
    <div className="flex w-full flex-1 flex-col items-center">
      <TimelineBackdrop pane={DEFAULT_PANE} panes={STILL_PANES} />

      <div className="my-auto flex w-full max-w-5xl flex-col gap-4 py-2 md:gap-5">
        <VersusChoice
          t={t}
          photos={photos}
          friendArt={friendArt}
          standing={standing}
          signedIn={signedIn}
        />

        {/* The sideways door, for someone who came here and would rather play
            alone. It sat inside the friend card until the two cards were made
            one shape: a link to another game is not part of either press, and
            under both of them it belongs to the page instead. */}
        <Link
          href="/guess"
          className="mx-auto inline-block px-3 py-2 text-xs text-white/55 underline-offset-4 transition hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t.tryTimeline}
        </Link>
      </div>
    </div>
  );
}

/**
 * The two ways in, and nothing around them.
 *
 * Split out from the page so the home board can open the same pair in a window
 * without sending anyone to `/versus` first (components/versus-dialog.tsx).
 * Both presses navigate on their own — into a search lobby or into an
 * invitation — so there is nothing for a caller to do afterwards and nothing
 * for this to report back.
 *
 * It renders two sections and no box of its own: the caller owns the column
 * they sit in, which is a page here and a dialog there.
 */
export function VersusChoice({
  t,
  photos,
  friendArt,
  standing,
  signedIn,
}: VersusChoiceProps) {
  return (
    <>
      <OnlineCard
        t={t}
        photo={photos.history}
        standing={standing}
        signedIn={signedIn}
      />
      <FriendCard t={t} photos={photos} art={friendArt} />
    </>
  );
}

/**
 * The frame both cards wear.
 *
 * They were two different objects until 2026-10-18 — a dressed banner with a
 * photograph behind it over a bare glass panel — which made the second one
 * read as a footnote to the first rather than as the other half of the
 * choice. One shell, one set of art layers and one arrangement inside (words
 * on the left, the press on the right above `md`) is the whole of the fix. The
 * hierarchy between them is still there, but it is carried by the things that
 * should carry it: the order on the column, and a filled button against an
 * outlined one.
 */
const CARD_SHELL =
  "relative overflow-hidden rounded-3xl border border-white/12 bg-black/45 shadow-2xl shadow-black/70 backdrop-blur-2xl";

/** The row inside a card: words, then the press. */
const CARD_ROW =
  "relative flex flex-col items-center gap-6 px-7 py-8 text-center md:flex-row md:items-end md:justify-between md:px-9 md:py-9 md:text-left";

const CARD_KICKER =
  "text-xs font-semibold uppercase tracking-[0.18em] text-white/55";

const CARD_TITLE =
  "mt-1 font-display text-3xl font-semibold tracking-tight text-ink";

/**
 * A card's picture, pushed well back, and the gradient that makes the words on
 * it readable whatever the picture is.
 *
 * A background rather than an `<img>` because it is decoration under a label:
 * there is nothing in either picture a screen reader should be told about that
 * the title does not already say. The gradient runs up on a stacked card and
 * across on a wide one, which is where the text is in each case.
 *
 * `opacity` is passed as a whole class name rather than a number — Tailwind
 * reads the source for class names, and a computed one is a string it never
 * sees. The two cards differ: the online card is a photograph and sits at 35%,
 * the friend card's repeat is painted on near-black and needs a little more to
 * register at all.
 */
function CardArt({ photo, opacity }: { photo: string; opacity: string }) {
  return (
    <>
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-cover bg-center ${opacity}`}
        style={{ backgroundImage: `url(${JSON.stringify(photo)})` }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/40 md:bg-gradient-to-r"
      />
    </>
  );
}

/**
 * The friend press: an invitation, once the game behind it is chosen.
 *
 * **The game is picked before the code is minted.** A match is ten questions
 * drawn from one pool and the pool is stamped on the match row
 * (`match.mode`), so it cannot be chosen later — a rematch is another ten of
 * the same game, and the second player arrives at a match that already knows
 * what it is. Pressing "play a friend" therefore opens a small board of the
 * date-guessing games instead of creating a match straight away, and the
 * invite code appears on the lobby screen the chosen mode lands on.
 *
 * **The match is created on the press, not on the render.** Opening this card
 * costs nothing; only a real intent to play deals a hand of ten rounds. The
 * seat token is written to `sessionStorage` *before* navigating — the other
 * way round, the match page would arrive with no seat, fail to find one, and
 * join the match this player had just created, taking seat two in their own
 * game.
 */
function FriendCard({
  t,
  photos,
  art,
}: {
  t: Dict;
  photos: Record<PickerPhoto, string>;
  art: string;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  // Which mode is being created, so only the card that was pressed shows the
  // wait. Null while nothing is in flight.
  const [busy, setBusy] = useState<VersusMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "Play a friend" and "Back" each unmount on their own press, which drops a
  // keyboard user's focus to the document. So focus follows the swap: onto
  // the first mode card when the board opens, back onto "Play a friend" when
  // it closes. Only on a change, never on mount — arriving at the page is not
  // a press (and a "skip the first run" flag would not survive StrictMode's
  // second mount pass in development).
  const grid = useRef<HTMLDivElement>(null);
  const playFriend = useRef<HTMLButtonElement>(null);
  const pickingWas = useRef(picking);
  useEffect(() => {
    if (pickingWas.current === picking) return;
    pickingWas.current = picking;
    const target = picking
      ? grid.current?.querySelector<HTMLElement>("button")
      : playFriend.current;
    target?.focus({ preventScroll: true });
  }, [picking]);

  async function start(mode: VersusMode) {
    if (busy) return;
    setBusy(mode);
    setError(null);

    // A thrown request (the network dropped, the dev server mid-rebuild) is
    // the same failure as a refused one; uncaught, it left the pressed card
    // spinning forever with nothing on screen to say so.
    let result: Awaited<ReturnType<typeof createVersusMatch>> | null;
    try {
      result = await createVersusMatch(mode);
    } catch {
      result = null;
    }
    if (!result || !result.ok) {
      setError(t.versusCreateFailed);
      setBusy(null);
      return;
    }

    writeVersusSeat(result.code, {
      matchId: result.matchId,
      token: result.token,
      seat: result.seat,
    });
    router.push(`/versus/${result.code}`);
  }

  return (
    <section className={CARD_SHELL}>
      <CardArt photo={art} opacity="opacity-45" />

      <div className={CARD_ROW}>
        <div className="min-w-0 max-w-xl">
          <p className={CARD_KICKER}>{t.versusTitle}</p>
          <h2 className={CARD_TITLE}>{t.versusPlayFriend}</h2>
          <p className="mt-2 text-sm leading-snug text-white/70">
            {picking ? t.versusChooseMode : t.versusBlurb}
          </p>
        </div>

        {/* The press, in the online card's own slot — and gone while the
            picker is open, where the four games *are* the press. Nothing
            stands in for it: a disabled button in a slot whose job is being
            done by the row below it is a second thing to read. */}
        {!picking && (
          <div className="flex w-full shrink-0 flex-col items-center gap-2 md:w-auto md:items-end">
            <button
              ref={playFriend}
              type="button"
              onClick={() => setPicking(true)}
              // Outlined where the online card's is filled: both presses are
              // offered the same way now, and this is what keeps the one most
              // visitors came for in front. Capped below `md` for the online
              // button's reason — stacked, the column is the page's width, and
              // a full-width button is a bar rather than a button.
              className="w-full max-w-sm rounded-full border border-white/45 bg-black/45 px-8 py-3 text-sm font-semibold text-ink backdrop-blur-md transition hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:w-auto md:min-w-[14rem] md:max-w-none"
            >
              {t.versusPlayFriend}
            </button>
          </div>
        )}
      </div>

      {/* The picker and anything the last press has to say share one
          footer, so the card has a single bottom edge whichever of them is
          open. */}
      {(picking || error) && (
        <div className="relative px-7 pb-8 md:px-9 md:pb-9">
          {picking && (
            <>
              {/* Two up on a phone, which is what keeps a 3:2 photograph a
                  photograph at that width, and four up once the card is the
                  page's full column — two up there made each photograph a
                  third of the window tall and pushed the board off it. */}
              <div ref={grid} className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {PICKER.map((entry, index) => (
                  <ModeCard
                    key={entry.key}
                    index={index}
                    photo={photos[entry.key]}
                    title={
                      entry.mode
                        ? t[VERSUS_MODE_SPEC[entry.mode].titleKey]
                        : t.basketballTitle
                    }
                    blurb={
                      entry.mode
                        ? t[VERSUS_MODE_SPEC[entry.mode].blurbKey]
                        : t.cardBasketballBlurb
                    }
                    soon={entry.mode === null ? t.comingSoon : null}
                    busy={entry.mode !== null && busy === entry.mode}
                    onPick={
                      entry.mode === null
                        ? null
                        : () => void start(entry.mode as VersusMode)
                    }
                  />
                ))}
              </div>

              {/* Out of the way rather than prominent: the subject board is
                  what the player came here to read, and the way back is only
                  needed by someone who opened it by accident. Quiet is not
                  tiny, though: the padding makes it a thumb-sized target. */}
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="mx-auto mt-3 block px-3 py-2 text-xs text-white/55 underline-offset-4 transition hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {t.backTitle}
              </button>
            </>
          )}

          {error && (
            <p role="alert" className="mt-3 text-center text-xs text-bad">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The online press.
 *
 * Wide and dressed, with the general game's own photograph pushed well back
 * behind it — the same treatment the "coming soon" card had, now on the card
 * that plays. Text on the left and the button on the right above `md`, where
 * the card is the page's full width; stacked and centred below it. The frame,
 * the art layers and that arrangement are `CARD_SHELL`/`CardArt`/`CARD_ROW`,
 * shared with the friend card so the two read as one choice.
 */
function OnlineCard({
  t,
  photo,
  standing,
  signedIn,
}: {
  t: Dict;
  photo: string;
  standing: ChronoStanding | null;
  signedIn: boolean;
}) {
  // No previous match passed: the hook reads the last online match this tab
  // finished, so a player who went home and came back to search again is
  // still kept apart from the opponent they have just played.
  const { find, busy, error } = useFindOpponent();

  return (
    <section className={CARD_SHELL}>
      <CardArt photo={photo} opacity="opacity-35" />

      <div className={CARD_ROW}>
        <div className="min-w-0 max-w-xl">
          <p className={CARD_KICKER}>{t.versusOnlineTitle}</p>
          <h2 className={CARD_TITLE}>{t.versusFindTitle}</h2>
          <p className="mt-2 text-sm leading-snug text-white/70">
            {t.versusOnlineBlurb}
          </p>

          {/* Where the player stands. A signed-in player with no profile row
              yet (`standing` null) is shown nothing rather than a guest's
              line: they are not a guest, and the row arrives on its own. */}
          {standing ? (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-white/70 md:justify-start">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                {t.versusRatingName}
              </span>
              <span className="font-semibold tabular-nums text-ink">
                {format(t.versusRatingValue, { n: standing.rating })}
              </span>
              {/* The dot rides with the league: as separate items a wrap
                  could leave it dangling at the end of the first line. */}
              <span className="whitespace-nowrap">
                <span className="pr-1.5 text-white/30">·</span>
                {t[CHRONO_TIER_LABEL_KEYS[standing.tier]]}
              </span>
            </p>
          ) : !signedIn ? (
            <p className="mt-4 text-sm text-white/65">
              {t.versusOnlineNeedsAccount}
            </p>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col items-center gap-2 md:w-auto md:items-end">
          {signedIn ? (
            <button
              type="button"
              onClick={find}
              aria-busy={busy}
              // Never `disabled` while busy: the hook already refuses a second
              // press, and a disabled button drops focus to the document.
              // Capped below `md` like "Play a friend": stacked, the column is
              // the page's width, and between 640 and 767px a full-width button
              // was a bar rather than a button.
              className={`relative w-full max-w-sm rounded-full border border-transparent bg-ink px-8 py-3 text-sm font-semibold text-page transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:w-auto md:min-w-[14rem] md:max-w-none ${
                busy ? "cursor-progress" : ""
              }`}
            >
              {t.versusFindButton}
              {/* The board's loading trace, as on the mode cards: opening a
                  search is a round trip, and a button that looked unpressed
                  for a second reads as one that did nothing. */}
              {busy && (
                <span aria-hidden="true" className="round-trace">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </button>
          ) : (
            /* The same filled button, so the card does not change shape for a
               guest — it only leads somewhere else first. `next` brings them
               back here to press it. */
            <Link
              href={signInHref("/versus")}
              className="relative w-full max-w-sm rounded-full border border-transparent bg-ink px-8 py-3 text-center text-sm font-semibold text-page transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:w-auto md:min-w-[14rem] md:max-w-none"
            >
              {t.versusSignInToPlay}
            </Link>
          )}
          <FindOpponentError error={error} t={t} />
        </div>
      </div>
    </section>
  );
}

/**
 * One subject on the picker.
 *
 * A button where there is a pool behind it and a plain box where there is not,
 * which is the home board's own rule: a card that cannot be pressed should not
 * look pressable or sit in the tab order. The photograph is a background rather
 * than an `<img>` because it is decoration under a label — there is nothing in
 * it a screen reader should be told about that the title does not already say.
 */
function ModeCard({
  index,
  title,
  blurb,
  photo,
  soon,
  busy,
  onPick,
}: {
  /** Stagger position, so the four cards arrive in order. */
  index: number;
  title: string;
  blurb: string;
  photo: string;
  /** The "soon" pill, on the one card with nothing behind it. */
  soon: string | null;
  busy: boolean;
  /** Null makes the card a label rather than a control. */
  onPick: (() => void) | null;
}) {
  const body = (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-105"
        style={{ backgroundImage: `url(${JSON.stringify(photo)})` }}
      />
      {/* The label's own ground. The photographs are whatever they are, so the
          text cannot rely on the picture being dark where it lands. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/60 to-black/25"
      />

      {/* The chip is a **row of the card's own column**, not an overlay pinned
          to the corner. Pinned, it had no idea what was underneath it: the
          picker is two cards across at every width, so at 390px a card is
          161x107 and its title and two-line blurb fill 86 of those pixels from
          the bottom — the chip then printed across the word "Basketbol". In
          flow it cannot, whatever the card's size or the length of the label
          in any of the five languages. An empty row where there is no chip is
          zero pixels tall, so every other card is laid out exactly as before. */}
      <div className="relative flex h-full min-h-0 flex-col justify-between gap-1 p-3.5 text-left">
        <div className="flex shrink-0 justify-end">
          {soon && (
            <span className="rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70 backdrop-blur-md">
              {soon}
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-0.5">
          <p className="font-display text-base font-semibold leading-tight text-ink">
            {title}
          </p>
          {/* Clamped to one line on a card this small and two from `sm` up:
              the blurb is the first thing to give when the title and the chip
              both have to fit, and a sentence cut mid-word is better than a
              title it has pushed off its own card. */}
          <p className="line-clamp-1 text-[11px] leading-snug text-white/65 sm:line-clamp-2">
            {blurb}
          </p>
        </div>
      </div>

      {/* The board's loading trace, around the card that was pressed: dealing
          ten rounds is a round trip, and a card that looked unpressed for a
          second reads as a card that did nothing. */}
      {busy && (
        <span aria-hidden="true" className="round-trace">
          <i />
          <i />
          <i />
        </span>
      )}
    </>
  );

  // The floor is under the 3:2, not instead of it: a card is 3:2 wherever 3:2
  // is tall enough for its column, and only grows where it is not. That is
  // two narrow widths — the two-up board below ~390px, and the four-up one
  // at 768px — where 3:2 left the blurb less than its one line and
  // `overflow-hidden` sliced it through the glyphs. The floors are the
  // column's own height: padding 28 + chip 18 + gap 4 + title 20 + gap 2 +
  // blurb 15 (one line) = 87px, or + 15 for the second line from `md` = 102px.
  // `w-full` holds the width to the grid column: left to the ratio, the floor
  // carried through it into a minimum width (92px tall made a 138px card in a
  // 101px column at 320) and the two cards of a row ran over each other.
  const shell =
    "group versus-mode-in relative aspect-[3/2] min-h-[5.75rem] w-full overflow-hidden rounded-2xl border border-white/12 md:min-h-[6.75rem]";

  return onPick === null ? (
    <div
      className={`${shell} opacity-55`}
      style={{ "--mode-i": index } as React.CSSProperties}
    >
      {body}
    </div>
  ) : (
    <button
      type="button"
      onClick={onPick}
      aria-busy={busy}
      // `text-ink` is for the loading trace, which draws itself in
      // `currentColor`: the labels inside carry their own colours, so without
      // it the comet would inherit the page's default and vanish.
      className={`${shell} text-ink text-left transition hover:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        busy ? "cursor-progress" : ""
      }`}
      style={{ "--mode-i": index } as React.CSSProperties}
    >
      {body}
    </button>
  );
}
