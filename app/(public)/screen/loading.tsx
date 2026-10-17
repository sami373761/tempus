import { GameLoading } from "@/components/game-loading";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { SCREEN_DEFAULT_PANE, SCREEN_PANES } from "@/lib/game/timeline";
import { readLocaleContext } from "@/lib/i18n/server";

/** Shown while page.tsx deals its opening rounds — see `GameLoading`. */
export default async function Loading() {
  const { t } = await readLocaleContext();

  return (
    <GameLoading
      // page.tsx's frame, verbatim: the same one-viewport budget.
      frame="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-7xl flex-col overflow-y-auto px-6 pb-5 pt-5"
      backdrop={<TimelineBackdrop pane={SCREEN_DEFAULT_PANE} panes={SCREEN_PANES} />}
      title={t.screenTitle}
      label={t.gameLoading}
    />
  );
}
