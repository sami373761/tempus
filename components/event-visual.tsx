"use client";

import { useState } from "react";

import { EVENT_PLACEHOLDER_IMAGE } from "@/lib/game/rounds";
import type { LocalizedEvent } from "@/lib/db/types";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * An event's picture, and the gate in front of the few that need one.
 *
 * Takes only the picture and the flag rather than the whole event, which is
 * what lets the head-to-head mode render a round from a `MaskedEvent` — the
 * shape with the answer removed (lib/game/versus.ts). Asking for a
 * `LocalizedEvent` here would have meant the component with no use for a year
 * demanding one.
 *
 * **The gate lives here rather than in each game**, because this is the single
 * component every photograph on the site passes through: the date-guessing
 * card, the daily, the head-to-head round and all three bubbles of the
 * comparison game. A flag honoured in one screen and forgotten in another
 * would be worse than no flag at all.
 */
export function EventVisual({
  event,
  className = "",
  sizes,
  t,
}: {
  event: { image: LocalizedEvent["image"]; isSensitive?: boolean };
  className?: string;
  sizes?: string;
  /**
   * Needed only to label the gate. Optional so a surface that can never deal a
   * sensitive event — a decorative or editorial one — does not have to thread a
   * dictionary down to it; without it the picture is simply shown, which is the
   * same thing that happens for the other 319 events.
   */
  t?: Dict;
}) {
  const src = event.image?.url ?? EVENT_PLACEHOLDER_IMAGE;

  // A round with no photograph cannot be gated — hence the null key rather
  // than `?? ""`, since the placeholder is the same URL for every event.
  const key = event.image?.objectKey ?? null;
  const gated = Boolean(event.isSensitive) && t !== undefined && key !== null;

  // Read once at mount from the session's set, so a picture already revealed
  // is not gated a second time by a *different instance* of this component.
  // That is the normal case rather than an edge one: both games cross-dissolve
  // a round by mounting the outgoing picture into a second layer, so without
  // this the photograph you just chose to look at would blur again on its way
  // out. Comparing against `key` as well covers the opposite case — an
  // instance that survives while its picture changes closes the gate again.
  const [revealedKey, setRevealedKey] = useState<string | null>(() =>
    key !== null && revealedThisSession.has(key) ? key : null,
  );
  const hidden = gated && revealedKey !== key;

  const picture = (
    // Plain <img>: R2 is an arbitrary remote host and next/image would need it
    // whitelisted per deployment, while the placeholder is a local SVG.
    <img
      src={src}
      alt=""
      sizes={sizes}
      draggable={false}
      // Scaled up under the blur because a blur samples the transparent space
      // beyond the element's edges, which would otherwise show as a pale
      // border inside the card's own rounded frame. The transition is only
      // worth having on a picture that can actually change state.
      className={`h-full w-full object-cover ${
        gated ? "transition-[filter,transform] duration-500" : ""
      } ${hidden ? "scale-110 blur-2xl" : ""} ${className}`}
    />
  );

  if (!gated) return picture;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {picture}

      {hidden && (
        <button
          type="button"
          onClick={() => {
            revealedThisSession.add(key);
            setRevealedKey(key);
          }}
          // The comparison game drags its floating card by the picture and
          // takes pointer capture on `pointerdown`, which would swallow this
          // button's click. Stopping the press here means a gated picture
          // answers the first press by revealing itself and is draggable
          // afterwards, which is the right order: an interstitial should take
          // the first interaction.
          onPointerDown={(pressEvent) => pressEvent.stopPropagation()}
          className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-2 bg-black/45 px-4 text-center backdrop-blur-sm transition-colors hover:bg-black/35 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
        >
          <EyeOff />
          <span className="on-photo text-[13px] font-semibold leading-tight text-white">
            {t.sensitiveTitle}
          </span>
          <span className="on-photo text-[11px] leading-tight text-white/70 underline decoration-white/30 underline-offset-2">
            {t.sensitiveReveal}
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Pictures this visitor has chosen to look at, by R2 object key.
 *
 * Module scope, so it is one set per page load and is never persisted: the
 * choice outlives the component that was asked for it — which is what makes a
 * cross-dissolve work — without outliving the visit. Nothing subscribes to it;
 * the only writer is the click below, which sets component state in the same
 * breath, so there is no change for anything else to miss.
 */
const revealedThisSession = new Set<string>();

/** An eye with a stroke through it: "this is being withheld", not "danger". */
function EyeOff() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-7 w-7 shrink-0 stroke-white/85"
      fill="none"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M4 20 20 4" />
    </svg>
  );
}
