"use client";

import { useEffect, useRef, useState } from "react";

import { BadgeFrame } from "@/components/badge-frame";
import { ExplorerCoin } from "@/components/explorer-coin";
import {
  GridIcon,
  HeartIcon,
  MarkerIcon,
  ScalesIcon,
} from "@/components/game-board";
import { BADGES, DEFAULT_AVATAR_SRC, type BadgeSlug } from "@/lib/badges";
import type { Dict } from "@/lib/i18n/dictionary";
import type { ExplorerArt, ExplorerImage } from "@/lib/storage/images";

/**
 * The block between the board and the bento: six pills that open one at a time,
 * with the artwork for whichever is open on the stage beside them.
 *
 * It replaced a card of prose on 2026-10-06. The card said what Tempus is in
 * two paragraphs; this says it in six, one per thing there is to know, and only
 * the one being read is on screen. The modes it names are the board's own, so
 * the first screen is the grid of names and this is the same list explained.
 *
 * **Nothing here navigates.** It is a showcase: the pills describe the modes
 * and that is all they do. The board on the first screen is where a game is
 * started from, and a second set of Play buttons a scroll below it was two
 * doors into one room. Removing them is also what made the panels short enough
 * for the column below.
 *
 * **It opens closed, and the closing is a real state.** With nothing open the
 * pills are collapsed, the stage turns a 3D coin on nothing, and neither the
 * stepper nor the close button is on screen — opening one brings both. That
 * shape is the point of the pattern: the list reads as a list until you ask it
 * something.
 *
 * Six things hold the layout up:
 *
 * - **The stage's height is the pill column's**, fixed at `md:h-[39rem]`, so
 *   opening a different item cannot resize the block. The column is centred
 *   inside that box and clipped, so the height has to clear the *worst* case in
 *   every language, not the English one: five closed pills at 60px plus the
 *   achievements panel, which is the only one carrying a swatch row under its
 *   body. Measured across all five locales after the pills were enlarged on
 *   2026-10-06 — en 568, tr 568, es 568, de 592, fr 592 — so 624 is the worst
 *   case plus 32px. Lengthen a body, enlarge the type or narrow the column and
 *   re-measure: the failure is silent, a line clipped off each end of the list.
 * - **A pill's closed width is measured, not guessed.** `width` interpolates
 *   between a length and a percentage, but not out of `fit-content`, so a pill
 *   that hugs its label cannot animate open on its own. A hidden twin of the
 *   closed pill sits behind each row and is measured instead — including after
 *   the webfonts land, since a width taken against the fallback face is a pill
 *   that jumps.
 * - **The body is laid out at the open width throughout**, which is the second
 *   measurement. A paragraph inside a box whose width is animating re-wraps on
 *   every frame, so the text visibly shuffles a word onto the next line as the
 *   pill grows; pinning it means the lines are decided once and the shell just
 *   uncovers them.
 * - **The stepper is a rail to the left of the pills**, which is a column of
 *   the grid rather than something floated over the card's padding: the pills
 *   must not move when it appears, and a 36px control does not fit in 32px of
 *   padding. It is `hidden` under `md`, where six pills are one thumb-reach
 *   apart and a stepper is chrome.
 * - **The stage crossfades the way the game's backdrop does**: the layer being
 *   left is held at full opacity underneath while the incoming one fades in on
 *   top. Fading both at once puts the card colour between them for the length
 *   of the dissolve. **Every layer is opaque** (`bg-page`) for the same reason —
 *   two of the seven are not full-bleed pictures.
 * - **The body of a closed pill is `inert`.** It is collapsed to zero height by
 *   a grid row rather than unmounted — that is what makes the height animate —
 *   so the achievements swatches inside one would otherwise still be tabbable
 *   behind a pill that reads as shut.
 * - **Reduced motion needs `!important`**, which is the only place on the site
 *   that does: every duration here is set inline from `FADE_MS`, and an inline
 *   style outranks a media query. `.explorer-motion` marks those elements; the
 *   rule lives in `app/globals.css`. The coin stops turning under that setting
 *   and stands still — see `components/explorer-coin.tsx`, which reads the
 *   query itself because its motion is a render loop rather than a transition.
 */

/** Long enough to read as a dissolve rather than a cut, short enough that
 *  pressing down the list does not feel like waiting. Matches the pill's own
 *  width and height transitions, so the whole block moves as one thing.
 *
 *  It was 520ms until 2026-10-06 and read as a snap rather than an opening:
 *  the pill has two geometry changes to make and at half a second the eye
 *  arrives after both have finished. One constant for all of it is what keeps
 *  the shell, the body and the stage moving as a single gesture — splitting it
 *  per element is what makes an opening look like three things happening. */
const FADE_MS = 780;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** The three ranks the achievements pill lets you try on. The ladder has four,
 *  but diamond is the one you are least likely to have seen and makes a poor
 *  default row of three. */
const PREVIEW_RANKS: readonly BadgeSlug[] = ["bronze", "silver", "gold"];

/**
 * The swatches are metal, which is the one place chroma re-enters an otherwise
 * neutral page — the same exception the bento's amber sun is. A grey circle for
 * gold would not be restraint, it would be wrong: the artwork these stand for
 * is bronze, silver and gold, and the swatch's whole job is to say which one is
 * about to appear.
 */
const RANK_SWATCH: Record<string, string> = {
  bronze: "linear-gradient(145deg, #d09355 0%, #8a5529 55%, #5d3717 100%)",
  silver: "linear-gradient(145deg, #f1f1f1 0%, #b4b4b4 55%, #7c7c7c 100%)",
  gold: "linear-gradient(145deg, #f7d978 0%, #c99a2c 55%, #8e6714 100%)",
};

type ItemId = "guess" | "compare" | "survival" | "other" | "badges" | "library";

/** The six panels plus the coin that stands in for all of them when the list is
 *  closed. `idle` is a stage layer like any other, which is what lets closing
 *  the panel be the same crossfade as switching between two. */
