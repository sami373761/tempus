"use client";

import { useState } from "react";
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
import { DEFAULT_PANE } from "@/lib/game/timeline";
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
 * it is the wide card on top, the press most visitors came for. The friend
 * card under it is the invitation flow exactly as it was.
 *
 * **The online card says where the player stands before they press.** A
 * signed-in player is shown their Chrono Rating and league, which is what the
 * search will match on; a guest is told the one thing they are giving up — a
 * guest's results are not kept — with the sign-in link that changes it. The
 * standing is read on the server (the page) because the rating lives on the
 * profile row, which this Client Component has no business querying.
 *
 * **The game is picked before the code is minted.** A match is ten questions
 * drawn from one pool and the pool is stamped on the match row
 * (`match.mode`), so it cannot be chosen later — a rematch is another ten of
 * the same game, and the second player arrives at a match that already knows
 * what it is. Pressing "play a friend" therefore opens a small board of the
 * date-guessing games instead of creating a match straight away, and the
 * invite code appears on the lobby screen the chosen mode lands on.
 *
 * **The match is created on the press, not on the render.** Visiting this page
 * costs nothing; only a real intent to play deals a hand of ten rounds. The
 * seat token is written to `sessionStorage` *before* navigating — the other
 * way round, the match page would arrive with no seat, fail to find one, and
 * join the match this player had just created, taking seat two in their own
 * game. The online press does the same through `useFindOpponent`.
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

export function VersusStart({
  t,
  photos,
  standing,
  signedIn,
}: {
  t: Dict;
  /**
   * The board's own photograph for each subject, resolved on the server (the
   * page) because `lib/storage/images` is where every key lives and this is a
   * Client Component. The same pictures the home board's cards wear, so a mode
   * looks the same wherever it is offered.
   */
  photos: Record<PickerPhoto, string>;
  /** The signed-in player's rating and league; null for a guest. */
  standing: ChronoStanding | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  // Which mode is being created, so only the card that was pressed shows the
  // wait. Null while nothing is in flight.
  const [busy, setBusy] = useState<VersusMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(mode: VersusMode) {
    if (busy) return;
    setBusy(mode);
    setError(null);

    const result = await createVersusMatch(mode);
    if (!result.ok) {
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
    // Not `justify-center` on a box pinned to the page's height: once the
    // picker is open the two cards can be taller than a short window, and a
    // centred column that overflows is cut off at the *top*, where no scroll
    // reaches. `my-auto` centres while there is room and gives way when there
    // is not, so the page's own scroll gets the overflow.
    <div className="flex w-full flex-1 flex-col items-center">
      <TimelineBackdrop pane={DEFAULT_PANE} />

      <div className="my-auto flex w-full max-w-5xl flex-col gap-4 py-2 md:gap-5">
        <OnlineCard
          t={t}
          photo={photos.history}
          standing={standing}
          signedIn={signedIn}
        />

        <section className="flex flex-col rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {t.versusTitle}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
            {t.versusPlayFriend}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-white/70">
            {picking ? t.versusChooseMode : t.versusBlurb}
          </p>

          {picking ? (
            <>
              {/* Two up on a phone, which is what keeps a 3:2 photograph a
                  photograph at that width, and four up once the card is the
                  page's full column — two up there made each photograph a
                  third of the window tall and pushed the board off it. */}
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
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
                  needed by someone who opened it by accident. */}
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="mx-auto mt-5 text-xs text-white/55 underline-offset-4 transition hover:text-ink hover:underline"
              >
                {t.backTitle}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              // The column is the page's width now; a button that spanned it
              // would be a bar, not a button.
              className="mx-auto mt-6 w-full max-w-sm rounded-full border border-white/45 bg-black/45 px-6 py-2.5 text-sm font-semibold text-ink backdrop-blur-md transition hover:bg-black/65"
            >
              {t.versusPlayFriend}
            </button>
          )}

          {error && <p className="mt-3 text-xs text-bad">{error}</p>}

          <Link
            href="/guess"
            className="mx-auto mt-5 inline-block text-xs text-white/55 underline-offset-4 transition hover:text-ink hover:underline"
          >
            {t.tryTimeline}
          </Link>
        </section>
      </div>
    </div>
  );
}

/**
 * The online press.
 *
 * Wide and dressed, with the general game's own photograph pushed well back
 * behind it — the same treatment the "coming soon" card had, now on the card
 * that plays. Text on the left and the button on the right above `md`, where
 * the card is the page's full width; stacked and centred below it.
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
    <section className="relative overflow-hidden rounded-3xl border border-white/12 bg-black/45 shadow-2xl shadow-black/70 backdrop-blur-2xl">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${JSON.stringify(photo)})` }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/40 md:bg-gradient-to-r"
      />

      <div className="relative flex flex-col items-center gap-6 px-7 py-8 text-center md:flex-row md:items-end md:justify-between md:px-9 md:py-9 md:text-left">
        <div className="min-w-0 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {t.versusOnlineTitle}
          </p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
            {t.versusFindTitle}
          </h2>
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
              <span className="text-white/30">·</span>
              <span>{t[CHRONO_TIER_LABEL_KEYS[standing.tier]]}</span>
            </p>
          ) : !signedIn ? (
            <p className="mt-4 text-sm text-white/65">
              {t.versusGuestRatingHint}{" "}
              <Link
                href={signInHref("/versus")}
                className="font-semibold text-ink underline underline-offset-4 transition hover:opacity-80"
              >
                {t.versusSignInForRating}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col items-center gap-2 md:w-auto md:items-end">
          <button
            type="button"
            onClick={find}
            aria-busy={busy}
            // Never `disabled` while busy: the hook already refuses a second
            // press, and a disabled button drops focus to the document.
            className={`relative w-full rounded-full border border-transparent bg-ink px-8 py-3 text-sm font-semibold text-page transition hover:opacity-85 md:w-auto md:min-w-[14rem] ${
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

  const shell =
    "group versus-mode-in relative aspect-[3/2] overflow-hidden rounded-2xl border border-white/12";

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
