import {
  comparisonBackdropSrcSet,
  comparisonBackdropUrl,
} from "@/lib/storage/images";

/**
 * The photograph standing behind the comparison game.
 *
 * One plate for the whole game, unlike the date-guessing backdrop's five: a
 * comparison round holds two anchors that can sit in any two eras at once, so
 * there is no single era for a backdrop to illustrate. The cosmos plate was
 * picked for exactly that reason — it is the one view that belongs to no
 * period, so it cannot contradict the round in front of it.
 *
 * Static, so this stays a Server Component: there is nothing to crossfade, and
 * the markup is the same on every round.
 *
 * Fixed and full-bleed, so the photograph runs under the translucent site bar
 * too. Like its counterpart it must not end up inside a transformed or filtered
 * ancestor — either would make it a containing block and crop it to the game's
 * own box.
 */
export function ComparisonBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-page"
      style={{
        // Painted under the photograph and left showing on its own when it
        // cannot be fetched (r2.dev has been unreachable before — see
        // CLAUDE.md). Deep space, matching the plate it stands in for, so the
        // page degrades to the right key rather than to a black rectangle.
        background:
          "radial-gradient(120% 110% at 18% 0%, #33216b 0%, #150f33 46%, #04040c 100%)",
      }}
    >
      {/* Plain <img>: R2 is an arbitrary remote host, and next/image would have
          to be whitelisted per deployment to reach it. The derived widths are
          what load — never the 24-megapixel master; see `BACKDROP_WIDTHS`. */}
      <img
        src={comparisonBackdropUrl()}
        srcSet={comparisonBackdropSrcSet()}
        sizes="100vw"
        alt=""
        draggable={false}
        decoding="async"
        /* Slightly overscanned so the still plate has no edge of its own to
           find, and so it reads as depth behind the rail rather than as a
           picture pasted at the back. */
        className="h-full w-full scale-[1.06] object-cover"
      />

      {/* Scrim. The game is white type over thin rules and small numerals, none
          of which survives a bright nebula unaided. Heaviest top and bottom,
          where the bar and the anchors' captions sit. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 24%, rgba(0,0,0,0.34) 54%, rgba(0,0,0,0.6) 100%)",
        }}
      />
      {/* Vignette, so the corners of a busy photograph stop competing with the
          middle of the screen, which is where the whole round happens. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(118% 85% at 50% 46%, transparent 36%, rgba(0,0,0,0.42) 100%)",
        }}
      />
    </div>
  );
}
