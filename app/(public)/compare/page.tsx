import { dealComparisonRounds } from "@/app/actions/rounds";
import { ComparisonBackdrop } from "@/components/comparison-backdrop";
import { ComparisonGame } from "@/components/comparison-game";
import { ROUND_QUEUE_DEPTH } from "@/lib/game/rounds";
import { readLocaleContext } from "@/lib/i18n/server";

// Every visit deals a fresh queue; "next round" after that is a state change in
// the client, not a route refresh.
export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const { locale, t } = await readLocaleContext();

  // The opening queue: the round being played and the one after it. The game
  // plays through it and tops it back up itself, so this is the only deal that
  // ever blocks a render.
  const rounds = await dealComparisonRounds(ROUND_QUEUE_DEPTH);

  return (
    // One screen, exactly, on the date-guessing page's pattern: `100dvh` less
    // the bar above, both sides of that sum reading the same token. The game
    // sizes its cards from what is left (see `--compare-chrome` in
    // app/globals.css), so nothing here should ever scroll; `overflow-y-auto`
    // is the safety valve for the window too short to honour that, where a
    // reachable scrollbar beats content cut off below the fold.
    //
    // `max-w-7xl` rather than `6xl` because the rail is the measure here: the
    // two anchors sit on its ends, so every pixel of width is distance between
    // the dates being compared.
    <div className="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-[90rem] flex-col overflow-y-auto px-6 pb-4 pt-2">
      {/* The visible heading moved into the game (see below); the outline still
          wants one, and on the summary screen this is the only one left. */}
      <h1 className="sr-only">{t.comparisonTitle}</h1>

      <ComparisonBackdrop />

      {/* The masthead is rendered by the game, not here, because it has to go
          when the set does: its blurb is a live instruction ("which of the two
          dates…"), and leaving it standing over the end-of-set summary would
          be the page asking a question that is no longer on screen. Only the
          game knows the set is over.

          It is a `fixed` pill in the top bar's own row since 2026-10-08
          (`RoundHead`, now shared from components/round-head.tsx by every
          game that wants one), so it is no longer one of the rows this
          screen's
          height budget pays for — `--compare-chrome` dropped by its 84px and
          the photographs took them. */}
      {rounds.length > 0 ? (
        <ComparisonGame rounds={rounds} t={t} locale={locale} />
      ) : (
        <p className="on-photo text-center text-white/70">{t.noEvents}</p>
      )}
    </div>
  );
}
