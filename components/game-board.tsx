"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
 */
const CARD_HEIGHT = "h-[calc((100cqw-1rem)/2)] md:h-[calc((100cqw-3rem)/4)]";

export function GameBoard({
  t,
  guessCover,
  photos,
}: {
  t: Dict;
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
    <div ref={board} className="@container grid w-full max-w-[var(--board-w)]">
      {/* Six columns rather than four, because the row under the covers is
          three tiles wide now that survival has moved into the other view: a
          cover spans three of them and a tile two, so both rows still end flush
          with the board's edges. The tiles are the wider for it — a third of
          the board at the games cards' height — which is the only shape on the
          board that is not square, and is what lets the two views stay the same
          width as well as the same height. */}
      <BoardView active={view === "play"} swaps={swaps} columns={6}>
        <CoverCard
          title={t.dailyTitle}
          kicker={t.timelineTitle}
          icon={<CalendarIcon />}
          soon={t.comingSoon}
          index={0}
        />
        <CoverCard
          href="/guess"
          title={t.timelineTitle}
          icon={<MarkerIcon />}
          photo={guessCover}
          index={1}
        />
        <BoardCard
          href="/versus"
          title={t.duelTitle}
          kicker={t.timelineTitle}
          icon={<SwordsIcon />}
          photo={photos.versus}
          span="wide"
          index={2}
        />
        <BoardCard
          href="/compare"
          title={t.comparisonTitle}
          icon={<ScalesIcon />}
          photo={photos.compare}
          span="wide"
          index={3}
        />
        {/* Deliberately *not* `outlined`: on this page a dashed edge means a
            card that cannot be used, and both of the cards that swap the board
            are the one live control on the view they sit in.

            `span="full"` rather than `"wide"` only matters under `md`, where
            the grid is two columns and this is the odd third tile: spanning
            both keeps the row flush instead of leaving a half-width hole. At
            six columns it is two of them like its neighbours. */}
        <BoardCard
          onClick={(event) => show("games", event)}
          title={t.otherGamesTitle}
          icon={<GridIcon />}
          photo={photos.other}
          span="full"
          index={4}
        />
      </BoardView>

      <BoardView active={view === "games"} swaps={swaps} columns={4}>
        {/* Survival leads this view rather than the play one. It is a mode that
            is named but not built, which is what everything else in here is —
            and it took one of the three slots that were being held open, so the
            view is still eight cards in two rows. */}
        <BoardCard
          title={t.survivalTitle}
          kicker={t.timelineTitle}
          icon={<HeartIcon />}
          photo={photos.survival}
          soon={t.comingSoon}
          index={0}
        />
        <BoardCard
          title={t.footballTitle}
          kicker={t.timelineTitle}
          icon={<FootballIcon />}
          photo={photos.football}
          soon={t.comingSoon}
          index={1}
        />
        <BoardCard
          title={t.basketballTitle}
          kicker={t.timelineTitle}
          icon={<BasketballIcon />}
          photo={photos.basketball}
          soon={t.comingSoon}
          index={2}
        />
        <BoardCard
          title={t.screenTitle}
          kicker={t.timelineTitle}
          icon={<ClapperIcon />}
          photo={photos.screen}
          soon={t.comingSoon}
          index={3}
        />
        {/* Two slots held open on purpose — there were three before survival
            took one — so the board keeps its shape and the two cards that mean
            something, what is coming and the way back, stay in the corner the
            eye already knows. Empty rather than filled with invented names:
            there is nothing to announce yet. `aria-hidden`, because unlabelled
            stops in a row are noise to a screen reader rather than
            information. */}
        <EmptySlot index={4} />
        <EmptySlot index={5} />
        <BoardCard
          title={t.comingSoonTitle}
          kicker={t.newGamesBlurb}
          icon={<SparkIcon />}
          soon={t.comingSoon}
          outlined
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
  children,
}: {
  active: boolean;
  swaps: number;
  /** Columns above `md`. The two views differ — six for the play view's
   *  three-up row, four for the games view's four-up — but both resolve to the
   *  same card height, so the views stay the same size. */
  columns: 4 | 6;
  children: React.ReactNode;
}) {
  return (
    <div
      data-active={active}
      inert={!active || undefined}
      className="board-view col-start-1 row-start-1 self-center"
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
function CardScrim() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-card via-card/55 to-transparent"
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
 * A cover card: the half-board frame at the top of the board.
 *
 * Its photograph is a function of the date, so the card changes once a day and
 * holds still for the whole of one.
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
  soon,
  index,
}: {
  href?: string;
  title: string;
  kicker?: string;
  icon: React.ReactNode;
  photo?: CoverPhoto;
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
          sizes="(min-width: 1160px) 546px, (min-width: 768px) 47vw, 100vw"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        /* The mesh stands in for the photograph this card does not have yet,
           for the same reason the bento's hero keeps one underneath: a card
           with nothing behind its title reads as a card that failed to load
           rather than as one that is not ready. */
        <div aria-hidden="true" className="board-mesh absolute inset-0" />
      )}

      <CardScrim />

      <span className="relative flex items-start justify-between">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/80 backdrop-blur-md transition-colors group-hover:text-white"
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
        {kicker ? (
          <span className="mb-1 block text-xs uppercase tracking-[0.1em] text-white/70">
            {kicker}
          </span>
        ) : null}
        <h2 className="font-display text-3xl font-semibold leading-none tracking-[-0.02em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-4xl">
          {title}
        </h2>
      </span>
    </>
  );

  /* Half the board wide — three of the play view's six columns plus the gap
     between them — and `CARD_HEIGHT` tall like everything else on it. The
     padding is a notch wider than a `BoardCard`'s, which is the one thing
     about the arrangement that does scale with the card. */
  const shape = `board-card group relative col-span-2 flex ${CARD_HEIGHT} flex-col justify-between overflow-hidden rounded-3xl border border-hairline bg-card p-5 text-left md:col-span-3`;

  if (!href) {
    return (
      <div
        aria-disabled="true"
        style={cardOrder(index)}
        className={`${shape} opacity-80`}
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
 * `outlined` is the one visual variant — a dashed edge and no fill — and it
 * belongs to the card that stands for modes not yet named rather than for a
 * particular one, which is why the two cards that swap the board do not take
 * it: a dashed edge here means a card that cannot be used.
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
 * ready is still `aria-disabled` with its "soon" chip, exactly as the Daily
 * cover is, and it keeps the cover card's `opacity-80` rather than the bare
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
  kicker,
  icon,
  photo,
  soon,
  arrow,
  outlined,
  span,
  index,
}: {
  href?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  title: string;
  kicker?: string;
  icon: React.ReactNode;
  /** A photograph to fill the card with. One URL, no srcset — see
   *  `boardPhotoUrl` for why one width is enough at these sizes, and for which
   *  cards are square in the file and which are cropped. */
  photo?: string;
  soon?: string;
  arrow?: "back";
  outlined?: boolean;
  span?: "wide" | "full";
  index: number;
}) {
  const surface = outlined
    ? "border border-dashed border-hairline"
    : "border border-hairline bg-card";

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
            className="absolute inset-0 h-full w-full object-cover"
          />
          <CardScrim />
        </>
      ) : null}

      <span className="relative flex items-start justify-between">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
            photo
              ? "border border-white/15 bg-white/10 text-white/80 backdrop-blur-md group-hover:text-white"
              : `text-ink-dim group-hover:text-ink ${
                  outlined ? "bg-card/70" : "bg-card-raised"
                }`
          }`}
        >
          {icon}
        </span>

        {/* The corner carries one of three things and never two: the chip on a
            card that is not ready, nothing at all on the way back — whose icon
            is the arrow, and a second one in the corner was the same sign
            twice — and otherwise the arrow that leans on hover. */}
        {soon ? <SoonChip label={soon} onDark={Boolean(photo)} /> : null}
        {!soon && arrow !== "back" ? (
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
        {kicker ? (
          <span
            className={`mb-0.5 block text-xs uppercase tracking-[0.1em] ${
              photo ? "text-white/70" : "text-ink-dim"
            }`}
          >
            {kicker}
          </span>
        ) : null}
        <span
          className={`block text-lg font-semibold leading-tight ${
            photo
              ? "text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]"
              : "text-ink"
          }`}
        >
          {title}
        </span>
      </span>
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
  const shape = `board-card group relative flex ${CARD_HEIGHT} flex-col justify-between overflow-hidden rounded-2xl p-4 text-left ${surface} ${width ?? ""}`;

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
        className={`${shape} ${photo ? "opacity-80" : "opacity-60"}`}
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
    </Link>
  );
}

/** A slot the board keeps open for a game that has not been named yet. */
function EmptySlot({ index }: { index: number }) {
  return (
    <div
      aria-hidden="true"
      style={cardOrder(index)}
      className={`board-card ${CARD_HEIGHT} rounded-2xl border border-dashed border-hairline/50`}
    />
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
   chrome on the page are visibly the same hand. 20px inside a 40px box. */
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
function MarkerIcon() {
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
function ScalesIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M12 4.5v15M7.5 19.5h9" />
      <path d="M4 8h16M6.5 7.6 4 13h5l-2.5-5.4ZM17.5 7.6 15 13h5l-2.5-5.4Z" />
    </svg>
  );
}

/** Survival: lives, not a heartbeat — the mode is "keep going until you are
 *  out", and a pulse line would have read as health or activity. */
function HeartIcon() {
  return (
    <svg {...CARD_ICON}>
      <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z" />
    </svg>
  );
}

/** The door to the rest of the board: four panes, which is the board itself
 *  seen small. */
function GridIcon() {
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
