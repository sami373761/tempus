import type { ReactNode } from "react";

/**
 * What a solo game route shows between the click and its opening deal — the
 * `loading.tsx` of each game segment.
 *
 * Every solo page awaits its first rounds before it can render, and that read
 * crosses to a database on the other side of the world. Without a boundary the
 * click did nothing visible for the whole of it; with one, Next.js prefetches
 * this state and paints it at once, then swaps the game in when it streams.
 *
 * It is the page's own frame and the page's own backdrop, not a generic
 * placeholder, so the swap changes only what is inside the frame:
 *
 *   * `frame` is the page's outer class list repeated verbatim — the
 *     one-viewport height and the same safety valve — so this state cannot
 *     scroll where the game cannot, and nothing jumps when the game arrives;
 *   * `backdrop` is the component the game itself paints behind it, on the
 *     game's opening pane, which loads the derived widths the game will reuse
 *     rather than a picture of its own.
 *
 * The ring is infinite motion, so it stops outright under reduced motion and
 * the line of text carries the state alone.
 */
export function GameLoading({
  frame,
  backdrop,
  title,
  label,
}: {
  frame: string;
  backdrop: ReactNode;
  title: string;
  label: string;
}) {
  return (
    <div className={frame}>
      {backdrop}

      <div
        role="status"
        className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
      >
        <span
          aria-hidden
          className="on-photo size-10 rounded-full border-2 border-white/15 border-t-white/80 animate-spin motion-reduce:animate-none"
        />
        <div className="on-photo flex flex-col gap-1.5">
          <span className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">
            {title}
          </span>
          <span className="text-sm text-white/70">{label}</span>
        </div>
      </div>
    </div>
  );
}
