"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";

import type { Dict } from "@/lib/i18n/dictionary";
import type { BoardPhoto } from "@/lib/storage/images";

/**
 * The home page's board: every way to play, in one grid that swaps its own
 * contents.
 *
 * Two views live here. The first is the page proper — two cover cards over a
 * row of four — and the last of those four opens the second, which is the games
 * that are named but not built. The swap is a state change, not a route: there
 * is nothing on the other side to fetch, and a navigation would cost the whole
 * hero a repaint to change six cards.
 *
 * **Both views are mounted, stacked in one grid cell** (`col-start-1
 * row-start-1`), which is what makes the swap cost the page no height. The row
 * takes the taller view's height — the covers make the first one taller — and
 * `self-center` hangs the shorter one in the middle of it. Animating the
 * board's height instead would drag the masthead with it: the hero is
 * `min-h-dvh` and centred, so every pixel the board loses moves the title up
 * half a pixel. A board that changed size would be a page that jumped.
 *
 * **Below `md` the cell follows the active view instead.** There the views are
 * not the same height (three rows against four), the hero is not centred in a
 * full screen, and a cell held at the taller view left a row of black under
 * the play view that pushed the next section down the page. So on a phone the
 * cell is the active view's measured height, and opening the other games
 * slides what is below the board down to make room (`.board-cell` in
 * app/globals.css).
 *
 * The hidden view is `inert`, like the menu panel and for the same reason:
 * `opacity-0` alone leaves a grid of links and buttons sitting invisibly over
 * the page.
 *
 * It is one client component rather than a client shell around server cards
 * because the toggle is the point — the two cards that do the swapping need a
 * handler, and a server-rendered child cannot take one. The only thing the
 * server has to hand down is the cover photo, which is a pair of strings.
 */
export type CoverPhoto = { src: string; srcSet: string };

type View = "play" | "games";

/**
 * Every card on the board is exactly this tall — covers, squares and the wide
 * tiles alike — and that one line is the whole reason the two views line up.
 * Each is two rows of this height, so swapping the board cannot move a card up
 * or down.
 *
 * It is a height, not an aspect ratio, because the cards are no longer one
 * shape: a cover spans half the board, a play tile a third of it, a games card
 * a quarter. The value is the games card's own width — `100cqw` is the board's
 * width (it is an `@container`) and `3rem` the three 1rem gaps between four
 * columns — which is what keeps those square without saying so twice. Under
 * `md` every grid drops to two columns and the quarter becomes a half, so the
 * rule tracks the grid's own breakpoint.
 *
 * A fixed ratio cannot do this job at all: a cover spans two columns *plus the
 * gap between them*, so the ratio that lands it on the squares' height is
 * `2(W-16)/(W-48)` — a function of the board's width rather than a constant.
 *
 * **The two-column branch is a tenth shorter than square**, asked for: on a
 * phone every card is half the board and a square one is 155px tall, which
 * made the first screen a column of five of them with the masthead pushed off
 * the top of it. The `md` branch is untouched, so nothing about the board at
 * its cap moves. It is still *one* height for both views, which is the whole
 * point of the token — the number changed, not the rule.
 */
const CARD_HEIGHT =
  "h-[calc((100cqw-1rem)/2*0.9)] md:h-[calc((100cqw-3rem)/4)]";

