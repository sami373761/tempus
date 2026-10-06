import { AboutCard } from "@/components/about-card";
import { AppleBento } from "@/components/apple-bento";
import { FaqSection } from "@/components/faq-section";
import { GameBoard } from "@/components/game-board";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SiteMark } from "@/components/site-header";
import { SiteMenu } from "@/components/site-menu";
import { readLocaleContext } from "@/lib/i18n/server";
import {
  boardPhotos,
  dailyGameCoverIndex,
  gameCoverSrcSet,
  gameCoverUrl,
} from "@/lib/storage/images";

export default async function HomePage() {
  const { locale, t } = await readLocaleContext();

  /* Which of the card's two photos shows is a function of the date, so the
     cover changes every day and holds still for the whole of one. The homepage
     reads the locale cookie and is therefore request-rendered, so the date is
     read at request time rather than frozen at build time.

     Resolved here rather than inside the board: the board is a client
     component — the two cards that swap it need a handler — and the cover is
     the only thing in it the server has to decide. Two strings cross that
     boundary instead of the whole of `lib/storage/images`. */
  const guessPhoto = dailyGameCoverIndex("guess");
  const guessCover = {
    src: gameCoverUrl("guess", guessPhoto),
    srcSet: gameCoverSrcSet("guess", guessPhoto),
  };

  /* Every photographed card on the board, both views. One URL each and no
     srcset — at a third of the board and under, one width covers every device;
     see `boardPhotoUrl`. Resolved here for the same reason the cover above is:
     the board is a client component and this is the only part of it the server
     has to decide. Daily is deliberately absent — it is the one card that
     paints `.board-mesh` instead. */
  const photos = boardPhotos();

  return (
    <>
      {/* Masthead, tagline and cards are one block, centred on the first
          screen. Two things make that come out exact at every size rather than
          at the one it was measured on:

          - The wordmark is *inside* this section. Centring the section's
            content while the masthead stayed up in the header would only have
            stretched the gap under it — ~150px of nothing, which reads as a
            mistake rather than as breathing room. The two have to move
            together, so they have to be siblings.
          - `min-h-dvh` is the whole first screen, not the screen less the
            header, because the header is out of flow on this route. So this box
            spans 0..100dvh and `justify-center` puts the block's centre at 50dvh
            for any block height. Nothing here depends on the cards' aspect
            ratio or on how the grid breaks.

          The slack that is left falls below the cards, where it is the run-up to
          the scroll.

          An edge vine ran down each side of this screen until 2026-10-05
          (`Ornament`, an alpha mask painted in `--color-ornament`). It was
          removed on request; `public/ornament-vine.png` is still in the repo,
          so putting it back is a component and a token, not new artwork. */}
      <section className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 text-center">
        {/* The masthead is a row on the board's own column, which is what puts
            the mark over the top-left corner of the first card and the menu
            button over the top-right corner of the second. `--board-w` is the
            board's own cap, read here rather than repeated, because the whole
            point of the row is that its two ends land on the cards' two
            corners.

            The menu is rendered here rather than left on the layout's fixed
            track, and the floating copy stands down on this route. On a page
            whose masthead is centred against the first screen rather than
            pinned to the top of it, a button at a fixed `top` would sit at a
            different height from the row it reads as part of; inline, the two
            move together at every viewport height. Off home it still pins
            itself — see components/site-menu.tsx.

            `items-center` against the title's own line, not against the block:
            the tagline hangs below the row so the button stays level with the
            word it sits beside. */}
        <div className="w-full max-w-[var(--board-w)] text-left">
          <div className="flex items-center justify-between gap-6">
            <h1 className="flex items-center gap-3 font-display text-[clamp(30px,4.5vw,46px)] font-semibold leading-none tracking-[-0.02em] text-ink">
              <SiteMark />
              Tempus
            </h1>

            <SiteMenu locale={locale} t={t} inline />
          </div>

          {/* The 48px the masthead kept from the tagline when it was a header of
              its own, less what the parent's `gap-10` already supplies below. */}
          <p className="mt-4 text-lg text-ink-dim">{t.tagline}</p>
        </div>

        {/* Every way to play, in one grid that swaps its own contents.

            Two cover cards over a row of four, and the fourth of those four
            exchanges the whole board for the games that are named but not
            built — see components/game-board.tsx, which owns both views and
            the swap between them. The separate "more ways to play" list that
            used to sit under the covers is gone: it was a second grid at a
            second size, and the modes in it are either on the board now or
            behind that fourth card. */}
        <GameBoard t={t} guessCover={guessCover} photos={photos} />
      </section>

      {/* Everything below the fold shares one column, and that column *is*
          `--board-w`: the cap is the token plus the `px-6` it carries on both
          sides, so the three blocks line up with the cards above them at every
          width and cannot drift when the board is rescaled. It was `max-w-7xl`
          until 2026-10-06, which agreed with the old 77rem board by arithmetic
          rather than by construction.

          Each run of empty space is the *parent's*, never the revealed
          element's: `ScrollReveal` measures its own box, so padding inside it
          would trip the animation while nothing but blank space was on
          screen. */}
      <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pt-[26vh]">
        <ScrollReveal>
          <AboutCard t={t} />
        </ScrollReveal>
      </div>

      {/* Temporary: placeholder entrances to areas that do not exist yet. */}
      <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pt-32">
        <ScrollReveal>
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">
              {t.moreTitle}
            </h2>
            <p className="mt-2 text-ink-dim">{t.moreBlurb}</p>
          </div>
          <AppleBento />
        </ScrollReveal>
      </div>

      {/* The menu's FAQ row links to `/#faq`, which is the section inside. It
          reveals on scroll like its neighbours — the hash jump scrolls it into
          view, and the observer fires on arrival rather than needing a second
          code path for landing on it directly.

          `pt-40` where its two neighbours have `pt-32`: the FAQ is a list of
          plain text on the page itself rather than a block of cards, so it has
          no edge of its own to separate it from the bento above, and at the
          shared spacing the first question read as part of that block. */}
      <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pb-32 pt-40">
        <ScrollReveal>
          <FaqSection t={t} />
        </ScrollReveal>
      </div>
    </>
  );
}
