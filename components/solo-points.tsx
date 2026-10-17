"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import { RefreshChrome } from "@/components/refresh-chrome";
import { BADGE_BY_SLUG, type BadgeSlug } from "@/lib/badges";
import type { RevealResult } from "@/lib/game/solo";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The TP side of a solo set: which set the rounds are banked into, and what
 * the set has paid so far.
 *
 * Shared by every solo game for the reason `SetSummary` is — a set is the same
 * object in all of them, and the bookkeeping is the part that must not drift.
 */

/**
 * A random v4 UUID for a new set.
 *
 * Not `crypto.randomUUID()`: that exists only in a secure context, and the
 * site is played over a LAN address in development (CLAUDE.md, versus), where
 * the page is plain http. `getRandomValues` has no such restriction.
 */
export function newSetId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SetPoints {
  /** Banked TP for a member (bonuses included); what it would have been for a guest. */
  tp: number;
  /** Whether any of it was actually banked — false is a guest's set. */
  banked: boolean;
  /** Badges unlocked during the set, in the order they landed. */
  newBadges: BadgeSlug[];
}

const EMPTY: SetPoints = { tp: 0, banked: false, newBadges: [] };

export function useSoloSet() {
  const [setId, setSetId] = useState(newSetId);
  const [points, setPoints] = useState<SetPoints>(EMPTY);

  const record = useCallback((result: Extract<RevealResult, { ok: true }>) => {
    setPoints((current) => {
      const banked = result.banked?.counted ? result.banked : null;
      return {
        tp: current.tp + (banked ? banked.tp + banked.bonus : result.tp),
        banked: current.banked || banked !== null,
        newBadges: [...current.newBadges, ...(banked?.newBadges ?? [])],
      };
    });
  }, []);

  /** A new set: a new id, so the next round opens a fresh row. */
  const reset = useCallback(() => {
    setSetId(newSetId());
    setPoints(EMPTY);
  }, []);

  return { setId, points, record, reset };
}

/**
 * The set's TP on a results screen: what was banked, or — for a guest — what
 * it would have been, with the way to keep it next time.
 */
export function PointsLine({ points, t }: { points: SetPoints; t: Dict }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* A badge earned in this set is also a mark on the menu's Achievements
          row, and that mark is read in the layout — see `RefreshChrome`. The
          summary is the one moment it is safe to ask for one: the set is
          over, no round is in flight, and the player is reading rather than
          watching a clock. */}
      <RefreshChrome when={points.newBadges.length > 0} />
      <p className="text-sm font-semibold tabular-nums text-ink">
        {format(points.banked ? t.pointsEarned : t.pointsWouldHave, {
          n: points.tp,
        })}
      </p>
      {!points.banked && (
        <Link
          href="/signin"
          className="text-xs text-white/60 underline underline-offset-4 transition hover:text-ink"
        >
          {t.pointsSignIn}
        </Link>
      )}
      {points.newBadges.map((slug) => (
        <p key={slug} className="text-xs font-semibold text-ink">
          {format(t.newBadge, { name: t[BADGE_BY_SLUG[slug].nameKey] })}
        </p>
      ))}
    </div>
  );
}
