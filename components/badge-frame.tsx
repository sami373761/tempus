import { RING_BOX, type Badge } from "@/lib/badges";

/**
 * One badge, optionally worn around a picture.
 *
 * The badge is a ring and the picture goes through it, so the two are stacked
 * rather than placed side by side: the avatar is laid down first and the
 * artwork over it, which is what lets an ornament overlap the picture's edge —
 * the gem that hangs off the bottom of four of these sits *on* the photograph,
 * and painting the ring underneath would hide it behind a circle of face.
 *
 * **Everything is sized off one number.** `avatar` is the diameter of the
 * picture in pixels; the frame's box and the hole's position inside it are
 * multiples of that diameter, measured per badge in `lib/badges.ts`. So the
 * same `avatar` value produces the same picture under all six badges with the
 * ornaments growing around it, which is the comparison the page exists to
 * make. Nothing here is a percentage of the card.
 *
 * Without `avatarSrc` the hole is left empty and the card surface shows
 * through it. That is the gallery's state: the badge on its own is what the
 * list is about, and a stand-in face in every one of six cards would be the
 * loudest thing on the page.
 *
 * Plain `<img>`, like every other picture on the site. The artwork is already
 * WebP at a fixed width, so the only thing `next/image` could add here is a
 * re-encode — and the preview bench changes `avatar` on every step of a
 * slider, which through `next/image` would be a trip to the optimiser per
 * step for a file that never changes.
 *
 * **`align` is how two badges are made to look aligned.** By default the
 * element *is* the artwork's box, which is what a caller wants when it is
 * placing one badge. Put two of them in a row that way and they come out
 * crooked: the ring is several per cent off the centre of every one of these
 * six files, differently each time, so centring the boxes scatters the
 * circles. `align="ring"` pads the element out to `RING_BOX` and hangs the
 * artwork inside it so the *ring* lands at the element's centre — then the one
 * thing every badge has in common is the one thing a row lines up on.
 */
export function BadgeFrame({
  badge,
  avatar,
  avatarSrc,
  holeContent,
  artworkStyle,
  align = "frame",
  className = "",
}: {
  badge: Badge;
  /** Diameter of the profile picture, in pixels. Sizes the whole badge. */
  avatar: number;
  /** The picture to put through the ring. Omitted leaves the hole empty. */
  avatarSrc?: string;
  /**
   * Anything to sit in the ring's hole instead of a picture — the "?" the
   * achievements page puts inside an unrevealed badge. It is laid out in the
   * hole's own box, which is the whole reason it is a prop rather than
   * something a caller positions: the hole is several per cent off the centre
   * of the file on every one of these six, and `badge.frame` is the only place
   * that is written down.
   */
  holeContent?: React.ReactNode;
  /**
   * Applied to the artwork only, never to the avatar or the hole. The
   * achievements page darkens a locked badge and all but blacks out an
   * unrevealed one through this.
   */
  artworkStyle?: React.CSSProperties;
  /**
   * What the element's box is measured on. `"frame"` makes it the artwork's
   * own box — one badge, placed by its caller. `"ring"` makes it the shared
   * `RING_BOX` with the ring at its centre, which is what any *row* or *column*
   * of badges wants: see the note above.
   */
  align?: "frame" | "ring";
  className?: string;
}) {
  const { w, h, x, y } = badge.frame;

  /* The hole, in the frame's own box. Both the avatar and `holeContent` use
     it, so the two can never disagree about where the picture goes. */
  const hole: React.CSSProperties = {
    left: Math.round(x * avatar),
    top: Math.round(y * avatar),
    width: avatar,
    height: avatar,
  };

  const frameBox: React.CSSProperties = {
    width: Math.round(w * avatar),
    height: Math.round(h * avatar),
  };

  /* Ring-centred: the frame is offset so that the ring's centre — at
     `(x + 0.5, y + 0.5)` avatars into the frame — falls on the middle of the
     padded box. `RING_BOX` is sized so no badge's artwork reaches past it. */
  const offset =
    align === "ring"
      ? {
          left: Math.round((RING_BOX.w / 2 - (x + 0.5)) * avatar),
          top: Math.round((RING_BOX.h / 2 - (y + 0.5)) * avatar),
        }
      : null;

  const art = (
    <div
      className={offset ? "absolute" : `relative shrink-0 ${className}`}
      style={offset ? { ...frameBox, ...offset } : frameBox}
    >
      {avatarSrc ? (
        // Positioned off the frame's own box rather than centred in it: on
        // none of these six is the hole at the centre of the artwork.
        <img
          src={avatarSrc}
          alt=""
          aria-hidden="true"
          className="absolute rounded-full object-cover"
          style={hole}
        />
      ) : null}

      {holeContent ? (
        <span
          aria-hidden="true"
          className="absolute flex items-center justify-center"
          style={hole}
        >
          {holeContent}
        </span>
      ) : null}

      {/* Decoration, so it carries no alt text: the badge's name is written
          beside it everywhere this is used. */}
      <img
        src={badge.src}
        alt=""
        aria-hidden="true"
        style={artworkStyle}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
      />
    </div>
  );

  if (!offset) return art;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{
        width: Math.round(RING_BOX.w * avatar),
        height: Math.round(RING_BOX.h * avatar),
      }}
    >
      {art}
    </div>
  );
}
