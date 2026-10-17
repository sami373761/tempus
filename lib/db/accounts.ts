/**
 * Reads and writes for the one row per player.
 *
 * Like the rest of `lib/db`, every function takes an explicit client — but
 * unlike the content modules there is a real choice about which one. The
 * profile table is the first on the site whose rows belong to a caller, so
 * `auth.uid()` can name the owner in a policy and the ordinary
 * `authenticated` client is both sufficient and safer than the service role:
 * the rule holds even if a Server Action forgets to re-check it. See the
 * departure note in 20261006130000_accounts_and_badges.sql.
 *
 * Badge progress reads the same way and **writes only through the service
 * role**, which is not a style choice: a player who could update their own
 * progress row could award themselves a badge.
 */

import type { Json } from "./database.types.ts";
import type { DbClient } from "./queries.ts";
import type { Account, BadgeProgress } from "./types.ts";

/** Stored usernames: lower case, 3–20 of `[a-z0-9_]`. Mirrors
 *  `public.normalize_username()`, which the column's CHECK re-applies. */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** The longest name the column holds — `normalize_username()` cuts to it with
 *  `substring(… from 1 for 20)`, so this side has to cut as well or the two
 *  disagree about a 25-character name: SQL keeps the first twenty, and a regex
 *  with no truncation in front of it simply refuses. */
const USERNAME_MAX = 20;

/**
 * Folds a candidate name to the stored form, or null when nothing usable is
 * left — **the exact shape of `public.normalize_username()`**, truncation
 * included, which is what the paired-rule note in CLAUDE.md is about.
 *
 * Folding is right for a name the player never typed: `handle_new_user()` runs
 * this over a Google display name, and an account whose sign-up failed because
 * somebody's profile said "Çağla ✨" would be a worse answer than one that
 * starts unnamed. It is **wrong for a name typed into a form**, because the
 * stripping is silent: "ali_şahin" folds to "ali_ahin", which is a different
 * person's name saved under a confirmation that says it worked. Forms call
 * `validateUsername` instead.
 */
export function normalizeUsername(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX);
  return USERNAME_RE.test(cleaned) ? cleaned : null;
}

/**
 * Why a typed name was refused.
 *
 * Four problems rather than one, because the four need four different
 * sentences: a length is something the player can see in the field, a space is
 * the mistake almost everybody makes and has an obvious fix, and a character
 * the column cannot hold is the one refusal that cannot be worked out by
 * looking at what was typed.
 *
 * `has-space` is split out of `bad-characters` for that last reason: the list
 * of offending characters is printed back to the player, and a space printed
 * in a sentence is invisible.
 */
export type UsernameProblem =
  | "too-short"
  | "too-long"
  | "has-space"
  | "bad-characters";

export type UsernameCheck =
  | { ok: true; username: string }
  | {
      ok: false;
      problem: UsernameProblem;
      /** The characters the field refused, as typed, de-duplicated and in
       *  order — what the `{chars}` in `authErrUsernameChars` is filled with.
       *  Empty for every problem but `bad-characters`. */
      rejected: string;
    };

/** Shortest name the column holds. The counterpart of `USERNAME_MAX`, and the
 *  number the refusal sentence quotes. */
const USERNAME_MIN = 3;

/**
 * What a form does with a typed name: accept it, or say why not.
 *
 * **Nothing is removed from it.** Case is folded — the column stores lower
 * case and the unique index is on that, so "Ali" and "ali" are one name rather
 * than two — but a character the column cannot hold is a refusal, never a
 * deletion. That is the whole difference from `normalizeUsername` above, and
 * it is the difference between "that name is not available here" and a
 * confirmed save of a name the player did not write.
 *
 * The accepted set is the column's own, `[a-z0-9_]`, so every name this
 * returns satisfies the CHECK constraint and the uniqueness index without the
 * database having to fold anything. Turkish ş, ğ, ı, ö, ç, ü land in
 * `bad-characters` for that reason and not by oversight: they have no spelling
 * the index could treat as one name. (`"İ".toLowerCase()` is not even a
 * single character — it is `i` plus a combining dot — which is exactly the
 * kind of thing a username column must not be asked to decide about.)
 *
 * **The refused characters come back with the refusal**, which is why this
 * returns `rejected` rather than just a problem: the form prints them, so the
 * player is told "ş and !" instead of being left to compare their name against
 * a character class. They are taken from the *trimmed, un-folded* text so the
 * list reads back as what was typed — a rejected "Ş" is reported as "Ş", not
 * as the "ş" the fold would have made of it.
 *
 * Order of the checks is the order of the sentences' usefulness: a name with
 * both a space and an accent is told about the space, because that is the one
 * with a fix in it.
 */
