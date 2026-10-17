/**
 * The six profile badges and the geometry that lets a picture sit inside one.
 *
 * Every badge is a *ring*, not a medal: the artwork is an annulus with an
 * ornament hanging off it and a hole in the middle where a profile picture
 * goes. So the number that matters about each file is not its size but where
 * its hole is, and nothing on the page can be laid out without it.
 *
 * That circle was measured off each master's alpha channel rather than guessed,
 * and then checked by compositing the avatar into it — the ornaments are not
 * symmetric about the hole (a gem hangs below it on four of the six), so the
 * centre of the file is several per cent away from the centre of the ring and
 * eyeballing it leaves the picture visibly low.
 *
 * The shipped files in `public/badges/` are the masters in `data/` rescaled so
 * that **every ring is the same 520px across**. That is what lets one avatar
 * size dress all six: the wings, laurels and crystals then size themselves
 * around a picture that never changes, which is exactly how they will be worn.
 * `frame` below is each file's size and the hole's position expressed as
 * multiples of the avatar's diameter, so a caller picks one number — how big
 * the picture is — and the rest follows.
 *
 * Re-exporting a master means re-measuring: see the ring-fitting notes in the
 * commit that added this file.
 */

import type { Dict } from "./i18n/dictionary.ts";

export type BadgeSlug =
  | "bronze"
  | "silver"
  | "gold"
  | "diamond"
  | "ruby"
  | "amethyst";

export type Badge = {
  slug: BadgeSlug;
  /**
   * Where it sits on the ladder. All six are rungs since TP (2026-10-17):
   * Ruby and Amethyst stood outside it as one-off feats until then, which is
   * why the type still allows `null`.
   */
  rank: number | null;
  src: string;
  /**
   * The file's box and its ring's hole, as multiples of the avatar's diameter.
   * `w`/`h` size the artwork; `x`/`y` are where the picture's top-left corner
   * lands inside it.
   */
  frame: { w: number; h: number; x: number; y: number };
  nameKey: keyof Dict;
  ruleKey: keyof Dict;
  howKey: keyof Dict;
};

/**
 * Built from the measured circle so the arithmetic is visible rather than a
 * table of four opaque decimals per badge. `width`/`height` are the file's own
 * pixels and `cx`/`cy`/`r` its ring, in those same pixels.
 */
function frameOf(width: number, height: number, cx: number, cy: number, r: number) {
  const d = r * 2;
  return { w: width / d, h: height / d, x: (cx - r) / d, y: (cy - r) / d };
}

/**
 * The ladder, in the order it is climbed. Rendering order on the page is this
 * order, so a rank can never show up out of sequence. What earns each rung is
 * lib/game/badge-rules.ts.
 */
export const BADGES: readonly Badge[] = [
  {
    slug: "bronze",
    rank: 1,
    src: "/badges/bronze.webp",
    frame: frameOf(1203, 1088, 606.7, 509.7, 260),
    nameKey: "badgeBronze",
    ruleKey: "badgeBronzeRule",
    howKey: "badgeBronzeHow",
  },
  {
    slug: "silver",
    rank: 2,
    src: "/badges/silver.webp",
    frame: frameOf(1203, 1088, 606.7, 509.7, 260),
    nameKey: "badgeSilver",
    ruleKey: "badgeSilverRule",
    howKey: "badgeSilverHow",
  },
  {
    slug: "gold",
    rank: 3,
    src: "/badges/gold.webp",
    frame: frameOf(1203, 1088, 606.7, 509.7, 260),
    nameKey: "badgeGold",
    ruleKey: "badgeGoldRule",
    howKey: "badgeGoldHow",
  },
  {
    slug: "diamond",
    rank: 4,
    src: "/badges/diamond.webp",
    frame: frameOf(1203, 1088, 606.7, 509.7, 260),
    nameKey: "badgeDiamond",
    ruleKey: "badgeDiamondRule",
    howKey: "badgeDiamondHow",
  },
  {
    slug: "ruby",
    rank: 5,
    src: "/badges/ruby.webp",
    frame: frameOf(961, 881, 484.7, 409.8, 260),
    nameKey: "badgeRuby",
    ruleKey: "badgeRubyRule",
    howKey: "badgeRubyHow",
  },
  {
    slug: "amethyst",
    rank: 6,
    src: "/badges/amethyst.webp",
    frame: frameOf(1075, 877, 511.7, 394.4, 260),
    nameKey: "badgeAmethyst",
    ruleKey: "badgeAmethystRule",
    howKey: "badgeAmethystHow",
  },
];

/**
 * The box a badge needs when it is laid out on its **ring's centre** rather
 * than on its own file's centre, in multiples of the avatar's diameter.
 *
 * Six badges side by side only *look* aligned when their rings line up, and
 * their rings are not in the middle of their files: the ornaments hang off one
 * side (a gem below the hole on four of the six, a wider spread of wings on the
 * tiers), so a row that centres the artwork boxes puts the six circles at six
 * different places. On the leaderboard that was a 6px horizontal wander down a
 * column of ten rows and a visibly uneven run of row heights — technically
 * centred, plainly crooked.
 *
 * So this is the smallest box that is **symmetric about the ring's centre** and
 * still contains every one of the six frames whole: twice the furthest any
 * badge reaches from its own ring centre, taken per side. Centre a badge in it
 * and the ring lands at the box's middle, with nothing clipped at any edge.
 */
