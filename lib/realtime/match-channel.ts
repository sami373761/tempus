"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { createBrowserDbClient } from "../db/client.ts";
import type { Seat, VersusMatchPush } from "../game/versus.ts";

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
 * That choice is what forces the schema's shape: row-level security cannot
 * hide a column, so `match` carries nothing that would decide a live round
 * (see the migration header), and the things it cannot carry — the question,
 * the opponent's guess before the reveal — are fetched per seat through a
 * Server Action instead. What *can* narrow a push is a column grant: Realtime
 * drops every column the subscriber may not select, so the row that arrives
 * is `VersusMatchPush` (`MATCH_CLIENT_COLUMNS` in lib/game/versus.ts), not the
 * table row — no invite code, no timestamps a client should not reason from,
 * and no seat's name or rating: anyone may subscribe to this table unfiltered,
 * so those reach the two players through their own views instead. Nor does an
 * online match push a first answer at all — each seat hears of the other's
 * lock-in from its own heartbeat (app/api/versus/tick), because a bot's could
 * never arrive any other way.
 *
 * **Presence is separate and deliberately advisory.** It answers "is their tab
 * open", which is worth showing and worth nothing else: a match is never
 * paused, forfeited or ended because presence dropped. The clock does that, on
 * the server, and a player on a train going through a tunnel keeps their
 * remaining seconds. Treating presence as authority is how a brief disconnect
 * becomes a lost game.
 *
 * **And it is off entirely in an online match.** There the other seat may not
 * have a browser at all, and a presence line that only ever showed for some
 * opponents would say which ones. The caller turns it off (`presence: false`)
 * and neither side announces itself, so every online opponent looks the same.
 */

export interface MatchChannelOptions {
  /**
   * Track this seat and report the other's. Default true, which is every
   * invitation; an online match passes false — see the header.
   */
  presence?: boolean;
}

export interface MatchChannelHandlers {
  /**
   * A new authoritative row — the client-readable columns of it, which is
   * all Realtime delivers. Fold it in with `applyMatchRow`.
   */
  onRow: (row: VersusMatchPush) => void;
  /**
   * Whether the opponent's tab is currently connected to this channel. Never
   * called when presence is off.
   */
  onOpponentPresence?: (present: boolean) => void;
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
  options: MatchChannelOptions = {},
): () => void {
  const presence = options.presence ?? true;
  const supabase = createBrowserDbClient();

  // Without a presence key or a presence listener the channel never joins the
  // presence state at all (realtime-js only enables it for one or the other),
  // which is the point: an online seat is not merely quiet, it is absent.
  const channel: RealtimeChannel = supabase.channel(
    `match:${matchId}`,
    presence ? { config: { presence: { key: String(seat) } } } : undefined,
  );

  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "match",
      filter: `id=eq.${matchId}`,
    },
    (payload) => {
      // Cast rather than parsed: the grant decides the shape, and every
      // field is read through `applyMatchRow`, which tolerates the nulls.
      handlers.onRow(payload.new as VersusMatchPush);
    },
  );

  if (presence) {
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      // Keys are seat numbers; anything that is not this client is the
      // opponent. Reading it this way rather than looking for a specific key
      // means a stale entry from a previous tab cannot read as the opponent.
      const others = Object.keys(state).filter((key) => key !== String(seat));
      handlers.onOpponentPresence?.(others.length > 0);
    });
  }

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      handlers.onConnected(true);
      // Announce this seat only once the socket is up; tracking before
      // subscribe silently does nothing.
      if (presence) void channel.track({ seat, at: Date.now() });
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
