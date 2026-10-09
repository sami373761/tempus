"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Top bar that gets out of the way.
 *
 * Hides on a downward scroll and comes back on an upward one, so reading never
 * costs the header's height but navigation is always one flick away. Near the
 * very top it stays pinned regardless of direction — a bar that vanished on the
 * first pixel of scroll would read as a glitch.
 *
 * The home page is the exception to all of it: this renders **nothing** there.
 * That page's masthead is a row of its own inside the hero — mark, wordmark and
 * the menu button, on the board's own column so the three line up with the
 * cards underneath them — and it is centred together with the cards against the
 * full screen, which a bar pinned to the top of the page cannot be part of.
 *
 * The menu button is **not** in here. Off home it pins itself to the viewport
 * so it outlives a scroll, and this element translates itself away to hide — a
 * transformed ancestor is the containing block for its `fixed` descendants, so
 * a menu inside the bar would have hidden with the bar. It is a sibling in
 * app/(public)/layout.tsx instead.
 *
 * **The bar carries no surface on any route** — no fill, no blur, no rule. It
 * was a hairline-and-blur panel everywhere except the three routes that paint
 * their own artwork, and those three were the ones that read as clean; the rest
 * wore a line across the top of every page for no reason but to separate the
 * wordmark from content that already had its own margin. So every page now
 * looks like `/versus` did: the wordmark and the menu button over whatever is
 * behind them, and nothing drawn to hold them. The height is still reserved and
 * the bar still hides on scroll; only the chrome went.
 *
 * `isTransparentRoute` therefore no longer says anything about *this* element.
 * It stays because the controls still need it: the menu button and its panel
 * are surfaces of their own, and over a photograph they take the game's glass
 * rather than the card they wear on an ordinary page.
 *
 * The legibility shadow belongs to the wordmark, not to this element: as a
 * `filter` it would apply to the bar's whole subtree instead of just the bare
 * text that needs it.
 */

/**
 * Routes whose own backdrop runs behind the bar. Exported because the controls
 * in the bar have to agree with it: a card-surfaced button over a photograph
 * reads as a leftover panel, so `SiteMenu` matches the glass pill the
 * timeline's own doors use on exactly these routes.
 */
export const TRANSPARENT_ROUTES = [
  "/guess",
  "/compare",
  "/survival",
  "/versus",
  "/football",
];

/**
 * Whether this route paints its own artwork behind the bar.
 *
 * A prefix match, not an exact one: a head-to-head match lives at
 * `/versus/<code>`, and an exact comparison would have left the bar opaque on
 * the only screen of that mode anyone actually plays on.
 */
export function isTransparentRoute(pathname: string): boolean {
  return TRANSPARENT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Scroll depth above which the bar is always shown. */
const ALWAYS_VISIBLE_UNTIL = 72;
/** Movement a single direction must accumulate before the bar reacts, in px.
 *  Absorbs trackpad jitter and iOS rubber-banding. */
const DIRECTION_THRESHOLD = 10;

export function SiteHeader() {
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  const home = pathname === "/";
  // Read in a rAF callback rather than through state, so the scroll listener
  // never re-renders on a pixel that does not change the answer.
  const lastY = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;

    function evaluate() {
      frame.current = 0;
      const y = window.scrollY;
      const delta = y - lastY.current;

      if (y <= ALWAYS_VISIBLE_UNTIL) {
        lastY.current = y;
        setHidden(false);
        return;
      }

      if (Math.abs(delta) < DIRECTION_THRESHOLD) return; // Keep the anchor.
      lastY.current = y;
      setHidden(delta > 0);
    }

    function onScroll() {
      if (frame.current) return;
      frame.current = requestAnimationFrame(evaluate);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  // Home has no bar: its masthead is a row inside the hero, beside the board.
  if (home) return null;

  return (
    <header
      className={`sticky top-0 z-40 transition-transform duration-300 ease-out ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {/* A fixed height rather than padding around the content: the
          date-guessing screen sizes itself to `100dvh` minus this bar, so the
          bar's height has to be a number both sides can read. */}
      <div className="mx-auto flex h-[var(--site-bar-h)] max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          /* A notch smaller below `sm`, with the menu button opposite it and
             the bar itself: on a phone that row has to hold the comparison
             game's round pill between the two of them. */
          className="on-photo font-display text-base font-semibold tracking-[-0.01em] text-ink sm:text-lg"
        >
          Tempus
        </Link>
      </div>
    </header>
  );
}

/**
 * The site's mark: the `Tempus` sundial, knocked out of a rounded tile.
 *
 * A mask rather than a picture. `public/logo-mark.svg` is the negative
 * artwork — the tile is filled and the glyph is a hole in it — and only its
 * alpha matters, so the element's own background is what you see through it.
 * That is what lets the mark take its colour from one class, and it keeps 68KB
 * of path data out of the bundle.
 *
 * It is painted `bg-current`, which is the colour of the text it sits in rather
 * than a value of its own: the mark and the word `Tempus` are one masthead, and
 * tying the tile to `currentColor` means they cannot come apart when `ink` is
 * retuned. It carried `.logo-sweep`'s grey ramp for an afternoon on
 * 2026-10-05 — the ramp the bento's glyph still uses — and at masthead size a
 * gradient tile beside flat white text read as two different whites.
 *
 * The file's viewBox is square, so `mask-size: 100% 100%` lands the tile with
 * no padding to crop out — keep the box square or the corner radii go oval.
 *
 * It does **not** turn. The turning version was the home page's corner
 * ornament, which had the whole top-left to itself; this one sits against the
 * word `Tempus` as one masthead, where a mark revolving beside the text it
 * names would read as a loading spinner rather than as a dial.
 *
 * Sized in `em` so it tracks whatever text it is set beside: the home masthead
 * is `clamp()`ed against the viewport, and a fixed pixel box would drift out of
 * proportion with it at the ends of that range.
 */
const MARK_MASK = {
  maskImage: "url(/logo-mark.svg)",
  WebkitMaskImage: "url(/logo-mark.svg)",
  maskSize: "100% 100%",
  WebkitMaskSize: "100% 100%",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
} as const;

export function SiteMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={MARK_MASK}
      className={`block shrink-0 bg-current ${className ?? "h-[1.1em] w-[1.1em]"}`}
    />
  );
}
