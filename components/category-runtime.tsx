"use client";

import type { CategoryPane } from "@/lib/game/builtin-categories";
import { registerCategory } from "@/lib/game/register-category";

/**
 * Makes a category's rails known to the timeline helpers in this bundle.
 *
 * Rendered as the first child of a category's game, so it runs before the
 * game renders (React renders siblings in order): every `yearAtFraction`,
 * `paneTicks` and backdrop lookup then resolves the category's own panes,
 * on the server and in the browser alike. Idempotent; renders nothing.
 */
export function RegisterCategory({ panes, backdropKey }: { panes: CategoryPane[]; backdropKey: string | null }) {
  registerCategory(panes, backdropKey);
  return null;
}
