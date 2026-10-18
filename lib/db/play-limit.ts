import "server-only";

/**
 * An account's standing in one subject mode today — the read behind
 * supabase/migrations/20261018150000_game_play_standing.sql.
 *
 * **There is no table of its own.** `solo_set` is the record of games begun:
 * one row per set, created by its first banked round and closed by
 * `bank_solo_round`. See the migration for why counting them beats a ledger of
 * the limit's own — the short version is that a client-named set id can be
 * reused, and the thing that already stops that is the set closing at ten.
 *
 * **Service role only**, like everything that reads `solo_set`. Nothing here
 * writes: the write that moves this number is the banking a graded round was
 * going to do anyway.
 */

import type { LimitedGame } from "../game/play-limit.ts";
import type { DbClient } from "./queries.ts";

export interface PlayStanding {
  /** Sets of this game begun today. */
  used: number;
  /**
   * The round asked about may be played: its set still has rounds left, or the
   * round has already been banked and is being retried. False when no set was
   * asked about.
   */
  setOpen: boolean;
  /** The set asked about belongs to this player and this game, open or not. */
  continuing: boolean;
}

/**
 * How this account stands: games begun since `since`, and whether the round
 * asked about may be played.
 *
 * `setId`/`roundId` are null for the page's question — how many games are left
 * — and the round in hand for a reveal's.
 */
export async function readPlayStanding(
  admin: DbClient,
  input: {
    userId: string;
    game: LimitedGame;
    setId: string | null;
    roundId: string | null;
    since: string;
    setSize: number;
  },
): Promise<PlayStanding> {
  const { data, error } = await admin.rpc("game_play_standing", {
    p_user_id: input.userId,
    p_game: input.game,
    p_set_id: input.setId,
    p_round_id: input.roundId,
    p_since: input.since,
    p_set_size: input.setSize,
  });
  if (error) throw new Error(`readPlayStanding: ${error.message}`);

  const row = (data ?? {}) as {
    used?: number;
    set_open?: boolean;
    continuing?: boolean;
  };
  return {
    used: Number(row.used ?? 0),
    setOpen: row.set_open === true,
    continuing: row.continuing === true,
  };
}
