import type { Metadata } from "next";
import Link from "next/link";

import { AccountPanel } from "@/components/account-panel";
import { BadgeFrame } from "@/components/badge-frame";
import {
  getCurrentUser,
  hasPasswordIdentity,
  requireAccount,
} from "@/lib/auth/server";
import {
  BADGE_BY_SLUG,
  BADGES,
  type Badge,
} from "@/lib/badges";
import { avatarSrc } from "@/lib/avatar";
import { readAvatarKey } from "@/lib/db/accounts";
import { createAdminDbClient } from "@/lib/db/admin";
import {
  readLeaderboardPosition,
  readShownBadge,
  refreshBadges,
} from "@/lib/db/scoring";
import { createServerDbClient } from "@/lib/db/server";
import { format } from "@/lib/i18n/dictionary";
import { readLocaleContext } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.accountTitle} · Tempus`, description: t.accountBlurb };
}

/**
 * Where the menu's Account row lands.
 *
 * **Deliberately small.** The site stores a username and a picture and nothing
 * else about a player, so this is that picture and name, the address the
 * session is keyed on, the password, the badges and the way out. There are no
 * notification settings and no match history, because none of those exist to
 * settle — and a settings page padded with controls that do nothing is the same
 * mistake the board's unbuilt cards avoid by labelling themselves.
 *
 * Gated twice, like `/achievements`: `middleware.ts` redirects a signed-out
 * visitor before anything renders, and `requireAccount` is the boundary that
 * holds if the matcher is ever narrowed.
 *
 * The badge the player is *wearing* is the one they chose on /achievements, or
 * the top rung they have earned when they have not chosen (`shown_badge` in
 * the scoring migration — the same rule the leaderboard draws). With none
 * earned the picture is a plain circle, which is the honest version of the
 * same thing rather than a borrowed bronze.
 */
export default async function AccountPage() {
  const { t } = await readLocaleContext();
  const account = await requireAccount("/account");

  /* The user record as well as the account, for one fact the profile row does
     not carry: whether this account has an email identity at all. A Google
     sign-in has no password *yet*, so the panel offers to set a first one
     rather than to change one that does not exist — and once it is set,
     Supabase adds the email identity and the next render of this page sees it.
     `hasPasswordIdentity` is the same predicate `updatePassword` checks, so the
     form's shape and the action's requirement cannot disagree. */
  const user = await getCurrentUser();
  const hasPassword = user ? hasPasswordIdentity(user) : true;

  // Guarded like the badge read below: a picture that cannot be read is the
  // default picture, not a page that fails.
  let avatarKey: string | null = null;
  try {
    avatarKey = await readAvatarKey(await createServerDbClient(), account.id);
  } catch (error) {
    console.error("account: avatar read failed", error);
  }
  const avatar = avatarSrc(avatarKey);

  // Re-measured here as on /achievements, so the count of badges and the
  // ring on the picture are never a visit behind.
  let earned = 0;
  let totalTp = 0;
  let worn: Badge | null = null;
  let rank: number | null = null;
  try {
    const admin = createAdminDbClient();
    const state = await refreshBadges(admin, account.id);
    earned = state.badges.filter((badge) => badge.unlockedAt !== null).length;
    totalTp = state.stats.tp;
    const shown = await readShownBadge(admin, account.id);
    worn = shown ? BADGE_BY_SLUG[shown] : null;
    rank = (await readLeaderboardPosition(admin, account.id, "all"))?.rank ?? null;
  } catch (error) {
    console.error("account: badge refresh failed", error);
  }

  return (
    <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pb-32 pt-12 sm:pt-16">
      <header>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          {t.accountTitle}
        </h1>
        <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-ink-dim">
          {t.accountBlurb}
        </p>
      </header>

      {/* One column on a phone, two from `lg`: the identity card on the left is
          a fixed-width block and the forms want the rest. Below that breakpoint
          the card is full width and sits above them, which is also the order a
          screen reader gets either way. */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <section className="rounded-card border border-hairline bg-card p-6 text-center sm:p-7">
          {/* The ring sizes itself around a 72px picture, which is the whole of
              what `BadgeFrame` is given — see lib/badges.ts for why one number
              is enough for all six. */}
          <div className="flex h-[10rem] items-center justify-center">
            {worn ? (
              <BadgeFrame badge={worn} avatar={72} avatarSrc={avatar} />
            ) : (
              <img
                src={avatar}
                alt=""
                aria-hidden="true"
                className="h-[88px] w-[88px] rounded-full border border-hairline object-cover"
              />
            )}
          </div>

          <p className="truncate font-display text-xl font-semibold tracking-[-0.01em]">
            {account.displayName}
          </p>
          {/* `break-all` because an address has no spaces to wrap at and this
              column is 352px at the cap. */}
          <p className="mt-1 break-all text-[13px] text-ink-dim">
            {account.email}
          </p>

          <p className="mt-6 font-display text-2xl font-semibold tabular-nums text-ink">
            {format(t.badgesTotalTp, { n: totalTp.toLocaleString("en-US") })}
          </p>
          {rank !== null && (
            <p className="mt-1 text-[13px] text-ink-dim">
              {format(t.accountRank, { n: rank })}
            </p>
          )}
          <p className="mt-4 text-[13px] font-semibold text-ink">
            {format(t.accountBadgesEarned, {
              n: earned,
              total: BADGES.length,
            })}
          </p>
          <Link
            href="/achievements"
            className="mt-3 inline-block rounded-full border border-hairline bg-card-raised/70 px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t.accountSeeBadges}
          </Link>
        </section>

        <AccountPanel
          t={t}
          username={account.username}
          email={account.email}
          hasPassword={hasPassword}
          avatarUrl={avatar}
          hasAvatar={avatarKey !== null}
        />
      </div>
    </div>
  );
}
