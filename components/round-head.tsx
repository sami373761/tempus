"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A round's masthead: the game's name, optionally where you are in the set,
 * and — on demand — what the game is asking.
 *
 * **It is rendered by the game, not by the page**, because it has to go when
 * the round does: a summary replaces the round outright, and a masthead asking
 * "which of the two dates…" over a finished set is the page asking a question
 * that is no longer on screen. Only the game knows the set is over.
 *
 * **It is `fixed`, in the top bar's own row, and that is what makes it free.**
 * Every game screen on this site is exactly one viewport and must not scroll,
 * and several of them are a hand-maintained height sum (`--compare-chrome`),
 * so a title in the flow is a title the photographs pay for. In the bar's row
 * it costs the budget nothing. Its `top` is solved the way the menu button's
 * is, from the bar's height and its own, so the three things on that row share
 * a centre line rather than three independent numbers.
 *
 * **It is in that row on a phone too**, between the wordmark and the menu
 * button, which is what the two bookends were brought down a notch for
 * (`--menu-btn` 34px, the wordmark `text-base`, the bar itself 58px; all three
 * in app/globals.css). The ~215px that leaves at 375px is enough for the pill
 * at `text-[13px]`.
 *
 * **One type size for both halves**, and it is the `Tempus` wordmark's: the
 * pill reads as the one masthead the row already has, not as a heading with a
 * counter stuck to it.
 *
 * **The blurb unrolls rather than standing under the title.** It is a live
 * instruction and it is read once, so it is available rather than permanent.
 * The mechanism is the home board's card descriptions' — `grid-template-rows:
 * 0fr -> 1fr` with the child owning the overflow, which is the only way to
 * animate a height out of nothing without measuring one in JavaScript — and
 * the text is always in the document, so a screen reader gets the instruction
 * whether or not anything was opened.
 *
 * **Hover opens it on a pointer, a press opens it on a phone.** Hover alone is
 * what it had, and `group-hover:` compiles inside `@media (hover: hover)`, so
 * on a touch screen the instruction was unreachable — which is exactly the
 * screen the film and "Born When?" games took their printed description off
 * to give the picture the room. So the pill is a button whenever it has
 * something to say: a press latches it open, a press outside or Escape closes
 * it, and hover still works untouched on a desktop.
 *
 * Two things hold the shape up.
 *
 * **The radius is half the closed height, written as exactly that.** A pill
 * that opens is the explorer's problem, not the button's: `rounded-full`
 * resolves against the box, so the corners would tighten and slacken through
 * the whole 420ms and the thing would read as a rubber sheet rather than as a
 * panel. One constant gives the stadium closed and holds it open.
 *
 * **Only the pill is a pointer target.** The wrapper and the unrolled row are
 * `pointer-events-none`, so the open panel — which hangs over the top of
 * whatever the round has put under it — cannot swallow the drag that starts
 * the round. Hover still reaches the card, because an element is `:hover`
 * whenever the hit target is one of its descendants.
 */
