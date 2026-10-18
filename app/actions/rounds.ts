"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { categorySlugLookup, randomEvents } from "@/lib/db/queries";
import { createServerDbClient } from "@/lib/db/server";
import type { LocalizedEvent } from "@/lib/db/types";
import type { ComparisonGameId, SoloGame } from "@/lib/game/points";
import { signRound } from "@/lib/game/round-token";
import {
  buildComparisonRound,
  COMPARISON_MIN_YEAR,
  EVENTS_PER_COMPARISON_ROUND,
  EXCLUDED_EVENT_LIMIT,
  ROUND_QUEUE_DEPTH,
  type ComparisonRound,
} from "@/lib/game/rounds";
import { screenFormatOf, type ScreenEvent } from "@/lib/game/screen";
import {
  maskForDeal,
  type DealtComparisonRound,
  type DealtEvent,
} from "@/lib/game/solo";
import {
  BASKETBALL_TOPIC,
  FOOTBALL_TOPIC,
  SCREEN_TOPIC,
  WHEN_BORN_TOPIC,
} from "@/lib/game/topics";
import { personFieldOf, type WhenBornEvent } from "@/lib/game/when-born";
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
 *
 * `exclude` is what keeps a set of ten made of ten *different* events. The
 * queue is topped up a round or two at a time, so without it each draw knows
 * only what the game is holding and nothing about what it has already played:
 * on the 66-event football pool that put a repeat in roughly half of all sets.
 * It is caller-supplied, which is safe because it can only ever narrow a draw
 * the player was already entitled to — see `sanitizeExclude`.
 */
export async function dealTimelineEvents(
  count: number = ROUND_QUEUE_DEPTH,
  exclude: readonly string[] = [],
): Promise<DealtEvent[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const [events, userId] = await Promise.all([
    randomEvents(supabase, {
      count: take,
      locale,
      exclude: sanitizeExclude(exclude),
    }),
    dealtTo(),
  ]);

  return dealDated("history", shuffle(events), userId);
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
  exclude: readonly string[] = [],
): Promise<DealtEvent[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const [events, userId] = await Promise.all([
    randomEvents(supabase, {
      count: take,
      locale,
      topicSlug: FOOTBALL_TOPIC,
      exclude: sanitizeExclude(exclude),
    }),
    dealtTo(),
  ]);

  return dealDated("football", shuffle(events), userId);
}

/**
 * Deals events for the basketball game.
 *
 * `dealFootballEvents` with one word changed, which is the whole of what a
 * subject pool needs when its dataset carries nothing beyond a name, a year
 * and a photograph: the events come back as plain `LocalizedEvent`s, the way
 * football's do, because there is no second fact for the screen to print (film
 * has its format, "Born When?" its field).
 *
 * A separate action per pool, for the reason spelled out above: the pool must
 * not be a caller-supplied argument.
 */
export async function dealBasketballEvents(
  count: number = ROUND_QUEUE_DEPTH,
  exclude: readonly string[] = [],
): Promise<DealtEvent[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const [events, userId] = await Promise.all([
    randomEvents(supabase, {
      count: take,
      locale,
      topicSlug: BASKETBALL_TOPIC,
      exclude: sanitizeExclude(exclude),
    }),
    dealtTo(),
  ]);

  return dealDated("basketball", shuffle(events), userId);
}

/**
 * Deals rounds for the film & television game.
 *
 * `dealFootballEvents` plus the one fact this subject has that no other pool
 * does: whether each entry is a film or a series. The stored year is a release
 * for the first and a premiere for the second, so the game prints which — see
 * lib/game/screen.ts for why that is a rule and not a label.
 *
 * The format is a second, small query rather than a wider view (see
 * `eventCategorySlugs`), read beside the draw and kept per process
 * (`categorySlugLookup`), and it is resolved **here** rather than on the client
 * for the same reason the pool is: `kind = 'other'` categories are not a pool
 * and could not be used to reach another game's events, but a client that had
 * to ask for them would be a client that could ask for anything else in
 * `event_category` too.
 *
 * A separate action per pool, like football's, so the pool is never a
 * caller-supplied argument.
 */
export async function dealScreenEvents(
  count: number = ROUND_QUEUE_DEPTH,
  exclude: readonly string[] = [],
): Promise<DealtEvent<ScreenEvent>[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const [events, userId, categories] = await Promise.all([
    randomEvents(supabase, {
      count: take,
      locale,
      topicSlug: SCREEN_TOPIC,
      exclude: sanitizeExclude(exclude),
    }),
    dealtTo(),
    categorySlugLookup(supabase, { kind: "other" }),
  ]);

  const formats = await categories(events.map((event) => event.id));

  return dealDated(
    "screen",
    shuffle(
      events.map((event) => ({
        ...event,
        format: screenFormatOf(formats.get(event.id)),
      })),
    ),
    userId,
  );
}

