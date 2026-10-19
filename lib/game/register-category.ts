import type { CategoryPane } from "./builtin-categories.ts";
import { registerPanes } from "./timeline.ts";
import { registerBackdropPlate } from "../storage/images.ts";

/**
 * Makes a category's rails and backdrop known to this bundle's timeline and
 * image helpers. Called by the page on the server and by
 * `<RegisterCategory>` in the browser, so both resolve the same specs.
 */
export function registerCategory(panes: CategoryPane[], backdropKey: string | null): void {
  registerPanes(panes);
  for (const pane of panes) registerBackdropPlate(pane.key, backdropKey);
}
