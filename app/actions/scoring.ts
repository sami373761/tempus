"use server";

import { after } from "next/server";

import { getCurrentUser, type SessionUser } from "@/lib/auth/server";
import { isBadgeSlug } from "@/lib/badges";
import { createAdminDbClient } from "@/lib/db/admin";
import { publishedCategory } from "@/lib/db/cached";
import {
  bankSoloRound,
  refreshBadges,
  setWornBadge,
} from "@/lib/db/scoring";
import {
  allowRound,
  type RoundAllowance,
} from "@/lib/game/play-ledger";
import { isLimitedGame } from "@/lib/game/play-limit";
import {
  comparisonPoints,
  DATE_GAMES,
  isYearGame,
  tierPoints,
  type SoloGame,
} from "@/lib/game/points";
import { verifyRound, type RoundClaims } from "@/lib/game/round-token";
import {
  COMPARISON_SECTIONS,
  comparisonVerdict,
  isComparisonCorrect,
  sectionSide,
  type ComparisonRound,
} from "@/lib/game/rounds";
import {
  BASKETBALL_BANDS,
  FOOTBALL_BANDS,
  gradeGuess,
  SCREEN_BANDS,
  WHEN_BORN_BANDS,
  type BandSet,
  type Verdict,
} from "@/lib/game/scoring";
import { QUESTIONS_PER_SET } from "@/lib/game/set";
import type { BankedRound, RevealedDate, RevealResult } from "@/lib/game/solo";

/**
 * Revealing a solo round: grade the guess on the server, and for a member,
 * bank it.
 *
 * **The round is the token's, not the caller's.** Which event, which game
 * (and so which bands) and who it was dealt to all come from the signed token
 * (lib/game/round-token.ts); the caller supplies only the guess and the set it
 * is playing. A guest is graded and told how they did — that is the game — and
 * nothing is written. A round dealt to a guest tab that is revealed after
 * signing in is graded the same way and not banked: it was not dealt to the
 * account.
 *
 * **The set id is the caller's, and buys nothing.** See `solo_set` in
 * supabase/migrations/20261017120000_scoring.sql: a set's owner and game are
 * fixed by its first round, and a round can be banked into one set, once.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each date game's ladder. `undefined` is the general one (`BANDS`). */
const DATE_GAME_BANDS: Record<(typeof DATE_GAMES)[number], BandSet | undefined> = {
  history: undefined,
  football: FOOTBALL_BANDS,
  basketball: BASKETBALL_BANDS,
  screen: SCREEN_BANDS,
  "when-born": WHEN_BORN_BANDS,
};

function isDateGame(game: SoloGame): boolean {
  return (DATE_GAMES as readonly string[]).includes(game) || isYearGame(game);
}

/**
 * The ladder a round is graded on: the built-in games' constants, or a
 * category's `game_category.bands` (computed from its timeline in the admin
 * panel). A slug that is not a published category grades nothing — the
 * round could not have been dealt.
 */
async function bandsFor(game: SoloGame): Promise<{ ok: true; bands: BandSet | undefined } | { ok: false }> {
  if ((DATE_GAMES as readonly string[]).includes(game)) {
    return { ok: true, bands: DATE_GAME_BANDS[game as (typeof DATE_GAMES)[number]] };
  }
  const category = await publishedCategory(game);
  return category ? { ok: true, bands: category.bands } : { ok: false };
}

