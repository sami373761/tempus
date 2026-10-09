import type { Metadata } from "next";

import { AuthForm } from "@/components/auth-form";
import type { AuthErrorCode } from "@/app/actions/auth";
import { safeNextPath } from "@/lib/auth/paths";
import { readLocaleContext } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.authTabSignIn} · Tempus`, description: t.authSignInBlurb };
}

/**
 * The one door: sign in and sign up on one route, switched inside the form.
 *
 * `middleware.ts` keeps a signed-in visitor off this page, so there is no
 * "already signed in" state to render here.
 *
 * Two things arrive in the query string and both are validated before they are
 * used. `next` is where to go once there is a session, and is the reason the
 * menu's gated rows link *here* rather than straight at the page they want —
 * `safeNextPath` refuses anything that is not a path on this site, because a
 * redirect target a visitor can set is an open redirect. `error` is a code
 * handed back by `/auth/callback` when the Google round trip failed; it is
 * checked against the known codes rather than printed, so a crafted URL cannot
 * put text of its own on the page.
 *
 * The centring is `min-h` of the viewport less the bar, which is the one piece
 * of layout arithmetic here: `--site-bar-h` is the single source for that
 * height (see app/globals.css), so the form sits in the middle of what is left
 * rather than in the middle of the window with the bar pushing it down.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await readLocaleContext();
  const params = await searchParams;

  const next = safeNextPath(first(params.next));
  const error = asErrorCode(first(params.error));

  /* No masthead of its own: `SiteHeader` already carries the wordmark on this
     route, and a second `Tempus` 90px under the first read as two logos rather
     than as branding. Dropping it also lifts the whole form a line, which is
     what lets the three-field sign-up finish inside one screen. */
  return (
    <div className="flex min-h-[calc(100dvh-var(--site-bar-h))] flex-col items-center justify-center px-6 py-14">
      <AuthForm t={t} next={next} initialError={error} />
    </div>
  );
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** The codes `/auth/callback` is allowed to hand back. Anything else is
 *  ignored rather than shown — the query string is not a place to write copy. */
const CALLBACK_ERRORS = ["provider-failed", "generic"] as const;

function asErrorCode(value: string | null): AuthErrorCode | null {
  return (CALLBACK_ERRORS as readonly string[]).includes(value ?? "")
    ? (value as AuthErrorCode)
    : null;
}