export const RING_BOX: { w: number; h: number } = (() => {
  const furthest = (reach: (frame: Badge["frame"]) => number) =>
    Math.max(...BADGES.map((badge) => reach(badge.frame)));

  /* The ring's centre sits at `x + 0.5` across and `y + 0.5` down the frame,
     the hole being one avatar wide. The four reaches are its distances to the
     frame's four edges. */
  const left = furthest((f) => f.x + 0.5);
  const right = furthest((f) => f.w - f.x - 0.5);
  const top = furthest((f) => f.y + 0.5);
  const bottom = furthest((f) => f.h - f.y - 0.5);

  return { w: 2 * Math.max(left, right), h: 2 * Math.max(top, bottom) };
})();

/** The ranks, in climbing order — all six now. */
export const LADDER_BADGES = BADGES.filter((badge) => badge.rank !== null);

/** The stand-in picture the preview area dresses, and the only avatar there is. */
export const DEFAULT_AVATAR_SRC = "/default-profile-picture.jpg";

/** Lookup by slug, so a route param or a database row can become a badge. */
export const BADGE_BY_SLUG: Record<BadgeSlug, Badge> = Object.fromEntries(
  BADGES.map((badge) => [badge.slug, badge]),
) as Record<BadgeSlug, Badge>;

export function isBadgeSlug(value: string): value is BadgeSlug {
  return value in BADGE_BY_SLUG;
}

/**
 * Each badge's colour, as the three stops of a left-to-right ramp.
 *
 * **Nothing paints these today**, and the four helpers under them have no
 * caller either. They dressed the badges page's progress bar and its sliding
 * tab indicator, both of which went when that page became a rail of six cards
 * on 2026-10-09 — a card shows the artwork itself rather than a bar in its
 * colour. They are kept rather than deleted for the same reason
 * `writeBadgeProgress()` is: this is measured design data, not code that can be
 * re-derived, and the next thing that needs a bronze will want exactly this
 * bronze. Nothing here is load-bearing, so retuning one costs nothing until a
 * caller exists.
 *
 * This was the **second** deliberate chroma on an otherwise neutral page — the
 * first is the bento's amber sun — and for the same reason the explorer's
 * swatches are metal: a grey bar for gold would not be restraint, it would be
 * wrong. The artwork these stand for is bronze, silver, gold, diamond, ruby and
 * amethyst.
 *
 * Three stops rather than two because a single hue across a 4px bar reads as a
 * flat fill; a highlight at the leading edge falling to a shadow at the trailing
 * one is what makes it read as metal. The first four are the explorer's own
 * `RANK_SWATCH` values, so a bronze pill and a bronze bar are the same bronze.
 *
 * `MYSTERY_RAMP` is what stood in for the last two while they were unearned. It
 * is deliberately not grey: a warm grey falling to a cool one is a ramp with
 * somewhere to go, and it gives away neither red nor violet.
 */
export type BadgeRamp = readonly [string, string, string];

export const BADGE_RAMP: Record<BadgeSlug, BadgeRamp> = {
  bronze: ["#e0a86a", "#a4652f", "#5d3717"],
  silver: ["#f6f6f6", "#bfbfbf", "#7c7c7c"],
  gold: ["#f9e08c", "#d6a533", "#8e6714"],
  diamond: ["#eafcff", "#a4dcef", "#5c9fc2"],
  ruby: ["#ff9b9b", "#e0273f", "#8c0f22"],
  amethyst: ["#e0c6ff", "#9268f0", "#5b21b6"],
};

export const MYSTERY_RAMP: BadgeRamp = ["#a39c93", "#6b6f76", "#3a3d42"];

/**
 * The ramp to actually paint. It hid Ruby's and Amethyst's colours behind
 * `MYSTERY_RAMP` until they were earned, while they stood outside the ladder;
 * all six are rungs now and none is hidden, so the flag no longer changes the
 * answer. Kept in the signature for whatever paints a locked badge next.
 */
export function rampFor(slug: BadgeSlug, _unlocked: boolean): BadgeRamp {
  return BADGE_RAMP[slug];
}

/** A ramp as the `linear-gradient()` a fill or a rule can take directly. */
export function rampGradient(ramp: BadgeRamp, angle = "90deg"): string {
  return `linear-gradient(${angle}, ${ramp[0]} 0%, ${ramp[1]} 52%, ${ramp[2]} 100%)`;
}

/**
 * The same ramp as a progress bar's *track* would wear: the badge's colour
 * mixed a fifth of the way out of the surface it sits on.
 *
 * `color-mix` rather than the gradient at `opacity: 0.2`, and that is load
 * bearing rather than tidy. The bar crossfades between two ramps by stacking
 * the incoming layer over the outgoing one, so a layer that is semi-transparent
 * lets the layer beneath show through and two tracks at a fifth each read as
 * one at a third. Mixing the alpha into the stops keeps every layer opaque, and
 * the dissolve then composites correctly.
 */
export function rampTrackGradient(ramp: BadgeRamp, angle = "90deg"): string {
  const mix = (color: string) =>
    `color-mix(in srgb, ${color} 20%, var(--color-card-raised))`;
  return `linear-gradient(${angle}, ${mix(ramp[0])} 0%, ${mix(ramp[1])} 52%, ${mix(ramp[2])} 100%)`;
}
