import { AppleBento } from "@/components/apple-bento";
import { ContactSection } from "@/components/contact-section";
import { FaqSection } from "@/components/faq-section";
import { GameBoard } from "@/components/game-board";
import { HomeExplorer } from "@/components/home-explorer";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SiteMark } from "@/components/site-header";
import { SiteMenu } from "@/components/site-menu";
import { getCurrentAccount } from "@/lib/auth/server";
import { SUPPORTED_LOCALES } from "@/lib/db/types";
import { chronoStanding } from "@/lib/game/chrono-rating";
import { readGameCategoriesCached } from "@/lib/db/cached";
import { categoryBlurb, categoryTitle } from "@/lib/db/game-categories";
import { readLocaleContext } from "@/lib/i18n/server";
import {
  boardPhotoUrl,
  boardPhotos,
  dailyGameCoverIndex,
  explorerArt,
  explorerModel,
  gameCoverSrcSet,
  gameCoverUrl,
  publicImageUrl,
  timelineBackdropSrcSet,
  timelineBackdropUrl,
  versusFriendArtUrl,
} from "@/lib/storage/images";

export default async function HomePage() {
  const { locale, t } = await readLocaleContext();

  /* Game categories (public.game_category, managed in the admin panel): which
     subject cards are shown, and any category the panel added. A failed read
     shows the board as it always was — the built-in four, no extras. */
  const categories = await readGameCategoriesCached().catch(() => null);
  const hiddenBuiltins = (categories ?? [])
    .filter((c) => c.isBuiltin && !c.showOnHome)
    .map((c) => c.slug);
  const extraCards = (categories ?? [])
    .filter((c) => !c.isBuiltin && c.showOnHome && c.layout === "landscape")
    .sort((a, b) => a.homeOrder - b.homeOrder)
    .map((c) => ({
      slug: c.slug,
      href: `/oyun/${c.slug}`,
      title: categoryTitle(c, locale),
      blurb: categoryBlurb(c, locale),
      photo: c.cardImageKey ? publicImageUrl(c.cardImageKey) : null,
    }));

  /* The masthead's menu button is this page's own copy (the layout's floating
     one stands down on `/`), so this page has to resolve the session too — the
     layout's `account` does not reach a sibling route segment. */
  const account = await getCurrentAccount();

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

  /* Daily's picture is the date-guessing game's own common-era backdrop, reused
     rather than uploaded — the art the site already has, like everything on the
     explorer's stage. It is the one card on the board with no photograph of its
     own, and a plate from the game the mode is played over says what the mode
     is where `.board-mesh` only said "not ready".

     Its derived widths are the backdrops' 1440/2560 rather than the covers'
     800/1600, which the card's `sizes` hint handles without a change: half the
     board is 546px at the cap, so 1440 is what a 2x screen picks. */
  const dailyCover = {
    src: timelineBackdropUrl("ce"),
    srcSet: timelineBackdropSrcSet("ce"),
  };

  /* Every photographed card on the board, both views. One URL each and no
     srcset — at a third of the board and under, one width covers every device;
     see `boardPhotoUrl`. Resolved here for the same reason the cover above is:
     the board is a client component and this is the only part of it the server
     has to decide. The two covers are not in here: they are the only cards on
     the board that carry a pair of widths, so they travel as `CoverPhoto`
     objects rather than as single URLs. */
  const photos = boardPhotos();

  /* What the board's 1v1 card opens, which is the head-to-head page's own two
     cards in a window (components/versus-dialog.tsx). They are resolved here
     for the same reason everything above them is: the art lives in
     `lib/storage/images` and the standing on the profile row, and the board is
     a Client Component.

     The picker's four photographs are the board's own — the same pictures its
     cards wear, so a mode looks the same wherever it is offered — except the
     general game, which has no card of its own and wears the date-guessing
     cover, picked by the day exactly as the cover above is.

     The standing costs no round trip: `chronoRating` rides in the profile read
     the menu already makes for the player's name (`readProfileChrome`). */
  const versus = {
    photos: {
      history: guessCover.src,
      football: boardPhotoUrl("football"),
      screen: boardPhotoUrl("screen"),
      basketball: boardPhotoUrl("basketball"),
    },
    friendArt: versusFriendArtUrl(),
    standing:
      account && account.chronoRating !== null
        ? chronoStanding(account.chronoRating)
        : null,
    signedIn: account !== null,
  };

  /* The explorer's library panel used to state how big the illustrated library
     is, read from the database so it could not go stale. It states "1000+"
     now, which was asked for — so this page makes **no database read at all**,
     and the `try`/`catch` that kept a failed count from 500-ing the front page
     went with it. See `ExplorerStats` in components/home-explorer.tsx before
     putting a number back: the read has to come back with it. */

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
          so putting it back is a component and a token, not new artwork.

          The `py` is clearance for the masthead, and it is deliberately small.
          `justify-center` overflows *both* ways, so on a phone where the block
          was taller than the screen the wordmark sat hard against the top edge
          with nothing above it — which is what the padding answers. It has to
          stay under the slack the block actually has (at 375x667 the content is
          594px after the mobile board was shortened), or it puts the overflow
          back and the padding is skipped again. It changes nothing above `sm`:
          symmetric padding inside `min-h-dvh` leaves the block centred on the
          screen.

          **`min-h-dvh` only from `md`.** On a phone the block is shorter than
          a tall screen, and a full-height hero kept the explorer's heading a
          screen down behind empty black. There the hero is its content, and the
          board's own cell grows when the other games open (see
          components/game-board.tsx), sliding the rest of the page down. */}
      <section className="flex flex-col items-center justify-center gap-10 px-6 py-6 text-center sm:py-8 md:min-h-dvh">
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

            <SiteMenu locale={locale} t={t} account={account} inline />
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
        <GameBoard
          t={t}
          dailyCover={dailyCover}
          guessCover={guessCover}
          photos={photos}
          versus={versus}
          hiddenBuiltins={hiddenBuiltins}
          extraCards={extraCards}
        />
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
          screen.

          **The run-up above `md` is a fifth of the board's own width, and that
          is the fix for a gap that grew as the page narrowed.** It was a flat
          `26vh`, which is a constant on any given screen — but the space the
          reader actually sees above this block is that padding *plus* the slack
          the hero leaves under the cards, and the slack is not constant. The
          hero is `min-h-dvh` and `justify-center`, so as the column narrows the
          board gets shorter and the leftover it is centred in grows: measured
          at 844px tall, the gap ran 301px at 1680 and 405px at 770 — a third
          wider at exactly the width with least room to spare. Reading the
          board's width instead tracks the thing that is moving, because the
          board's height *is* a function of its width (see `CARD_HEIGHT`): the
          same two measurements now come out 301 and 330. `min()` with a `vh`
          cap keeps the other end honest — on a tall window the hero is already
          leaving an enormous slack and the run-up should not add to it.

          The factor was 0.2 (and the cap 26vh) until the heading was asked to
          sit higher on wide screens; 0.12/15vh takes ~90px off the gap at
          1680x844 and keeps the same shape.

          **Below `md` it is a flat 3rem**, down from `14vh`, asked for: on a
          phone the hero already fills the first screen outright, so there is no
          slack to compensate for — and 14vh on an 844px window was 118px of
          nothing between the last card and this block's heading, which put the
          block's own pills most of a second screen down. A fixed 48px rather
          than a smaller `vh` because the quantity that should set this gap is
          the type above and below it, not the height of the window. */}
      <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pt-12 md:pt-[min(15vh,calc(min(var(--board-w),100vw_-_3rem)*0.12))]">
        <ScrollReveal>
          {/* The block's name, outside the card rather than in a corner of it —
              the same arrangement the bento below has, so the two sections
              below the fold are introduced the same way. Left-aligned because
              that is where it was asked for; the bento's is centred over a
              block that has no left edge of its own to answer to. */}
          {/* Heading and one line under it, left-aligned — the same two-line
              introduction the bento and the FAQ below now carry, so the three
              blocks under the fold are all announced the same way and all on
              the page's one left edge. */}
          <div className="mb-6">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">
              {t.explorerHeading}
            </h2>
            <p className="mt-2 text-ink-dim">{t.explorerLead}</p>
          </div>
          <HomeExplorer
            t={t}
            locale={locale}
            art={explorerArt()}
            model={explorerModel()}
            stats={{ languages: SUPPORTED_LOCALES.length }}
          />
        </ScrollReveal>
      </div>

      {/* Temporary: placeholder entrances to areas that do not exist yet. */}
      <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pt-32">
        <ScrollReveal>
          {/* Left-aligned, as asked, like the explorer's heading above and the
              FAQ's below: the column has one left edge and every block under
              the fold now starts on it. */}
          <div className="mb-10">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">
              {t.moreTitle}
            </h2>
            <p className="mt-2 text-ink-dim">{t.moreBlurb}</p>
          </div>
          <AppleBento t={t} />
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
      <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pt-40">
        <ScrollReveal>
          <FaqSection t={t} />
        </ScrollReveal>
      </div>

      {/* The last block on the home page, and still a section rather than the
          page's only contact surface: the menu's Contact row goes to
          `/contact` since 2026-10-07, where this errand shares a page with the
          tip jar. This stays because it is what a reader who has scrolled the
          whole page should arrive at — the address offered without being asked
          for. It keeps its `id`, so `/#contact` still works for anything that
          links it.

          It is wrapped in its own `ScrollReveal` like every block above it, so
          it arrives the same way they do. `pt-32` where the FAQ above it has
          `pt-40`: the FAQ's last row ends on a hairline, which already reads as
          a boundary, where the bento above it ended on the edge of a card.

          The page's bottom padding moved from the FAQ's wrapper to this one —
          whichever block is last carries it. */}
      <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pb-32 pt-32">
        <ScrollReveal>
          <ContactSection t={t} />
        </ScrollReveal>
      </div>
    </>
  );
}
