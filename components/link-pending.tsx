"use client";

import { useLinkStatus } from "next/link";

/**
 * A link's label that dims and breathes while the page it opens is on its way.
 *
 * For the plain text links between server-rendered pages — the leaderboard's
 * board pills, the account page's way to the badges — where a press is
 * followed by the server's whole render and the link otherwise sits unchanged
 * for a couple of seconds, as if it had not been heard. The site menu already
 * answers its own rows' presses (its button's pending ring); these did not.
 *
 * A child of the `Link` rather than a class on it, for the reason `CardTrace`
 * in components/game-board.tsx gives: `useLinkStatus` reads the pending state
 * of the link it sits inside, so the router owns the state. `motion-safe`, so
 * a reader who asked for less motion gets the dimming without the pulse.
 */
export function LinkPending({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? "opacity-60 motion-safe:animate-pulse" : undefined}>
      {children}
    </span>
  );
}
