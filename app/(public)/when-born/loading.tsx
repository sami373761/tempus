import { GameLoading } from "@/components/game-loading";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { WHEN_BORN_DEFAULT_PANE, WHEN_BORN_PANES } from "@/lib/game/timeline";
import { readLocaleContext } from "@/lib/i18n/server";

/** Shown while page.tsx deals its opening rounds — see `GameLoading`. */
export default async function Loading() {
  const { t } = await readLocaleContext();

  return (
    <GameLoading
      // page.tsx's frame, verbatim: the same one-viewport budget.
      frame="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-7xl flex-col overflow-y-auto px-6 pb-5 pt-5"
      backdrop={<TimelineBackdrop pane={WHEN_BORN_DEFAULT_PANE} panes={WHEN_BORN_PANES} />}
      title={t.whenBornTitle}
      label={t.gameLoading}
    />
  );
}