export function RoundHead({
  title,
  counter = null,
  blurb = null,
}: {
  /** The game's name. Gives way before the counter does; see `min-w-0`. */
  title: string;
  /**
   * Where the round stands, already rendered as a string by the game that
   * owns the count — "3 of 10" in a set, "12 correct" in a run. Null is a
   * screen that counts somewhere else: the film and "Born When?" games print
   * their progress in the corner of the picture, where a portrait leaves room
   * a landscape one does not.
   */
  counter?: string | null;
  /** What the game is asking. Null is a pill with nothing to open. */
  blurb?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pill = useRef<HTMLDivElement>(null);

  // A latched panel has to be closable by something other than the control
  // that opened it, or a phone is left with the instruction over the round.
  // Scoped to the open state so neither listener exists while it is shut.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (pill.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      // In the bar's own row at every width. Below `sm` it is held off the two
      // things already in that row rather than centred in it: 24px of page
      // padding plus the `text-base` wordmark's ~62px plus 8px of air on the
      // left, and 24px plus the 34px button plus 8px on the right — which
      // leaves the pill 215px at 375px and lands it in the gap instead of
      // across the wordmark. From `sm` the row is wide enough to centre in.
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center pl-[5.875rem] pr-[4.125rem] sm:px-6"
      style={
        {
          // `--compare-head` is the closed pill's height and lives in
          // app/globals.css, because it changes with the breakpoint and an
          // inline style is the one place a media query cannot reach. The
          // row's centre line and the corner radius are both read off it, so
          // neither can drift from the box.
          top: "calc((var(--site-bar-h) - var(--compare-head)) / 2)",
        } as React.CSSProperties
      }
    >
      <div
        ref={pill}
        data-open={open}
        // The focus ring is drawn here, for the button inside: the button
        // fills the pill's padding box, so a ring of its own would be cut
        // off by this `overflow-hidden`. An element's outline is never
        // clipped by its own overflow, and nothing above this clips.
        className="group w-full max-w-[21rem] overflow-hidden rounded-[calc(var(--compare-head)/2)] border border-white/15 bg-black/45 shadow-xl shadow-black/60 backdrop-blur-xl sm:w-[21rem] has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-accent"
      >
        {/* A button only when there is something to open. A pill that is a
            control and does nothing when pressed is worse than a pill that
            plainly is not one, so the element itself changes rather than its
            handler. */}
        <HeadRow
          onPress={blurb ? () => setOpen((current) => !current) : null}
          open={open}
        >
          {/* `min-w-0` is what lets the title give way rather than push the
              counter out of the pill: Turkish's "10 sorudan 1." is the longest
              pair and the gap on a 320px screen is narrower than it. */}
          <span className="min-w-0 truncate font-display text-[13px]/[1.25rem] font-semibold tracking-[-0.01em] text-ink sm:text-lg">
            {title}
          </span>
          {counter && (
            <>
              {/* The dot carries the row's type size too, or its own 16px line
                  box sets the pill's height and `--compare-head` no longer
                  describes the box the centre line is solved from. */}
              <span className="px-1.5 text-[13px]/[1.25rem] text-white/30 sm:px-2 sm:text-lg">
                ·
              </span>
              <span className="shrink-0 font-display text-[13px]/[1.25rem] font-semibold tracking-[-0.01em] tabular-nums text-white/70 sm:text-lg">
                {counter}
              </span>
            </>
          )}
        </HeadRow>

        {blurb && (
          <div className="compare-head-blurb pointer-events-none grid grid-rows-[0fr] transition-[grid-template-rows] duration-[420ms] ease-out group-hover:grid-rows-[1fr] group-data-[open=true]:grid-rows-[1fr]">
            <div className="overflow-hidden">
              <p className="px-5 pb-3 text-center text-xs leading-snug text-white/70 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 group-data-[open=true]:opacity-100">
                {blurb}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The closed pill's one row, as a button where it opens something and as a
 * plain box where it does not.
 *
 * Split out so the two spellings cannot drift in padding: the row's height is
 * `--compare-head`, which the masthead's corner radius and its position in the
 * bar are both solved from, and a button with different padding from the box
 * it replaces would move the whole thing off the bar's centre line.
 */
function HeadRow({
  onPress,
  open,
  children,
}: {
  onPress: (() => void) | null;
  open: boolean;
  children: React.ReactNode;
}) {
  const box =
    "pointer-events-auto flex w-full items-center justify-center px-3 py-1.5 sm:px-5 sm:py-2";

  if (!onPress) return <div className={box}>{children}</div>;

  return (
    <button
      type="button"
      onClick={onPress}
      aria-expanded={open}
      // Its ring is the pill's (`has-[>button:focus-visible]` above).
      className={`${box} text-left focus-visible:outline-none`}
    >
      {children}
    </button>
  );
}
