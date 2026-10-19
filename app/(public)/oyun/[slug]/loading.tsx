import { GameLoading } from "@/components/game-loading";
import { readLocaleContext } from "@/lib/i18n/server";

/**
 * Shown while page.tsx deals its opening rounds — see `GameLoading`. No
 * backdrop: the category (and so its photograph) is not known until the page
 * has read it, and a wrong one would flash.
 */
export default async function Loading() {
  const { t } = await readLocaleContext();

  return (
    <GameLoading
      // page.tsx's frame, verbatim: the same one-viewport budget.
      frame="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2"
      backdrop={null}
      title={t.gameLoading}
      label={t.gameLoading}
    />
  );
}
