import "server-only";

/**
 * Where a day's subject-mode games are counted: the set ledger for an account,
 * a cookie for a guest.
 *
 * The two halves answer the same two questions — how many games are left, and
 * may this round be played — so they are one module with one pair of
 * functions, and neither the pages nor the reveal has to know which kind of
 * player it is serving. The rules (which games, how many, which day) are
 * ./play-limit.ts; the account's count is read off `solo_set` in
 * ../db/play-limit.ts.
 *
 * **The limit is enforced where a round is graded**, not where the client says
 * a game began — see `allowRound`, which `revealDateRound` calls before it
 * reveals anything. A gate the client has to ask for is a gate a client can
 * decline to ask for; grading is the one thing a player cannot play without.
 *
 * **A guest's games live in a cookie, and that is the honest ceiling of what a
 * guest can be held to.** There is no account to key a count to, so the cookie
 * is the record: `httpOnly`, because nothing on the client reads it — the
 * allowance reaches the screen as props. A guest who clears it gets another
 * game, which is the trade every guest mode makes; the sign-up notice is the
 * answer to that, not a stricter store.
 *
 * **Reads never write.** `readAllowance` runs during a page render, where
 * Next.js refuses cookie writes, and it must not need one: a cookie from
 * yesterday is *read* as an empty day and replaced by the next round that
 * spends a game, rather than being tidied up by whoever happened to look first.
 */

import { cookies } from "next/headers";

import { getCurrentUser } from "../auth/server.ts";
import { createAdminDbClient } from "../db/admin.ts";
import { readPlayStanding } from "../db/play-limit.ts";
import { isDevelopment } from "../env.ts";
import {
  allowanceOf,
  playDay,
  playDayStart,
  playsPerDay,
  type LimitedGame,
  type PlayAllowance,
} from "./play-limit.ts";
import { QUESTIONS_PER_SET } from "./set.ts";

/**
 * The guest ledger's cookie.
 *
 * One cookie for all four games rather than one each, so a guest's whole day
 * is read in a single header and there is one thing to expire.
 */
const COOKIE = "tempus_plays";

/** Two days, so yesterday's cookie goes away on its own. */
const COOKIE_MAX_AGE = 2 * 24 * 60 * 60;

/**
 * A guest's day: which sets of which games they have begun.
 *
 * Set ids rather than a count, because a round has to be able to tell "the set
 * I am already playing" from "a new game" — the same question the account half
 * asks `solo_set`. A guest gets one game per mode, so this holds at most four
 * ids and is a small cookie by construction.
 */
interface GuestPlays {
  /** The UTC day these belong to. A different day reads as an empty one. */
  d: string;
  p: Partial<Record<LimitedGame, string[]>>;
}

/* -------------------------------------------------------------------------
   How many games are left
   ------------------------------------------------------------------------- */

/**
 * How this player stands in one game today — the entry gate every limited page
 * renders against.
 *
 * The caller decides what to do with it: `canPlay` is the gate, `playsLeft` is
 * what the screen prints.
 */
export async function readAllowance(
  game: LimitedGame,
): Promise<PlayAllowance> {
  const day = playDay();
  const user = await getCurrentUser();

  if (!user) {
    const ids = guestIdsOf(await readGuestPlays(), game, day);
    return allowanceOf(game, false, ids.length, day);
  }

  // Guarded rather than allowed to throw: a page that cannot read the ledger
  // must not be a page that will not render. A failure counts as no games
  // used, which errs towards letting somebody play — the alternative is
  // locking a player out of a mode over one lost round trip, and the gate in
  // the reveal will still refuse a game that is really spent.
  try {
    const standing = await readPlayStanding(createAdminDbClient(), {
      userId: user.id,
      game,
      setId: null,
      roundId: null,
      since: playDayStart(day),
      setSize: QUESTIONS_PER_SET,
    });
    return allowanceOf(game, true, standing.used, day);
  } catch (error) {
    console.error("readAllowance failed", error);
    return allowanceOf(game, true, 0, day);
  }
}

/* -------------------------------------------------------------------------
   May this round be played
   ------------------------------------------------------------------------- */

export interface RoundAllowance {
  /** Whether this round may be graded. False is the day's games being spent. */
  ok: boolean;
  /** What to tell the screen: the standing as it now is. */
  allowance: PlayAllowance;
}

/**
 * Whether a round of a limited game may be graded, and what that leaves.
 *
 * Two ways to be allowed, and the distinction is the whole of the rule:
 *
 *   * the set is one the day has already paid for and still has rounds left —
 *     a game in progress, which costs nothing more;
 *   * or it is a new set and the day has a game to spend on it.
 *
 * **The account's identity comes from the round's own token**, not from the
 * session: `userId` here is `RoundClaims.userId`, so a round dealt to an
 * account is counted against that account whatever the tab is doing now. A
 * round dealt with no account is a guest's, and goes to the cookie.
 *
 * `roundId` is the token's too, and buys one thing: a round that has already
 * been banked may always be played again, because a retried reveal is a lost
 * reply rather than a second game.
 *
 * **A guest's new game writes the cookie, so this must run in a Server Action
 * or Route Handler** — which is where it is called from (the reveal).
 */
