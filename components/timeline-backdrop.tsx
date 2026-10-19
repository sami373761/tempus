"use client";

import { useEffect, useState } from "react";

import {
  TIMELINE_PANES,
  type PaneSet,
  type TimelinePane,
} from "@/lib/game/timeline";
import {
  timelineBackdropSrcSet,
  timelineBackdropUrl,
} from "@/lib/storage/images";

/**
 * The photograph standing behind the date-guessing timeline — one per pane, so
 * walking from the common era into deep time changes what the player is looking
 * at, not just the ruler's numbers.
 *
 * **Only the incoming layer animates.** The pane being left is held at full
 * opacity underneath for the length of the crossfade; the pane being entered
 * fades in on top of it. The obvious alternative — fading one out while fading
 * the other in — looks wrong for a reason worth writing down: half way through,
 * both layers sit at ~50% alpha, so source-over composites 25% of the black
 * page in between them and the join reads as a dark band sweeping the screen.
 * Dissolving a transparent layer over an opaque one puts no third colour in the
 * result, which is what makes the seam genuinely invisible rather than merely
 * brief.
 *
 * Each layer also drifts: an off-camera pane rests slightly scaled up and
 * pushed towards the side of the timeline it lives on, and settles to centre as
 * it becomes active. Both layers travel the same direction as the stage but a
 * fraction of its distance, which reads as parallax depth instead of as a
 * slideshow.
 */

/**
 * Longer than the stage's own 750ms pan (see components/timeline-game.tsx):
 * a backdrop that settles after the foreground has arrived reads as distant,
 * and the slower ramp is also what keeps the dissolve below notice.
 */
const CROSSFADE_MS = 1100;

/** How far an off-camera pane rests from centre, in percent of its own width. */
const DRIFT_PERCENT = 4.5;

/**
 * Overscan. `scale()` precedes `translateX()` below, so the drift is scaled
 * too — both scales leave more margin than the drift consumes, which is what
 * guarantees no layer's edge can slide into view mid-transition.
 */
const ACTIVE_SCALE = 1.12;
const RESTING_SCALE = 1.22;

/**
 * Painted under each photograph, and left showing on its own when one cannot be
 * fetched — the public R2 domain has gone down before (see CLAUDE.md), and a
 * timeline whose eras still change colour degrades far better than five
 * identical black screens. Hues follow the pane: deep space, mossy prehistory,
 * sunbaked antiquity, steel-blue recorded history.
 */
const PANE_WASH: Record<TimelinePane, string> = {
  cosmos: "radial-gradient(120% 110% at 18% 0%, #33216b 0%, #150f33 46%, #04040c 100%)",
  evolution: "radial-gradient(120% 110% at 78% 8%, #3f5230 0%, #1d2616 48%, #060803 100%)",
  civilization:
    "radial-gradient(120% 110% at 28% 10%, #7a4a1f 0%, #39200d 48%, #0d0704 100%)",
  ce: "radial-gradient(120% 110% at 70% 6%, #1f3f63 0%, #121f31 48%, #04070c 100%)",
  // Football's own, and the one pane whose wash is not an era: floodlit turf.
  // It is the pane set's only member, so this is also the whole of what the
  // football game degrades to when R2 is unreachable — see the note on
  // `TIMELINE_BACKDROP_PLATES`, where that pane currently shares the common
  // era's photograph.
  football:
    "radial-gradient(120% 110% at 50% 4%, #1f5c33 0%, #113021 48%, #030705 100%)",
  // Basketball's own, and a subject rather than an era like football's and
  // film's: varnished hardwood under arena lights. It is the pane set's only
  // member, so this is also the whole of what the basketball game degrades to
  // when R2 is unreachable — and like the film wash it had to be checked
  // against the verdict ladder rather than against itself, since `wayOff` red
  // sits on top of it. Its brightest stop is a warm 27% lightness, far enough
  // from `--color-bad` in hue and saturation that the verdict still reads as a
  // signal over it.
  basketball:
    "radial-gradient(120% 110% at 50% 4%, #8a5420 0%, #3d2410 48%, #0a0603 100%)",
  // Film & television's own: the red of a cinema curtain under a house light,
  // which like football's is a subject rather than an era. It is also the
  // whole of what this game degrades to when R2 is unreachable, since its
  // pane set has one member — and the only one of the seven washes that had to
  // be checked against something other than itself, because the verdict
  // ladder's `wayOff` red sits on top of it. It is dark and desaturated enough
  // (its brightest stop is 28% lightness) that `--color-bad` still reads as a
  // signal over it rather than as more of the same.
  screen:
    "radial-gradient(120% 110% at 50% 2%, #5c1f2e 0%, #2b1019 48%, #070304 100%)",
  // The "Born When?" game's three rails, and the only pane set whose washes
  // form a *sequence* rather than three unrelated colours. These panes are
  // stretches of history, so they borrow the eras' own hues — the antiquity
  // rail takes the civilisation pane's sunbaked ochre, and the two common-era
  // rails the steel blue of recorded history — which is what makes the pan
  // across the 1 BCE hinge read as walking out of antiquity.
  //
  // The two common-era rails are deliberately *not* identical. They share the
  // same photograph (see `TIMELINE_BACKDROP_PLATES`), so the wash is the only
  // thing that can mark the seam at AD 1500, and the modern rail's is a few
  // points cooler and brighter — enough to register as a step when the camera
  // crosses it, not enough to read as a different place. A player who pans
  // from 1200 to 1800 should feel they have moved, not teleported.
  "born-antiquity":
    "radial-gradient(120% 110% at 28% 10%, #7a4a1f 0%, #39200d 48%, #0d0704 100%)",
  "born-premodern":
    "radial-gradient(120% 110% at 62% 8%, #27405c 0%, #141f2d 48%, #04060b 100%)",
  "born-modern":
    "radial-gradient(120% 110% at 74% 4%, #2b5478 0%, #16263a 48%, #050810 100%)",
};