type StageId = ItemId | "idle";

type Item = {
  id: ItemId;
  titleKey: keyof Dict;
  bodyKey: keyof Dict;
  icon: React.ReactNode;
};

/**
 * Reading order is the order of the board above: the game that exists, the
 * game beside it, the two that are named but not built, then the two things
 * that are about the whole site rather than about one mode.
 *
 * Five of the six titles are the board's and the achievements page's own keys.
 * Only the library needs a title written for it, because it is not a mode and
 * nothing else on the site names it.
 */
const ITEMS: readonly Item[] = [
  {
    id: "guess",
    titleKey: "timelineTitle",
    bodyKey: "explorerGuessBody",
    icon: <MarkerIcon />,
  },
  {
    id: "compare",
    titleKey: "comparisonTitle",
    bodyKey: "explorerCompareBody",
    icon: <ScalesIcon />,
  },
  {
    id: "survival",
    titleKey: "survivalTitle",
    bodyKey: "explorerSurvivalBody",
    icon: <HeartIcon />,
  },
  {
    id: "other",
    titleKey: "otherGamesTitle",
    bodyKey: "explorerOtherBody",
    icon: <GridIcon />,
  },
  {
    id: "badges",
    titleKey: "achievementsTitle",
    bodyKey: "explorerBadgesBody",
    icon: <MedalIcon />,
  },
  {
    id: "library",
    titleKey: "explorerLibraryTitle",
    bodyKey: "explorerLibraryBody",
    icon: <ShelfIcon />,
  },
];

/**
 * What the library panel states about itself.
 *
 * **The event count is not in here, and that is deliberate.** It used to be:
 * the home page read the live count of published, illustrated rows and this
 * panel printed it. The tile says `explorerStatEventsValue` — a round claim
 * about the library rather than a measurement of it — which was asked for, and
 * which is why the home page now makes no database read at all. Putting a
 * number back means putting the read back with it; it must not be reintroduced
 * as a hard-coded one, since a figure nobody checks is the thing the read was
 * there to prevent.
 */
export type ExplorerStats = {
  languages: number;
};

export function HomeExplorer({
  t,
  locale,
  art,
  model,
  stats,
}: {
  t: Dict;
  /** For `Intl.NumberFormat` on the one number on the stage. */
  locale: string;
  art: Record<ExplorerArt, ExplorerImage>;
  /** The coin the stage shows while the list is closed — a GLB's public URL. */
  model: string;
  stats: ExplorerStats;
}) {
  const [open, setOpen] = useState<ItemId | null>(null);
  const [rank, setRank] = useState<BadgeSlug>("gold");

  const stage: StageId = open ?? "idle";

  /* The item the phone's detail block is showing. It lags `open` by design:
     on close it has to keep the body that is collapsing, or the text would
     vanish on the first frame of a 780ms animation and leave an empty box
     closing. Derived during render for the reason `shown` below is — an effect
     would paint one frame of the wrong thing first. */
  const opened = ITEMS.find((item) => item.id === open) ?? null;
  const [detail, setDetail] = useState<Item | null>(null);
  if (opened && opened !== detail) setDetail(opened);

  /* The layer held opaque under the dissolve, derived during render rather
     than in an effect so the incoming layer is never painted once with the
     card colour behind it. Same arrangement as components/timeline-backdrop. */
  const [shown, setShown] = useState<{
    active: StageId;
    leaving: StageId | null;
  }>({ active: "idle", leaving: null });
  if (shown.active !== stage) setShown({ active: stage, leaving: shown.active });

  /* **The outgoing layer has to be let go of once the dissolve is over**, or
     the next dissolve *onto* it is a cut. `leaving` holds a layer at full
     opacity under the one arriving, which is what stops the card colour showing
     between them — but it used to stay set until the stage changed again, so
     any layer you came back to was still sitting at opacity 1 and simply took
     the z-index. Closing a panel was the obvious case (the coin reappeared
     instantly) and going back to a pill you had just looked at was the same
     bug. Releasing it after `FADE_MS` drops it to 0 underneath a layer that is
     by then fully opaque, so nothing is visible on the way down and it is ready
     to fade in next time. */
  useEffect(() => {
    if (shown.leaving === null) return;
    const timer = window.setTimeout(
      () => setShown((current) => ({ active: current.active, leaving: null })),
      FADE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shown.leaving]);

  /** Wraps, because six pills in a ring is one key-press from either end to the
   *  other and there is nothing at the ends to stop at. Only reachable while
   *  something is open, which is the only state the rail is shown in. */
  function step(delta: number) {
    if (!open) return;
    const index = ITEMS.findIndex((item) => item.id === open);
    setOpen(ITEMS[(index + delta + ITEMS.length) % ITEMS.length]!.id);
  }

  return (
    /* `@container` is what makes the pill column shrink with the page rather
       than holding 21rem while the stage beside it collapses — see the grid
       below. The padding comes in with it: the distance from the card's edge
       is part of the same scale, and 32px of it on a 768px screen is a tenth
       of the width spent on nothing. */
    <section className="@container overflow-hidden rounded-card border border-hairline bg-card p-4 sm:p-6 lg:p-8">
      {/* The card carried a `Tempus` heading and a line of blurb above this row
          until 2026-10-06; both were removed on request and nothing replaced
          them *inside* the card. The block's heading is above it now, outside
          the card, the way the bento's is — see app/(public)/page.tsx. The row
          stays because the close button still needs somewhere to sit, and it
          keeps `justify-end` rather than collapsing to nothing so the button
          lands in the same corner it always did. */}
      <div className="flex items-start justify-end gap-6">

        {/* Only once there is something to close. Kept mounted and `inert`
            rather than unmounted so it has a frame to fade in and out on,
            which is the same arrangement the site menu's panel uses. */}
        <RoundButton
          label={t.explorerClose}
          onClick={() => setOpen(null)}
          shown={open !== null}
          className="shrink-0"
        >
          <CloseIcon />
        </RoundButton>
      </div>

      {/* **The pill column is a fraction of the card, not a fixed 21rem.** It
          held that width from `md` all the way up, so every pixel the page
          lost between the cap and 768 came out of the stage alone: the coin
          went from a 631px box to a 244px one while the list beside it did not
          move. `32.2cqw` is the width that reproduces 21rem (and the stage's
          documented 631px) at the cap, so nothing about the board's own width
          changes; below it the list gives ground at the same rate as
          everything else, and 14rem is the floor where the bodies stop being
          worth reading. The gaps and the card's padding come down with it.

          **The box gets taller as the column narrows**, which is the other half
          of the same trade: the list is clipped rather than scrolled, and a
          narrower column wraps the open body onto more lines. The two ends of
          `clamp` are measured, not chosen — 39rem is what the 21rem column
          needs at the cap and 45rem is what the 14rem column needs at 768, in
          both cases the worst of the five languages (the achievements panel in
          German and in French) plus the same ~32px of cushion the fixed height
          always carried. Between them the height falls at 26.3px per 100px of
          card, which is the line through those two points, so there is no step
          anywhere in the range.
          Lengthen a body or enlarge the type and both ends have to be
          re-measured: the failure is silent, a line clipped off each end of the
          list. */}
      <div className="mt-3 grid gap-3 md:mt-5 md:gap-6 md:h-[clamp(39rem,898px_-_26.3cqw,45rem)] md:grid-cols-[auto_minmax(0,clamp(14rem,32.2cqw,21rem))_minmax(0,1fr)] md:gap-x-4 md:gap-y-0 lg:gap-x-5">
        {/* The stepper's rail. A column of the grid rather than something laid
            over the card's padding: the pills must not shift when it arrives,
            and 36px of button does not fit in 32px of padding. Gone entirely
            under `md`, where the whole list is within reach anyway. */}
        <div className="hidden flex-col justify-center gap-2 md:flex">
          <RoundButton
            label={t.explorerPrev}
            onClick={() => step(-1)}
            shown={open !== null}
          >
            <ChevronIcon up />
          </RoundButton>
          <RoundButton
            label={t.explorerNext}
            onClick={() => step(1)}
            shown={open !== null}
          >
            <ChevronIcon />
          </RoundButton>
        </div>

        {/* Three across and two down on a phone, a column from `md`.
            Six pills stacked vertically were 420px of list above the stage —
            the coin started below the fold on every phone — and each one was a
            60px bar holding a 30px chip and two words. As a 3x2 grid they are
            half the height and an easier target.

            **On a phone the grid never moves.** The open pill used to take
            `order-first col-span-3`, so pressing one re-laid the whole grid in
            a single frame: the pressed cell jumped to the top left, the other
            five re-flowed around it, and the stage below was pushed down by
            the body that had just opened inside it. None of that is
            animatable — `order` and `grid-column` do not interpolate — so the
            one gesture on the block that is meant to be a slow dissolve was
            the only one that was a jump cut. The body now opens *under* the
            grid instead (see `MobileDetail`), which leaves every cell where
            the thumb found it and makes the opening the same crossfade the
            desktop layout has.

            From `md` it is the column it was: centred in a box of fixed height
            and clipped, so a longer body pushes the pills apart around the
            middle instead of growing the block. */}
        <ul className="grid grid-cols-3 gap-2 md:flex md:flex-col md:justify-center md:gap-3 md:overflow-hidden">
          {ITEMS.map((item) => (
            <Pill
              key={item.id}
              item={item}
              t={t}
              open={item.id === open}
              /* Pressing the open pill closes it, which is the second way back
                 to the coin and the one that is under the pointer already. */
              onToggle={() =>
                setOpen((current) => (current === item.id ? null : item.id))
              }
              extra={
                item.id === "badges" ? (
                  <RankSwatches t={t} rank={rank} onPick={setRank} />
                ) : null
              }
            />
          ))}
        </ul>

        {/* The open panel's words, on a phone. A grid row of its own between
            the pills and the stage, and `display: none` from `md` — where the
            same text is inside the pill that opened it, laid out at the pill's
            own open width. */}
        <MobileDetail t={t} item={detail} open={open !== null} rank={rank} onPickRank={setRank} />

        {/* Under `md` the stage is a block of its own under the pills, so it
            needs a shape; above, it takes the column's fixed height. The floor
            is what the panels that are *not* one photograph need — three
            stacked statistics want more than 4:3 gives them on a phone.

            **The frame belongs to the panels, not to the coin**, so it is
            painted only while one of the six is open. A plate of pure black
            inside a `bg-card` section reads as a card, which is right for a
            photograph — it is the mount the picture hangs in — and wrong for
            the idle state, where the whole point is an object sitting on
            nothing. It fades with the panel it belongs to over `FADE_MS`
            rather than switching, or the border would snap in a frame ahead of
            the artwork it frames. */}
        <div
          /* **`w-full` is load-bearing below `md`.** With only `aspect-[4/3]`
             and a `min-h`, the box took its *width* from its height — a grid
             item with a preferred ratio and a definite height is not stretched
             in the other axis — so it came out 424px wide inside a 277px card
             and every panel's right-hand side was cut off by the section's own
             `overflow-hidden`. Pinning the width makes the ratio set the
             height, the floor raise it, and the picture end where the card
             does. */
          /* The floor was `20rem` while the panels that are not one
             photograph needed it — three stacked statistics and three stacked
             subject squares. Both are three-across on a phone now, so the
             ratio alone is enough and 13rem is only a guard for the narrowest
             screens. It is 100px of height given back, which is what lets the
             pills and the picture be on the same screen. */
          className={`explorer-motion relative aspect-[4/3] w-full min-h-[13rem] overflow-hidden rounded-[22px] border transition-colors ease-out md:aspect-auto md:h-full md:min-h-0 ${
            open === null ? "border-transparent bg-transparent" : "border-hairline bg-page"
          }`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        >
          {(["idle", ...ITEMS.map((item) => item.id)] as StageId[]).map((id) => {
            const isActive = id === shown.active;
            const isLeaving = id === shown.leaving;
            const item = ITEMS.find((candidate) => candidate.id === id);

            return (
              <div
                key={id}
                id={`explorer-stage-${id}`}
                aria-hidden={!isActive}
                inert={!isActive}
                /* Every layer is opaque, or the one being left shows through
                   the one arriving — but the coin's is opaque in the *card's*
                   colour, which is what makes it read as no plate at all while
                   still covering the panel it replaced. */
                className={`explorer-motion absolute inset-0 transition-opacity ease-out ${
                  item ? "bg-page" : "bg-card"
                }`}
                style={{
                  opacity: isActive || isLeaving ? 1 : 0,
                  // The only ordering that matters: incoming above outgoing.
                  zIndex: isActive ? 2 : isLeaving ? 1 : 0,
                  transitionDuration: `${FADE_MS}ms`,
                }}
              >
                {item ? (
                  <Stage
                    item={item}
                    t={t}
                    locale={locale}
                    art={art}
                    stats={stats}
                    rank={rank}
                    active={isActive}
                  />
                ) : (
                  <ExplorerCoin
                    src={model}
                    playing={isActive}
                    fadeMs={FADE_MS}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   The pills
   --------------------------------------------------------------------------- */

/** Shared by the pill and by the hidden twin that is measured in its place, so
 *  the two cannot drift and the measurement stays the real closed width. The
 *  padding is separate because the pill itself carries none — its head and its
 *  body are padded individually, which is what lets the body collapse to
 *  nothing without leaving the shell's own padding behind as a gap.
 *
 *  **The radius is half a closed pill's height, which makes it a stadium**, and
 *  it is one number rather than a pair because the pattern this is drawn from
 *  holds its radius constant: the same corner that reads as a stadium on a
 *  60px pill reads as a generously rounded panel once the body is open. It was
 *  22px until 2026-10-06, which rounded neither shape enough. Change the pill's
 *  padding or type size and this has to follow, or the closed shape stops being
 *  a stadium and starts being a rounded rectangle that is nearly one. */
const PILL_SHELL = "rounded-[30px] border border-hairline bg-card-raised";
const PILL_PAD = "px-5 py-3.5";
const PILL_HEAD = "flex items-center gap-3 text-base font-semibold text-ink";

/** What a pill wears below `md`, where it is one cell of a 3x2 grid rather
 *  than a bar across a column.
 *
 *  A phone's cell is about 87px wide, which is not enough for a 26px chip, two
 *  words and 40px of padding on one line — so the chip goes above the label and
 *  the label is allowed to wrap. `break-words` is for the one case that still
 *  does not fit at 10px: German's "Ereignisbibliothek", which has no space in
 *  it to break at. The type comes up a step at `sm`, where a cell is nearly
 *  200px and a 10px label in the middle of one reads as a caption that has
 *  lost its picture.
 *
 *  **It is what a pill wears whether or not it is open**, which is new: the
 *  open pill used to switch to the `md` row layout at every width, so on a
 *  phone it was a 30px chip and a left-aligned label inside a third of the
 *  card. The body is no longer inside the pill down there (see `MobileDetail`),
 *  so there is nothing for the row layout to be the head of.
 *
 *  The type and the padding came down a step on 2026-10-11, asked for, and the
 *  two are the same saving: 10px of label over a 26px chip is a 56px cell
 *  against the 86px it was, and six of those are 60px of height the picture
 *  below them gets back.
 *
 *  From `md` every one of these is overridden back to the row the open pill
 *  and the measured twin both use, so the two states agree at exactly one
 *  breakpoint — which is what lets the twin be measured against one layout
 *  rather than two. */
const PILL_HEAD_COMPACT =
  "flex h-full flex-col items-center justify-center gap-1 px-1 py-2.5 text-center text-[10px] font-semibold leading-tight text-ink sm:gap-1.5 sm:py-3 sm:text-[12px] md:h-auto md:flex-row md:items-center md:justify-start md:gap-3 md:px-5 md:py-3.5 md:text-left md:text-base md:leading-normal";

/** The shell's left and right border, which the body's laid-out width has to
 *  come off (see `openWidth`): the pill is `border-box` at 100% of its row, so
 *  its content box is the row less these two pixels. */
const PILL_BORDER = 2;

function Pill({
  item,
  t,
  open,
  onToggle,
  extra,
}: {
  item: Item;
  t: Dict;
  open: boolean;
  onToggle: () => void;
  extra: React.ReactNode;
}) {
  const title = t[item.titleKey];
  const ghost = useRef<HTMLSpanElement>(null);
  const row = useRef<HTMLLIElement>(null);
  const [closedWidth, setClosedWidth] = useState<number | null>(null);
  const [openWidth, setOpenWidth] = useState<number | null>(null);

  useEffect(() => {
    const node = ghost.current;
    if (!node) return;

    /* Ceiling plus a pixel, not `offsetWidth`. The twin's natural width is
       fractional — 117.05px for "Survival" here — and `offsetWidth` rounds it
       down, which leaves the label five hundredths of a pixel short of what it
       needs; `truncate` answers that by eating four characters. Overshooting by
       a pixel is invisible and cannot do it. */
    const measure = () =>
      setClosedWidth(Math.ceil(node.getBoundingClientRect().width) + 1);

    /* Watched rather than measured once. Lato arrives after the first paint and
       the twin gets wider when it does, and `document.fonts.ready` is no help:
       it resolves against whatever is pending *at the moment it is read*, so on
       a warm cache it had already resolved and the pills kept the fallback
       face's width — four characters short, with an ellipsis where the rest of
       the word should be. An observer catches the swap, a page zoom and a new
       locale with one mechanism. */
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [title]);

  /* The width the body is *laid out* at, which is the open width and not the
     animating one.

     The shell's width goes from the closed measurement to 100% over FADE_MS, and
     a paragraph inside a box that is getting wider re-wraps on every frame of
     it: the text arrives on one line, then drops a word to the next, then
     another — which reads as the panel correcting itself rather than opening.
     Pinning the body to its final width means the lines are decided once and
     the shell simply uncovers them, since the shell is the one clipping.

     Measured off the row rather than the shell, because the shell is the thing
     in motion. The row is the grid column's full width; the shell is 100% of it
     in `border-box`, so the content box is that less its two borders. */
  useEffect(() => {
    const node = row.current;
    if (!node) return;

    const measure = () =>
      setOpenWidth(Math.floor(node.getBoundingClientRect().width) - PILL_BORDER);

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    /* Nothing about `open` touches this element. The open pill used to be
       dealt first and span the phone's three columns, which re-laid the grid
       in one frame — see the note on the `ul` in `HomeExplorer`. */
    <li ref={row} className="relative">
      {/* The twin. Same shell and same head, `w-max` so it reports the width the
          pill would have if it hugged its label — border included, which is why
          it carries the shell's classes rather than a copy of its padding. */}
      <span
        ref={ghost}
        aria-hidden
        className={`pointer-events-none invisible absolute left-0 top-0 w-max whitespace-nowrap ${PILL_SHELL} ${PILL_PAD} ${PILL_HEAD}`}
      >
        <IconChip open={false}>{item.icon}</IconChip>
        {title}
      </span>

      <div
        /* The measured width is only ever the `md` layout's: below it a pill
           fills its grid cell, and a cell is the one thing already sized for
           it. The number travels as a custom property rather than as `width`
           itself, because an inline style cannot be made to stop at a
           breakpoint and a Tailwind class can. */
        className={`explorer-motion h-full w-full max-w-full overflow-hidden ${PILL_SHELL} transition-[width] md:h-auto md:w-[var(--pill-w)]`}
        style={
          {
            // `max-content` only before the twin has been measured, and on the
            // paint a browser with JavaScript off keeps: it is the right width,
            // it simply cannot be interpolated out of.
            "--pill-w": open
              ? "100%"
              : closedWidth
                ? `${closedWidth}px`
                : "max-content",
            transitionDuration: `${FADE_MS}ms`,
            transitionTimingFunction: EASE,
          } as React.CSSProperties
        }
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`explorer-stage-${item.id}`}
          /* The hover is a *brighter* fill, not the dimmed one this carried
             until 2026-10-06. Dimming reads as a control going away under the
             pointer; one step up the palette (`card-raised` -> `hairline`,
             which is the same proportional step the reference makes from
             #191919 to #202022) reads as it coming forward. It is on the
             button rather than on the shell because the shell's own transition
             is the opening, whose duration is `FADE_MS` — a fill that took the
             best part of a second to arrive would not read as a response to the
             pointer at all. The shell clips it to the stadium, and a closed
             pill's body is zero-height, so the button *is* the whole of what
             you see. There is deliberately no scale: the reference's pill does
             not move, measured identical to the pixel across a hover. */
          className={`w-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${PILL_HEAD_COMPACT} ${
            open
              ? /* The fill is the only thing that marks the open pill on a
                   phone, now that it no longer changes shape or place: the
                   chip's plus has turned into the mode's icon, which is the
                   other half of it. From `md` the pill opens into a panel and
                   the fill would be a panel in a second colour, so it is
                   dropped there. */
                "bg-hairline md:bg-transparent"
              : "hover:bg-hairline"
          }`}
        >
          <IconChip open={open}>{item.icon}</IconChip>
          {/* Wrapping is the compact tile's whole point — there is a second
              line to grow into and nothing below it to push — and truncation
              is the row's, where a long name in one of five languages would
              otherwise set the closed pill's width. */}
          <span className="w-full break-words md:w-auto md:truncate">
            {title}
          </span>
        </button>

        {/* `0fr` -> `1fr` is the whole height animation. The child must own the
            `overflow-hidden` or the text spills out of the collapsed row.

            **`md` and up only.** On a phone the pill is a third of the card
            wide and this paragraph has nowhere to be; `MobileDetail` carries
            it in a full-width block under the grid instead. `display: none`
            rather than a second copy of the markup, so the text is in the
            document exactly once at every width. */}
        <div
          className="explorer-motion hidden transition-[grid-template-rows] md:grid"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            transitionDuration: `${FADE_MS}ms`,
            transitionTimingFunction: EASE,
          }}
          inert={!open}
        >
          <div className="overflow-hidden">
            <div
              /* Pinned from `md` only. Below it the shell's width does not
                 animate — a pill fills its cell, and opening one changes the
                 cell rather than the box inside it — so there is no re-wrap to
                 head off, and the measured number would be a third of the row
                 for as long as it took the observer to catch the span. */
              className="explorer-motion w-auto px-5 pb-4 transition-opacity md:w-[var(--pill-body-w)]"
              style={
                {
                  // `auto` until the row has been measured, which is the one
                  // paint where re-wrapping cannot be seen anyway: nothing is
                  // open.
                  "--pill-body-w": openWidth ? `${openWidth}px` : "auto",
                  opacity: open ? 1 : 0,
                  transitionDuration: `${open ? FADE_MS : FADE_MS / 2}ms`,
                } as React.CSSProperties
              }
            >
              <p className="text-[15px] leading-relaxed text-ink-dim">
                {t[item.bodyKey]}
              </p>

              {extra}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * The open panel's words on a phone, in a block of their own under the pill
 * grid.
 *
 * It exists because the pill grid must not move. Below `md` a pill is a third
 * of the card and the body it opens cannot be inside it, so the body used to
 * be bought with `order-first col-span-3` on the pill — a re-layout of the
 * whole grid in one frame, with the picture below shoved down by however tall
 * the paragraph turned out to be. This takes the opposite trade: the grid is
 * fixed, and the one thing that changes height is a row that was already
 * between the pills and the stage.
 *
 * **It animates exactly like the pill body it replaces** — `0fr` -> `1fr` on a
 * grid row, the same `FADE_MS` and the same easing — which is the whole point:
 * the phone and the desktop now open with one gesture rather than two, and the
 * stage's crossfade underneath is running on the same clock.
 *
 * `item` lags `open` on the way out (see `detail` in `HomeExplorer`), so the
 * text being collapsed is the text that was being read. It is only ever null
 * before the first pill is opened, where the block has never been seen.
 *
 * `inert` while closed, for the reason every collapsed body on this site is:
 * the achievement swatches inside one are buttons, and a zero-height row does
 * not take them out of the tab order.
 */
function MobileDetail({
  t,
  item,
  open,
  rank,
  onPickRank,
}: {
  t: Dict;
  item: Item | null;
  open: boolean;
  rank: BadgeSlug;
  onPickRank: (next: BadgeSlug) => void;
}) {
  return (
    <div
      className="explorer-motion grid transition-[grid-template-rows] md:hidden"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        transitionDuration: `${FADE_MS}ms`,
        transitionTimingFunction: EASE,
      }}
      inert={!open}
    >
      <div className="overflow-hidden">
        <div
          /* The pill's own surface and hairline, at a radius that suits a
             block the width of the card: `PILL_SHELL`'s 30px is half a closed
             pill's height and reads as a stadium on one, as a lozenge on
             this. */
          className="explorer-motion rounded-[20px] border border-hairline bg-card-raised px-4 py-3.5 transition-opacity"
          style={{
            opacity: open ? 1 : 0,
            transitionDuration: `${open ? FADE_MS : FADE_MS / 2}ms`,
          }}
        >
          <p className="text-[14px] leading-relaxed text-ink-dim">
            {item ? t[item.bodyKey] : ""}
          </p>

          {item?.id === "badges" ? (
            <RankSwatches t={t} rank={rank} onPick={onPickRank} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The ring with the plus in it. Open collapses the upright stroke rather than
 * swapping the glyph for a minus: one line leaving is a mark that changed its
 * mind, two glyphs crossfading is a mark that was replaced.
 */
function IconChip({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    /* 26px on a phone and 30px from `md`. The smaller one is part of the same
       saving the compact head's type is: it is the tallest thing in a cell
       that is now 56px high. The `md` size is what the measured twin reports,
       so the pill widths above that breakpoint are untouched. */
    <span className="relative grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border border-ink/35 text-ink md:h-[30px] md:w-[30px]">
      {/* The mode's own icon, which is what the chip holds once it is open —
          the plus has said all it has to say by then. */}
      <span
        className="explorer-motion absolute inset-0 grid place-items-center transition-opacity"
        style={{
          opacity: open ? 1 : 0,
          transitionDuration: `${FADE_MS / 2}ms`,
        }}
      >
        {/* The board's icons are drawn for a 40px chip and are 20px inside it;
            here the chip is 30px, so the glyph is scaled to 18 rather than the
            strokes re-weighted — the line stays what it is everywhere else on
            the page. It was 22px and 0.58 for an afternoon, and at 11.6px a
            marker on a ruler is a smudge rather than a drawing. */}
        <span className="scale-[0.78] md:scale-[0.9]">{children}</span>
      </span>

      <svg
        viewBox="0 0 12 12"
        aria-hidden
        className="explorer-motion h-3.5 w-3.5 transition-opacity md:h-4 md:w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        style={{ opacity: open ? 0 : 1, transitionDuration: `${FADE_MS / 2}ms` }}
      >
        <path d="M2 6h8" />
        <path d="M6 2v8" />
      </svg>
    </span>
  );
}

function RankSwatches({
  t,
  rank,
  onPick,
}: {
  t: Dict;
  rank: BadgeSlug;
  onPick: (next: BadgeSlug) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className="sr-only" id="explorer-rank-label">
        {t.explorerBadgesPick}
      </span>
      {/* Toggle buttons rather than a `radiogroup`: a radio group owes its
          users arrow-key roving, and three swatches inside a panel that the
          arrow keys are not otherwise used in is not worth a second key
          handler. `aria-pressed` says the same thing honestly. */}
      <div
        role="group"
        aria-labelledby="explorer-rank-label"
        className="flex items-center gap-2.5"
      >
        {PREVIEW_RANKS.map((slug) => {
          const badge = BADGES.find((candidate) => candidate.slug === slug)!;
          const selected = slug === rank;

          return (
            <button
              key={slug}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(slug)}
              title={t[badge.nameKey]}
              className={`h-[22px] w-[22px] rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected
                  ? "ring-2 ring-ink ring-offset-2 ring-offset-card-raised"
                  : "opacity-70 hover:opacity-100"
              }`}
              style={{ backgroundImage: RANK_SWATCH[slug] }}
            >
              <span className="sr-only">{t[badge.nameKey]}</span>
            </button>
          );
        })}
      </div>

      <span className="text-sm text-ink-dim">
        {t[BADGES.find((badge) => badge.slug === rank)!.nameKey]}
      </span>
    </div>
  );
}

/**
 * The three controls that only exist while a panel is open: the two steppers on
 * the rail and the close at the top right.
 *
 * `shown` fades rather than unmounts, for the reason the site menu's panel is
 * always mounted — an element that unmounts has no frame to leave on — and it
 * carries `inert` as well as `pointer-events-none`, because an invisible button
 * that is still tabbable is worse than a visible one.
 */
function RoundButton({
  label,
  onClick,
  shown,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  shown: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      inert={!shown}
      className={`explorer-motion grid h-9 w-9 place-items-center rounded-full border border-hairline bg-card-raised text-ink transition-[opacity,transform] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "scale(0.8)",
        transitionDuration: `${FADE_MS / 2}ms`,
        transitionTimingFunction: EASE,
      }}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   The stage
   --------------------------------------------------------------------------- */

/** The ring never grows past this, however much stage there is: at 150 the
 *  tallest frame is 314px, which is already the largest a badge reads as one
 *  object rather than as wallpaper. */
const MAX_STAGE_AVATAR = 150;

/** Height the badge's two lines of caption take out of the stage before the
 *  ring is fitted into what is left. */
const STAGE_BADGE_CAPTION = 56;

/** What the stage is at the cap — `--board-w` (1108.8px) less the card's `p-8`,
 *  the stepper rail, the 21rem pill column and the two 1.25rem gaps, measured at
 *  631px — then what it is between `md` and there, and on a phone, where it is
 *  the card's full inner width. */
const STAGE_SIZES =
  "(min-width: 1160px) 631px, (min-width: 768px) 60vw, calc(100vw - 4.5rem)";

function Stage({
  item,
  t,
  locale,
  art,
  stats,
  rank,
  active,
}: {
  item: Item;
  t: Dict;
  locale: string;
  art: Record<ExplorerArt, ExplorerImage>;
  stats: ExplorerStats;
  rank: BadgeSlug;
  active: boolean;
}) {
  switch (item.id) {
    case "guess":
      return <StagePhoto image={art.guess} active={active} />;
    case "compare":
      return <StagePhoto image={art.compare} active={active} />;
    case "survival":
      return <StagePhoto image={art.survival} active={active} />;
    case "other":
      return <StageSubjects t={t} art={art} active={active} />;
    case "badges":
      return <StageBadge t={t} rank={rank} active={active} />;
    case "library":
      return (
        <StageLibrary
          t={t}
          locale={locale}
          art={art}
          stats={stats}
          active={active}
        />
      );
  }
}

/**
 * A photograph filling the stage, resting slightly scaled up while it is off
 * and settling as it arrives — the same parallax the game's backdrop has, for
 * the same reason: a layer that only changes opacity reads as a slideshow.
 */
function StagePhoto({
  image,
  active,
}: {
  image: ExplorerImage;
  active: boolean;
}) {
  return (
    <>
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={STAGE_SIZES}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        className="explorer-motion h-full w-full object-cover transition-transform ease-out"
        style={{
          transform: active ? "scale(1)" : "scale(1.06)",
          transitionDuration: `${FADE_MS * 2}ms`,
        }}
      />
      {/* The corners of a busy photograph stop competing with the pills beside
          it. Nothing is printed over these, so it is a vignette rather than the
          game's heavier top-and-bottom scrim. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(118% 88% at 50% 46%, transparent 38%, rgba(0,0,0,0.42) 100%)",
        }}
      />
    </>
  );
}

/** The three subjects the games view names, as three square photographs — the
 *  one panel that is a set rather than a single picture, because the mode it
 *  stands for is itself a set. */
function StageSubjects({
  t,
  art,
  active,
}: {
  t: Dict;
  art: Record<ExplorerArt, ExplorerImage>;
  active: boolean;
}) {
  const subjects = [
    { key: "football" as const, label: t.footballTitle },
    { key: "basketball" as const, label: t.basketballTitle },
    { key: "screen" as const, label: t.screenTitle },
  ];

  return (
    /* A triptych filling the stage rather than three squares floating in the
       middle of it. The stage is nearly 5:4 and three squares across can only
       ever be a third of its width — at the cap that left them 196px tall in a
       544px box, which read as three thumbnails that had failed to load at
       full size. Tall panels use the whole plate and are what the three
       pictures can take: all three are centred compositions, and the football
       master was a portrait phone shot before it was cropped square. */
    <div className="grid h-full grid-cols-3 grid-rows-1 gap-2 p-3 sm:gap-3.5 sm:p-5">
      {subjects.map((subject, i) => (
        <figure
          key={subject.key}
          className={`relative h-full overflow-hidden rounded-2xl border border-hairline ${
            active ? "explorer-tile-in" : ""
          }`}
          style={{ "--tile-i": i } as React.CSSProperties}
        >
          <img
            src={art[subject.key].src}
            /* No `sizes`: these are stored at one width. A panel is a third of
               the stage — 221 CSS px at the cap — so the 512px square they were
               cut at is still better than 2x. */
            alt=""
            aria-hidden
            draggable={false}
            decoding="async"
            className="h-full w-full object-cover"
          />
          {/* The name sits on the picture rather than under it, which is what
              lets the picture have the whole panel. Bottom-weighted, like the
              board's `CardScrim` and for the same reason. */}
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-1.5 pb-2 pt-6 text-center text-[10px] font-semibold leading-tight text-white sm:px-3 sm:pb-3 sm:pt-10 sm:text-xs">
            {subject.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * The chosen rank, worn.
 *
 * The gallery on `/achievements` shows the rings empty, because there the badge
 * itself is the subject. Here the question is what one looks like around a
 * picture, so the hole is filled with the stand-in avatar — the same pairing
 * the preview bench on that page makes.
 *
 * Keyed on the slug so the arrival replays on every swatch, and the class is
 * conditional on `active` so it replays again when the pill is reopened: a CSS
 * animation that has already finished does not run merely because its element
 * became visible again.
 */
function StageBadge({
  t,
  rank,
  active,
}: {
  t: Dict;
  rank: BadgeSlug;
  active: boolean;
}) {
  const badge = BADGES.find((candidate) => candidate.slug === rank)!;
  const box = useRef<HTMLDivElement>(null);
  const [avatar, setAvatar] = useState(MAX_STAGE_AVATAR);

  /* `BadgeFrame` is sized in pixels off the avatar's diameter, and it has to be
     solved rather than scaled: `transform: scale()` leaves the layout box at
     the unscaled size, so a badge shrunk to fit a phone would still reserve a
     347x314 hole and push its own caption off the stage. Solving the diameter
     instead means the frame's box *is* what is on screen at every width.

     The divisors are the badge's own frame multiples, so each badge fits
     itself: the four tier masters share a canvas but ruby and amethyst do not,
     and amethyst is the widest relative to its ring. */
  useEffect(() => {
    const node = box.current;
    if (!node) return;

    const fit = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width === 0) return;
      setAvatar(
        Math.max(
          56,
          Math.min(
            MAX_STAGE_AVATAR,
            Math.floor(
              Math.min(
                width / badge.frame.w,
                (height - STAGE_BADGE_CAPTION) / badge.frame.h,
              ),
            ),
          ),
        ),
      );
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [badge]);

  return (
    <div className="relative h-full p-5 sm:p-6">
      {/* A soft pool of light under the ring. The badges are metal and were
          drawn to catch a light; on flat `page` black they sit on nothing. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 44%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 45%, transparent 72%)",
        }}
      />

      <div ref={box} className="relative grid h-full w-full place-items-center">
        <div
          key={rank}
          className={`flex flex-col items-center ${active ? "explorer-badge-in" : ""}`}
        >
          <BadgeFrame
            badge={badge}
            avatar={avatar}
            avatarSrc={DEFAULT_AVATAR_SRC}
          />

          <p className="text-center font-display text-xl font-semibold text-ink">
            {t[badge.nameKey]}
          </p>
          <p className="mt-1 text-center text-[13px] text-ink-dim">
            {t[badge.ruleKey]}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * What the library is, in three figures over the pattern.
 *
 * Only one of the three is formatted: the language count, which is the length
 * of a list this code can see. The other two are written per language — see
 * `explorerStatSpanValue` for why the span is, and `ExplorerStats` for why the
 * event figure now is.
 *
 * **Three across at every width**, including a phone, where they used to stack.
 * Stacked, the three tiles were 300px of panel and the picture behind them was
 * never visible at the same time as the pills that opened it; across, the whole
 * panel is a third of that and the type comes down a step to pay for it.
 */
function StageLibrary({
  t,
  locale,
  art,
  stats,
  active,
}: {
  t: Dict;
  locale: string;
  art: Record<ExplorerArt, ExplorerImage>;
  stats: ExplorerStats;
  active: boolean;
}) {
  const number = new Intl.NumberFormat(locale);

  const tiles = [
    { value: t.explorerStatEventsValue, label: t.explorerStatEvents },
    { value: number.format(stats.languages), label: t.explorerStatLanguages },
    { value: t.explorerStatSpanValue, label: t.explorerStatSpan },
  ];

  return (
    <>
      <img
        src={art.pattern.src}
        srcSet={art.pattern.srcSet}
        sizes={STAGE_SIZES}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        className="explorer-motion h-full w-full object-cover transition-transform ease-out"
        style={{
          transform: active ? "scale(1)" : "scale(1.06)",
          transitionDuration: `${FADE_MS * 2}ms`,
        }}
      />
      {/* Heavier than the photographs' vignette, because this one has type over
          it: the pattern is busy at every point, so the wash has to be flat
          rather than edge-weighted for the numerals to hold. */}
      <div aria-hidden className="absolute inset-0 bg-black/62" />

      <div className="absolute inset-0 grid place-items-center p-3 sm:p-8">
        {/* Value over label rather than beside it. Side by side, the three
            labels start at three different x positions — the number's width is
            the whole of the difference, and "4,54 milyar" against "5" is as far
            apart as that gets. Stacked, they line up in every language without
            a width being reserved for the widest number any of them has. */}
        <dl className="grid w-full max-w-xl grid-cols-3 gap-2 sm:gap-3">
          {tiles.map((tile, i) => (
            <div
              key={tile.label}
              /* `flex-col-reverse` so the term can stay before its definition
                 in the markup, which is the order a `dl` requires, while the
                 number is the line on top. */
              className={`flex flex-col-reverse gap-1.5 rounded-xl border border-white/15 bg-black/35 px-2.5 py-3 backdrop-blur-xl sm:gap-2 sm:rounded-2xl sm:px-5 sm:py-4 ${
                active ? "explorer-tile-in" : ""
              }`}
              style={{ "--tile-i": i } as React.CSSProperties}
            >
              <dt className="text-[10px] leading-snug text-white/70 sm:text-[13px]">
                {tile.label}
              </dt>
              {/* `leading-tight` rather than `leading-none` below `sm`: a
                  third of a phone's panel is ~67px of text column, and
                  "4,54 milyar" takes two lines in it. */}
              <dd className="font-display text-[17px] font-semibold leading-tight text-white sm:text-[26px] sm:leading-none">
                {tile.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Icons the board has no card for
   --------------------------------------------------------------------------- */

const ICON = {
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  className: "h-5 w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Achievements: a medal on its ribbon. The badges are rings worn around a
 *  picture, and a ring on its own at this size is a circle. */
function MedalIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="14.5" r="5.5" />
      <path d="M8.5 9.4 6 2.5M15.5 9.4 18 2.5M9.6 3.2h4.8" />
    </svg>
  );
}

/** The library: books on a shelf, which is the one thing on this list that is a
 *  collection rather than a thing you do. */
function ShelfIcon() {
  return (
    <svg {...ICON}>
      <path d="M3.5 20h17" />
      <rect x="5" y="7" width="3.6" height="10" rx="1" />
      <rect x="10.2" y="4.5" width="3.6" height="12.5" rx="1" />
      <path d="m15.6 7.8 3.3-.9 2.1 8-3.3.9-2.1-8Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON} className="h-4 w-4">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

function ChevronIcon({ up = false }: { up?: boolean }) {
  return (
    <svg
      {...ICON}
      className="h-4 w-4"
      style={up ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </svg>
  );
}
