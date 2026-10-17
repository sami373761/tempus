"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Ask the router to re-render the layout, once, when something below it has
 * changed what the chrome should say.
 *
 * **Why this has to exist.** The menu's Achievements mark is read in the
 * layout (`getCurrentAccount`), and a client-side navigation reuses layouts
 * — only the segments that change are fetched again. So the two moments the
 * mark should move are both invisible to it: a badge earned at the end of a
 * set, and the badges page clearing the count as it renders. Without a
 * refresh the number appears only after a full page load, and — worse — a
 * cleared mark comes back the moment the player leaves the page that
 * answered it, because the layout is still holding the count it rendered
 * with.
 *
 * `refresh` rather than a reload: it re-runs the server render and keeps
 * every client component's state, so the screen the player is on does not
 * move under them. Both callers place it where nothing is in flight — a
 * summary, and a page that has finished rendering.
 *
 * **Once per mount**, which is what the ref is for: the refresh re-renders
 * this component's tree, and an effect keyed on `when` alone would ask again
 * on each of its own re-renders.
 */
export function RefreshChrome({ when }: { when: boolean }) {
  const router = useRouter();
  const asked = useRef(false);

  useEffect(() => {
    if (!when || asked.current) return;
    asked.current = true;
    router.refresh();
  }, [when, router]);

  return null;
}