export async function revealDateRound(
  token: string,
  guess: number,
  setId: string | null,
): Promise<RevealResult> {
  const claims = verifyRound(token);
  if (!claims || claims.eventIds.length !== 1 || !isDateGame(claims.game)) {
    return { ok: false, reason: "bad-token" };
  }
  // The rails cannot produce anything outside the dataset's own range, but an
  // action can be called without a rail.
  if (!Number.isInteger(guess) || Math.abs(guess) > 20_000_000_000) {
    return { ok: false, reason: "bad-input" };
  }

  try {
    const admin = createAdminDbClient();
    // All three in one wait. The limit is read beside the date rather than
    // before it, so the four limited modes cost the same round trip as the
    // unlimited ones — see the note on `allowRound`.
    const [dates, user, play, ladder] = await Promise.all([
      readDates(admin, claims.eventIds),
      dealtAccount(claims),
      allowRoundOf(claims, setId),
      bandsFor(claims.game),
    ]);
    if (!ladder.ok) return { ok: false, reason: "bad-token" };

    // The day's games are spent. Nothing is revealed and nothing is banked:
    // this is the gate a client cannot skip, because a guess it cannot send
    // for grading is a guess it cannot have an answer to.
    if (play && !play.ok) {
      return { ok: false, reason: "play-limit", plays: play.allowance };
    }

    const date = dates.get(claims.eventIds[0]!);
    if (!date) return { ok: false, reason: "failed" };

    const { verdict } = gradeGuess(guess, date.year, ladder.bands);
    const tp = tierPoints(verdict);
    const correct = verdict !== "wayOff";

    const banked = await bankIfMember(admin, claims, user, setId, {
      verdict,
      correct,
      tp,
    });

    return {
      ok: true,
      date,
      verdict,
      correct,
      tp,
      banked,
      plays: play?.allowance ?? null,
    };
  } catch (error) {
    console.error("revealDateRound failed", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * `section` is null when the round's clock ran out with the card dead centre,
 * which commits to neither side (see `useSoloRoundClock`): the round is still
 * graded and banked — a set needs all ten, and a run ends on it — as a miss
 * worth nothing, which is what the head-to-head makes of a round nobody
 * answered.
 */
export async function revealComparisonRound(
  token: string,
  section: number | null,
  setId: string | null,
): Promise<RevealResult> {
  const claims = verifyRound(token);
  if (
    !claims ||
    claims.eventIds.length !== 3 ||
    (claims.game !== "compare" && claims.game !== "survival")
  ) {
    return { ok: false, reason: "bad-token" };
  }
  if (
    section !== null &&
    (!Number.isInteger(section) ||
      section < 0 ||
      section >= COMPARISON_SECTIONS)
  ) {
    return { ok: false, reason: "bad-input" };
  }

  try {
    const admin = createAdminDbClient();
    const [leftId, targetId, rightId] = claims.eventIds as [string, string, string];
    const [dates, user] = await Promise.all([
      readDates(admin, claims.eventIds),
      dealtAccount(claims),
    ]);
    const left = dates.get(leftId);
    const target = dates.get(targetId);
    const right = dates.get(rightId);
    if (!left || !target || !right) return { ok: false, reason: "failed" };

    // The comparison rules read nothing of an event but its year, so a round
    // of three years is all they need here. Cast rather than fetching three
    // whole localized events only to throw everything but the year away.
    const round = {
      left: { year: left.year },
      target: { year: target.year },
      right: { year: right.year },
    } as unknown as ComparisonRound;

    const verdict: Verdict =
      section === null ? "wayOff" : comparisonVerdict(round, section);
    const correct =
      section !== null && isComparisonCorrect(round, sectionSide(section));
    const tp = comparisonPoints(verdict, correct);

    const banked = await bankIfMember(admin, claims, user, setId, {
      verdict,
      correct,
      tp,
    });

    return {
      ok: true,
      date: target,
      verdict,
      correct,
      tp,
      banked,
      comparison: { left, target, right },
    };
  } catch (error) {
    console.error("revealComparisonRound failed", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Put a badge on beside your name, or `null` to take it off. Wearing one takes
 * any other off — there is one column for the choice. The badge must be
 * earned, which the database is asked rather than the client.
 */
export async function wearBadge(
  slug: string | null,
): Promise<{ ok: boolean }> {
  if (slug !== null && (typeof slug !== "string" || !isBadgeSlug(slug))) {
    return { ok: false };
  }

  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false };
    const ok = await setWornBadge(createAdminDbClient(), user.id, slug);
    return { ok };
  } catch (error) {
    console.error("wearBadge failed", error);
    return { ok: false };
  }
}

/* -------------------------------------------------------------------------
   Internals
   ------------------------------------------------------------------------- */

type Admin = ReturnType<typeof createAdminDbClient>;

async function readDates(
  admin: Admin,
  ids: readonly string[],
): Promise<Map<string, RevealedDate>> {
  const { data, error } = await admin
    .from("event")
    .select("id, year, month, day, precision, sort_key")
    .in("id", [...ids]);

  if (error) throw new Error(`readDates: ${error.message}`);

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        year: row.year,
        month: row.month,
        day: row.day,
        precision: row.precision,
        sortKey: row.sort_key,
      } satisfies RevealedDate,
    ]),
  );
}

