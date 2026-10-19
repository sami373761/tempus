/**
 * Topping up a solo game's queue, from the browser.
 *
 * **Over plain HTTP (app/api/deal/route.ts), never as a Server Action.** A
 * page's Server Actions run one at a time, and the refill is the slowest call a
 * solo game makes — three or four reads against a database in another
 * hemisphere, about two seconds. As an action it sat in the same queue as the
 * reveal, so a player who locked in shortly after a new round appeared waited
 * for the next round's *deal* to finish before their own answer was even sent.
 * A `fetch` is outside that queue: the deal and the reveal now travel side by
 * side, which is the arrangement the head-to-head heartbeat already uses for
 * the same reason (app/api/versus/tick/route.ts).
 *
 * The opening deal is unchanged — the page still calls the dealers in
 * app/actions/rounds.ts directly while it renders.
 */
import type { ScreenEvent } from "./screen.ts";
import type { DealtComparisonRound, DealtEvent } from "./solo.ts";
import type { CategoryGame } from "./points.ts";
import type { WhenBornEvent } from "./when-born.ts";

export const DEAL_PATH = "/api/deal";

/**
 * Every pool a solo game is dealt from, by the key the route dispatches on.
 * Each key names one dealer whole — its pool *and* the game its tokens are
 * signed for — so choosing a key is exactly what choosing which action to call
 * used to be, and a survival run still cannot be dealt rounds signed for the
 * comparison game.
 */
export const DEAL_GAMES = [
  "history",
  "football",
  "basketball",
  "screen",
  "when-born",
  "compare",
  "survival",
] as const;

export type DealGame = (typeof DEAL_GAMES)[number];

/** The date games that play on `TimelineGame`: the built-in three, and any
 *  landscape category made in the admin panel (dealt by slug). */
export type TimelineDealGame = Extract<DealGame, "history" | "football" | "basketball"> | CategoryGame;

export interface DealtFor {
  history: DealtEvent[];
  football: DealtEvent[];
  basketball: DealtEvent[];
  screen: DealtEvent<ScreenEvent>[];
  "when-born": DealtEvent<WhenBornEvent>[];
  compare: DealtComparisonRound[];
  survival: DealtComparisonRound[];
}

export function isDealGame(value: unknown): value is DealGame {
  return (DEAL_GAMES as readonly unknown[]).includes(value);
}

/**
 * Deal `count` more rounds of `game`, avoiding `exclude` where the pool allows.
 * Throws on anything but a full answer, which the callers' refill effects
 * already treat as "try again shortly".
 */
export async function dealRounds<G extends DealGame>(
  game: G,
  count: number,
  exclude: readonly string[],
): Promise<DealtFor[G]>;
export async function dealRounds(
  game: CategoryGame,
  count: number,
  exclude: readonly string[],
): Promise<DealtEvent[]>;
export async function dealRounds(
  game: string,
  count: number,
  exclude: readonly string[],
): Promise<unknown> {
  const response = await fetch(DEAL_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ game, count, exclude }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`deal failed: ${response.status}`);
  return response.json();
}
