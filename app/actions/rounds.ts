"use server";

import { randomEvents } from "@/lib/db/queries";
import { createServerDbClient } from "@/lib/db/server";
import type { LocalizedEvent } from "@/lib/db/types";
import {
  buildComparisonRound,
  COMPARISON_MIN_YEAR,
  EVENTS_PER_COMPARISON_ROUND,
  ROUND_QUEUE_DEPTH,
  type ComparisonRound,
} from "@/lib/game/rounds";
import { FOOTBALL_TOPIC } from "@/lib/game/topics";
import { readLocale } from "@/lib/i18n/server";

/**
 * Upper bound on a single draw, so the endpoint cannot be asked for the
 * dataset. Counted in whatever the caller is asking for — events for the
 * date-guessing game, rounds (three events each) for the comparison game.
 */
const MAX_DRAW = 4;

/**
 * Deals events for the date-guessing game.
 *
 * Callable from the client, which is the point: the page deals the opening
 * queue during render and the game tops it back up in the background while the
 * player is still guessing, so moving to the next round never waits on the
 * network and never reloads the route.
 *
 * The locale is read from the cookie here rather than taken as an argument —
 * it is the same source the server components read, and it leaves this endpoint
 * with no caller-supplied input to validate beyond the count.
 *
 * No year floor: the deep panes reach 10 billion BCE, so every event in the
 * dataset — down to the formation of the Earth — is guessable here.
 */
export async function dealTimelineEvents(
  count: number = ROUND_QUEUE_DEPTH,
): Promise<LocalizedEvent[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const events = await randomEvents(supabase, { count: take, locale });

  return shuffle(events);
}

/**
 * Deals events for the football game.
 *
 * The same deal as `dealTimelineEvents` with one difference, and the
 * difference is the whole point: `topicSlug` restricts the draw to the
 * football pool, which is a pool every other game is restricted *out* of (see
 * `randomEvents` in lib/db/queries.ts, where both halves of that rule live).
 *
 * It is a separate action rather than a parameter on the one above because the
 * pool must not be decidable by the caller: `dealTimelineEvents(2, "football")`
 * would make the date-guessing game's endpoint able to deal football events,
 * and — worse in the other direction — a future subject endpoint able to deal
 * the general pool. An action per pool has no argument to get wrong.
 */
export async function dealFootballEvents(
  count: number = ROUND_QUEUE_DEPTH,
): Promise<LocalizedEvent[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const events = await randomEvents(supabase, {
    count: take,
    locale,
    topicSlug: FOOTBALL_TOPIC,
  });

  return shuffle(events);
}

/**
 * Deals rounds for the comparison game.
 *
 * A round is three events, so this draws three per round in one go and cuts the
 * result up. **The shuffle before the cut is load-bearing**: `randomEvents`
 * returns its batch in timeline order, so slicing it straight into threes would
 * hand each round three events that are adjacent in history — anchors a few
 * years apart, and a question with no room in it.
 *
 * `distinctYears` is asked of the whole draw rather than of each round. That is
 * stronger than needed, and deliberately so: it is what guarantees no round can
 * come out with two anchors on the same year, which would make "closer to
 * which?" unanswerable.
 */
export async function dealComparisonRounds(
  count: number = ROUND_QUEUE_DEPTH,
): Promise<ComparisonRound[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const events = await randomEvents(supabase, {
    count: take * EVENTS_PER_COMPARISON_ROUND,
    locale,
    fromYear: COMPARISON_MIN_YEAR,
    distinctYears: true,
  });

  const pool = shuffle(events);
  const rounds: ComparisonRound[] = [];

  for (
    let at = 0;
    at + EVENTS_PER_COMPARISON_ROUND <= pool.length;
    at += EVENTS_PER_COMPARISON_ROUND
  ) {
    const round = buildComparisonRound(
      pool.slice(at, at + EVENTS_PER_COMPARISON_ROUND),
    );
    if (round) rounds.push(round);
  }

  return rounds;
}

/**
 * `randomEvents` draws at random but returns the batch in timeline order, which
 * would be invisible for a single event and a pattern for a batch: every round
 * dealt together would be older than the one after it. The draw is already
 * uniform, so one shuffle is enough to make the order uniform too.
 */
function shuffle<T>(rows: readonly T[]): T[] {
  const pool = [...rows];

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  return pool;
}