/**
 * The account a round may be banked to: the session's, and only if it is the
 * one the round was dealt to. Read alongside the event's date rather than
 * after it — each is a round trip to the database's region.
 */
async function dealtAccount(claims: RoundClaims): Promise<SessionUser | null> {
  if (!claims.userId) return null;
  const user = await getCurrentUser();
  return user && user.id === claims.userId ? user : null;
}

/**
 * Whether this round may be played at all: the subject modes are three games a
 * day, one for a guest (lib/game/play-limit.ts).
 *
 * Null in every other game, which is what makes this the whole of the limit's
 * presence on this path — the four modes are a list in one module rather than
 * a branch in each caller.
 *
 * **Whose game it is comes from the token, not the session.** `claims.userId`
 * is the account the round was dealt to, so a round is counted against that
 * account however the tab's session has moved since — the same reasoning as
 * `dealtAccount`, which asks a different question (may it be *paid*).
 */
async function allowRoundOf(
  claims: RoundClaims,
  setId: string | null,
): Promise<RoundAllowance | null> {
  if (!isLimitedGame(claims.game)) return null;
  return allowRound(
    claims.game,
    setId,
    claims.roundId,
    claims.userId ?? null,
  );
}

async function bankIfMember(
  admin: Admin,
  claims: RoundClaims,
  user: SessionUser | null,
  setId: string | null,
  graded: { verdict: Verdict; correct: boolean; tp: number },
): Promise<BankedRound | null> {
  if (!user) return null;

  if (!setId || !UUID_RE.test(setId)) {
    return { counted: false, tp: 0, bonus: 0, setTp: 0, newBadges: [] };
  }

  const banked = await bankSoloRound(admin, {
    userId: user.id,
    setId,
    game: claims.game,
    roundId: claims.roundId,
    eventId: claims.eventIds[claims.eventIds.length === 3 ? 1 : 0]!,
    verdict: graded.verdict,
    correct: graded.correct,
    tp: graded.tp,
    setSize: QUESTIONS_PER_SET,
  });

  const { setClosed, ...round } = banked;

  /*
   * Badges are re-measured after every payout, but **never before the
   * reply**: the refresh is three or four more round trips, and a player
   * waiting on a reveal is waiting on exactly this request. Mid-set it runs
   * after the response (`after`). The set's last round does not refresh at
   * all — it says the badges are pending, and the summary asks
   * `/api/set-badges`, which refreshes and reports every badge unlocked since
   * the set began, the deferred ones included. The summary opens on this
   * reply alone instead of waiting ~2 s for the announcement.
   *
   * A payout of nothing changes nothing a rule reads (a correct answer always
   * pays), so it skips the refresh. Failures are logged, never thrown: the
   * round is already banked, and /achievements re-measures on every visit.
   */
  if (round.counted && setClosed) {
    return { ...round, newBadges: [], badgesPending: true };
  }
  if (round.counted && round.tp + round.bonus > 0) {
    after(async () => {
      try {
        await refreshBadges(admin, user.id);
      } catch (error) {
        console.error("deferred refreshBadges failed", error);
      }
    });
  }

  return { ...round, newBadges: [] };
}