export function GameBoard({
  t,
  dailyCover,
  guessCover,
  photos,
}: {
  t: Dict;
  /** The date-guessing game's common-era backdrop, reused as the Daily card's
   *  picture. Asked for on 2026-10-07: that card painted `.board-mesh` while
   *  every other card on both views carried a photograph, which made the one
   *  card that cannot be played the only one that looked unfinished. It is the
   *  art the site already has rather than a new upload, like the explorer's
   *  stage — and a backdrop from the game Daily is played over is the picture
   *  that says what the mode is. */
  dailyCover: CoverPhoto;
  guessCover: CoverPhoto;
  /** One photograph per photographed card, across both views, resolved on the
   *  server like `guessCover` — a record of strings crosses the boundary
   *  rather than the whole of `lib/storage/images`. */
  photos: Record<BoardPhoto, string>;
}) {
  const [view, setView] = useState<View>("play");
  // Bumped on every swap so the card stagger can be replayed by remounting the
  // view's contents — a CSS animation that has already finished does not run
  // again merely because its element became visible. Zero is the first paint,
  // where the cards must simply be there: the page has not been interacted
  // with, and animating the board in on load would be a second entrance
  // competing with the scroll reveal further down.
  const [swaps, setSwaps] = useState(0);
  const board = useRef<HTMLDivElement>(null);
  const takeFocus = useRef(false);
  const playView = useRef<HTMLDivElement>(null);
  const gamesView = useRef<HTMLDivElement>(null);
  // The active view's height, which the cell takes below `md` (see the note
  // at the top). Null until measured: the first paint keeps the stacked
  // cell's own height, so nothing animates on load.
  const [cellHeight, setCellHeight] = useState<number | null>(null);

  // A layout effect so the first measurement lands before the first paint,
  // rather than as a visible jump from the stacked height. Observed rather
  // than read once, because the cards' height is solved from the board's
  // width and a rotated phone changes it. `offsetHeight` ignores the leaving
  // view's `scale`, which is a transform.
  useLayoutEffect(() => {
    const active = (view === "play" ? playView : gamesView).current;
    if (!active) return;
    const measure = () => setCellHeight(active.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(active);
    return () => observer.disconnect();
  }, [view]);

  /**
   * `detail` is 0 only when the button was activated from the keyboard — a
   * real click carries its count — which is how the board tells a press from a
   * tap without listening for key events of its own.
   */
  function show(next: View, event: React.MouseEvent<HTMLButtonElement>) {
    if (next === view) return;
    takeFocus.current = event.detail === 0;
    setView(next);
    setSwaps((n) => n + 1);
  }

  /**
   * Hand the focus to the card that undoes the swap — but only for a keyboard
   * swap.
   *
   * The card that was just pressed is inside the view that has gone `inert`, so
   * whoever made the swap loses their place: for the keyboard that means the
   * next Tab restarts from the top of the page, which would make "open, change
   * your mind, close" a hunt instead of three keystrokes. Moving focus to the
   * counterpart card keeps it in the corner they were already in.
   *
   * Doing it after a *click* was tried and is wrong. Chrome carries
   * `:focus-visible` across a scripted focus, so the ring appeared over a card
   * the pointer had just left — a bright blue box with nothing to explain it.
   * A mouse swap therefore leaves focus where the browser puts it, which is the
   * ordinary consequence of clicking a control that goes away.
   */
  useEffect(() => {
    if (!takeFocus.current) return;
    takeFocus.current = false;
    board.current
      ?.querySelector<HTMLElement>('[data-active="true"] [data-board-swap]')
      ?.focus();
  }, [swaps]);

  return (
    /* `@container` is what lets a cover card's *height* be solved from the
       board's own width — see `CoverCard`. The width cap is the shared token,
       because the masthead row above reads it too. */
    <div
      ref={board}
      data-measured={cellHeight !== null || undefined}
      style={
        cellHeight === null
          ? undefined
          : ({ "--board-cell-h": `${cellHeight}px` } as React.CSSProperties)
      }
      className="board-cell @container grid w-full max-w-[var(--board-w)]"
    >
      {/* Six columns rather than four, because the row under the covers is
          three tiles wide now that survival has moved into the other view: a
          cover spans three of them and a tile two, so both rows still end flush
          with the board's edges. The tiles are the wider for it — a third of
          the board at the games cards' height — which is the only shape on the
          board that is not square, and is what lets the two views stay the same
          width as well as the same height. */}
      <BoardView
        active={view === "play"}
        swaps={swaps}
        columns={6}
        viewRef={playView}
      >
        <CoverCard
          href="/daily"
          title={t.dailyTitle}
          kicker={t.timelineTitle}
          icon={<CalendarIcon />}
          photo={dailyCover}
          blurb={t.cardDailyBlurb}
          index={0}
        />
        <CoverCard
          href="/guess"
          title={t.timelineTitle}
          icon={<MarkerIcon />}
          photo={guessCover}
          /* The instruction the game's own screen carries, rather than a second
             sentence about the same game in five languages. */
          blurb={t.timelineBlurb}
          index={1}
        />
        <BoardCard
          href="/versus"
          title={t.duelTitle}
          blurb={t.cardDuelBlurb}
          kicker={t.timelineTitle}
          icon={<SwordsIcon />}
          photo={photos.versus}
          span="wide"
          index={2}
        />
        <BoardCard
          href="/compare"
          title={t.comparisonTitle}
          blurb={t.comparisonBlurb}
          icon={<ScalesIcon />}
          photo={photos.compare}
          span="wide"
          index={3}
        />
        {/* `span="full"` rather than `"wide"` only matters under `md`, where
            the grid is two columns and this is the odd third tile: spanning
            both keeps the row flush instead of leaving a half-width hole. At
            six columns it is two of them like its neighbours. */}
        <BoardCard
          onClick={(event) => show("games", event)}
          title={t.otherGamesTitle}
          blurb={t.cardOtherBlurb}
          icon={<GridIcon />}
          photo={photos.other}
          span="full"
          index={4}
        />
      </BoardView>

      <BoardView
        active={view === "games"}
        swaps={swaps}
        columns={4}
        viewRef={gamesView}
      >
        {/* Survival leads this view, and it is now the one card in it that is
            built — it kept the slot it took from the three that were being
            held open, rather than moving to the play view, because this is
            still where a player looks for a mode that is not one of the two
            headline games.

            **Its kicker is the comparison round, not the date-guessing one.**
            The kicker names the game a mode is played over, and survival is
            the comparison round with no set of ten around it (see
            app/(public)/survival/page.tsx) — it was labelled date guessing
            while it was only a name on a card. */}
        <BoardCard
          href="/survival"
          title={t.survivalTitle}
          blurb={t.cardSurvivalBlurb}
          kicker={t.comparisonTitle}
          icon={<HeartIcon />}
          photo={photos.survival}
          index={0}
        />
        <BoardCard
          href="/football"
          title={t.footballTitle}
          blurb={t.cardFootballBlurb}
          kicker={t.timelineTitle}
          icon={<FootballIcon />}
          photo={photos.football}
          index={1}
        />
        <BoardCard
          href="/basketball"
          title={t.basketballTitle}
          blurb={t.cardBasketballBlurb}
          kicker={t.timelineTitle}
          icon={<BasketballIcon />}
          photo={photos.basketball}
          index={2}
        />
        <BoardCard
          href="/screen"
          title={t.screenTitle}
          blurb={t.cardScreenBlurb}
          kicker={t.timelineTitle}
          icon={<ClapperIcon />}
          photo={photos.screen}
          index={3}
        />
        {/* The last two slots stood empty until 2026-10-06. They are named
            now, which leaves the view eight cards with nothing held open: the
            board's shape is settled and the two that mean something — what is
            coming and the way back — are still in the corner the eye knows.

            **Born When? leads this pair and Inventions follows it**, which is
            the order the two modes are actually in: the first row of this view
            is the four that can be played, and this slot is the fifth of them.
            Inventions has moved down into the unbuilt half of the view, beside
            the card that stands for everything else still being written. */}
        <BoardCard
          href="/when-born"
          title={t.whenBornTitle}
          blurb={t.cardWhenBornBlurb}
          kicker={t.timelineTitle}
          icon={<PersonIcon />}
          photo={photos.whenBorn}
          index={4}
        />
        {/* The one card on the board that says so across its whole face rather
            than with a chip in the corner. See `veil` on `BoardCard`: the
            chip was read as decoration beside three live cards wearing
            photographs of the same weight, and this mode is far enough off
            that "not yet" has to be the first thing about the card rather than
            a detail of it. */}
        <BoardCard
          title={t.inventionTitle}
          blurb={t.cardInventionBlurb}
          kicker={t.timelineTitle}
          icon={<BulbIcon />}
          photo={photos.invention}
          veil={t.comingSoonTitle}
          index={5}
        />
        <BoardCard
          title={t.comingSoonTitle}
          blurb={t.cardComingSoonBlurb}
          kicker={t.newGamesBlurb}
          icon={<SparkIcon />}
          photo={photos.comingSoon}
          soon={t.comingSoon}
          index={6}
        />
        <BoardCard
          onClick={(event) => show("play", event)}
          title={t.backTitle}
          icon={<ArrowLeftIcon />}
          arrow="back"
          index={7}
        />
      </BoardView>
    </div>
  );
}

/**
 * One of the two stacked views.
 *
 * The cards are remounted on every swap (the `key`) so their entrance replays,
 * and the whole view fades as a block on the way out. That asymmetry is the
 * menu's and is deliberate: a staggered exit holds the last card on screen past
 * the moment its replacement has already arrived underneath it, so the two
 * views would be legible through each other.
 */
function BoardView({
  active,
  swaps,
  columns,
  viewRef,
  children,
}: {
  active: boolean;
  swaps: number;
  /** Measured by the board, which sizes its cell to the active view below `md`. */
  viewRef: React.Ref<HTMLDivElement>;
  /** Columns above `md`. The two views differ — six for the play view's
   *  three-up row, four for the games view's four-up — but both resolve to the
   *  same card height, so the views stay the same size. */
  columns: 4 | 6;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={viewRef}
      data-active={active}
      inert={!active || undefined}
      /* Centred in the shared cell, which is what stops a board that changed
         height between views from moving the masthead above it by half the
         difference. Below `md` the two views are no longer the same number of
         rows — the play view is three now that the covers sit side by side,
         and the games view is still four — so there both are pinned to the top
         of the cell, which is sized to the active one (`.board-cell`). */
      className="board-view col-start-1 row-start-1 self-start md:self-center"
    >
      {/* The grid lives on the inner element, not on the view, because this is
          what the key remounts — and a remount of the grid itself would be a
          remount of the thing the stagger is measured against.

          Both column counts are written out rather than interpolated: Tailwind
          reads the source for class names, and `md:grid-cols-${n}` is a string
          it never sees. */}
      <div
        key={swaps}
        /* The arriving view deals its cards in; the leaving one must not. Both
           are remounted by the key — the one leaving so it is fresh the next
           time it is asked for — and without this gate the departing cards
           would restart their entrance underneath their own fade, which reads
           as the board flinching. */
        data-swapped={(active && swaps > 0) || undefined}
        className={`grid grid-cols-2 gap-4 ${
          columns === 6 ? "md:grid-cols-6" : "md:grid-cols-4"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The gradient every photographed card wears along its bottom edge.
 *
 * It is the card's **own surface colour** fading up out of the picture, not a
 * black wash over it: `--color-card` is where a bare card already sits, so the
 * photograph dissolves into the board rather than being dimmed by a film laid
 * on top of it. That is the whole difference between a card that looks dark
 * and a card that looks deep.
 *
 * Bottom-weighted because every card's text is anchored to its lower edge now,
 * covers included — so the part of the picture the title has to stay legible
 * against is the bottom, and the top two-fifths are left alone at full
 * strength. A flat wash over the whole frame was what the covers used while
 * their titles floated in the middle.
 *
 * Only cards with something behind them get one: on a plain `bg-card` surface
 * it would be card colour over card colour, and inside a dashed placeholder it
 * would read as a fill the card is not meant to have.
 */
/**
 * The ground a card's text stands on, over whatever photograph it was dealt.
 *
 * **It is sized to the text, not to the picture.** Every card anchors its
 * block to the lower edge, so the fade has to be opaque enough to read on
 * through the title *and* the kicker above it — and the artwork underneath is
 * not negotiable with: the 1v1 card is gold and blue heraldry at full
 * saturation, which at the old `via-card/55` left "1v1" and "TARİH TAHMİNİ"
 * printed over fleurs-de-lis under about 30% of a wash. The stops were
 * re-measured against that card — the worst one on the board, which is the one
 * worth measuring against: at 85% up to 42% of the fade, the bottom third,
 * where every card's words are, is near-solid, and above it the fade is as
 * gentle as it was and the photograph still reads as a photograph.
 */
function CardScrim() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[78%] bg-gradient-to-t from-card from-5% via-card/85 via-42% to-transparent"
    />
  );
}

/**
 * What the two bits of chrome in a card's top corners wear when they sit on a
 * photograph.
 *
 * `CardScrim` only covers the bottom of the card, which is where the text is —
 * so the arrow and the "soon" chip are now the only things on a card standing
 * on untouched picture, and some of those pictures are bright (the 1v1 card's
 * flags, the masks on "other games"). A shadow carries them without a wash
 * over the whole frame, which is what the scrim replaced in the first place.
 * The icon chip needs none: it is already a filled glass tile.
 */
const ON_PHOTO_SHADOW = "drop-shadow-[0_1px_6px_rgba(0,0,0,0.75)]";

/**
 * The sentence that unrolls under a card's title while the pointer is on it.
 *
 * **The row is what animates** — `0fr` -> `1fr`, the same arrangement the
 * explorer's pills use — and the child owns the `overflow-hidden`, or the text
 * spills out of the collapsed row. Height is not animatable from nothing any
 * other way without measuring one in JavaScript, and there are thirteen of
 * these on the board.
 *
 * **Growing the row is what lifts the title**, which is the whole of the
 * effect: every card's text block is anchored to the card's lower edge
 * (`justify-between`), so a row that opens underneath the title pushes the
 * title up by exactly its own height rather than moving anything else on the
 * card. A translate on the title would have had to be a guess at that height.
 *
 * `group-hover` is Tailwind's, which wraps `@media (hover: hover)`, so this
 * never opens on a touch screen — where there is no pointer to explain it and,
 * on a phone-sized card, not enough height for the paragraph either. The card
 * clips what does not fit in any case.
 *
 * The text is always in the document rather than being revealed by script, so
 * a screen reader reads each card's name *and* what the mode is. The
 * `.board-card-blurb` class is only how `prefers-reduced-motion` reaches the
 * inline durations — see `app/globals.css`.
 */
function CardBlurb({
  text,
  onPhoto,
  size,
}: {
  text: string;
  onPhoto?: boolean;
  /** The covers carry a notch more than the tiles, in proportion with their
   *  own much larger titles. Neither goes below 13px: a description nobody can
   *  read is a description that need not have been written. */
  size: string;
}) {
  return (
    <span className="board-card-blurb grid grid-rows-[0fr] transition-[grid-template-rows] duration-[420ms] ease-out group-hover:grid-rows-[1fr]">
      <span className="overflow-hidden">
        <span
          className={`block pt-2 ${size} leading-snug opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 ${
            onPhoto ? `text-white/85 ${ON_PHOTO_SHADOW}` : "text-ink-dim"
          }`}
        >
          {text}
        </span>
      </span>
    </span>
  );
}

/**
 * A cover card: the half-board frame at the top of the board.
 *
 * The date-guessing cover's photograph is a function of the date, so that card
 * changes once a day and holds still for the whole of one. Daily's is fixed: it
 * is the game's own common-era backdrop, reused rather than uploaded.
 *
 * **Its contents are a `BoardCard`'s, at a cover's size.** The title stood in
 * the middle of the frame until 2026-10-06, which made these two the only
 * cards on the board whose label was not in the same corner as everybody
 * else's — so the eye had to find the name twice per row. They now carry the
 * same three things in the same places: an icon chip at the top left, a chip
 * or an arrow opposite it, and the kicker-and-title block at the foot. What is
 * bigger is the type, not the arrangement.
 *
 * Without `href` it is a `div`, not a disabled link: there is nothing to
 * navigate to, and the "soon" chip is what says so.
 */
function CoverCard({
  href,
  title,
  kicker,
  icon,
  photo,
  blurb,
  soon,
  index,
}: {
  href?: string;
  title: string;
  kicker?: string;
  icon: React.ReactNode;
  photo?: CoverPhoto;
  /** One line about the mode, unrolled under the title on hover. See
   *  `CardBlurb`. */
  blurb?: string;
  soon?: string;
  index: number;
}) {
  const inner = (
    <>
      {photo ? (
        <img
          src={photo.src}
          srcSet={photo.srcSet}
          /* Half the board, so once the board hits its cap (`--board-w`, at a
             ~1157px viewport — the token plus the column's `px-6`) it stops
             growing at 546px — a plain `50vw` would overstate it on every
             wider viewport and pull a file larger than it can ever show. Both
             numbers follow the board's width; rescale it and this has to
             follow. */
          /* Half the board from `md`; below it the card is one of two columns
             like every other card on the board, so it is ~47vw at both ends
             and the old `100vw` would have pulled twice the file it can show. */
          sizes="(min-width: 1160px) 546px, 47vw"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        /* The mesh stands in for a photograph a cover does not have, for the
           same reason the bento's hero keeps one underneath: a card with
           nothing behind its title reads as a card that failed to load rather
           than as one that is not ready. **It has no caller as of
           2026-10-07** — Daily was the last cover without a picture and now
           carries the date-guessing game's common-era backdrop — so this is
           the branch a third cover added without art would land in, not a
           state anything on the board is in. */
        <div aria-hidden="true" className="board-mesh absolute inset-0" />
      )}

      <CardScrim />

      <span className="relative flex items-start justify-between">
        <span
          aria-hidden="true"
          /* A notch smaller below `sm`, where a card is half a phone rather
             than a quarter of the board: 40px of chip over a 128px card is a
             third of its width. Unchanged from `sm` up. */
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/80 backdrop-blur-md transition-colors group-hover:text-white sm:h-10 sm:w-10"
        >
          {icon}
        </span>

        {soon ? (
          <SoonChip label={soon} onDark />
        ) : (
          <span
            aria-hidden="true"
            className={`shrink-0 text-white/70 transition-transform duration-300 group-hover:translate-x-0.5 ${ON_PHOTO_SHADOW}`}
          >
            &rarr;
          </span>
        )}
      </span>

      <span className="relative block">
        {/* The tiles' mobile kicker, for the same reason — see `BoardCard`.
            At 320px a cover is a 96px text column and "Date guessing" wants
            two lines of `text-xs` in it, which is a line more than the card
            has. Unchanged from `sm` up. */}
        {kicker ? (
          <span className={`mb-1 block text-[10px] uppercase leading-[1.35] tracking-[0.08em] text-white/85 sm:text-xs sm:leading-4 sm:tracking-[0.1em] ${ON_PHOTO_SHADOW}`}>
            {kicker}
          </span>
        ) : null}
        {/* A cover's type is the one thing about it that is bigger than a
            tile's, and only from `md` — below that the two are the same card
            at the same width, so the same size is what makes the row read as
            one row. `leading-none` is a one-line setting; a half-width mobile
            card takes two, so it waits for `md` as well. */}
        <h2 className="font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-2xl md:text-3xl md:leading-none lg:text-4xl">
          {title}
        </h2>
        {blurb ? (
          <CardBlurb text={blurb} onPhoto size="text-[13px] md:text-sm lg:text-base" />
        ) : null}
      </span>
    </>
  );

  /* Half the board wide from `md` — three of the play view's six columns plus
     the gap between them — and `CARD_HEIGHT` tall like everything else on it.
     The padding is a notch wider than a `BoardCard`'s, which is the one thing
     about the arrangement that does scale with the card.

     **Below `md` it is one column, not two**, asked for so Daily and Date
     Guessing sit side by side at the games view's own size rather than as two
     full-width bands stacked above the rest. That takes the play view from
     four rows to three on a phone, and it is why the two covers take a tile's
     padding, radius and type down there: at a tile's width they *are* tiles,
     and a cover's 20px padding and 30px headline inside a 155px box read as a
     card that had been scaled rather than laid out. Other Games keeps its
     `span="full"`, so the row under them is unchanged. */
  const shape = `board-card group relative flex ${CARD_HEIGHT} flex-col justify-between overflow-hidden rounded-2xl border-[1.5px] border-hairline bg-card p-3.5 text-left sm:p-4 md:col-span-3 md:rounded-3xl md:p-5`;

  if (!href) {
    return (
      <div
        aria-disabled="true"
        style={cardOrder(index)}
        /* It comes out of its mute under the pointer, and it brightens its
           border like the live cards do. The border used to be withheld here
           on the grounds that it promises a click this card cannot answer; it
           was asked for on 2026-10-07, and the distinction is still carried by
           the "soon" chip, the default cursor and the mute itself — what is
           gone is a card that looked inert rather than unready. The fill
           (`hover:bg-card-raised`) stays off: that is the pressable pair. */
        className={`${shape} opacity-80 transition-[opacity,border-color] duration-300 hover:border-ink/25 hover:opacity-100`}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      style={cardOrder(index)}
      className={`${shape} transition-colors hover:border-ink/25 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`}
    >
      {inner}
      <CardTrace />
    </Link>
  );
}

/**
 * One of the square cards.
 *
 * Three elements in one shape, and which one it is turns on the props: a
 * finished mode is a `Link`, the two that swap the board are `button`s, and an
 * unbuilt one is a plain `div` carrying a "soon" chip. Not a disabled button
 * and not a link for that last case, because there is nothing to navigate to
 * and nothing to press; `aria-disabled` is what carries the distinction to a
 * screen reader, and it stays out of the tab order so a keyboard user does not
 * have to step through stops that do nothing.
 *
 * There is no dashed variant any more. A dashed edge used to mean a card that
 * cannot be used — the empty slots and the "coming soon" card wore one — but
 * the slots are named now and that card has a photograph of its own, so the
 * board carries no dashes at all and the "soon" chip is the whole of the
 * distinction. Bringing it back is a `surface` branch and a prop.
 *
 * **The text block is anchored to the bottom and the title wraps rather than
 * truncating.** Both follow from the card being tall enough for a second line:
 * a name that needs one grows the block upward into space the card already
 * has. That is also why the kicker is optional — the title is the last line
 * either way, so the titles across a row share a baseline whether or not there
 * is a line above them. The tiles these replaced were one line tall and had to
 * `truncate`, which made every new language a measurement.
 *
 * **A `photo` turns the card's chrome over to the picture.** The icon chip, the
 * "soon" chip, the arrow and both lines of text switch to the white-on-glass
 * treatment the site uses everywhere it sits on a photograph, and `CardScrim`
 * carries the text — the same one the covers wear, since those anchor their
 * titles to the lower edge too now. The photograph is always a different one,
 * so the scrim cannot be skipped on the grounds that a particular picture is
 * dark.
 *
 * A photograph says nothing about whether the mode exists. A card that is not
 * ready is still `aria-disabled` with its "soon" chip, and it keeps the cover
 * card's `opacity-80` rather than the bare
 * card's `opacity-60`, which at this size muted the photograph into a grey
 * rectangle. A finished mode wearing one is an ordinary `Link` at full
 * opacity — which is why the arrow has a photographed colour at all, since
 * until the play view was dressed only `soon` cards carried pictures and they
 * show the chip in the arrow's place.
 *
 * `span` is how wide it sits, never how tall: the height is `CARD_HEIGHT` in
 * every case. Unset is one column — square, since a games card is a quarter of
 * the board both ways. `"wide"` is a third of it, which is what the play view's
 * row of three needs. `"full"` is the same third above `md` and the whole width
 * under it, for the odd tile in a two-column row.
 */
function BoardCard({
  href,
  onClick,
  title,
  blurb,
  kicker,
  icon,
  photo,
  soon,
  veil,
  arrow,
  span,
  index,
}: {
  href?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  title: string;
  /** One line about the mode, unrolled under the title on hover. See
   *  `CardBlurb`. The way back has none: it is not a game. */
  blurb?: string;
  kicker?: string;
  icon: React.ReactNode;
  /** A photograph to fill the card with. One URL, no srcset — see
   *  `boardPhotoUrl` for why one width is enough at these sizes, and for which
   *  cards are square in the file and which are cropped. */
  photo?: string;
  soon?: string;
  /** The loud form of `soon`: the label to print across the middle of the
   *  card, over a wash dark enough that the picture cannot be mistaken for a
   *  live one. See `CardVeil`. Mutually exclusive with `soon` — two marks
   *  saying the same thing on one card is one too many — and like `soon` it
   *  says nothing about whether the card is a link: `href` is what decides
   *  that, and a veiled card has none. */
  veil?: string;
  arrow?: "back";
  span?: "wide" | "full";
  index: number;
}) {
  const surface = "border-[1.5px] border-hairline bg-card";

  const inner = (
    <>
      {photo ? (
        <>
          <img
            src={photo}
            /* A games-view card is square in the file as well as on screen, so
               `object-cover` has nothing left to crop; a play-view tile changes
               shape at `md` and is cropped from a 16/9 file. Either way one
               file and no srcset — see `boardPhotoUrl`. */
            alt=""
            aria-hidden="true"
            /* The hover every card shares. It is on the *picture* rather than
               on the card because the card's own hover — border and fill — is
               invisible under a photograph, which is why only the three
               interactive cards used to appear to react at all. The scale is
               clipped by the card's `overflow-hidden`, and the scrim is a
               sibling so the title does not drift with it. */
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
          <CardScrim />
        </>
      ) : null}

      {/* Over the picture, under the chrome: the icon chip, the kicker and the
          title are all rendered after this and so stay crisp on top of it. The
          wash is what makes the card read as unavailable; the words on it are
          still the words. */}
      {veil ? <CardVeil /> : null}

      <span className="relative flex items-start justify-between">
        <span
          aria-hidden="true"
          /* **A veiled card has no chip below `sm`.** Under the veil the icon
             is one of two marks saying the same thing, and on a phone the card
             is 126px tall: the chip takes the top 50px, the kicker and title
             the bottom 50, and the 27px left between them is not two lines of
             label. French is where that bites — "Bientôt disponible" wraps at
             every size this card ever is — and the fix that keeps the label
             legible is the mark that is carrying the least. From `sm` the card
             is twice as tall and the chip comes back. */
          className={`h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors sm:h-10 sm:w-10 ${
            veil ? "hidden sm:flex" : "flex"
          } ${
            photo
              ? "border border-white/15 bg-white/10 text-white/80 backdrop-blur-md group-hover:text-white"
              : "bg-card-raised text-ink-dim group-hover:text-ink"
          }`}
        >
          {icon}
        </span>

        {/* The corner carries one of three things and never two: the chip on a
            card that is not ready, nothing at all on the way back — whose icon
            is the arrow, and a second one in the corner was the same sign
            twice — and otherwise the arrow that leans on hover. */}
        {soon ? <SoonChip label={soon} onDark={Boolean(photo)} /> : null}
        {!soon && !veil && arrow !== "back" ? (
          <span
            aria-hidden="true"
            className={`shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 ${
              photo ? `text-white/70 ${ON_PHOTO_SHADOW}` : "text-ink-dim"
            }`}
          >
            &rarr;
          </span>
        ) : null}
      </span>

      <span className="relative block">
        {/* The kicker is a step smaller below `sm`, where a tile leaves ~123px
            of text column: "More modes on the way" wants three lines of
            `text-xs` there, and three lines of kicker over two of title is
            more than a card a tenth shorter than square has. The size only
            matters on a phone — from `sm` every kicker on the board is one
            line. */}
        {kicker ? (
          <span
            className={`mb-0.5 block text-[10px] uppercase leading-[1.35] tracking-[0.08em] sm:text-xs sm:leading-4 sm:tracking-[0.1em] ${
              photo ? `text-white/85 ${ON_PHOTO_SHADOW}` : "text-ink-dim"
            }`}
          >
            {kicker}
          </span>
        ) : null}
        {/* Up from `text-lg` on 2026-10-07, asked for: at a third of the board
            these titles read as captions beside the covers' `text-3xl`. The
            step stops well short of a cover's, which is the one thing the
            request pinned — Daily and Date Guessing stay the loudest names on
            the board.

            Below `sm` it is back to `text-lg`, which is a consequence of the
            cards being a tenth shorter on a phone: "Coming Soon" is the one
            card carrying a two-line kicker *and* a two-line title, and at
            `text-xl` it ran 1px past its own lower edge. The covers stay at
            `text-xl` there, so the hierarchy the step was asked for survives
            at every width. */}
        <span
          className={`block text-lg font-semibold leading-tight sm:text-2xl ${
            photo
              ? "text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]"
              : "text-ink"
          }`}
        >
          {title}
        </span>
        {blurb ? (
          <CardBlurb
            text={blurb}
            onPhoto={Boolean(photo)}
            size="text-[13px] sm:text-sm"
          />
        ) : null}
      </span>

      {/* Last child, so it is over everything including the title block. */}
      {veil ? <SoonBanner label={veil} /> : null}
    </>
  );

  const width =
    span === "full"
      ? "col-span-2"
      : span === "wide"
        ? "md:col-span-2"
        : undefined;

  /* `relative` and `overflow-hidden` only matter with a photograph, but they
     cost a card without one nothing and keep the class list one string. */
  const shape = `board-card group relative flex ${CARD_HEIGHT} flex-col justify-between overflow-hidden rounded-2xl p-3.5 text-left sm:p-4 ${surface} ${width ?? ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        /* Marks the pair the board hands focus between — see the effect in
           `GameBoard`. */
        data-board-swap
        style={cardOrder(index)}
        className={`${shape} transition-colors hover:border-ink/25 hover:bg-card-raised/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`}
      >
        {inner}
      </button>
    );
  }

  if (!href) {
    return (
      <div
        aria-disabled="true"
        style={cardOrder(index)}
        /* The outline the live branches carry, asked for on 2026-10-07 so the
           games view answers the pointer the way the play view does. It is
           only *half* of the pressable pair: `hover:bg-card-raised` stays off,
           and so does the pointer cursor, so a card that cannot be played
           still does not promise a click. What it keeps from before is coming
           out of its own mute, which is the louder half of the reaction.

           **A veiled card answers the pointer with nothing at all**, and it
           carries no mute either. Both follow from the veil: the wash is
           already darker than any opacity this branch applied, so muting on
           top of it only makes the title illegible — and a card that brightens
           under the pointer is a card inviting a press, which is the one thing
           a label reading "Coming Soon" across its middle must not do. */
        className={`${shape} transition-[opacity,border-color] duration-300 ${
          veil
            ? ""
            : `hover:border-ink/25 ${
                photo
                  ? "opacity-80 hover:opacity-100"
                  : "opacity-60 hover:opacity-80"
              }`
        }`}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      style={cardOrder(index)}
      className={`${shape} transition-colors hover:border-ink/25 hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`}
    >
      {inner}
      <CardTrace />
    </Link>
  );
}

/**
 * The ring that runs around a card while the click it answered is still being
 * fetched.
 *
 * A game route is a database read — the board deals a round before it can
 * render one — so a press is followed by a wait the page cannot shorten, and
 * before this the card gave no sign it had been heard. The arc is the whole of
 * the feedback: no spinner, no overlay, nothing that moves the card or hides
 * the picture.
 *
 * `useLinkStatus` is why this is a child component rather than a branch in the
 * card: the hook reads the pending state of the `Link` it sits inside, which
 * means the router owns the state and nothing here has to guess when a
 * navigation ended. It is also why the two `button` cards have no trace — the
 * view swap is a state change, there is nothing to wait for.
 *
 * Mounted only while pending, so the animation starts from zero on every press
 * instead of rejoining a loop that has been running invisibly. The ring itself
 * is `.board-card-trace` in app/globals.css.
 */
function CardTrace() {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return <span aria-hidden className="board-card-trace" />;
}

/**
 * The wash a veiled card wears over its photograph.
 *
 * Darker than anything else on the board by a wide margin, which is the point:
 * every other card is a photograph at full strength, and a mode that is months
 * off has to be distinguishable from them at a glance rather than by reading a
 * 10px chip in the corner. Black rather than the card's own colour — the
 * opposite of `CardScrim`'s rule — because this is not a picture dissolving
 * into the board, it is a picture being switched off.
 *
 * It is one flat layer and not a blur: `backdrop-filter` over a card that also
 * scales its picture on hover costs a compositing pass per card, and the board
 * has thirteen of them.
 */
function CardVeil() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-black/70"
    />
  );
}

/**
 * "Coming Soon", across the middle of the card.
 *
 * **Biased above centre, not centred**, which is what keeps it clear of the
 * title block at the foot: `place-items-center` inside a box with bottom
 * padding lands the label halfway up the *remaining* space, so on a 147px
 * phone card the two lines of label and the two of title do not meet. A
 * translate would have had to be a guess at the title's height, which changes
 * with the language.
 *
 * The type is the card's own title size and a step up from it, rather than
 * something larger: at a quarter of the board a 24px label in French
 * ("Bientôt disponible") is three lines, and three lines of label is a card
 * with a paragraph on it. It is the *contrast* that makes this read as the
 * loudest thing on the card — white at full strength over a 70% wash — not the
 * size.
 */
function SoonBanner({ label }: { label: string }) {
  return (
    /* Not `aria-hidden`: this label *is* the "not yet", the way the chip it
       replaced was, so it has to be read out. `aria-disabled` on the card says
       the same thing to the tree but not in words. */
    <span className="pointer-events-none absolute inset-0 grid place-items-center px-3 pb-10 sm:pb-12">
      <span className="font-display text-center text-sm font-semibold uppercase leading-tight tracking-[0.06em] text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.8)] sm:text-xl">
        {label}
      </span>
    </span>
  );
}

function SoonChip({ label, onDark }: { label: string; onDark?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
        onDark
          ? `border-white/25 bg-black/25 text-white/75 backdrop-blur-md ${ON_PHOTO_SHADOW}`
          : "border-hairline text-ink-dim"
      }`}
    >
      {label}
    </span>
  );
}

/** Where a card falls in the stagger. A custom property rather than a stack of
 *  `nth-child` rules, so adding a card needs no new CSS. */
function cardOrder(index: number) {
  return { "--card-i": index } as React.CSSProperties;
}

/* The cards' icons. Line art at one weight, like the menu's, so the two sets of
   chrome on the page are visibly the same hand. 20px inside a 40px box.

   Four of them are exported, because the explorer below the fold names the same
   four modes this board does (components/home-explorer.tsx) and a second
   drawing of the same mode would be two things to keep in step. The two the
   explorer adds — a medal and a shelf — have no card up here and live there. */
const CARD_ICON = {
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  className: "h-5 w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Daily: a calendar, with the one square that is today filled in. The mode is
 *  "a date a day", and a clock would have said "timed" instead. */
function CalendarIcon() {
  return (
    <svg {...CARD_ICON}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.6" />
      <path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" />
      <rect x="7" y="12.5" width="3.4" height="3.2" rx="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Date guessing: a marker standing on a ruler — the game's own rail, seen
 *  small. The one icon on the board that is a picture of the thing you do. */
export function MarkerIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M3 15h18" />
      <path d="M6.5 15v2.5M12 15v2.5M17.5 15v2.5" />
      <circle cx="12" cy="9.5" r="2.6" />
      <path d="M12 12.1V15" />
    </svg>
  );
}

/** Head to head: two chevrons converging on a dividing line. Crossed blades
 *  were tried first and at this size read as one broken object rather than
 *  two. */
function SwordsIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M4.5 7.5 9 12l-4.5 4.5" />
      <path d="M19.5 7.5 15 12l4.5 4.5" />
      <path d="M12 4.5v15" />
    </svg>
  );
}

/** Comparison: a balance, which is the question that game asks — which of two
 *  dates the event sits nearer to. */
export function ScalesIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M12 4.5v15M7.5 19.5h9" />
      <path d="M4 8h16M6.5 7.6 4 13h5l-2.5-5.4ZM17.5 7.6 15 13h5l-2.5-5.4Z" />
    </svg>
  );
}

/** Survival: lives, not a heartbeat — the mode is "keep going until you are
 *  out", and a pulse line would have read as health or activity. */
export function HeartIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z" />
    </svg>
  );
}

/** The door to the rest of the board: four panes, which is the board itself
 *  seen small. */
export function GridIcon() {
  return (
    <svg {...CARD_ICON}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M19 12H5M10.5 6.5 5 12l5.5 5.5" />
    </svg>
  );
}

function FootballIcon() {
  return (
    <svg {...CARD_ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7.3 3.6 2.6-1.4 4.3H9.8L8.4 9.9 12 7.3Z" />
      <path d="M12 3v4.3M19.6 9.5l-4 .4M17 19l-2.8-4.8M7 19l2.8-4.8M4.4 9.5l4 .4" />
    </svg>
  );
}

function BasketballIcon() {
  return (
    <svg {...CARD_ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" />
      <path d="M5.6 5.6a12 12 0 0 1 0 12.8M18.4 5.6a12 12 0 0 0 0 12.8" />
    </svg>
  );
}

/** Film and television: a screen with a play head. A clapperboard was tried
 *  first and at this size was indistinguishable from a wallet. */
function ClapperIcon() {
  return (
    <svg {...CARD_ICON}>
      <rect x="3" y="4.5" width="18" height="13" rx="2.5" />
      <path d="M10.4 9.1v3.8l3.4-1.9-3.4-1.9Z" />
      <path d="M8.5 20.5h7" />
    </svg>
  );
}

/** Inventions: a filament bulb, which is the picture on the card seen small —
 *  the one glyph in this set that repeats its own photograph, because every
 *  other drawing of "an invention" is a cog, and a cog is machinery. */
function BulbIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M9 17.2a6 6 0 1 1 6 0v1.3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 18.5v-1.3Z" />
      <path d="M9.6 17.2h4.8" />
    </svg>
  );
}

/** Born when?: a bust rather than a cradle. The question is which year a
 *  person belongs to, and the picture on the card is a statue — a cradle would
 *  have promised babies. */
function PersonIcon() {
  return (
    <svg {...CARD_ICON}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.4 20.4a6.6 6.6 0 0 1 13.2 0" />
    </svg>
  );
}

/** Modes not yet named: a spark rather than a question mark, which would have
 *  read as "we do not know" instead of "more is coming". */
function SparkIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
      <path d="M18.5 16.5 19 18l1.5.5-1.5.5-.5 1.5-.5-1.5L16.5 19l1.5-.5.5-1.5Z" />
    </svg>
  );
}