export function validateUsername(raw: string): UsernameCheck {
  const typed = raw.trim();
  const folded = typed.toLowerCase();

  if (/\s/.test(typed)) return { ok: false, problem: "has-space", rejected: "" };

  const rejected = [
    ...new Set(
      [...typed].filter((char) => !/^[a-z0-9_]$/.test(char.toLowerCase())),
    ),
  ].join(" ");
  if (rejected) return { ok: false, problem: "bad-characters", rejected };

  if (folded.length < USERNAME_MIN) {
    return { ok: false, problem: "too-short", rejected: "" };
  }
  if (folded.length > USERNAME_MAX) {
    return { ok: false, problem: "too-long", rejected: "" };
  }

  return { ok: true, username: folded };
}

/** The chrome's view of whoever is signed in. */
export function accountFrom(
  user: { id: string; email?: string | null },
  username: string | null,
  unseenBadges = 0,
): Account {
  const fallback = user.email?.split("@")[0] ?? null;
  return {
    id: user.id,
    email: user.email ?? null,
    username,
    displayName: username ?? fallback ?? "Player",
    unseenBadges,
  };
}

/**
 * The signed-in player's username, or null.
 *
 * `maybeSingle` rather than `single`: the row is created by a trigger on
 * `auth.users`, and a profile that is somehow missing should leave the site
 * usable with no name rather than throwing on every page that renders the
 * menu.
 */
export async function readUsername(
  client: DbClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("profile")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`readUsername: ${error.message}`);
  return data?.username ?? null;
}

/**
 * The two things the site's chrome reads off a profile: the name to greet
 * them by, and whether there is a badge waiting to be looked at.
 *
 * One query rather than two because this runs in the layout, on every
 * player-facing route — the username read was already there, and the count
 * rides along in it for nothing. That is the whole reason the mark is a
 * number on `profile` rather than a count over `user_badge_progress`: the
 * database is a long way from the player (see the note in CLAUDE.md), and a
 * nudge is not worth a round trip per page.
 *
 * Both fall back rather than throwing, for `readUsername`'s reason: a missing
 * profile row should cost the greeting, not the site.
 */
export async function readProfileChrome(
  client: DbClient,
  userId: string,
): Promise<{ username: string | null; unseenBadges: number }> {
  const { data, error } = await client
    .from("profile")
    .select("username, unseen_badges")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`readProfileChrome: ${error.message}`);
  return {
    username: data?.username ?? null,
    unseenBadges: data?.unseen_badges ?? 0,
  };
}

/**
 * A player's Chrono Rating (KP), or null when there is no profile row.
 *
 * Null rather than 0 for the missing row, for the reason lib/game/chrono-rating.ts
 * gives guests a null: a zero is a real standing (a new account at the bottom
 * of the bottom league), and a profile that is somehow absent is not one.
 * Read-only from here — the one writer is the settlement trigger.
 */
export async function readChronoRating(
  client: DbClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await client
    .from("profile")
    .select("chrono_rating")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`readChronoRating: ${error.message}`);
  return data?.chrono_rating ?? null;
}

/** The R2 key of a player's picture, or null for the default. */
export async function readAvatarKey(
  client: DbClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("profile")
    .select("avatar_key")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`readAvatarKey: ${error.message}`);
  return data?.avatar_key ?? null;
}

/**
 * Points a profile at a new picture (or none) and returns the key it replaced,
 * so the caller can delete that object once the row no longer names it.
 * Service role only — `avatar_key` is not in the column grant.
 */
