import type { Metadata } from "next";

import { dealWhenBornEvents } from "@/app/actions/rounds";
import { PlayLimitPanel } from "@/components/play-limit";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { WhenBornGame } from "@/components/when-born-game";
import { readAllowance } from "@/lib/game/play-ledger";
import { canPlay } from "@/lib/game/play-limit";
import { ROUND_QUEUE_DEPTH } from "@/lib/game/rounds";
import { WHEN_BORN_DEFAULT_PANE, WHEN_BORN_PANES } from "@/lib/game/timeline";
import { readLocaleContext } from "@/lib/i18n/server";

/** page.tsx's frame, which loading.tsx repeats verbatim (CLAUDE.md). */
const FRAME =
  "mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-7xl flex-col overflow-y-auto px-6 pb-5 pt-5";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.whenBornTitle} · Tempus` };
}

/**
 * The "Born When?" game.
 *
 * `/when-born` rather than `/people` or `/born`: it matches the R2 prefix the
 * photographs were uploaded under and the `whenBorn` name the home board's card
 * already uses, so the mode has one spelling everywhere it appears.
 *
 * Like `/screen` and unlike `/football`, this is not `TimelineGame` with
 * different arguments: these photographs are portraits, and that game's screen
 * is one column built around a landscape picture — see the note on
 * `WhenBornGame` for what follows. The *rules* are still parameters of the
 * shared pieces: `WHEN_BORN_PANES`, `WHEN_BORN_BANDS`, `WHEN_BORN_TOPIC`.
 *
 * The summary points back at the general date-guessing game, which is the
 * nearer neighbour: somebody who has just placed ten birth years is being
 * offered the same thing over the whole of history.
 *
 * **Three games a day, one for a guest** (lib/game/play-limit.ts), gated here
 * exactly as `/football` gates it — see the note on that page.
 */
export default async function WhenBornPage() {
  const { locale, t } = await readLocaleContext();

  // The opening queue: the first round plus the one after it, exactly as the
  // other games deal it. Everything after this is a state change on the client
  // — see the queue note in `WhenBornGame`. Drawn alongside the day's
  // allowance rather than after it; see the note on `/football`.
  const [allowance, events] = await Promise.all([
    readAllowance("when-born"),
    dealWhenBornEvents(ROUND_QUEUE_DEPTH),
  ]);

  if (!canPlay(allowance)) {
    return (
      <div className={FRAME}>
        <TimelineBackdrop
          pane={WHEN_BORN_DEFAULT_PANE}
          panes={WHEN_BORN_PANES}
        />
        <h1 className="sr-only">{t.whenBornTitle}</h1>
        <PlayLimitPanel allowance={allowance} title={t.whenBornTitle} t={t} />
      </div>
    );
  }

  return (
    // One screen, exactly: `100dvh` less the bar above, both sides of that sum
    // reading the same token (app/globals.css). `overflow-y-auto` is the safety
    // valve for a window too short to honour it, where a reachable scrollbar
    // beats content cut off below the fold.
    //
    // `max-w-7xl px-6` is the site bar's own container
    // (components/site-header.tsx) repeated, which is the whole point of the
    // number: it puts the portrait's left edge under the wordmark and the
    // rail's right edge under the menu button.
    <div className={FRAME}>
      {/* No visible masthead, as on `/guess` and `/screen`: the picture and the
          rail say what the game is, and the game names itself in the rail's own
          column. Kept for screen readers and for the document outline. */}
      <h1 className="sr-only">{t.whenBornTitle}</h1>

      {events.length > 0 ? (
        <WhenBornGame
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
