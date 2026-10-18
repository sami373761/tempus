import type { Metadata } from "next";

import { dealScreenEvents } from "@/app/actions/rounds";
import { PlayLimitPanel } from "@/components/play-limit";
import { ScreenGame } from "@/components/screen-game";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { readAllowance } from "@/lib/game/play-ledger";
import { canPlay } from "@/lib/game/play-limit";
import { ROUND_QUEUE_DEPTH } from "@/lib/game/rounds";
import { SCREEN_DEFAULT_PANE, SCREEN_PANES } from "@/lib/game/timeline";
import { readLocaleContext } from "@/lib/i18n/server";

/** page.tsx's frame, which loading.tsx repeats verbatim (CLAUDE.md). */
const FRAME =
  "mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-7xl flex-col overflow-y-auto px-6 pb-5 pt-5";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.screenTitle} · Tempus` };
}

/**
 * The film & television game.
 *
 * `/screen` rather than `/film`: the mode is called "Film & TV" in all five
 * languages and neither half of that makes a URL, so the route takes the name
 * the rest of the codebase already uses for it — the home board's card, its
 * photograph (`BoardPhoto`) and the explorer's artwork are all `screen`.
 *
 * Unlike `/football`, this is not `TimelineGame` with different arguments. A
 * poster is 2:3 and that game's screen is one column built around a landscape
 * photograph, so the layout had to change rather than just the pool, the rail
 * and the bands — see the note on `ScreenGame` for what follows from that. The
 * *rules* are still parameters of the shared pieces: `SCREEN_PANES`,
 * `SCREEN_BANDS`, `SCREEN_TOPIC`.
 *
 * The summary points back at the general date-guessing game, which is the
 * nearer neighbour: somebody who has just placed ten posters is being offered
 * the same thing over the whole of history.
 *
 * **Three games a day, one for a guest** (lib/game/play-limit.ts), gated here
 * exactly as `/football` gates it — see the note on that page.
 */
export default async function ScreenPage() {
  const { locale, t } = await readLocaleContext();

  // The opening queue: the first round plus the one after it, exactly as the
  // other games deal it. Everything after this is a state change on the
  // client — see the queue note in `ScreenGame`. Drawn alongside the day's
  // allowance rather than after it; see the note on `/football`.
  const [allowance, events] = await Promise.all([
    readAllowance("screen"),
    dealScreenEvents(ROUND_QUEUE_DEPTH),
  ]);

  if (!canPlay(allowance)) {
    return (
      <div className={FRAME}>
        <TimelineBackdrop pane={SCREEN_DEFAULT_PANE} panes={SCREEN_PANES} />
        <h1 className="sr-only">{t.screenTitle}</h1>
        <PlayLimitPanel allowance={allowance} title={t.screenTitle} t={t} />
      </div>
    );
  }

  return (
    // One screen, exactly: `100dvh` less the bar above, both sides of that sum
    // reading the same token (app/globals.css). `overflow-y-auto` is the
    // safety valve for a window too short to honour it, where a reachable
    // scrollbar beats content cut off below the fold.
    //
    // `max-w-7xl px-6` is the site bar's own container (components/site-header.tsx)
    // repeated, which is the whole point of the number: it puts the poster's
    // left edge under the wordmark and the rail's right edge under the menu
    // button, so the game sits between the two things above it rather than
    // running out past them.
    <div className={FRAME}>
      {/* No visible masthead, as on `/guess`: the poster and the rail say what
          the game is, and the game names itself in the rail's own column. Kept
          for screen readers and for the document outline. */}
      <h1 className="sr-only">{t.screenTitle}</h1>

      {events.length > 0 ? (
        <ScreenGame
          events={events}
          t={t}
          locale={locale}
          allowance={allowance}
        />
      ) : (
        <p className="text-center text-ink-dim">{t.noEvents}</p>
      )}
    </div>
  );
}