/**
 * Deals rounds for the "Born When?" game.
 *
 * `dealScreenEvents` with a different pool and a different second fact: the
 * field of the person in the picture rather than a film's format. Both are
 * `kind = 'other'` category links, so both come back through the same
 * `eventCategorySlugs` call, and the two readers (`screenFormatOf`,
 * `personFieldOf`) each ignore slugs they do not recognise — which is why one
 * query shape serves both games without either being able to read the other's
 * label.
 *
 * It is resolved **here** rather than on the client for the reason the pool is:
 * `kind = 'other'` categories are not a pool and could not be used to reach
 * another game's events, but a client that had to ask for them would be a
 * client that could ask for anything else in `event_category` too.
 *
 * A separate action per pool, like football's and film's, so the pool is never
 * a caller-supplied argument. That matters more for this pool than for the
 * others: these events are dated by *birth year*, so an endpoint that could be
 * talked into mixing them into the general draw would be grading "when did
 * this happen" against the year somebody was born.
 */
export async function dealWhenBornEvents(
  count: number = ROUND_QUEUE_DEPTH,
  exclude: readonly string[] = [],
): Promise<DealtEvent<WhenBornEvent>[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const [events, userId, categories] = await Promise.all([
    randomEvents(supabase, {
      count: take,
      locale,
      topicSlug: WHEN_BORN_TOPIC,
      exclude: sanitizeExclude(exclude),
    }),
    dealtTo(),
    categorySlugLookup(supabase, { kind: "other" }),
  ]);

  const fields = await categories(events.map((event) => event.id));

  return dealDated(
    "when-born",
    shuffle(
      events.map((event) => ({
        ...event,
        field: personFieldOf(fields.get(event.id)),
      })),
    ),
    userId,
  );
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
 *
 * `exclude` carries every event of every round the caller has already played,
 * anchors included — a round whose anchors the player has just been shown
 * reads as a repeat even when the event being guessed is new.
 */
export async function dealComparisonRounds(
  count: number = ROUND_QUEUE_DEPTH,
  exclude: readonly string[] = [],
): Promise<DealtComparisonRound[]> {
  return dealComparisonFor("compare", count, exclude);
}

/**
 * Deals rounds for survival: the comparison game's rounds, signed for the
 * survival game. A separate action for the pool rule's reason — the game a
 * round is banked under must not be a caller-supplied argument, or a survival
 * run could be paid as comparison sets and the other way round.
 */
export async function dealSurvivalRounds(
  count: number = ROUND_QUEUE_DEPTH,
  exclude: readonly string[] = [],
): Promise<DealtComparisonRound[]> {
  return dealComparisonFor("survival", count, exclude);
}

async function dealComparisonFor(
  game: ComparisonGameId,
  count: number,
  exclude: readonly string[],
): Promise<DealtComparisonRound[]> {
  const take = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_DRAW);

  const locale = await readLocale();
  const supabase = await createServerDbClient();
  const [events, userId] = await Promise.all([
    randomEvents(supabase, {
      count: take * EVENTS_PER_COMPARISON_ROUND,
      locale,
      fromYear: COMPARISON_MIN_YEAR,
      distinctYears: true,
      exclude: sanitizeExclude(exclude),
    }),
    dealtTo(),
  ]);

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

  return rounds.map((round) => {
    const token = signRound({
      game,
      userId,
      eventIds: [round.left.id, round.target.id, round.right.id],
    });
    // The token rides on all three so each bubble can be keyed on its own
    // event; only the round's own `token` is ever presented.
    return {
      left: maskForDeal(round.left, token),
      right: maskForDeal(round.right, token),
      target: maskForDeal(round.target, token),
      token,
    };
  });
}

/**
 * Who a deal is for: the signed-in account, or null for a guest. Read from the
 * session on this request — never an argument — and written into every
 * token, so a round dealt to a guest tab cannot be banked by an account and a
 * round dealt to one account cannot be banked by another.
 *
 * Every dealer reads it *beside* the draw (`Promise.all`), not after it: for a
 * signed-in player it is a trip to Supabase Auth, as far away as the database,
 * and the two answers do not depend on each other.
 */
async function dealtTo(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * Masks and signs a batch of date rounds. **The year leaves the server only in
 * the reply to a guess** (app/actions/scoring.ts), never in a deal.
 */
function dealDated<E extends LocalizedEvent>(
  game: SoloGame,
  events: readonly E[],
  userId: string | null,
): DealtEvent<E>[] {
  return events.map((event) =>
    maskForDeal(event, signRound({ game, userId, eventIds: [event.id] })),
  );
}

/**
 * Narrows a client's "already dealt" list to something this endpoint is
 * willing to hand the draw.
 *
 * It is the one caller-supplied argument here besides the count, and the only
 * thing it can do is make a draw *smaller*: an id that names nothing is simply
 * never matched, and an id that names a real event removes it from a pool the
 * player could already have been dealt it from. So there is nothing to
 * authorize — only a size to bound, since the list arrives in a request body.
 * `EXCLUDED_EVENT_LIMIT` is that bound, and trimming to it can only ever cost
 * a repeat: the draw treats the list as a preference, never as a filter (see
 * `exclude` in lib/db/queries.ts).
 */
function sanitizeExclude(ids: readonly string[]): string[] {
  const clean = ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  // The tail, not the head: clients append as they play, so the most recently
  // dealt events are the ones worth keeping when the list is over the cap.
  return clean.slice(-EXCLUDED_EVENT_LIMIT);
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
