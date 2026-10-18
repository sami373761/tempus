"use client";

import { useEffect, useRef } from "react";

import { VersusChoice, type VersusChoiceProps } from "@/components/versus-start";

/**
 * The 1v1 window: the two ways into head-to-head, opened where the player
 * already is.
 *
 * **It exists so that choosing costs nothing.** Pressing "1v1" on the home
 * board used to be a navigation to `/versus`, which is a request-rendered page
 * a long way from the database (see CLAUDE.md) — so the first thing a player
 * who wanted a match got was a wait, and at the end of it two buttons. The
 * choice is two buttons and some art: it does not need a page. The window
 * puts both in front of them in the time it takes to paint, and the
 * navigation happens on the press that actually means something — into a
 * search lobby, or into an invitation. `/versus` is unchanged and still the
 * page a link, a bookmark or a modified click lands on.
 *
 * **The cards are the page's own**, not a second copy of them: `VersusChoice`
 * is the pair with no page around it, so the window and the route cannot
 * drift apart. What is here is only the window — the ground, the way out, and
 * the keyboard's business while it is open.
 *
 * **Mounted on the press, not on load.** The two cards carry ~200KB of art
 * between them, and the home page is the one screen on the site every visitor
 * pays for. Keeping the window in the tree from the start would have bought
 * an instant second open at the cost of every first paint; the text and the
 * buttons are there the moment it opens either way, and the art arrives over
 * a ground that is already dark.
 */
export function VersusDialog({
  open,
  onClose,
  ...choice
}: VersusChoiceProps & { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  /* The way out, readable from the keyboard handler without being a reason to
     run the effect again. It is an inline arrow at the call site, so a new one
     arrives on every render of the board — and an effect that re-ran on each
     of those would re-lock the page, take focus back off whatever was inside
     the window, and hand it to the card that opened it on the way out. */
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    // Where focus was, so it can go back there — the board card that opened
    // this. Checked for `isConnected` on the way back, because the ordinary
    // way out of this window is a navigation that takes the board with it.
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });

    // The page behind must not scroll under the window. `paddingRight` is the
    // scrollbar the lock takes away: on a platform with a classic scrollbar,
    // locking without it moves the whole page sideways at the moment the
    // window opens.
    const { body } = document;
    const overflowWas = body.style.overflow;
    const paddingWas = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;

      // Tab cycles inside the window rather than wandering onto the page it
      // covers. Queried on every press, not once: the friend card swaps its
      // button for a board of four when the picker opens.
      const stops = panel.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (!stops || stops.length === 0) return;

      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = overflowWas;
      body.style.paddingRight = paddingWas;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      // The ground, and the way out for anyone who opened this by accident: a
      // press anywhere that is not the window closes it. `onMouseDown` rather
      // than `onClick`, so a drag that *starts* inside the window and ends on
      // the backdrop — selecting the invite text, missing a card by a few
      // pixels — does not close it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-2xl sm:px-6"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={choice.t.duelTitle}
        tabIndex={-1}
        // `my-auto` centres the window while there is room and gives way when
        // the picker makes it taller than the screen, where the backdrop's own
        // scroll takes over — the page behind is locked, so this is the only
        // thing that moves.
        className="versus-modal-in my-auto flex w-full max-w-3xl flex-col gap-4 outline-none"
      >
        {/* The way out, over the window rather than inside either card: it
            belongs to the window, and a card that carried it would be a card
            that looks different here from how it looks on its own page. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white/70 backdrop-blur-md transition hover:border-white/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="sr-only">{choice.t.explorerClose}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <VersusChoice {...choice} />
      </div>
    </div>
  );
}
