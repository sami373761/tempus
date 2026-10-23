import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { serverEnv } from "../env.ts";
import type { SoloGame } from "./points.ts";

/**
 * A dealt solo round, signed, so the server can grade it without having
 * stored it.
 *
 * **Why a token and not a table.** The solo games are playable signed out, and
 * every guest round would otherwise be a row written on deal and never read.
 * What the server needs at reveal is small — which events, which game, who it
 * was dealt to — so it travels with the round instead, signed so a client
 * cannot change any of it: a forged token cannot point at an event the client
 * already knows the year of, move a round into another game's (easier) bands,
 * or claim a round dealt to someone else.
 *
 * **Replay is the ledger's problem, not this file's.** A token can be
 * revealed as often as the client likes; it can be *banked* once, because
 * `solo_answer.round_id` is a primary key. A guest's reveals are graded and
 * banked nowhere.
 *
 * The key is derived from the service-role key rather than being an
 * environment variable of its own: it is already the one secret only the
 * server holds, and rotating it (CLAUDE.md, known gap 9) costs nothing worse
 * than the rounds already on screen failing to reveal once.
 */

/** How long a dealt round stays revealable. A long tea break, not a stockpile. */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export interface RoundClaims {
  /** The round's own id: what the ledger keys a payout on. */
  roundId: string;
  game: SoloGame;
  /**
   * The events, in the game's own order. One for a date round; three for a
   * comparison round, `[left, target, right]`.
   */
  eventIds: string[];
  /** Who it was dealt to. Null for a guest. */
  userId: string | null;
  issuedAt: number;
}

let cachedKey: Buffer | null = null;

function signingKey(): Buffer {
  if (!cachedKey) {
    cachedKey = createHash("sha256")
      .update("tempus/round-token/v1:")
      .update(serverEnv().supabaseServiceRoleKey)
      .digest();
  }
  return cachedKey;
}

function mac(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function signRound(
  claims: Omit<RoundClaims, "roundId" | "issuedAt">,
): string {
  const full: RoundClaims = {
    ...claims,
    roundId: randomUUID(),
    issuedAt: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/**
 * The claims, if the token is genuine and still fresh. Null for anything else
 * — the caller has nothing more useful to do with a bad token than refuse it.
 */
export function verifyRound(token: unknown): RoundClaims | null {
  if (typeof token !== "string" || token.length > 2048) return null;

  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(mac(body), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  try {
    const claims = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as RoundClaims;
    if (Date.now() - claims.issuedAt > TOKEN_TTL_MS) return null;
    return claims;
  } catch {
    return null;
  }
}
