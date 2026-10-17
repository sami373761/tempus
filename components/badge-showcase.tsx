"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { wearBadge } from "@/app/actions/scoring";
import { BadgeFrame } from "@/components/badge-frame";
import { BADGES, RING_BOX, type Badge, type BadgeSlug } from "@/lib/badges";
import type { SupportedLocale } from "@/lib/db/types";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * One badge as the page draws it: the TP threshold, the quests beside it, and
 * whether it is earned. Built on the server from `refreshBadges`
 * (lib/db/scoring.ts), so the card explains a badge with the same evaluation
 * that awards it.
 */
export interface BadgeView {
  slug: BadgeSlug;
  tp: number;
  tpTarget: number;
  quests: {
    key: string;
    labelKey: keyof Dict;
    progress: number;
    target: number;
    done: boolean;
  }[];
  unlocked: boolean;
}

/** Thousands grouped the reader's way, which is how the dictionary's own rule
 *  lines print them ("10.000 TP" in German) — a fixed "en-US" had the
 *  checklist under a German rule line reading "10,000". */
function count(n: number, locale: SupportedLocale): string {
  return n.toLocaleString(locale);
}

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
 * The button below the text is the one control on the card, and it **puts the
 * badge on**: the silhouette dissolves into the real artwork, and that is the
 * badge shown beside your name on the leaderboard and the account page. Press
 * it again to take it off. Only one is worn at a time, so putting one on takes
 * the other off. **It is dead until the badge is earned**, which is the whole
 * of what `disabled` means here — there is nothing of yours to wear yet.
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
  locale,
  badges,
  totalTp,
  shown,
}: {
  t: Dict;
  /** For grouping the numbers; see `count`. */
  locale: SupportedLocale;
  /** One entry per badge, in the badges' own order. */
  badges: readonly BadgeView[];
  /** Career TP, for the line under the heading. */
  totalTp: number;
  /** The badge beside the player's name: their choice, or their highest. */
  shown: BadgeSlug | null;
}) {
  const bySlug = new Map(badges.map((row) => [row.slug, row]));
  const router = useRouter();
  // Held here rather than per card, because wearing one badge takes another
  // off: the cards cannot each own a piece of a choice there is one of.
  // Optimistic — the card answers the press at once — and put back if the
  // server refuses.
  const [worn, setWorn] = useState<BadgeSlug | null>(shown);
  const [, startTransition] = useTransition();

  useEffect(() => setWorn(shown), [shown]);

  function toggleWear(slug: BadgeSlug) {
    const before = worn;
    const next = worn === slug ? null : slug;
    setWorn(next);
    startTransition(async () => {
      const { ok } = await wearBadge(next);
      if (!ok) setWorn(before);
      router.refresh();
    });
  }

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
        <p className="mt-3 text-[15px] font-semibold tabular-nums text-ink-dim">
          {format(t.badgesTotalTp, { n: count(totalTp, locale) })}
        </p>
      </div>

      <Rail t={t} label={t.badgesTitle}>
        {BADGES.map((badge) => {
          const row = bySlug.get(badge.slug);
          if (!row) return null;
          return (
            <BadgeCard
              key={badge.slug}
              t={t}
              locale={locale}
              badge={badge}
              view={row}
              worn={worn === badge.slug}
              onToggleWear={() => toggleWear(badge.slug)}
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
    <div className="mt-10">
      {/* `tabIndex` because a scrollable region has to be reachable without a
          pointer — a keyboard user needs somewhere to press the arrow keys.
          Its focus ring is drawn inside the box (`-outline-offset-2`): the
          scroller is the full width of the window, so a ring outside it lost
          both of its sides off the screen and showed as two stray lines. */}
      <div
        ref={scroller}
        tabIndex={0}
        role="group"
        aria-label={label}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 pl-[max(1.5rem,calc((100%_-_(var(--board-w)_+_3rem))_/_2_+_1.5rem))] pr-6 scroll-pl-[max(1.5rem,calc((100%_-_(var(--board-w)_+_3rem))_/_2_+_1.5rem))] [scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {/* Under the rail, at the right-hand end of the *column* rather than of
          the rail. The rail deliberately runs off the screen; a control that
          went with it would have nothing to align to and would sit jammed
          against the window's edge, so these stay on the page's own right
          margin with the heading above them. */}
      <div className="mx-auto mt-4 hidden max-w-[calc(var(--board-w)+3rem)] justify-end gap-2 px-6 sm:flex">
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
  /* `aria-disabled`, not `disabled`: the press that reaches the end of the
     rail is the one that switches its own arrow off, and a `disabled` button
     drops the keyboard focus that is on it to <body>. This one keeps focus,
     says it is unavailable, and ignores the press. */
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onClick();
      }}
      aria-disabled={disabled || undefined}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-card-raised text-ink transition-opacity duration-300 hover:bg-hairline aria-disabled:pointer-events-none aria-disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
 * page off a scrollbar.** `min-h-[min(30.5rem, 100dvh - 21rem)]`. The first
 * term is the fifth the card was asked to grow by — it measured 407px, and
 * 30.5rem is that plus 20%. The second is what is actually left: 21rem is
 * everything on the page that is *not* the card, summed — the 74px top bar,
 * the page's 40px and 32px paddings, the 83px heading, the rail's 40px gap
 * above it, and under it the scroller's 8px, the arrows' 16px gap and their
 * 36px: 329px, rounded up to 336 for a cushion. **A hand-maintained sum, like
 * `--compare-chrome`**: every row the page gains above or below the rail is a
 * row this has to gain too, or the page it was built not to scroll scrolls.
 * Without it a 488px card is 488px on a laptop with 600px of window; giving up
 * height instead is what makes the whole page fit one screen wherever there is
 * room for it to. The card's own spacing is in the same budget from the other
 * side: the tallest card (three quests, in English) is 503px of content at
 * the 1.8rem padding, and 503 + 329 is what fits a 1680x844 window.
 *
 * It is a **`min-height`**, never a height, and that is the valve. A card
 * shorter than its own paragraph would clip it, and the five languages do not
 * agree on how long that paragraph is — so below about an 832px window the text
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
  locale,
  badge,
  view,
  worn,
  onToggleWear,
}: {
  t: Dict;
  locale: SupportedLocale;
  badge: Badge;
  view: BadgeView;
  /** Whether this is the badge shown beside the player's name. */
  worn: boolean;
  onToggleWear: () => void;
}) {
  const { unlocked } = view;

  // Every requirement weighs the same: the TP threshold is one of them and
  // each quest is another, so a player with the points and none of the quests
  // reads as part of the way there rather than as nearly done.
  const parts = [
    view.tp / view.tpTarget,
    ...view.quests.map((quest) => quest.progress / quest.target),
  ];
  const pct = unlocked
    ? 100
    : Math.max(
        0,
        Math.min(
          99,
          Math.floor(
            (parts.reduce((sum, part) => sum + Math.min(1, part), 0) /
              parts.length) *
              100,
          ),
        ),
      );

  /* The colour is the badge being worn. A badge that is locked again — which
     cannot happen today — must not be left showing it. */
  const showArt = worn && unlocked;

  return (
    <article
      data-badge-card
      className="flex w-[min(86vw,26.4rem)] min-h-[min(30.5rem,calc(100dvh_-_21rem))] shrink-0 snap-start flex-col rounded-[34px] bg-card-raised p-[1.8rem] md:w-[25.2rem] lg:w-[25.8rem]"
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
      <div className="mt-6 flex-1">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
          {t[badge.nameKey]}
        </h2>

        {/* The countable half of the sentence below, pulled out so a glance is
            enough — "8 of 10" before the paragraph that explains it.
            The card's greys are `text-ink/60` rather than `text-ink-dim`:
            that token is tuned against the black page and only makes 4.3:1 on
            the card's raised grey, where this makes about 5.4:1. */}
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/60">
          {t[badge.ruleKey]}
        </p>

        <p className="mt-3 text-[15px] leading-relaxed text-ink/60">
          {t[badge.howKey]}
        </p>

        {/* The requirements, each with its own count: the TP threshold first,
            then the quests. A tick, not a colour, says which are done — the
            palette's chroma belongs to the verdict ladder. */}
        <ul className="mt-4 flex flex-col gap-2 text-[13px]">
          <Requirement
            done={view.tp >= view.tpTarget}
            label={format(t.badgeTpRequirement, {
              n: count(view.tpTarget, locale),
            })}
            progress={`${count(view.tp, locale)} / ${count(view.tpTarget, locale)}`}
          />
          {view.quests.map((quest) => (
            <Requirement
              key={quest.key}
              done={quest.done}
              label={format(t[quest.labelKey], { n: quest.target })}
              progress={`${quest.progress} / ${quest.target}`}
            />
          ))}
        </ul>
      </div>

      {/* The foot: how far along at the left, the reveal at the right.
          `items-center` rather than `items-end`: the number is set
          `leading-none`, so bottom-aligning it puts its baseline on the
          button's lower edge and the digits read a clear 8px below the glyph
          beside them. Centred, the two share a middle, which is what a row of
          two reads as. */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <p
          role="progressbar"
          aria-label={format(t.badgesProgressTo, { badge: t[badge.nameKey] })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}%`}
          className="text-xl font-semibold tabular-nums leading-none text-ink"
        >
          {pct}%
        </p>

        <WearButton
          t={t}
          unlocked={unlocked}
          worn={showArt}
          name={t[badge.nameKey]}
          onToggle={onToggleWear}
        />
      </div>
    </article>
  );
}

/** One line of a card's checklist. */
function Requirement({
  done,
  label,
  progress,
}: {
  done: boolean;
  label: string;
  progress: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={`flex min-w-0 items-baseline gap-2 ${done ? "text-ink" : "text-ink/60"}`}>
        <span aria-hidden="true" className="w-3 shrink-0 text-center">
          {done ? "✓" : "·"}
        </span>
        <span>{label}</span>
      </span>
      <span className="shrink-0 tabular-nums text-ink/60">{progress}</span>
    </li>
  );
}

/**
 * The reference's round button, and the only control on a card.
 *
 * It puts the badge on (and shows it in its own colours) or takes it off, and
 * it is `disabled` until the badge is earned — there is nothing of yours to
 * wear yet. A `disabled` button rather than a dimmed `div`, so the reason
 * reaches a screen reader and the control stays out of the tab order while it
 * cannot be used. It was a separate "Wearing" pill beside a reveal-only plus
 * until 2026-10-17; one control that does both was asked for.
 *
 * The glyph is the reference's plus, turning onto its own minus while the
 * badge is worn — the same two-bar mark the FAQ's rows use.
 */
function WearButton({
  t,
  unlocked,
  worn,
  name,
  onToggle,
}: {
  t: Dict;
  unlocked: boolean;
  worn: boolean;
  name: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!unlocked}
      aria-pressed={unlocked ? worn : undefined}
      aria-label={format(worn ? t.badgesTakeOff : t.badgesWear, {
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
          style={{ transform: worn ? "rotate(90deg)" : "none" }}
        />
      </svg>
    </button>
  );
}
