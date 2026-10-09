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
  BADGES,
  DEFAULT_AVATAR_SRC,
  LADDER_BADGES,
  type Badge,
} from "@/lib/badges";
import { readBadgeProgress } from "@/lib/db/accounts";
import { createServerDbClient } from "@/lib/db/server";
import type { BadgeProgress } from "@/lib/db/types";
import { format } from "@/lib/i18n/dictionary";
import { readLocaleContext } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.accountTitle} · Tempus`, description: t.accountBlurb };
}

/**
 * Where the menu's Account row lands.
 *
 * **Deliberately small.** The site stores a username and nothing else about a
 * player, so this is that name, the address the session is keyed on, the
 * password, the badges and the way out. There is no avatar upload, no
 * notification settings and no match history, because none of those exist to
 * settle — and a settings page padded with controls that do nothing is the same
 * mistake the board's unbuilt cards avoid by labelling themselves.
 *
 * Gated twice, like `/achievements`: `middleware.ts` redirects a signed-out
 * visitor before anything renders, and `requireAccount` is the boundary that
 * holds if the matcher is ever narrowed.
 *
 * The badge the player is *wearing* is the top ladder rank they have earned,
 * which is the rule the ladder already states — "the higher badge replaces the
 * one below it". With none earned the picture is a plain circle, which is the
 * honest version of the same thing rather than a borrowed bronze.
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

  let progress: BadgeProgress[] = [];
  try {
    progress = await readBadgeProgress(await createServerDbClient(), account.id);
  } catch {
    progress = [];
  }

  const unlocked = new Set(
    progress.filter((row) => row.unlockedAt !== null).map((row) => row.slug),
  );
  const worn = highestWornBadge(unlocked);

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
              <BadgeFrame badge={worn} avatar={72} avatarSrc={DEFAULT_AVATAR_SRC} />
            ) : (
              <img
                src={DEFAULT_AVATAR_SRC}
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

          <p className="mt-6 text-[13px] font-semibold text-ink">
            {format(t.accountBadgesEarned, {
              n: unlocked.size,
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
        />
      </div>
    </div>
  );
}

/**
 * The badge a player wears: the highest rank on the ladder they have earned.
 *
 * `LADDER_BADGES` is already in climbing order, so this is the last one that is
 * unlocked rather than a sort. The two standalone badges are deliberately not
 * considered — the ladder's own rule is that a rank is replaced by the one
 * above it, and which of ruby or amethyst outranks a diamond is not a question
 * anything has answered yet.
 */
function highestWornBadge(unlocked: ReadonlySet<string>): Badge | null {
  let worn: Badge | null = null;
  for (const badge of LADDER_BADGES) {
    if (unlocked.has(badge.slug)) worn = badge;
  }
  return worn;
}
