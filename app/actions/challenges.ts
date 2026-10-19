"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { createAdminDbClient } from "@/lib/db/admin";
import {
  isChallengeDirection,
  recordDateChallenge,
  type ChallengeDirection,
} from "@/lib/db/challenges";
import { readLocale } from "@/lib/i18n/server";

/**
 * A player's vote that an event is dated wrongly.
 *
 * **Signed-in players only, one vote each.** The admin panel ranks events by
 * these votes, so a vote has to be a person: a guest is told to sign in
 * (`needs-account`), and an account that has already voted on this event's
 * current year is told so (`already-voted`) — there is no changing or taking
 * back a vote. Changing the event's year in the panel opens a fresh count;
 * renaming it does not.
 *
 * The service-role client is used for exactly one INSERT into exactly one
 * table; the player's identity comes from the session, the year from the
 * database (a trigger stamps `year_at_vote`), and the locale from the cookie,
 * which leaves the caller nothing to supply but the event and the direction.
 */
export type ChallengeResult =
  | { ok: true }
  | { ok: false; reason?: "needs-account" | "already-voted" };

export async function submitDateChallenge(
  eventId: string,
  direction: string,
): Promise<ChallengeResult> {
  if (!isUuid(eventId) || !isChallengeDirection(direction)) {
    return { ok: false };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "needs-account" };

  try {
    const locale = await readLocale();
    const outcome = await recordDateChallenge(createAdminDbClient(), {
      eventId,
      userId: user.id,
      direction: direction as ChallengeDirection,
      localeCode: locale,
    });
    return outcome === "recorded" ? { ok: true } : { ok: false, reason: "already-voted" };
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
