import { EVENT_PLACEHOLDER_IMAGE } from "@/lib/game/rounds";
import type { LocalizedEvent } from "@/lib/db/types";

/**
 * An event's picture.
 *
 * Takes only the picture rather than the whole event, which is what lets the
 * head-to-head mode render a round from a `MaskedEvent` — the shape with the
 * answer removed (lib/game/versus.ts). Asking for a `LocalizedEvent` here
 * would have meant the component with no use for a year demanding one.
 */
export function EventVisual({
  event,
  className = "",
  sizes,
}: {
  event: { image: LocalizedEvent["image"] };
  className?: string;
  sizes?: string;
}) {
  const src = event.image?.url ?? EVENT_PLACEHOLDER_IMAGE;

  return (
    // Plain <img>: R2 is an arbitrary remote host and next/image would need it
    // whitelisted per deployment, while the placeholder is a local SVG.
    <img
      src={src}
      alt=""
      sizes={sizes}
      draggable={false}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
