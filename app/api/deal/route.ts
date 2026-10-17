import {
  dealBasketballEvents,
  dealComparisonRounds,
  dealFootballEvents,
  dealScreenEvents,
  dealSurvivalRounds,
  dealTimelineEvents,
  dealWhenBornEvents,
} from "@/app/actions/rounds";
import { isDealGame, type DealGame, type DealtFor } from "@/lib/game/deal";

/**
 * The solo games' background refill — the dealers in app/actions/rounds.ts,
 * reached with a `fetch` so a refill in flight never holds a reveal back in
 * the page's Server Action queue. Why that matters is lib/game/deal.ts.
 *
 * Nothing here decides anything a dealer did not already: each key is one of
 * them called as it was, with the same clamp on `count`, the same bound on
 * `exclude` and the same session read for whom the tokens are signed. It is in
 * the middleware matcher on purpose — unlike the versus heartbeat, a deal
 * reads the session.
 */
const DEALERS: {
  [G in DealGame]: (count: number, exclude: readonly string[]) => Promise<DealtFor[G]>;
} = {
  history: dealTimelineEvents,
  football: dealFootballEvents,
  basketball: dealBasketballEvents,
  screen: dealScreenEvents,
  "when-born": dealWhenBornEvents,
  compare: dealComparisonRounds,
  survival: dealSurvivalRounds,
};

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400);
  }

  const { game, count, exclude } =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  if (!isDealGame(game)) return refuse(404);
  if (typeof count !== "number" || !Number.isFinite(count)) return refuse(400);
  if (!Array.isArray(exclude)) return refuse(400);

  try {
    const dealt = await DEALERS[game](
      count,
      exclude.filter((id): id is string => typeof id === "string"),
    );
    return Response.json(dealt, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("deal failed", { game, error });
    return refuse(500);
  }
}

function refuse(status: number): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
