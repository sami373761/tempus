/**
 * The admin role, readable without imports: `middleware.ts` runs on the edge
 * runtime, and `lib/auth/admin.ts` is `server-only`.
 *
 * An admin account is the panel's and nothing else's. It shares the Supabase
 * session cookie with the game, so without a check the game would greet it
 * as a player, deal it rounds and credit it TP; every read of "who is
 * playing" asks this first and treats an admin session as signed out.
 */
export const ADMIN_ROLE = "admin";

export function hasAdminRole(appMetadata: unknown): boolean {
  return (
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    (appMetadata as { role?: unknown }).role === ADMIN_ROLE
  );
}
