import "server-only";

import type { Database } from "../database.types.ts";
import { createAdminDbClient } from "../admin.ts";

/**
 * The one door from the panel to the admin_* functions: service role, one
 * round trip, and a refusal turned into a code.
 *
 * Every admin_* function raises with a message that starts with a stable
 * code ("not-found: …", "out-of-bounds: …"); `AdminDbError.code` carries it
 * so lib/admin/errors.ts can pick a fixed Turkish message. Anything without
 * a code is "unknown" — the details stay in the server log, never in the UI.
 */
type Functions = Database["public"]["Functions"];
export type AdminFn = Extract<keyof Functions, `admin_${string}`>;

export class AdminDbError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const CODE = /^([a-z][a-z0-9-]*)(?::|$)/;

export function errorCode(message: string): string {
  return CODE.exec(message)?.[1] ?? "unknown";
}

export async function adminRpc<F extends AdminFn, T = Functions[F]["Returns"]>(
  fn: F,
  args: Functions[F]["Args"],
): Promise<T> {
  const client = createAdminDbClient();
  // The generated client's rpc() overloads do not narrow over a generic name;
  // the argument type above is what keeps call sites honest.
  const { data, error } = await (client.rpc as unknown as (
    name: string,
    params: unknown,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>)(fn, args);
  if (error) {
    const code = error.code === "P0001" || CODE.test(error.message) ? errorCode(error.message) : "unknown";
    if (code === "unknown") console.error(`admin rpc ${fn}:`, error.message);
    throw new AdminDbError(code, error.message);
  }
  return data as T;
}
