import { VersusStart } from "@/components/versus-start";
import { readLocaleContext } from "@/lib/i18n/server";
import {
  boardPhotoUrl,
  dailyGameCoverIndex,
  gameCoverUrl,
} from "@/lib/storage/images";

export const dynamic = "force-dynamic";

/**
 * The way in to head-to-head.
 *
 * A match cannot be created while rendering this: creating one deals ten
 * rounds and mints a seat token, and doing that for every visit would litter
 * the table with matches nobody joined. So the page is the button, and the
 * match exists once it is pressed — now with the chosen game's name on it, so
 * the press has to say which of the date-guessing pools it means.
 *
 * The only thing resolved here is the picker's photographs, for the reason the
 * home board's are resolved in its page: `lib/storage/images` holds every
 * object key on the site and the component that needs them is a Client
 * Component. Four strings cross that boundary instead of the whole module.
 */
export default async function VersusPage() {
  const { t } = await readLocaleContext();

  // The three playable subjects wear the board's own cards; the general game
  // has no board photograph of its own (it is one of the two cover cards), so
  // it wears the date-guessing cover — the same picture, picked the same way
  // the home page picks it, which is why this page is request-rendered.
  const photos = {
    history: gameCoverUrl("guess", dailyGameCoverIndex("guess")),
    football: boardPhotoUrl("football"),
    screen: boardPhotoUrl("screen"),
    basketball: boardPhotoUrl("basketball"),
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2">
      <h1 className="sr-only">{t.versusTitle}</h1>
      <VersusStart t={t} photos={photos} />
    </div>
  );
}
