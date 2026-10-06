"use client";

import { useEffect, useState } from "react";

import { TIMELINE_PANES, type TimelinePane } from "@/lib/game/timeline";
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
 * sunbaked antiquity, steel-blue recorded history, cold cyan future.
 */
const PANE_WASH: Record<TimelinePane, string> = {
  cosmos: "radial-gradient(120% 110% at 18% 0%, #33216b 0%, #150f33 46%, #04040c 100%)",
  evolution: "radial-gradient(120% 110% at 78% 8%, #3f5230 0%, #1d2616 48%, #060803 100%)",
  civilization:
    "radial-gradient(120% 110% at 28% 10%, #7a4a1f 0%, #39200d 48%, #0d0704 100%)",
  ce: "radial-gradient(120% 110% at 70% 6%, #1f3f63 0%, #121f31 48%, #04070c 100%)",
  future: "radial-gradient(120% 110% at 50% 0%, #0d5f66 0%, #0a2b33 46%, #02080a 100%)",
};

export function TimelineBackdrop({ pane }: { pane: TimelinePane }) {
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
    neighbourhood(pane),
  );

  useEffect(() => {
    setMounted((current) => {
      const wanted = neighbourhood(pane);
      return wanted.every((candidate) => current.includes(candidate))
        ? current
        : [...new Set([...current, ...wanted])];
    });
  }, [pane]);

  const activeIndex = TIMELINE_PANES.indexOf(shown.active);

  return (
    // Fixed and full-bleed, so the photograph runs under the translucent site
    // header too. This must not end up inside a transformed or filtered
    // ancestor — either would make it a containing block and crop the backdrop
    // to the game's own box.
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-page"
    >
      {TIMELINE_PANES.map((candidate) => {
        const isActive = candidate === shown.active;
        const isLeaving = candidate === shown.leaving;
        // -1 for panes older than the active one (off to the left), +1 newer.
        const side = Math.sign(TIMELINE_PANES.indexOf(candidate) - activeIndex);

        return (
          <div
            key={candidate}
            className="timeline-backdrop-layer absolute inset-0 transition-opacity ease-out"
            style={{
              background: PANE_WASH[candidate],
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
function neighbourhood(pane: TimelinePane): TimelinePane[] {
  const index = TIMELINE_PANES.indexOf(pane);
  return TIMELINE_PANES.filter(
    (_, candidate) => Math.abs(candidate - index) <= 1,
  );
}
