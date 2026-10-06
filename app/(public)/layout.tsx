import { SiteHeader } from "@/components/site-header";
import { SiteMenu } from "@/components/site-menu";
import { readLocaleContext } from "@/lib/i18n/server";

/**
 * Shell for the player-facing pages. The menu lives here so every page shares
 * one top-right control; `SiteHeader` owns the wordmark and the bar's scroll
 * behaviour, both of which depend on the route and so have to run on the
 * client.
 *
 * The two are siblings rather than nested, and that is deliberate: the menu
 * pins itself to the viewport so it survives a scroll, and off home the bar
 * translates itself out of view to hide. A transformed ancestor is the
 * containing block for its `fixed` descendants, so a menu inside the header
 * would hide along with it.
 *
 * The whole dictionary is handed to the menu rather than a label at a time —
 * it carries six rows and a language picker, and a prop per string would be a
 * list of seven that has to be edited again for every row added.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale, t } = await readLocaleContext();

  return (
    /* `relative` so the home page's edge ornament can hang off this box rather
       than off its own section: the vine has to start at the very top of the
       page, and everything inside `main` starts below the header. */
    <div className="relative flex min-h-dvh flex-col">
      <SiteHeader />
      <SiteMenu locale={locale} t={t} />

      <main className="flex-1">{children}</main>
    </div>
  );
}
