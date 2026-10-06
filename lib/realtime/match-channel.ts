"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { createBrowserDbClient } from "../db/client.ts";
import type { Seat, VersusMatchRow } from "../game/versus.ts";

/**
 * The live connection to one match.
 *
 * **Why Postgres changes rather than a broadcast.** Supabase offers both, and
 * broadcast would be a hop faster — but it would also be a second copy of the
 * state, sent by whichever server action happened to run, and a second copy is
 * a thing that can disagree with the first. Subscribing to the row means the
 * only way to tell a client something is to make it true in the database, and
 * the thing that arrives *is* the authoritative row. The ordering, the
 * replay-on-reconnect and the "what if the sender crashed between the write
 * and the send" question all stop existing.
 *
 * That choice is what forces the schema's shape: a pushed row is pushed
 * whole, and Postgres row-level security cannot hide a column. So `match`
 * carries nothing that would decide a live round (see the migration header),
 * and the things it cannot carry — the question, the opponent's guess before
 * the reveal — are fetched per seat through a Server Action instead.
 *
 * **Presence is separate and deliberately advisory.** It answers "is their tab
 * open", which is worth showing and worth nothing else: a match is never
 * paused, forfeited or ended because presence dropped. The clock does that, on
 * the server, and a player on a train going through a tunnel keeps their
 * remaining seconds. Treating presence as authority is how a brief disconnect
 * becomes a lost game.
 */

export interface MatchChannelHandlers {
  /** A new authoritative row. Fold it in with `applyMatchRow`. */
  onRow: (row: VersusMatchRow) => void;
  /** Whether the opponent's tab is currently connected to this channel. */
  onOpponentPresence: (present: boolean) => void;
  /**
   * Socket state. `true` on the first subscribe and on every re-subscribe
   * after a drop — the caller should refetch on the rising edge, because
   * changes made while the socket was down were never delivered and will not
   * be replayed.
   */
  onConnected: (connected: boolean) => void;
}

/**
 * Subscribe to a match. Returns the unsubscribe.
 *
 * The channel name is scoped to the match so two tabs playing different games
 * in one browser do not share presence — which is also exactly what makes it
 * possible to test a two-player mode on one machine.
 */
export function subscribeToMatch(
  matchId: string,
  seat: Seat,
  handlers: MatchChannelHandlers,
): () => void {
  const supabase = createBrowserDbClient();

  const channel: RealtimeChannel = supabase.channel(`match:${matchId}`, {
    config: { presence: { key: String(seat) } },
  });

  channel
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "match",
        filter: `id=eq.${matchId}`,
      },
      (payload) => {
        handlers.onRow(payload.new as VersusMatchRow);
      },
    )
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      // Keys are seat numbers; anything that is not this client is the
      // opponent. Reading it this way rather than looking for a specific key
      // means a stale entry from a previous tab cannot read as the opponent.
      const others = Object.keys(state).filter((key) => key !== String(seat));
      handlers.onOpponentPresence(others.length > 0);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        handlers.onConnected(true);
        // Announce this seat only once the socket is up; tracking before
        // subscribe silently does nothing.
        void channel.track({ seat, at: Date.now() });
        return;
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        handlers.onConnected(false);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
