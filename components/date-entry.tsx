"use client";

import { useEffect, useRef } from "react";

import {
  maxDigits,
  sanitizeDigits,
  type DateEntryValue,
} from "@/lib/game/date-entry";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The round's other way in: a date typed out, rather than dragged for.
 *
 * It is one control that transforms rather than two that swap. Pressing the
 * era slides it to the far end of the pill and the number crosses the other
 * way, so "CE 1492" becomes "1492 BCE" — which is how a date is written in
 * both eras, and is the whole of the reason the two halves change places
 * instead of the label simply changing its text. A player who has read "BCE"
 * on the right has read the number on the left as the year before it.
 *
 * **The geometry is fixed and the halves only translate.** The pill, the era
 * chip and the number's box all keep the same size in both states, so the
 * change of state is one transform per half and nothing reflows: a layout
 * that resized would re-wrap the label mid-slide and the control would read as
 * correcting itself rather than as turning over. The chip is wide enough for
 * the longest era abbreviation in any of the five languages, which is why it
 * is a constant here rather than `fit-content`.
 *
 * **The number is centred in its own box in both states**, not aligned towards
 * the label it belongs to. Flipping the alignment would be the one thing on
 * this control that cuts rather than travels, and it lands exactly in the
 * middle of the slide.
 *
 * Nothing here holds the round's state or decides whether a date is good: it
 * takes a value, reports edits, and wears the warning it is told to. The rules
 * are in lib/game/date-entry.ts and the submit is the caller's.
 */

/**
 * The pill and its two halves, in pixels, because every position below is one
 * of these subtracted from another and a fixed box is what lets the halves
 * cross by translating.
 *
 * **196px is the room the round's row actually has**, not a width chosen for
 * the control's own sake. The entry hangs off the left of the advance button,
 * which stands at the centre of the card above it, so what is left for the
 * pill is half the card (`CARD_BOX_WIDE`, 36rem, the cap it takes while the
 * rail is folded away) less half that button and the gap between the two. Any
 * wider and the entry starts to the left of the photograph it belongs to,
 * which reads as the row having slipped rather than as a control standing
 * beside a button. A language whose "lock in guess" is long enough —
 * German's is 206px — overruns that budget on its own and the entry reaches
 * past the card again; nothing this file can set would fix that, since the
 * overrun is the button's.
 *
 * The two halves then take what the width allows: 64px of chip clears the
 * longest abbreviation the dictionary has ("ap. J.-C." in French, 51px at
 * this weight and size), and the 118px left over holds the eleven tabular
 * digits of 10,000,000,000 BCE — the oldest year the timeline reaches, and
 * the only case that comes anywhere near filling it.
 */
const PILL_W = 196;
const PILL_PAD = 4;
const CHIP_W = 64;
const HALF_GAP = 6;

/** Where the number sits with CE on the left, and how far it travels. */
const FIELD_LEFT = PILL_PAD + CHIP_W + HALF_GAP;
const FIELD_W = PILL_W - PILL_PAD - FIELD_LEFT;
/** The chip's own journey: from the near edge to the far one. */
const CHIP_TRAVEL = PILL_W - PILL_PAD * 2 - CHIP_W;

/**
 * The pill with no era half at all (`eraHidden`): the chip's width and the gap
 * beside it come off, so what is left is the number's own box with the same
 * padding around it. Written as a subtraction rather than as a second constant
 * so it cannot drift from the box the field already had.
 */
const BARE_PILL_W = PILL_W - CHIP_W - HALF_GAP;

/**
 * `ROUND_BUTTON`'s height, written out, because the pill lays its halves out
 * absolutely and so cannot be sized by its own content. It stands beside that
 * button and a pixel of difference would show as a step in the row. Re-measure
 * it if the button's padding or type size changes.
 */
export const ENTRY_H = "2.875rem";

