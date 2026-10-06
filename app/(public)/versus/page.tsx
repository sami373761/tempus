import { VersusStart } from "@/components/versus-start";
import { readLocaleContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * The way in to head-to-head.
 *
 * A match cannot be created while rendering this: creating one deals ten
 * rounds and mints a seat token, and doing that for every visit would litter
 * the table with matches nobody joined. So the page is the button, and the
 * match exists once it is pressed.
 */
export default async function VersusPage() {
  const { t } = await readLocaleContext();

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2">
      <h1 className="sr-only">{t.versusTitle}</h1>
      <VersusStart t={t} />
    </div>
  );
}
