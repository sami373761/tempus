import { TimelineGame } from "@/components/timeline-game";
import { dealTimelineEvents } from "@/app/actions/rounds";
import { ROUND_QUEUE_DEPTH } from "@/lib/game/rounds";
import { readLocaleContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function GuessPage() {
  const { locale, t } = await readLocaleContext();

  // The opening queue: the first round plus the one after it. The game plays
  // through the queue on the client and tops it back up itself, so this is the
  // only deal that ever blocks a render — "next round" is a state change from
  // here on, not a route refresh.
  const events = await dealTimelineEvents(ROUND_QUEUE_DEPTH);

  return (
    // One screen, exactly: `100dvh` less the bar above, both sides of that sum
    // reading the same token (app/globals.css). The game is built to fit inside
    // it at every stage of a round — see the height budget in `TimelineGame` —
    // so nothing here should ever scroll. `overflow-y-auto` is the safety valve
    // for the window too short to honour that, where a reachable scrollbar
    // beats content cut off below the fold.
    <div className="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2">
      {/* The masthead was removed from this screen: the picture and the ruler
          say what the game is, and the heading was costing the composition the
          vertical room it needed to fit. Kept for screen readers and for the
          document outline, which still want a page title. */}
      <h1 className="sr-only">{t.timelineTitle}</h1>

      {events.length > 0 ? (
        <TimelineGame events={events} t={t} locale={locale} />
      ) : (
        <p className="text-center text-ink-dim">{t.noEvents}</p>
      )}
    </div>
  );
}
