import type { Metadata } from "next";
import Link from "next/link";

import { confirmEmailLink } from "@/app/actions/auth";
import { safeNextPath, SIGN_IN_PATH } from "@/lib/auth/paths";
import { readLocaleContext } from "@/lib/i18n/server";

export const metadata: Metadata = { robots: { index: false } };

/**
 * Where the links in our account mails land.
 *
 * **Nothing is spent by opening this page.** Mail scanners and link previews
 * fetch every URL in a message; if the GET itself verified the token, a
 * scanner would use it up and the player would click an expired link. The
 * token rides in hidden fields and only the button's POST — a Server Action,
 * which can write the session cookie — spends it.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await readLocaleContext();
  const params = await searchParams;
  const tokenHash = first(params.token_hash);
  const type = first(params.type);
  const next = safeNextPath(first(params.next));

  const complete = Boolean(tokenHash) && (type === "signup" || type === "recovery");
  const recovery = type === "recovery";

  return (
    <div className="auth-screen flex min-h-[calc(100dvh-var(--site-bar-h))] flex-col items-center justify-center px-6 py-14">
      <div className="auth-card w-full max-w-[27rem] rounded-card border border-hairline bg-card p-7 sm:p-9">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          {recovery ? t.verifyTitleRecovery : t.verifyTitleSignup}
        </h1>

        {complete ? (
          <>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">
              {recovery ? t.verifyBlurbRecovery : t.verifyBlurbSignup}
            </p>
            <form action={confirmEmailLink} className="mt-6">
              <input type="hidden" name="token_hash" value={tokenHash ?? ""} />
              <input type="hidden" name="type" value={type ?? ""} />
              <input type="hidden" name="next" value={next ?? ""} />
              <button
                type="submit"
                className="w-full rounded-full bg-ink px-5 py-3 text-[15px] font-semibold text-page transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {recovery ? t.verifyButtonRecovery : t.verifyButtonSignup}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">{t.verifyInvalid}</p>
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

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
