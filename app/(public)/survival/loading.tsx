import { ComparisonBackdrop } from "@/components/comparison-backdrop";
import { GameLoading } from "@/components/game-loading";
import { readLocaleContext } from "@/lib/i18n/server";

/** Shown while page.tsx deals its opening rounds — see `GameLoading`. */
export default async function Loading() {
  const { t } = await readLocaleContext();

  return (
    <GameLoading
      // page.tsx's frame, verbatim: the same one-viewport budget.
      frame="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-[90rem] flex-col overflow-y-auto px-6 pb-4 pt-2"
      backdrop={<ComparisonBackdrop />}
      title={t.survivalTitle}
      label={t.gameLoading}
    />
  );
}
