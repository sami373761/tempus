import Link from "next/link";
import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SiteMenu } from "@/components/site-menu";
import { getCurrentAccount } from "@/lib/auth/server";
import { readLocaleContext } from "@/lib/i18n/server";

/**
 * The 404.
 *
 * **It is a page of this site, not the framework's.** Next's built-in answer to
 * an unmatched URL is an unstyled English line on a white ground, which on a
 * site that is black, speaks five languages and has a wordmark reads as the
 * site having fallen over rather than as an address that is not here. So this
 * carries the same bar, the same menu and the same language as everything
 * else, and — the part that actually matters — a way back.
 *
 * **It lives at the root, not in `(public)`.** A `not-found.tsx` inside a route
 * group answers `notFound()` thrown by that group's own segments; the root one
 * is what an unmatched URL falls through to, and an unmatched URL is the case
 * this exists for. The cost is that it renders inside `app/layout.tsx` alone,
 * so the chrome `app/(public)/layout.tsx` adds is repeated here by hand. That
 * is three lines against the alternative of a 404 with no way out of it.
 *
 * `force-dynamic` because the locale is a cookie: the page has to be rendered
 * per request to be in the reader's own language, and the default would try to
 * settle it once at build time.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.notFoundTitle} · Tempus` };
}

export default async function NotFound() {
  // Both in one await, exactly as the public layout does it: the locale comes
  // from a cookie and the account from the session, and neither needs the
  // other.
  const [{ locale, t }, account] = await Promise.all([
    readLocaleContext(),
    getCurrentAccount(),
  ]);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <SiteHeader />
      <SiteMenu locale={locale} t={t} account={account} />

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[34rem] text-center">
          {/* The number, large and quiet. It is the one thing on the page that
              is the same in every language, so it carries the identification
              and the sentence under it can be a sentence rather than a code
              with an explanation attached. */}
          <p
            aria-hidden="true"
            className="font-display text-[5rem] font-semibold leading-none tracking-[-0.04em] text-ink-dim/40 sm:text-[6.5rem]"
          >
            {t.notFoundCode}
          </p>

          <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            {t.notFoundTitle}
          </h1>
          <p className="mx-auto mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-dim sm:text-base">
            {t.notFoundBlurb}
          </p>

          {/* Two ways out rather than one. The board is the answer to "where
              was I going"; a round is the answer to "I am here now", and it is
              the thing this site is for. */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="w-full rounded-full bg-ink px-7 py-3 text-[15px] font-semibold text-page transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
            >
              {t.notFoundHome}
            </Link>
            <Link
              href="/guess"
              className="w-full rounded-full border border-hairline bg-card px-7 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
            >
              {t.notFoundPlay}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
