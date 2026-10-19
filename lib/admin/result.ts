/**
 * What every admin action returns. Never throws to the browser: a refusal is
 * a fixed Turkish message (lib/admin/errors.ts), the detail stays in the log.
 */
export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };
