"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BadgeFrame } from "@/components/badge-frame";
import { BADGES, RING_BOX, type Badge } from "@/lib/badges";
import type { BadgeProgress } from "@/lib/db/types";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The whole of the badges page: six cards on a rail you shift to the right.
 *
 * It replaced the tab strip on 2026-10-09, which had replaced a grid of six
 * cards before that. The shape is transcribed from the supplied Apple
 * reference — a horizontal run of equal cards that pages sideways, with the
 * arrows under its right-hand end — and the page above it is now the heading
 * and nothing else: the intro paragraph, the single shared progress bar, the
 * compact grid, the tab strip and the detail panel all went, because every one
 * of them said something about *one* badge while six were on screen. A card
 * carries its own badge's answer instead.
 *
 * **A card is four things and deliberately no more**: the badge as a stark
 * white silhouette at the top left, what it is and how it is earned through the
 * middle, how far along you are at the bottom left, and the reveal at the
 * bottom right.
 *
 * **The artwork is a silhouette, so the colour is the reward.** Bronze, silver,
 * gold and diamond are a ladder, and six coloured rings in a row read as six
 * unrelated trophies — flatten them all to one white and what is left is the
 * *shape*, which is what actually differs between a bare ring and a pair of
 * wings. It also settles what used to be a special case: ruby and amethyst were
 * blacked out to hide their stones while the other four showed theirs, and now
 * nothing is hiding anything, because nothing is giving anything away.
 *
 * The button below the text is what hands the colour back, and it is the one
 * control on the card: press it and the silhouette dissolves into the real
 * artwork. **It is dead until the badge is earned**, which is the whole of what
 * `disabled` means here — there is no colour of yours to show yet.
 *
 * **One card per screen on a phone.** The rail is a scroll-snapping scroller,
 * so a swipe lands squarely on the next badge rather than part-way between two,
 * and the arrows — which are a pointer's way of doing the same thing — are
 * hidden at that width.
 */

/** The silhouette's ring diameter. A badge is an object rather than an icon, so
 *  it is a step above the 16-24px the reference's line art uses; much past this
 *  and it starts competing with the card's own title.
 *
 *  It grew with the card on 2026-10-09 — the padding and the corner radius did
 *  too, because a box that gains a fifth in both axes and keeps everything
 *  inside it at the old size reads as padded rather than as bigger. The type is
 *  the deliberate exception: it is the site's scale and the cards are not the
 *  place to start a second one. */
const SILHOUETTE_RING = 46;

/**
 * The box the silhouette and the revealed artwork are both stacked in.
 *
 * `RING_BOX` rather than each badge's own frame, so the six rings land at the
 * same place in their six cards. Laid out on the artwork's box they would not:
 * the ornaments hang off one side, differently per badge, so the circles would
 * wander across a row the eye reads as a row of circles. The same reason the
 * leaderboard's column is ring-aligned.
 */
const ART_BOX = {
  width: Math.round(RING_BOX.w * SILHOUETTE_RING),
  height: Math.round(RING_BOX.h * SILHOUETTE_RING),
};

/**
 * `GUTTER` — the page column's own left inset:
 *
 *     max(1.5rem, (100% - (var(--board-w) + 3rem)) / 2 + 1.5rem)
 *
 * `100%` is the full page width, so this resolves to exactly where
 * `mx-auto max-w-[calc(var(--board-w)+3rem)] px-6` puts its content: half the
 * slack on either side of the capped column, plus the column's own 24px
 * gutter. Below the cap there is no slack, the middle term goes negative and
 * the `max()` falls back to the gutter alone.
 *
 * `100%` rather than `100vw` is deliberate — `vw` counts the scrollbar, so on
 * any window with one the rail would start a few pixels right of the heading.
 *
 * It is written out in full twice in the rail's class list (`pl-` and
 * `scroll-pl-`) rather than kept in a constant: Tailwind reads the source for
 * class names and never sees an interpolated one.
 */

/** How long a paging scroll is given to settle before the rail's target is
 *  forgotten. Comfortably longer than the browser's own smooth scroll, and
 *  short enough that a drag a moment later starts from the live position. */
const PAGE_SETTLE_MS = 700;

export function BadgeShowcase({
  t,
  progress,
}: {
  t: Dict;
  /** One entry per badge, in the badges' own order. Zeros when nothing has
   *  been written yet, which is every account today — see the migration. */
  progress: readonly BadgeProgress[];
}) {
  const bySlug = new Map(progress.map((row) => [row.slug, row]));

  return (
    <section>
      {/* The heading keeps the site's column — `--board-w` plus the `px-6` it
          carries — while the rail below it does not. The two still start on the
          same left edge: `GUTTER` is that column's own left inset, solved rather
          than guessed. */}
      <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          {t.badgesTitle}
        </h1>
      </div>

      <Rail t={t} label={t.badgesTitle}>
        {BADGES.map((badge) => {
          const row = bySlug.get(badge.slug);
          return (
            <BadgeCard
              key={badge.slug}
              t={t}
              badge={badge}
              progress={row?.progress ?? 0}
              target={row?.target ?? 1}
              unlocked={(row?.unlockedAt ?? null) !== null}
            />
          );
        })}
      </Rail>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The rail: a horizontal scroller with the reference's pair of arrows under its
 * right-hand end.
 *
 * Three things hold it up.
 *
 * **The scroller is the interaction, not the arrows.** It is an ordinary
 * overflow container with scroll snapping, so a trackpad swipe, a touch drag, a
 * shift-wheel and the arrow buttons are all the same gesture and there is no
 * state saying which card is "current" — the browser owns the position. The
 * arrows only ever ask it to scroll.
 *
 * **They ask for an absolute position, never a relative one.** `scrollBy` is
 * the obvious way to write "one card along" and it is wrong here: a smooth
 * scroll takes a few hundred milliseconds, and a second press during it is
 * measured from wherever the animation has got to rather than from where it was
 * heading — so three quick presses advanced the rail by a little over one card
 * instead of three. `page()` works out the card positions, picks the next one
 * past where the rail is *going*, and scrolls there. Each press is then exactly
 * one card however fast they come.
 *
 * **It runs to the right-hand edge of the screen, not to the edge of the page's
 * column.** The rail is the one element on the site that is wider than that
 * column: it was inside it until 2026-10-09, where the overflow was clipped at
 * the column's right edge — 270px short of the window at 1680 — so the next card
 * was sliced off in open space and the rail read as broken rather than as
 * continuing. It is a full-width box with the column's own left inset as its
 * padding instead (see `GUTTER`), so the first card still lines up under the
 * heading and the row leaves at the screen's edge. `scroll-pl` matched to the
 * same value is the other half: without it a snapped card lands against the
 * scroller's *border* box and sits a gutter's width left of the heading.
 *
 * `pr-6` is the far end of the scroll, not of the row — the last card comes to
 * rest a gutter short of the window rather than flush against it, which is the
 * same margin everything else on the page keeps.
 *
 * **The arrows are hidden on a phone**, where a swipe is the way to move a rail
 * and two 36px targets under it would be chrome for a gesture the reader
 * already has. They are enabled off the live scroll position rather than off a
 * card index, which is the only reading that stays true when the rail is
 * dragged part-way.
 */
function Rail({
  t,
  label,
  children,
}: {
  t: Dict;
  label: string;
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    /* A pixel of slack at each end: `scrollWidth` and `clientWidth` are
       rounded independently, so a rail scrolled fully right can report a
       remainder of a fraction of a pixel and leave the arrow lit for a press
       that would do nothing. */
    const max = node.scrollWidth - node.clientWidth;
    setEnds({ start: node.scrollLeft <= 1, end: node.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  /* Where the rail is heading, while a smooth scroll is still running — see the
     note above. Cleared on a timer rather than on `scrollend`, which is not
     everywhere yet and which a drag would fire anyway: all this has to survive
     is a second press arriving during one animation. */
  const heading = useRef<number | null>(null);
  const forget = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (forget.current !== null) window.clearTimeout(forget.current);
    },
    [],
  );

  /* Every position a card can be snapped to, measured off the live rail rather
     than multiplied out from a card width: the card is a different width at
     each of three breakpoints, and the last card's stop is clamped by the end
     of the scroll range rather than falling where the card does. Clamping is
     what makes the final press land flush against the right-hand edge, which is
     in turn what lets the arrow disable itself.

     **Each stop is a distance from the first card, not from the scroller's
     content edge.** The two are the same number — `scroll-pl` is the rail's
     `pl`, so the first card is at rest at `scrollLeft: 0` — and this way is the
     one that can actually be measured: that padding is a `max()` around a
     percentage (see `GUTTER`), which Chrome hands back from
     `getComputedStyle` unresolved, so parsing it gives `NaN` and every stop
     would quietly come out a gutter's width too far left. `offsetLeft` is also
     indifferent to where the rail happens to be scrolled to, which a
     `getBoundingClientRect` chain is not. */
  function snapStops(node: HTMLElement): number[] {
    const cards = [
      ...node.querySelectorAll<HTMLElement>("[data-badge-card]"),
    ];
    const first = cards[0];
    if (!first) return [];
    const max = node.scrollWidth - node.clientWidth;
    return cards.map((card) =>
      Math.min(max, Math.max(0, card.offsetLeft - first.offsetLeft)),
    );
  }

  function page(direction: 1 | -1) {
    const node = scroller.current;
    if (!node) return;

    const stops = snapStops(node);
    const from = heading.current ?? node.scrollLeft;
    /* A pixel of slack so a stop the rail is already sitting on is not read as
       the one to move to. */
    const target =
      direction > 0
        ? stops.find((stop) => stop > from + 1)
        : [...stops].reverse().find((stop) => stop < from - 1);
    if (target === undefined) return;

    heading.current = target;
    if (forget.current !== null) window.clearTimeout(forget.current);
    forget.current = window.setTimeout(() => {
      heading.current = null;
    }, PAGE_SETTLE_MS);

    /* No `behavior`, so the CSS decides — which is what lets
       `motion-reduce:scroll-auto` on the rail turn this into a jump without a
       second media query here. */
    node.scrollTo({ left: target });
  }

  return (
    <div className="mt-10 sm:mt-12">
      {/* `tabIndex` because a scrollable region has to be reachable without a
          pointer — a keyboard user needs somewhere to press the arrow keys. */}
      <div
        ref={scroller}
        tabIndex={0}
        role="group"
        aria-label={label}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 pl-[max(1.5rem,calc((100%_-_(var(--board-w)_+_3rem))_/_2_+_1.5rem))] pr-6 scroll-pl-[max(1.5rem,calc((100%_-_(var(--board-w)_+_3rem))_/_2_+_1.5rem))] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {/* Under the rail, at the right-hand end of the *column* rather than of
          the rail. The rail deliberately runs off the screen; a control that
          went with it would have nothing to align to and would sit jammed
          against the window's edge, so these stay on the page's own right
          margin with the heading above them. */}
      <div className="mx-auto mt-6 hidden max-w-[calc(var(--board-w)+3rem)] justify-end gap-2 px-6 sm:flex">
        <RailArrow
          label={t.explorerPrev}
          disabled={ends.start}
          onClick={() => page(-1)}
          direction="prev"
        />
        <RailArrow
          label={t.explorerNext}
          disabled={ends.end}
          onClick={() => page(1)}
          direction="next"
        />
      </div>
    </div>
  );
}

function RailArrow({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: "prev" | "next";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-card-raised text-ink transition-opacity duration-300 hover:bg-hairline disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d={direction === "prev" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One badge: silhouette, what it takes, how far along, and the reveal.
 *
 * **The width is three steps.** A phone gets one card and a sliver of the next
 * — enough to say the rail moves without putting two badges on screen at once —
 * and a desktop gets three with the fourth peeking, which is the reference's own
 * count. All three grew by a fifth on 2026-10-09, as asked; `86vw` did not,
 * because it is already the whole of a phone's screen and the cap is what binds
 * there.
 *
 * **The height is a floor read off the viewport, and that is what keeps the
 * page off a scrollbar.** `min-h-[min(30.5rem, 100dvh - 20rem)]`. The first
 * term is the fifth the card was asked to grow by — it measured 407px, and
 * 30.5rem is that plus 20%. The second is what is actually left: 20rem is
 * everything on the page that is *not* the card, summed — the top bar, the
 * page's two paddings, the heading, the gap above the rail, and the arrows
 * under it with theirs. **A hand-maintained sum, like `--compare-chrome`**:
 * every row the page gains above or below the rail is a row this has to gain
 * too, or the page it was built not to scroll scrolls. Without it a 488px card
 * is 488px on a laptop with 600px of window; giving up height instead is what
 * makes the whole page fit one screen wherever there is room for it to.
 *
 * It is a **`min-height`**, never a height, and that is the valve. A card
 * shorter than its own paragraph would clip it, and the five languages do not
 * agree on how long that paragraph is — so below about a 770px window the text
 * wins, the page scrolls, and nothing is lost. `/compare`'s budget keeps the
 * same escape for the same reason. Equal heights across the six are free
 * either way, the cards being flex items on a stretching row.
 *
 * `bg-card-raised` rather than the near-black the reference uses, asked for:
 * this page's background is pure black where the reference's is a dark grey, so
 * the card has to come *up* off the page rather than down into it.
 */
function BadgeCard({
  t,
  badge,
  progress,
  target,
  unlocked,
}: {
  t: Dict;
  badge: Badge;
  progress: number;
  target: number;
  unlocked: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  const pct =
    target > 0
      ? Math.max(0, Math.min(100, Math.round((progress / target) * 100)))
      : 0;

  /* A badge that is locked again — which cannot happen today, but will the
     first time these rows are written by something — must not be left showing
     its colour because the card was open when it changed. */
  const showArt = revealed && unlocked;

  return (
    <article
      data-badge-card
      className="flex w-[min(86vw,26.4rem)] min-h-[min(30.5rem,calc(100dvh_-_20rem))] shrink-0 snap-start flex-col rounded-[34px] bg-card-raised p-[1.8rem] sm:p-[2.1rem] md:w-[25.2rem] lg:w-[25.8rem]"
    >
      {/* Top left. Two layers rather than one filtered image: a crossfade
          between two opaque pictures is clean, where interpolating
          `brightness(0) invert(1)` towards the identity passes through a grey
          wash on the way. The site's crossfade rule applies — the layer being
          left is held at full opacity underneath and only the arriving one
          animates. */}
      <div className="relative shrink-0" style={ART_BOX}>
        {/* Each layer gets a positioned wrapper of its own rather than being
            pushed into `absolute` through `BadgeFrame`'s `className`. That
            looked like it worked and did not: the frame already carries
            `relative`, and between two utilities of equal specificity the
            winner is whichever Tailwind emitted last — so both layers stayed
            in flow and the artwork sat 85px below the silhouette, on top of
            the card's title. */}
        <span
          className={`badge-fade absolute inset-0 ${showArt ? "opacity-0" : "opacity-100"}`}
        >
          <BadgeFrame
            badge={badge}
            avatar={SILHOUETTE_RING}
            align="ring"
            /* `brightness(0)` takes every pixel to black and `invert(1)` takes
               it to white; the alpha channel is untouched, so what is left is
               the artwork's outline and the ring's hole stays a hole. */
            artworkStyle={{ filter: "brightness(0) invert(1)" }}
          />
        </span>
        <span
          className={`badge-fade absolute inset-0 ${showArt ? "opacity-100" : "opacity-0"}`}
        >
          <BadgeFrame badge={badge} avatar={SILHOUETTE_RING} align="ring" />
        </span>
      </div>

      {/* The middle: what the badge is, what it takes, and how it is earned.
          `flex-1` is what pushes the foot to the card's lower edge whatever
          this runs to, so all six feet sit on one line. */}
      <div className="mt-[2.1rem] flex-1">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
          {t[badge.nameKey]}
        </h2>

        {/* The countable half of the sentence below, pulled out so a glance is
            enough — "8 of 10" before the paragraph that explains it. */}
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
          {t[badge.ruleKey]}
        </p>

        <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
          {t[badge.howKey]}
        </p>
      </div>

      {/* The foot: how far along at the left, the reveal at the right.
          `items-center` rather than `items-end`: the number is set
          `leading-none`, so bottom-aligning it puts its baseline on the
          button's lower edge and the digits read a clear 8px below the glyph
          beside them. Centred, the two share a middle, which is what a row of
          two reads as. */}
      <div className="mt-[2.4rem] flex items-center justify-between gap-4">
        <p
          role="progressbar"
          aria-label={format(t.badgesProgressTo, { badge: t[badge.nameKey] })}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={progress}
          aria-valuetext={`${pct}%`}
          className="text-xl font-semibold tabular-nums leading-none text-ink"
        >
          {pct}%
        </p>

        <RevealButton
          t={t}
          unlocked={unlocked}
          revealed={showArt}
          name={t[badge.nameKey]}
          onToggle={() => setRevealed((open) => !open)}
        />
      </div>
    </article>
  );
}

/**
 * The reference's round button, and the only control on a card.
 *
 * It shows the badge in its own colours, and it is `disabled` until the badge
 * is earned — which is the state the user asked for and is also the honest one:
 * there is nothing of yours to look at yet. A `disabled` button rather than a
 * dimmed `div`, so the reason reaches a screen reader and the control stays out
 * of the tab order while it cannot be used.
 *
 * The glyph is the reference's plus, turning a sixth of a circle onto its own
 * minus when the card is open — the same two-bar mark the FAQ's rows use, for
 * the same reason a chevron would be wrong: this opens something rather than
 * pointing further down the page.
 */
function RevealButton({
  t,
  unlocked,
  revealed,
  name,
  onToggle,
}: {
  t: Dict;
  unlocked: boolean;
  revealed: boolean;
  name: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!unlocked}
      aria-pressed={unlocked ? revealed : undefined}
      aria-label={format(revealed ? t.badgesHideArt : t.badgesShowArt, {
        badge: name,
      })}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-page transition-opacity duration-300 hover:opacity-85 disabled:pointer-events-none disabled:bg-ink/20 disabled:text-ink/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        className="h-[18px] w-[18px]"
      >
        <path d="M5 12h14" />
        <path
          d="M12 5v14"
          className="badge-mark origin-center"
          style={{ transform: revealed ? "rotate(90deg)" : "none" }}
        />
      </svg>
    </button>
  );
}
