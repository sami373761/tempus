import type { Metadata } from "next";

import { dealBasketballEvents } from "@/app/actions/rounds";
import { PlayLimitPanel } from "@/components/play-limit";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { TimelineGame } from "@/components/timeline-game";
import { readAllowance } from "@/lib/game/play-ledger";
import { canPlay } from "@/lib/game/play-limit";
import { ROUND_QUEUE_DEPTH } from "@/lib/game/rounds";
import { BASKETBALL_BANDS } from "@/lib/game/scoring";
import {
  BASKETBALL_DEFAULT_PANE,
  BASKETBALL_PANES,
} from "@/lib/game/timeline";
import { readLocaleContext } from "@/lib/i18n/server";

/** page.tsx's frame, which loading.tsx repeats verbatim (CLAUDE.md). */
const FRAME =
  "mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.basketballTitle} · Tempus` };
}

/**
 * The basketball game: the date-guessing screen, played over basketball's own
 * events and basketball's own rail.
 *
 * It is `TimelineGame` with four arguments, exactly as `/football` is — the
 * same screen, a different pool, rail and ladder. That is the point of this
 * file being this short: the football page proved a subject game is four
 * parameters rather than a second implementation, and this is the proof's
 * first reuse.
 *
 *   * `BASKETBALL_PANES` is one rail covering 1875–2026, because every event
 *     in the pool sits in the rightmost 6% of the common-era pane and a rail
 *     where every answer is a few pixels from every other is not the same
 *     game;
 *   * `BASKETBALL_BANDS` grades in plain years rather than against an event's
 *     age, which carries no information when every event in the pool is
 *     roughly as old as every other — and is tighter than football's at the
 *     top, because half of these events are from 2000 onwards;
 *   * `dealBasketballEvents` draws from the basketball topic pool, which every
 *     other game is excluded from and which is excluded from every other game.
 *
 * The summary points back at the general game rather than at the comparison
 * one, as football's does: somebody who has just played ten basketball dates
 * is being offered the same thing over the whole of history, which is the
 * nearer neighbour.
 *
 * **Three games a day, one for a guest** (lib/game/play-limit.ts), gated here
 * exactly as `/football` gates it — see the note on that page.
 */
export default async function BasketballPage() {
  const { locale, t } = await readLocaleContext();

  // The opening queue plus the day's allowance, in one wait rather than two:
  // see the note on `/football`, which this follows.
  const [allowance, events] = await Promise.all([
    readAllowance("basketball"),
    dealBasketballEvents(ROUND_QUEUE_DEPTH),
  ]);

  if (!canPlay(allowance)) {
    return (
      <div className={FRAME}>
        <TimelineBackdrop
          pane={BASKETBALL_DEFAULT_PANE}
          panes={BASKETBALL_PANES}
        />
        <h1 className="sr-only">{t.basketballTitle}</h1>
        <PlayLimitPanel allowance={allowance} title={t.basketballTitle} t={t} />
      </div>
    );
  }

  return (
    // One screen, exactly — the same budget `/guess` and `/football` run on,
    // and the same safety valve for a window too short to honour it.
    <div className={FRAME}>
      {/* No masthead in the flow, as on `/guess`: a heading here would cost
          the height the card needs. The game's name is a pill in the top
          bar's own row instead (`RoundHead`, passed as `headBlurb` below),
          which costs this screen's budget nothing — it used to be the rail's
          own pane heading, and that was both a line of flow and, on this
          screen's one-pane rail, a label `paneLabel` had no era to fill. */}
      <h1 className="sr-only">{t.basketballTitle}</h1>

      {events.length > 0 ? (
        <TimelineGame
          events={events}
          t={t}
          locale={locale}
          panes={BASKETBALL_PANES}
          homePane={BASKETBALL_DEFAULT_PANE}
          bands={BASKETBALL_BANDS}
          game="basketball"
          title={t.basketballTitle}
          otherHref="/guess"
          otherLabel={t.timelineTitle}
          // One rail and no era to name over it: the heading comes off and
          // the row it leaves carries the round's result card instead. See
          // `railHeading` on the game.
          railHeading={false}
          headBlurb={t.cardBasketballBlurb}
          allowance={allowance}
        />
      ) : (
        <p className="text-center text-ink-dim">{t.noEvents}</p>
      )}
    </div>
  );
}
