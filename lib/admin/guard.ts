import "server-only";

import { AdminDbError } from "../db/admin/rpc.ts";
import { adminMessage } from "./errors.ts";
import type { ActionResult } from "./result.ts";

/**
 * The body of an admin action after `await requireAdmin()`: runs it, and turns
 * any refusal into an ActionResult with a fixed Turkish message.
 */
export async function guard<T>(
  work: () => Promise<T>,
  message?: string,
): Promise<ActionResult<T>> {
  try {
    const data = await work();
    return { ok: true, data, message };
  } catch (error) {
    if (error instanceof AdminDbError) return { ok: false, error: adminMessage(error.code) };
    if (error instanceof AdminInputError) return { ok: false, error: error.message };
    if (error instanceof Error && error.name === "UploadError") {
      const code = (error as Error & { code: string }).code;
      return { ok: false, error: error.message !== code ? error.message : adminMessage(code) };
    }
    console.error("admin action failed:", error);
    return { ok: false, error: adminMessage("unknown") };
  }
}

/** A validation failure caught before the database, with its own message. */
export class AdminInputError extends Error {}

export function fail(message: string): never {
  throw new AdminInputError(message);
}

/** Every refusal-sensitive response waits at least this long (§4.4). */
export async function atLeast<T>(ms: number, started: number, value: T): Promise<T> {
  const left = started + ms - Date.now();
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
  return value;
}
