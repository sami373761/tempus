"use client";

import { useEffect, useRef, useState } from "react";

import {
  maxDigits,
  sanitizeDigits,
  type DateEntryValue,
} from "@/lib/game/date-entry";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The round's other way in: a date typed out, rather than dragged for.
 *
 * **A year field with its era seated at the end of it.** The number takes the
 * pill and the era is a chip flush inside its right-hand end, the way a unit
 * sits after an amount — "1492 CE", "1200 BCE". It used to be one control that
 * turned over, the chip sliding from one end of the pill to the other and the
 * number crossing the other way; in practice that read as a button loose
 * inside a field rather than part of it, and a control whose parts move every
 * time it is pressed never looks settled. Now nothing travels: the chip is
 * concentric with the pill (the same inset on every side, half its height for
 * a radius) and only its label changes, rolling up out of the chip as the new
 * one rolls in, so the press is answered in the place it was made.
 *
 * Nothing here holds the round's state or decides whether a date is good: it
 * takes a value, reports edits, and wears the warning it is told to. The rules
 * are in lib/game/date-entry.ts and the submit is the caller's.
 */

/**
 * The pill and its two parts, in pixels.
 *
 * **196px is the room the round's row actually has**, not a width chosen for
 * the control's own sake. The entry hangs off the left of the advance button,
 * which stands at the centre of the card above it, so what is left for the
 * pill is half the card (`CARD_BOX_WIDE`, 36rem, the cap it takes while the
 * rail is folded away) less half that button and the gap between the two. Any
 * wider and the entry starts to the left of the photograph it belongs to.
 *
 * 70px of chip holds the longest era abbreviation the dictionary has
 * ("ap. J.-C." in French, 51px at this weight and size) beside the swap glyph,
 * and the ~112px left over (less the pill's border) holds the eleven tabular digits of
 * 10,000,000,000 BCE — the oldest year the timeline reaches.
 */
const PILL_W = 196;
const PILL_PAD = 4;
const CHIP_W = 70;
const HALF_GAP = 4;

/**
 * The pill with no era at all (`eraHidden`): the chip's width and the gap
 * beside it come off, so what is left is the number's own box with the same
 * padding around it.
 */
const BARE_PILL_W = PILL_W - CHIP_W - HALF_GAP;

/**
 * `ROUND_BUTTON`'s height, written out, because the pill stands beside that
 * button and a pixel of difference would show as a step in the row. Re-measure
 * it if the button's padding or type size changes.
 */
export const ENTRY_H = "2.875rem";

const ROLL =
  "transition-[translate,opacity] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

