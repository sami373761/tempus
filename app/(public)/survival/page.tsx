import type { Metadata } from "next";

import { dealSurvivalRounds } from "@/app/actions/rounds";
import { ComparisonBackdrop } from "@/components/comparison-backdrop";
import { ComparisonGame } from "@/components/comparison-game";
import { ROUND_QUEUE_DEPTH } from "@/lib/game/rounds";
import { readLocaleContext } from "@/lib/i18n/server";

// Every visit deals a fresh queue; "next round" after that is a state change in
// the client, not a route refresh.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.survivalTitle} · Tempus` };
}

/**
 * Survival: the comparison round with no set of ten around it.
 *
 * Deliberately the same page as `/compare` with one prop changed. The round is
 * identical — same draw, same three events, same rail, same six sections, same
 * grade — because survival is a rule about when the game stops rather than a
 * second game, and `ComparisonGame` branches on `mode` in exactly three places
 * (see its own notes). Anything that looks different between the two screens
 * beyond the masthead and the results is a bug in one of them.
 *
 * The backdrop is the comparison game's own cosmos plate, for the reason it is
 * that game's: a round holds two anchors that can sit in any two eras at once,
 * so there is no era for a backdrop to illustrate, and the cosmos is the one
 * view that cannot contradict the round in front of it.
 */
export default async function SurvivalPage() {
  const { locale, t } = await readLocaleContext();

  // The opening queue: the round being played and the one after it. The game
  // plays through it and tops it back up itself, so this is the only deal that
  // ever blocks a render.
  const rounds = await dealSurvivalRounds(ROUND_QUEUE_DEPTH);

  return (
    // One screen, exactly, on the comparison page's pattern: `100dvh` less the
    // bar above, both sides of that sum reading the same token. The run's
    // chrome is the comparison round's chrome to the pixel — one masthead pill
    // out of the flow, one rail, one reserved verdict box — so
    // `--compare-chrome` covers this screen unchanged and nothing here needs a
    // budget of its own.
    <div className="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-[90rem] flex-col overflow-y-auto px-6 pb-4 pt-2">
      {/* The visible heading is the game's own masthead pill, which has to go
          when the run does; the outline still wants one, and on the results
          screen this is the only one left. */}
      <h1 className="sr-only">{t.survivalTitle}</h1>

      <ComparisonBackdrop />

      {rounds.length > 0 ? (
        <ComparisonGame
          rounds={rounds}
          t={t}
          locale={locale}
          mode="survival"
        />
      ) : (
        <p className="on-photo text-center text-white/70">{t.noEvents}</p>
      )}
    </div>
  );
}
