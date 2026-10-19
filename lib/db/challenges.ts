/**
 * Date challenges: a player's report that an event is dated wrongly.
 *
 * The game asks the question as two words — earlier or later — and the
 * database stores the signed number that aggregates into the admin panel's
 * score (`later` = +1, `earlier` = -1). This module is the one place those two
 * spellings meet, so the sort order is defined in SQL and the word is only
 * ever a label on a button.
 *
 * Both functions take an explicit client like the rest of `lib/db`, but there
 * is only one client either of them can be given: the table has no grants for
 * `anon` and no RLS policies, so every path here goes through the service role
 * (see the migration, and `app/actions/challenges.ts` for the validated entry
 * point a browser reaches).
 */

import type { DbClient } from "./queries.ts";

/** What the player is offered, and the only two answers accepted. */
export const CHALLENGE_DIRECTIONS = ["earlier", "later"] as const;
export type ChallengeDirection = (typeof CHALLENGE_DIRECTIONS)[number];

export function isChallengeDirection(
  value: string,
): value is ChallengeDirection {
  return (CHALLENGE_DIRECTIONS as readonly string[]).includes(value);
}

/**
 * The vote a direction casts.
 *
 * "Later" means the stored year is too early, so the event belongs further
 * down the timeline: +1. "Earlier" is the opposite. An event's score is the
 * sum, which is why a single disputed date reads as a magnitude *and* a
 * direction rather than as two counts to compare by eye.
 */
function voteFor(direction: ChallengeDirection): 1 | -1 {
  return direction === "later" ? 1 : -1;
}

/**
 * One vote. An account votes once per event per stored year
 * (`event_date_challenge_one_vote`); a second vote is not an error to the
 * player, it is an answer — `"already-voted"`. The year the vote is about is
 * stamped by the database from `event.year`, never sent from here.
 */
export async function recordDateChallenge(
  client: DbClient,
  input: {
    eventId: string;
    userId: string;
    direction: ChallengeDirection;
    /** The language the round was played in, for the editor's benefit. */
    localeCode?: string | null;
  },
): Promise<"recorded" | "already-voted"> {
  const { error } = await client.from("event_date_challenge").insert({
    event_id: input.eventId,
    user_id: input.userId,
    direction: voteFor(input.direction),
    locale_code: input.localeCode ?? null,
  });

  if (error?.code === "23505") return "already-voted";
  if (error) throw new Error(`recordDateChallenge: ${error.message}`);
  return "recorded";
}

/** One event's tally, as the admin panel will list it. */
export interface EventChallengeStats {
  eventId: string;
  slug: string;
  year: number;
  laterVotes: number;
  earlierVotes: number;
  totalVotes: number;
  /** `laterVotes - earlierVotes`. Positive: players think it happened later. */
  score: number;
  lastChallengedAt: string | null;
}

/**
 * The tally for every event, most disputed first.
 *
 * `order` picks which end of the scale leads: `"later"` puts the events
 * players think are dated too early at the top, `"earlier"` the opposite, and
 * `"volume"` ignores the direction and ranks by how often an event is reported
 * at all — which is the one an editor opening the list actually wants.
 *
 * Counts open votes only — cast for the event's current year, after its last
 * review (see the event_challenge_stats view). The admin panel's own list is
 * `admin_challenge_list`, which also filters; this stays for scripts.
 */
export async function eventChallengeStats(
  client: DbClient,
  options: {
    order?: "volume" | "later" | "earlier";
    limit?: number;
    /** Default `true`: events nobody has reported are not news. */
    onlyChallenged?: boolean;
  } = {},
): Promise<EventChallengeStats[]> {
  const { order = "volume", limit = 100, onlyChallenged = true } = options;

  let query = client.from("event_challenge_stats").select("*");

  if (onlyChallenged) query = query.gt("total_votes", 0);

  query =
    order === "volume"
      ? query.order("total_votes", { ascending: false })
      : query.order("score", { ascending: order === "earlier" });

  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`eventChallengeStats: ${error.message}`);

  return (data ?? []).map((row) => ({
    eventId: row.event_id,
    slug: row.slug,
    year: row.year,
    laterVotes: row.later_votes,
    earlierVotes: row.earlier_votes,
    totalVotes: row.total_votes,
    score: row.score,
    lastChallengedAt: row.last_challenged_at,
  }));
}
