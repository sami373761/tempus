import type { Metadata } from "next";

import { VersusStart } from "@/components/versus-start";
import { getCurrentAccount } from "@/lib/auth/server";
import { chronoStanding } from "@/lib/game/chrono-rating";
import { readLocaleContext } from "@/lib/i18n/server";
import {
  boardPhotoUrl,
  dailyGameCoverIndex,
  gameCoverUrl,
  versusFriendArtUrl,
} from "@/lib/storage/images";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.versusTitle} · Tempus` };
}

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
 * Component. Five strings cross that boundary instead of the whole module.
 * And the player's standing: the online card says which league a search will
 * play in, and only the server can read a rating.
 */
export default async function VersusPage() {
  const [{ t }, account] = await Promise.all([
    readLocaleContext(),
    getCurrentAccount(),
  ]);

  // The rating arrives with the rest of the chrome rather than in a read of
  // its own (`readProfileChrome`), which is also how the home page's window
  // gets it — one number from the row the session already fetches. A read
  // that failed leaves `chronoRating` null, so the card loses its standing
  // line rather than the page losing its button.
  const standing =
    account && account.chronoRating !== null
      ? chronoStanding(account.chronoRating)
      : null;

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
        friendArt={versusFriendArtUrl()}
        standing={standing}
        signedIn={account !== null}
      />
    </div>
  );
}