export async function allowRound(
  game: LimitedGame,
  setId: string | null,
  roundId: string,
  userId: string | null,
): Promise<RoundAllowance> {
  const day = playDay();
  const limit = playsPerDay(userId !== null);

  // No set to attribute the round to. Nothing can be counted — and nothing
  // needs to be: without a set id a round earns no TP either (see
  // `bankIfMember`), so this is a round played outside a game.
  if (!setId) {
    return { ok: true, allowance: allowanceOf(game, userId !== null, 0, day) };
  }

  if (!userId) return allowGuestRound(game, setId, day, limit);

  try {
    const standing = await readPlayStanding(createAdminDbClient(), {
      userId,
      game,
      setId,
      roundId,
      since: playDayStart(day),
      setSize: QUESTIONS_PER_SET,
    });

    // A set that exists but has had its ten rounds is refused — that is what
    // stops one set id being replayed all afternoon, and it is the closing
    // `bank_solo_round` already does rather than a rule of this module's own.
    // A round already banked is exempt: see the replay note in the migration.
    if (standing.continuing) {
      return {
        ok: standing.setOpen,
        allowance: allowanceOf(game, true, standing.used, day),
      };
    }

    // A new set. It spends a game, and the spending is the `solo_set` row the
    // banking below this is about to create — so `used + 1` is what the day
    // will hold once this round lands.
    const allowed = standing.used < limit;
    return {
      ok: allowed,
      allowance: allowanceOf(
        game,
        true,
        allowed ? standing.used + 1 : standing.used,
        day,
      ),
    };
  } catch (error) {
    // A round whose standing could not be read is graded anyway. The player
    // has already locked in a guess; the cost of a lost round trip is one
    // uncounted game, and the cost of the other choice is a guess thrown away
    // for a reason nobody can see.
    console.error("allowRound failed", error);
    return { ok: true, allowance: allowanceOf(game, true, 0, day) };
  }
}

/* -------------------------------------------------------------------------
   The guest cookie
   ------------------------------------------------------------------------- */

/**
 * A guest's round.
 *
 * The cookie holds the sets they have begun today, so a round of a set already
 * in it is a game in progress and costs nothing. There is no per-set round cap
 * on this side: a guest who would reuse a set id to keep playing is a guest who
 * could clear the cookie to keep playing, so the cap would buy nothing.
 */
async function allowGuestRound(
  game: LimitedGame,
  setId: string,
  day: string,
  limit: number,
): Promise<RoundAllowance> {
  const plays = await readGuestPlays();
  const ids = guestIdsOf(plays, game, day);

  if (ids.includes(setId)) {
    return { ok: true, allowance: allowanceOf(game, false, ids.length, day) };
  }
  if (ids.length >= limit) {
    return { ok: false, allowance: allowanceOf(game, false, ids.length, day) };
  }

  // A cookie from another day is replaced rather than merged: its games are
  // not today's, and there is nothing in it worth carrying over.
  const sameDay = plays?.d === day ? plays.p : {};
  const next: GuestPlays = {
    d: day,
    p: { ...sameDay, [game]: [...ids, setId].slice(-limit) },
  };

  const jar = await cookies();
  jar.set(COOKIE, encodeURIComponent(JSON.stringify(next)), {
    httpOnly: true,
    sameSite: "lax",
    // Not in development: the site is played over a plain-http LAN address
    // there (CLAUDE.md, versus), where a `secure` cookie is dropped and every
    // guest would get an unlimited number of first games.
    secure: !isDevelopment(),
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return { ok: true, allowance: allowanceOf(game, false, ids.length + 1, day) };
}

/** The sets of one game the cookie holds *for today*. Any other day is empty. */
function guestIdsOf(
  plays: GuestPlays | null,
  game: LimitedGame,
  day: string,
): string[] {
  if (!plays || plays.d !== day) return [];
  const ids = plays.p[game];
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}

/**
 * The guest cookie, or null.
 *
 * Every failure is null — a cookie this cannot read is a cookie somebody
 * hand-edited, and the only safe reading of one is "no games today". That is
 * generous rather than strict, and deliberately: the strict alternative would
 * lock a visitor out of a mode over a corrupt header they can neither see nor
 * clear.
 */
async function readGuestPlays(): Promise<GuestPlays | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { d, p } = parsed as { d?: unknown; p?: unknown };
    if (typeof d !== "string" || !p || typeof p !== "object") return null;
    return { d, p: p as GuestPlays["p"] };
  } catch {
    return null;
  }
}
