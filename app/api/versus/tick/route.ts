import { createAdminDbClient } from "@/lib/db/admin";
import { seatForToken, tickMatch, touchSeat } from "@/lib/db/matches";
import type { TickResponse } from "@/lib/game/versus";
import { readLocale } from "@/lib/i18n/server";

/**
 * The heartbeat of a live online round — what `PUBLIC_TICK_MS` in
 * lib/game/versus.ts describes, and `tickMatch` in lib/db/matches.ts does.
 *
 * **A Route Handler rather than a Server Action, on purpose.** Next runs a
 * page's Server Actions one at a time, queued on the router: an action called
 * while another is in flight is not even sent until the first has answered.
 * The beat fires every second and a half for most of a public round, and each
 * one is a reconcile against a database a continent away — so as an action it
 * kept the queue busy for a third of the round, and a lock-in pressed in the
 * last second could sit behind it and reach `versus_submit` after the
 * deadline, which judges the guess when it *arrives*. The same wait was
 * counted as network latency by the clock offset `fetchMatchView` measures.
 * Called with `fetch`, the beat is beside the queue instead of in it, and
 * nothing a player presses ever waits for one.
 *
 * The contract is the action's, unchanged in spirit: the seat comes from the
 * token and nothing else, and the answer is a view or null. Unauthenticated in
 * the cookie sense — the games are playable signed out and the seat token is
 * the credential — so it is excluded from the middleware matcher, which would
 * otherwise put a session refresh in front of every beat. Every failure is a
 * JSON `{ ok: false }` the client treats as a dropped beat.
 */

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return answer({ ok: false, reason: "bad-request" }, 400);
  }

  const { matchId, token, knownVersion } =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  if (typeof matchId !== "string" || !UUID.test(matchId)) {
    return answer({ ok: false, reason: "not-found" }, 404);
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 256) {
    return answer({ ok: false, reason: "forbidden" }, 403);
  }

  const admin = createAdminDbClient();

  try {
    const seat = await seatForToken(admin, matchId, token);
    if (seat === null) return answer({ ok: false, reason: "forbidden" }, 403);

    void touchSeat(admin, matchId, seat).catch(() => {});

    const locale = await readLocale();
    return answer(
      await tickMatch(admin, {
        matchId,
        seat,
        knownVersion: Math.trunc(Number(knownVersion)),
        locale,
      }),
    );
  } catch (error) {
    console.error("versus tick failed", { matchId, error });
    return answer({ ok: false, reason: "server" }, 500);
  }
}

function answer(body: TickResponse, status = 200): Response {
  return Response.json(body, {
    status,
    // A beat is a question about now; nothing between here and the browser
    // may answer it from yesterday.
    headers: { "cache-control": "no-store" },
  });
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
