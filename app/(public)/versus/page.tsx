import { VersusStart } from "@/components/versus-start";
import { getCurrentUser } from "@/lib/auth/server";
import { readChronoRating } from "@/lib/db/accounts";
import { createAdminDbClient } from "@/lib/db/admin";
import { chronoStanding, type ChronoStanding } from "@/lib/game/chrono-rating";
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
 * the press has to say which of the date-guessing pools it means. The same
 * goes for the online search: nothing is queued until "Find opponent" is
 * pressed.
 *
 * The only things resolved here are the picker's photographs, for the reason
 * the home board's are resolved in its page: `lib/storage/images` holds every
 * object key on the site and the component that needs them is a Client
 * Component. Four strings cross that boundary instead of the whole module.
 * And the player's standing: the online card says which league a search will
 * play in, and only the server can read a rating.
 */
export default async function VersusPage() {
  const [{ t }, user] = await Promise.all([readLocaleContext(), getCurrentUser()]);

  // Service role, as the actions read it, so the number on this card is the
  // number matchmaking will seat them on. Guarded like the menu's username
  // read: a rating that cannot be read leaves the card without a standing line
  // rather than the page without a button.
  let standing: ChronoStanding | null = null;
  if (user) {
    try {
      const rating = await readChronoRating(createAdminDbClient(), user.id);
      standing = rating === null ? null : chronoStanding(rating);
    } catch (error) {
      console.error("versus page: readChronoRating failed", error);
      standing = null;
    }
  }

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
      <VersusStart
        t={t}
        photos={photos}
        standing={standing}
        signedIn={user !== null}
      />
    </div>
  );
}