export function TimelineBackdrop({
  pane,
  panes = TIMELINE_PANES,
}: {
  pane: TimelinePane;
  /**
   * The pane set being played, which is what decides how many layers exist and
   * which side each one rests on. A subject game's set is one pane, so there is
   * nothing to crossfade and nothing to drift — the layer simply holds.
   */
  panes?: PaneSet;
}) {
  // `leaving` is the pane held opaque underneath the dissolve. Derived from the
  // prop during render rather than in an effect, so the incoming layer is never
  // painted once with nothing behind it.
  const [shown, setShown] = useState<{
    active: TimelinePane;
    leaving: TimelinePane | null;
  }>({ active: pane, leaving: null });

  if (shown.active !== pane) {
    setShown({ active: pane, leaving: shown.active });
  }

  // Photographs are mounted lazily and never unmounted. Loading all five up
  // front would pull several megabytes before the first guess; loading only the
  // active one would start the fetch at the moment of the crossfade, which is
  // exactly when a blank layer would show. Holding the active pane plus its
  // immediate neighbours means every reachable pane is already decoded.
  const [mounted, setMounted] = useState<readonly TimelinePane[]>(() =>
    neighbourhood(pane, panes),
  );

  useEffect(() => {
    setMounted((current) => {
      const wanted = neighbourhood(pane, panes);
      return wanted.every((candidate) => current.includes(candidate))
        ? current
        : [...new Set([...current, ...wanted])];
    });
    // `panes` is a module-level constant at both call sites, so it is stable;
    // listing it keeps the dependency array honest rather than relying on that.
  }, [pane, panes]);

  const activeIndex = panes.indexOf(shown.active);

  return (
    // Fixed and full-bleed, so the photograph runs under the translucent site
    // header too. This must not end up inside a transformed or filtered
    // ancestor — either would make it a containing block and crop the backdrop
    // to the game's own box.
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-page"
    >
      {panes.map((candidate) => {
        const isActive = candidate === shown.active;
        const isLeaving = candidate === shown.leaving;
        // -1 for panes older than the active one (off to the left), +1 newer.
        const side = Math.sign(panes.indexOf(candidate) - activeIndex);

        return (
          <div
            key={candidate}
            className="timeline-backdrop-layer absolute inset-0 transition-opacity ease-out"
            style={{
              background: PANE_WASH[candidate] ?? PANE_WASH.ce,
              opacity: isActive || isLeaving ? 1 : 0,
              // The only ordering that matters: incoming above outgoing.
              zIndex: isActive ? 2 : isLeaving ? 1 : 0,
              transitionDuration: `${CROSSFADE_MS}ms`,
            }}
          >
            {mounted.includes(candidate) && (
              // Plain <img>: R2 is an arbitrary remote host, and next/image
              // would have to be whitelisted per deployment to reach it.
              <img
                src={timelineBackdropUrl(candidate)}
                srcSet={timelineBackdropSrcSet(candidate)}
                sizes="100vw"
                alt=""
                draggable={false}
                decoding="async"
                fetchPriority={isActive ? "high" : "low"}
                className="timeline-backdrop-photo h-full w-full object-cover transition-transform ease-out"
                style={{
                  transform: isActive
                    ? `scale(${ACTIVE_SCALE})`
                    : `scale(${RESTING_SCALE}) translateX(${side * DRIFT_PERCENT}%)`,
                  transitionDuration: `${CROSSFADE_MS}ms`,
                }}
              />
            )}
          </div>
        );
      })}

      {/* Scrim. The game is white type over thin rules and small numerals, none
          of which survives a bright sky unaided. Heaviest top and bottom, where
          the header and the ruler's labels sit. */}
      <div
        className="absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.32) 24%, rgba(0,0,0,0.28) 54%, rgba(0,0,0,0.56) 100%)",
        }}
      />
      {/* Vignette, so the corners of a busy photograph stop competing with the
          centre of the screen. */}
      <div
        className="absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(118% 85% at 50% 46%, transparent 36%, rgba(0,0,0,0.38) 100%)",
        }}
      />
    </div>
  );
}

/** A pane and the panes one move away from it — everything reachable next. */
function neighbourhood(pane: TimelinePane, panes: PaneSet): TimelinePane[] {
  const index = panes.indexOf(pane);
  return panes.filter((_, candidate) => Math.abs(candidate - index) <= 1);
}
