import { VersusGame } from "@/components/versus-game";
import { isInviteCode, normalizeInviteCode } from "@/lib/game/versus";
import { readLocaleContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * One match.
 *
 * The page itself fetches nothing. A match is live state that arrives over a
 * socket and is keyed to a seat token the server has never seen — so there is
 * nothing here that could be rendered ahead of time, and anything this did
 * fetch would be stale before it painted. It hands the code to the client and
 * gets out of the way.
 *
 * The code is validated here anyway, so a mistyped URL is a sentence rather
 * than a round trip that fails.
 */
export default async function VersusMatchPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { locale, t } = await readLocaleContext();
  const { code: raw } = await params;
  const code = normalizeInviteCode(raw);

  return (
    // The same one-viewport box the solo games use, reading the same bar-height
    // token. See app/(public)/guess/page.tsx for why both sides of that
    // subtraction have to be the one number.
    //
    // The *width* is the game's own, not this page's: a match can be any of
    // the date-guessing pools and they do not all want the same container —
    // the film & television layout reads the site bar's full width so the
    // poster lines up under the wordmark, and the one-column modes keep
    // `/guess`'s narrower column. This page cannot know which: it deliberately
    // fetches nothing, and the mode is on the match row. So it owns the height
    // budget and `VersusGame` owns the container inside it.
    <div className="flex h-[calc(100dvh-var(--site-bar-h))] flex-col overflow-y-auto">
      <h1 className="sr-only">{t.versusTitle}</h1>

      {isInviteCode(code) ? (
        <VersusGame code={code} t={t} locale={locale} />
      ) : (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-ink-dim">
          {t.versusMatchNotFound}
        </p>
      )}
    </div>
  );
}
