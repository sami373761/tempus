import type { Metadata } from "next";

import { dealFootballEvents } from "@/app/actions/rounds";
import { TimelineGame } from "@/components/timeline-game";
import { ROUND_QUEUE_DEPTH } from "@/lib/game/rounds";
import { FOOTBALL_BANDS } from "@/lib/game/scoring";
import {
  FOOTBALL_DEFAULT_PANE,
  FOOTBALL_PANES,
} from "@/lib/game/timeline";
import { readLocaleContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.footballTitle} · Tempus` };
}

/**
 * The football game: the date-guessing screen, played over football's own
 * events and football's own rail.
 *
 * It is `TimelineGame` with four arguments rather than a game of its own,
 * which is the whole reason the pane set, the band set and the dealer are
 * parameters. What makes it a different game is not the screen:
 *
 *   * `FOOTBALL_PANES` is one rail covering 1850–2026, because every football
 *     event sits in the rightmost 7% of the common-era pane and a rail where
 *     every answer is four pixels from every other is not the same game;
 *   * `FOOTBALL_BANDS` grades in plain years rather than against an event's
 *     age, which carries no information when every event in the pool is
 *     roughly as old as every other;
 *   * `dealFootballEvents` draws from the football topic pool, which every
 *     other game is excluded from and which is excluded from every other game.
 *
 * The summary points back at the general game rather than at the comparison
 * one: somebody who has just played ten football dates is being offered the
 * same thing over the whole of history, which is the nearer neighbour.
 */
export default async function FootballPage() {
  const { locale, t } = await readLocaleContext();

  // The opening queue: the first round plus the one after it, exactly as the
  // general game deals it. Everything after this is a state change on the
  // client — see the queue note in `TimelineGame`.
  const events = await dealFootballEvents(ROUND_QUEUE_DEPTH);

  return (
    // One screen, exactly — the same budget `/guess` runs on, and the same
    // safety valve for a window too short to honour it.
    <div className="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2">
      {/* No masthead in the flow, as on `/guess`: a heading here would cost
          the height the card needs. The game's name is a pill in the top
          bar's own row instead (`RoundHead`, passed as `headBlurb` below),
          which costs this screen's budget nothing — it used to be the rail's
          own pane heading, and that was both a line of flow and, on this
          screen's one-pane rail, a label `paneLabel` had no era to fill. */}
      <h1 className="sr-only">{t.footballTitle}</h1>

      {events.length > 0 ? (
        <TimelineGame
          events={events}
          t={t}
          locale={locale}
          panes={FOOTBALL_PANES}
          homePane={FOOTBALL_DEFAULT_PANE}
          bands={FOOTBALL_BANDS}
          game="football"
          title={t.footballTitle}
          otherHref="/guess"
          otherLabel={t.timelineTitle}
          // One rail and no era to name over it: the heading comes off and
          // the row it leaves carries the round's result card instead. See
          // `railHeading` on the game.
          railHeading={false}
          headBlurb={t.cardFootballBlurb}
        />
      ) : (
        <p className="text-center text-ink-dim">{t.noEvents}</p>
      )}
    </div>
  );
}