const SLIDE =
  "transition-transform duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

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
   * The game has no BCE years to guess, so the era half is not drawn at all.
   *
   * A subject game whose rail starts after year 1 — film & television from
   * 1900, football from 1850 — can only ever refuse a BCE date. A switch whose
   * every result is the warning underneath reads as an invitation, and a dead
   * chip left in its place is a control that cannot be pressed: both are worse
   * than the era simply not being part of the question. So the chip goes, the
   * pill comes in by exactly the chip's width plus its gap, and what is left
   * is a field for a number — which is all this game ever asks for, since
   * every year it deals is a four-digit CE one.
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
  // With no era half there is no press that can reach BCE, so the number is
  // never drawn as if one had: it stays in the one place the bare pill has.
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
   * Turning the control over. The digits are re-sanitised rather than kept
   * verbatim, because the two eras do not hold the same number of them: a BCE
   * year carried into CE has to come down to what a CE year can be.
   */
  function switchEra() {
    const era = bce ? "CE" : "BCE";
    onChange({ era, digits: sanitizeDigits(value.digits, era) });
    field.current?.focus();
  }

  return (
    <div
      className={`relative shrink-0 rounded-full border backdrop-blur-md transition-colors ${
        invalid
          ? "border-bad/70 bg-bad/10"
          : "border-white/45 bg-black/45 hover:border-white/60"
      }`}
      style={{ width: eraHidden ? BARE_PILL_W : PILL_W, height: ENTRY_H }}
    >
      {/* The era, which is also the control that turns the pill over. Solid
          enough to read as the thing to press, but short of the advance
          button's flat white — there is one primary action in this row and it
          is not this. Absent entirely where the game has only one era. */}
      {!eraHidden && (
        <button
          type="button"
          onClick={switchEra}
          disabled={disabled}
          aria-label={t.eraSwitch}
          className={`${SLIDE} absolute top-1/2 flex items-center justify-center rounded-full border border-white/20 bg-white/15 text-[13px] font-semibold tracking-tight text-ink hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-60`}
          style={{
            left: PILL_PAD,
            width: CHIP_W,
            height: `calc(${ENTRY_H} - ${PILL_PAD * 2}px)`,
            // The vertical centring is written out here rather than left to a
            // `-translate-y-1/2` class, because Tailwind v4 compiles that to
            // the `translate` *property* and this is the `transform` one — the
            // two compose instead of overriding, so the pair would centre the
            // half twice and the chip would sit a full height above the pill.
            transform: `translate(${bce ? CHIP_TRAVEL : 0}px, -50%)`,
          }}
        >
          {/* Two labels in one box, stacked and crossfaded. The chip travels
              and the word dissolves inside it, which is what makes this one
              control changing state rather than two chips trading places. */}
          <span className="relative block h-[1.1em] w-full overflow-hidden">
            <span
              className={`absolute inset-0 flex items-center justify-center whitespace-nowrap transition-opacity duration-[300ms] ${
                bce ? "opacity-0" : "opacity-100"
              }`}
            >
              {t.commonEra}
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center whitespace-nowrap transition-opacity duration-[300ms] ${
                bce ? "opacity-100" : "opacity-0"
              }`}
            >
              {t.bce}
            </span>
          </span>
        </button>
      )}

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
        className={`${SLIDE} absolute top-1/2 rounded-full bg-transparent text-center text-base font-semibold tabular-nums text-ink outline-none placeholder:text-[13px] placeholder:font-normal placeholder:tracking-tight placeholder:text-ink-dim focus-visible:outline-none disabled:opacity-70`}
        style={{
          // With the era gone the field is the pill: it starts at the padding
          // and takes everything inside it, rather than sitting in the half
          // the chip left over.
          left: eraHidden ? PILL_PAD : FIELD_LEFT,
          width: eraHidden ? BARE_PILL_W - PILL_PAD * 2 : FIELD_W,
          // Centred here for the same reason as the chip above.
          transform: `translate(${bce ? PILL_PAD - FIELD_LEFT : 0}px, -50%)`,
        }}
      />
    </div>
  );
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
