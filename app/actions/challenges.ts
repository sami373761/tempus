"use server";

import { createAdminDbClient } from "@/lib/db/admin";
import {
  isChallengeDirection,
  recordDateChallenge,
  type ChallengeDirection,
} from "@/lib/db/challenges";
import { readLocale } from "@/lib/i18n/server";

/**
 * The one way a browser can write to the database.
 *
 * Everything else on the site is read-only to `anon` — the content tables have
 * no write grants and no write policies — so this action is the exception and
 * is shaped accordingly: the service-role client is used for exactly one
 * INSERT into exactly one table, and every argument is checked here rather
 * than trusted from the client.
 *
 * The locale is read from the cookie rather than taken as an argument, the
 * same way `dealTimelineEvents` does it, which leaves the caller with nothing
 * to supply but the event and the direction.
 *
 * There is no per-player limit, because there is no player: the site has no
 * accounts and a browser has nothing durable to key one on. So this records a
 * stream of reports for an editor to read, not a vote to be trusted — see the
 * migration. What it must never do is let a malformed call through, which is
 * what the two guards below are for.
 */

/** Deliberately coarse: the player is thanked either way, and a failure is a
 *  prompt to try again rather than something to explain. */
export type ChallengeResult = { ok: boolean };

export async function submitDateChallenge(
  eventId: string,
  direction: string,
): Promise<ChallengeResult> {
  if (!isUuid(eventId) || !isChallengeDirection(direction)) {
    return { ok: false };
  }

  try {
    const locale = await readLocale();
    await recordDateChallenge(createAdminDbClient(), {
      eventId,
      direction: direction as ChallengeDirection,
      localeCode: locale,
    });
    return { ok: true };
  } catch {
    // A thrown database error must not reach the browser as a stack trace —
    // the same rule the head-to-head actions follow. A foreign-key violation
    // (an event id that is not an event) lands here and is a failure, which is
    // the correct answer to it.
    return { ok: false };
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}
