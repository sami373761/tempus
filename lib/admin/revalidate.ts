import "server-only";

import { revalidateTag } from "next/cache";

/**
 * Cache tags the admin panel clears after a write. Every `unstable_cache` in
 * lib/db/cached.ts carries one or more of these; this file is the one list.
 * Kept out of lib/admin's node-runnable modules because `next/cache` must not
 * reach anything scripts/ imports (CLAUDE.md).
 */
export const CACHE_TAGS = [
  "leaderboard",
  "chrono-leaderboard",
  "daily",
  "events",
  "categories",
] as const;

export type CacheTag = (typeof CACHE_TAGS)[number];

export function revalidate(...tags: CacheTag[]): void {
  for (const tag of new Set(tags)) revalidateTag(tag);
}

export function revalidateAll(): void {
  revalidate(...CACHE_TAGS);
}