export function DateEntry({
  value,
  onChange,
  onSubmit,
  disabled = false,
  invalid = false,
  shown,
  focusDelayMs = 0,
  eraHidden = false,
  placeholder,
  t,
}: {
  value: DateEntryValue;
  onChange: (value: DateEntryValue) => void;
  /** Enter in the field answers the round, like pressing the button beside it. */
  onSubmit: () => void;
  /** Locked in: the entry stays on screen showing the guess, but is no longer one. */
  disabled?: boolean;
  /** The date was refused. The caller prints the sentence; this draws the edge. */
  invalid?: boolean;
  /** Whether the control is the one on screen, which is what arms the focus below. */
  shown: boolean;
  /** How long the shell takes to open. Focusing a clipped field scrolls the page. */
  focusDelayMs?: number;
  /**
   * The game has no BCE years to guess, so the era is not drawn at all.
   *
   * A subject game whose rail starts after year 1 — film & television from
   * 1900, football from 1850 — can only ever refuse a BCE date. A switch whose
   * every result is the warning underneath reads as an invitation, and a dead
   * chip left in its place is a control that cannot be pressed: both are worse
   * than the era simply not being part of the question. So the chip goes, the
   * pill comes in by exactly the chip's width plus its gap, and what is left
   * is a field for a number.
   */
  eraHidden?: boolean;
  /**
   * What the empty field says. Defaults to the word "Year"; a game with a
   * narrow rail passes its own span instead ("1900–2026"), which is the one
   * place the limits can be stated before a date is refused for missing them.
   */
  placeholder?: string;
  t: Dict;
}) {
  const bce = !eraHidden && value.era === "BCE";
  const field = useRef<HTMLInputElement>(null);

  // Arriving in this mode should mean being able to type, not having to click
  // first. Held until the shell has finished opening — a field focused while
  // its container is still clipped is one the browser may scroll into view, on
  // a page built not to scroll — and skipped where there is no pointer, since
  // on a phone the keyboard would cover the screen the moment the mode
  // changed.
  useEffect(() => {
    if (!shown || disabled) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    const timer = window.setTimeout(() => field.current?.focus(), focusDelayMs);
    return () => window.clearTimeout(timer);
  }, [shown, disabled, focusDelayMs]);

  /**
   * Switching era. The digits are re-sanitised rather than kept verbatim,
   * because the two eras do not hold the same number of them: a BCE year
   * carried into CE has to come down to what a CE year can be.
   */
  function switchEra() {
    const era = bce ? "CE" : "BCE";
    onChange({ era, digits: sanitizeDigits(value.digits, era) });
    field.current?.focus();
  }

  return (
    <div
      className={`flex shrink-0 items-center rounded-full border backdrop-blur-md transition-colors ${
        invalid
          ? "border-bad/70 bg-bad/10"
          : // The field itself draws no outline (it is a borderless slot in
            // this pill), so the pill's own edge is what says it has focus.
            // Hover only lifts an unfocused pill: Tailwind emits `hover`
            // after `focus-within`, so a plain hover would dim a focused
            // field's edge back under the pointer.
            "border-white/30 bg-black/50 hover:not-focus-within:border-white/50 focus-within:border-white/80 focus-within:bg-black/60"
      }`}
      style={{
        width: eraHidden ? BARE_PILL_W : PILL_W,
        height: ENTRY_H,
        padding: PILL_PAD,
        gap: HALF_GAP,
      }}
    >
      <input
        ref={field}
        type="text"
        // Not `type="number"`: it brings spinners this row has no room for and
        // accepts `e`, `+` and `-` as the beginnings of a number. A text field
        // told to raise the numeric keypad is the same affordance without any
        // of that.
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={t.yearLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={value.digits}
        // The era's own width, and a second line of defence: `sanitizeDigits`
        // is what actually holds the cap, including for a paste, but this
        // stops the browser from ever showing a character it will not keep.
        maxLength={maxDigits(value.era)}
        placeholder={placeholder ?? t.yearLabel}
        onChange={(event) =>
          onChange({
            era: value.era,
            digits: sanitizeDigits(event.target.value, value.era),
          })
        }
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onSubmit();
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-base font-semibold tracking-tight tabular-nums text-ink outline-none placeholder:text-[14px] placeholder:font-normal placeholder:text-ink-dim focus-visible:outline-none disabled:opacity-70"
      />

      {/* The era, seated in the end of the pill. Solid enough to read as the
          thing to press, but short of the advance button's flat white — there
          is one primary action in this row and it is not this. */}
      {!eraHidden && (
        <button
          type="button"
          onClick={switchEra}
          disabled={disabled}
          aria-label={t.eraSwitch}
          className="flex h-full shrink-0 items-center justify-center gap-[3px] rounded-full bg-white/[0.14] text-[13px] font-semibold tracking-tight text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-colors hover:bg-white/[0.22] active:bg-white/[0.28] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-60"
          style={{ width: CHIP_W }}
        >
          {/* Two labels in one slot: the outgoing one rolls up and out while
              the incoming one rolls up into place. */}
          <span className="relative block h-[1.2em] w-[51px] overflow-hidden">
            <span
              className={`${ROLL} absolute inset-0 flex items-center justify-center whitespace-nowrap ${
                bce ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"
              }`}
            >
              {t.commonEra}
            </span>
            <span
              className={`${ROLL} absolute inset-0 flex items-center justify-center whitespace-nowrap ${
                bce ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
              }`}
            >
              {t.bce}
            </span>
          </span>
          <SwapGlyph />
        </button>
      )}
    </div>
  );
}

/** Up over down: the chip is a choice between two, and this says so. */
function SwapGlyph() {
  return (
    <svg
      viewBox="0 0 8 12"
      aria-hidden
      className="h-[10px] w-[7px] shrink-0 text-ink-dim"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 4.25 4 1.75l2.5 2.5M1.5 7.75 4 10.25l2.5-2.5" />
    </svg>
  );
}

/**
 * The width below which there is no typing a date at all: the rail is the only
 * way to answer a round.
 *
 * `md`, the same breakpoint the controls row already changes shape at. Two
 * reasons it is a rule rather than a preference the player can override:
 *
 *   * **The entry costs a phone a row it has not got.** Above `md` the pill,
 *     the advance button and the switch stand across one line; below it the
 *     pill drops to a line of its own, which on a screen that is one viewport
 *     and must not scroll comes out of the photograph. The whole round pays
 *     for a control most players never press.
 *   * **It is not the better input there anyway.** Raising the numeric keypad
 *     on a phone covers the game — the picture, the rail and the button all
 *     go behind it — which is why the entry never takes focus on a touch
 *     screen in the first place (see the focus effect above). A drag is the
 *     affordance a phone actually has.
 *
 * The switch is hidden by a CSS class as well as by this hook, so it is never
 * painted for a frame before the hook has a window to measure; the hook is
 * what stops a player who turned the entry on at a desktop width and then
 * narrowed the window from being left with a folded-away field as their only
 * way to answer.
 */
export const KEYBOARD_ENTRY_QUERY = "(min-width: 768px)";

/** Whether this window is wide enough to type a date in. */
export function useKeyboardEntry(): boolean {
  // False until measured, which matches the server's render and the class the
  // switch is hidden with: the narrow case is the safe default, because it
  // only ever removes a second way of doing something the rail already does.
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(KEYBOARD_ENTRY_QUERY);
    const sync = () => setAllowed(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return allowed;
}

/**
 * The switch between the two ways of answering: the rail, or the entry above.
 *
 * It is the site menu's button — the same box (`--menu-btn`), the same glass,
 * the same ring — because it is the same kind of thing in the same kind of
 * place: one round control at the edge of the row, carrying a glyph rather
 * than a word. Only the glyph says which way it goes, and the two crossfade
 * rather than switching, so the press is answered on the button itself.
 */
export function InputModeToggle({
  direct,
  onToggle,
  disabled = false,
  t,
}: {
  /** Which mode is on now, which is also which glyph is showing. */
  direct: boolean;
  onToggle: () => void;
  disabled?: boolean;
  t: Dict;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={direct ? t.useTimeline : t.enterDate}
      aria-pressed={direct}
      className="relative flex h-[var(--menu-btn)] w-[var(--menu-btn)] items-center justify-center rounded-full border border-white/15 bg-white/10 text-ink backdrop-blur-xl transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none"
    >
      <span
        className={`absolute transition-[opacity,scale] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          direct ? "scale-75 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <CalendarIcon />
      </span>
      <span
        className={`absolute transition-[opacity,scale] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          direct ? "scale-100 opacity-100" : "scale-75 opacity-0"
        }`}
      >
        <ClockIcon />
      </span>
    </button>
  );
}

/* One weight for both glyphs, matching the menu's own line icons. */
const ICON = {
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  className: "h-[18px] w-[18px]",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function CalendarIcon() {
  return (
    <svg {...ICON}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8.5 3.5v4M15.5 3.5v4" />
      <path d="M8 14h2M8 17.5h2M14 14h2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
