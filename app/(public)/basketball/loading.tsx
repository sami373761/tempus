import { GameLoading } from "@/components/game-loading";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { BASKETBALL_DEFAULT_PANE, BASKETBALL_PANES } from "@/lib/game/timeline";
import { readLocaleContext } from "@/lib/i18n/server";

/** Shown while page.tsx deals its opening rounds — see `GameLoading`. */
export default async function Loading() {
  const { t } = await readLocaleContext();

  return (
    <GameLoading
      // page.tsx's frame, verbatim: the same one-viewport budget.
      frame="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2"
      backdrop={<TimelineBackdrop pane={BASKETBALL_DEFAULT_PANE} panes={BASKETBALL_PANES} />}
      title={t.basketballTitle}
      label={t.gameLoading}
    />
  );
}