export async function setAvatarKey(
  admin: DbClient,
  userId: string,
  avatarKey: string | null,
): Promise<string | null> {
  const previous = await readAvatarKey(admin, userId);

  const { error } = await admin
    .from("profile")
    .update({ avatar_key: avatarKey })
    .eq("id", userId);
  if (error) throw new Error(`setAvatarKey: ${error.message}`);

  return previous === avatarKey ? null : previous;
}

/** Distinguishes "that name is taken" from "that write failed", which is the
 *  one database error this site's forms have to be able to explain. */
export const USERNAME_TAKEN = "username-taken";

/**
 * Renames the signed-in player.
 *
 * The uniqueness check is the unique index, caught here rather than a `select`
 * first: two sign-ups racing for the same name would both pass a check and one
 * would still fail on insert, so the only answer that is always right is the
 * constraint's.
 */
export async function setUsername(
  client: DbClient,
  userId: string,
  username: string,
): Promise<void> {
  const { error } = await client
    .from("profile")
    .update({ username })
    .eq("id", userId);

  if (!error) return;
  // 23505 is unique_violation. Postgres reports it through PostgREST's `code`.
  if (error.code === "23505") throw new Error(USERNAME_TAKEN);
  throw new Error(`setUsername: ${error.message}`);
}

/**
 * Every badge's state for one player, in the badges' own order.
 *
 * Two queries and a merge rather than a view: `badge` is six rows of reference
 * data and a player has at most six progress rows, so the join is cheaper in
 * TypeScript than a view is to keep in step with the generated types. The
 * merge is what makes a badge with no row yet read as zeros instead of
 * disappearing — which is the normal case, since nothing writes these yet.
 */
export async function readBadgeProgress(
  client: DbClient,
  userId: string,
): Promise<BadgeProgress[]> {
  const [badges, progress] = await Promise.all([
    client.from("badge").select("slug, default_target").order("sort_order"),
    client
      .from("user_badge_progress")
      .select("badge_slug, progress, target, unlocked_at, details")
      .eq("user_id", userId),
  ]);

  if (badges.error) throw new Error(`readBadgeProgress: ${badges.error.message}`);
  if (progress.error) {
    throw new Error(`readBadgeProgress: ${progress.error.message}`);
  }

  const rows = new Map((progress.data ?? []).map((row) => [row.badge_slug, row]));

  return (badges.data ?? []).map((badge) => {
    const row = rows.get(badge.slug);
    return {
      slug: badge.slug,
      progress: row?.progress ?? 0,
      target: row?.target ?? badge.default_target,
      unlockedAt: row?.unlocked_at ?? null,
      details: (row?.details ?? {}) as Record<string, Json>,
    };
  });
}

/**
 * Sets one player's progress towards one badge. **Service role only.**
 *
 * The seam the badge rules write through (`refreshBadges` in ./scoring.ts,
 * rules in lib/game/badge-rules.ts). An upsert rather than an update so the
 * first time a badge is touched does not need a row to exist, and
 * `unlockedAt` is passed rather than derived — whether reaching the target is
 * what earns the badge is exactly the kind of rule this module must not decide.
 * **A caller must pass the existing `unlockedAt` back**: omitting it clears it.
 */
export async function writeBadgeProgress(
  client: DbClient,
  input: BadgeProgressWrite | readonly BadgeProgressWrite[],
): Promise<void> {
  const rows = (Array.isArray(input) ? input : [input]) as BadgeProgressWrite[];
  if (rows.length === 0) return;

  const { error } = await client.from("user_badge_progress").upsert(
    rows.map((row) => ({
      user_id: row.userId,
      badge_slug: row.badgeSlug,
      progress: row.progress,
      target: row.target,
      unlocked_at: row.unlockedAt ?? null,
      details: (row.details ?? {}) as Json,
    })),
    { onConflict: "user_id,badge_slug" },
  );

  if (error) throw new Error(`writeBadgeProgress: ${error.message}`);
}

export interface BadgeProgressWrite {
  userId: string;
  badgeSlug: string;
  progress: number;
  target: number;
  unlockedAt?: string | null;
  details?: Record<string, Json>;
}
