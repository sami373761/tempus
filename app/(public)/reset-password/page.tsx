import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { ResetPasswordForm } from "@/components/reset-password-form";
import { RECOVERY_COOKIE, verifyRecoveryMark } from "@/lib/auth/mail-guard";
import { SIGN_IN_PATH } from "@/lib/auth/paths";
import { getCurrentUser } from "@/lib/auth/server";
import { readLocaleContext } from "@/lib/i18n/server";

export const metadata: Metadata = { robots: { index: false } };

/**
 * The end of a password-reset link: a new password with no current one asked.
 *
 * Shown only to the session the link just signed in, recognised by the signed
 * recovery mark rather than by the session alone (lib/auth/mail-guard.ts).
 * The page's check is for the player's sake — the action checks again, and
 * that one decides.
 */
export default async function ResetPasswordPage() {
  const { t } = await readLocaleContext();
  const user = await getCurrentUser();
  const mark = (await cookies()).get(RECOVERY_COOKIE)?.value;
  const allowed = Boolean(user) && verifyRecoveryMark(mark, user!.id);

  return (
    <div className="auth-screen flex min-h-[calc(100dvh-var(--site-bar-h))] flex-col items-center justify-center px-6 py-14">
      <div className="auth-card w-full max-w-[27rem] rounded-card border border-hairline bg-card p-7 sm:p-9">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          {t.resetTitle}
        </h1>
        {allowed ? (
          <ResetPasswordForm t={t} />
        ) : (
          <>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">
              {t.authErrLinkExpired}
            </p>
            <Link
              href={SIGN_IN_PATH}
              className="mt-6 inline-block text-[14px] font-semibold text-ink underline-offset-4 hover:underline"
            >
              {t.authBackToSignIn}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
