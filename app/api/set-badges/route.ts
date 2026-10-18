import { getCurrentUser } from "@/lib/auth/server";
import { createAdminDbClient } from "@/lib/db/admin";
import { badgesEarnedDuringSet, refreshBadges } from "@/lib/db/scoring";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The badges a finished set unlocked, for its summary.
 *
 * Split off the set's last reveal so the summary opens on the reveal's own
 * round trip: the badge refresh is three or four more trips to the database's
 * region, and a player who has just locked in their tenth answer was waiting
 * on all of them. The summary now asks here once it is on screen, and the
 * announcement lands a moment later.
 *
 * Refreshing here rather than in an `after()` of the reveal is what makes the
 * answer complete: an `after()` would race this request. A refresh is
 * idempotent and only ever reads the player's own rows, so asking twice (a
 * retry, a second tab) costs a recomputation and nothing else.
 *
 * A Route Handler, not a Server Action, for the reason `/api/deal` is one:
 * actions run one at a time per client, and the next set's first reveal must
 * not queue behind this.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400);
  }

  const setId =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).setId
      : null;
  if (typeof setId !== "string" || !UUID_RE.test(setId)) return reply(400);

  const user = await getCurrentUser();
  if (!user) return reply(401);

  try {
    const admin = createAdminDbClient();
    await refreshBadges(admin, user.id);
    const badges = await badgesEarnedDuringSet(admin, user.id, setId);
    return reply(200, { badges });
  } catch (error) {
    console.error("set badges failed", error);
    return reply(500);
  }
}

function reply(status: number, body?: unknown): Response {
  const headers = { "cache-control": "no-store" };
  return body === undefined
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });
}
