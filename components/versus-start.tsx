"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createVersusMatch } from "@/app/actions/versus";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { DEFAULT_PANE } from "@/lib/game/timeline";
import {
  VERSUS_MODE_SPEC,
  VERSUS_MODES,
  type VersusMode,
} from "@/lib/game/versus";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The way in to head-to-head: the mode that works, and the one that does not
 * yet.
 *
 * **Two cards rather than one button.** "1v1" means two different things to a
 * player — play the person next to you, and be matched against a stranger —
 * and only the first is built. A single button saying "play a friend" left the
 * second unanswered, so the page now says both: a wide card that opens a
 * match, and a narrow one that says online matchmaking is being written. The
 * promo card is deliberately not a button; there is nothing behind it to press
 * and a dead control is worse than a sentence.
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
 * game.
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
}: {
  t: Dict;
  /**
   * The board's own photograph for each subject, resolved on the server (the
   * page) because `lib/storage/images` is where every key lives and this is a
   * Client Component. The same pictures the home board's cards wear, so a mode
   * looks the same wherever it is offered.
   */
  photos: Record<PickerPhoto, string>;
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

    try {
      window.sessionStorage.setItem(
        `tempus:versus:${result.code}`,
        JSON.stringify({
          matchId: result.matchId,
          token: result.token,
          seat: result.seat,
        }),
      );
    } catch {
      // Storage can be unavailable in private browsing. The match still
      // exists and the push below still works; the cost is that a reload
      // would come back as a new player rather than as the host.
    }

    router.push(`/versus/${result.code}`);
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
      <TimelineBackdrop pane={DEFAULT_PANE} />

      {/* The split: the card that plays is the wider of the two above `md`,
          and the stack below it puts it first. `items-stretch` so the promo
          card is the working card's own height rather than a short tile
          floating beside a tall one. */}
      <div className="grid w-full max-w-5xl grid-cols-1 items-stretch gap-4 md:grid-cols-[1.55fr_1fr] md:gap-5">
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
              {/* Two up, which is what keeps a 3:2 photograph a photograph at
                  this width. Four cards, so the grid is square. */}
              <div className="mt-5 grid grid-cols-2 gap-3">
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
              className="mt-6 w-full rounded-full border border-transparent bg-ink px-6 py-2.5 text-sm font-semibold text-page transition hover:opacity-85"
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

        <OnlineSoonCard t={t} photo={photos.history} />
      </div>
    </div>
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

/**
 * What 1v1 does not do yet.
 *
 * Not a button, and not a tile with a "soon" badge pretending to be one: it is
 * the sentence that answers the question the working card leaves open. The
 * photograph is the general game's own so the card is not a grey rectangle
 * beside a dressed one, and it is pushed well back — this half of the page is
 * information, and the eye belongs on the half that plays.
 */
function OnlineSoonCard({ t, photo }: { t: Dict; photo: string }) {
  return (
    <aside className="relative flex flex-col justify-end overflow-hidden rounded-3xl border border-white/12 bg-black/45 shadow-2xl shadow-black/70 backdrop-blur-2xl">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${JSON.stringify(photo)})` }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/40"
      />

      <span className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70 backdrop-blur-md">
        {t.comingSoon}
      </span>

      <div className="relative px-6 py-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
          {t.duelTitle}
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-ink">
          {t.versusOnlineTitle}
        </h2>
        <p className="mt-2 text-sm leading-snug text-white/65">
          {t.versusOnlineBlurb}
        </p>
      </div>
    </aside>
  );
}
