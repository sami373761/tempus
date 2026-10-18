/**
 * Shared Postgres connection helper for the CLI scripts in this directory.
 *
 * Scripts talk to Postgres directly (not through PostgREST) because DDL and
 * bulk inserts are not expressible over the REST API. The connection string is
 * a secret and is read from the environment, never hardcoded.
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";

/** Minimal .env loader: no dependency, and `node --env-file` skips .env.local. */
export function loadEnvFile(path = ".env.local"): void {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return; // Fine — the variables may already be in the environment.
  }

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function databaseUrl(): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "SUPABASE_DB_URL is not set.\n\n" +
        "Get it from the Supabase dashboard: Project Settings -> Database ->\n" +
        "Connection string -> URI, then add it to .env.local as\n" +
        "  SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres\n",
    );
  }
  return url;
}

/** Local clusters (supabase start, CI) do not speak TLS; hosted Supabase requires it. */
function isLocalHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * The project's direct host `db.<ref>.supabase.co` publishes AAAA records only.
 * From an IPv4-only network it is simply unreachable, and every script here
 * dies on connect with ENOTFOUND or ENETUNREACH before running a statement.
 *
 * The session pooler answers on IPv4, speaks the same protocol and takes the
 * same password with the project ref folded into the username — so a failure
 * to reach the direct host is worth one retry through it rather than an error
 * the operator has to recognise and work around. Returns null when the stored
 * URL is not a direct Supabase host (a local cluster, or already the pooler),
 * where there is nothing to fall back to.
 */
function poolerUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const ref = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(parsed.hostname)?.[1];
  if (!ref) return null;

  // The region is the project's own and cannot be derived from the direct host;
  // TEMPUS is ap-southeast-2 (see CLAUDE.md "Known gaps" — the region is settled).
  parsed.hostname = "aws-0-ap-southeast-2.pooler.supabase.com";
  parsed.port = "5432";
  parsed.username = `postgres.${ref}`;
  return parsed.toString();
}

/** Errors that mean "this host cannot be dialled", as opposed to a refused
 *  password or a bad database name — only these are worth a second route. */
const UNREACHABLE = new Set([
  "ENOTFOUND",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ETIMEDOUT",
]);

function isUnreachable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && UNREACHABLE.has(code);
}

function clientFor(url: string): Client {
  return new Client({
    connectionString: url,
    // Supabase terminates TLS with a managed cert; verification against the
    // local trust store fails, so trust the endpoint we explicitly dialled.
    ssl: isLocalHost(url) ? false : { rejectUnauthorized: false },
    statement_timeout: 120_000,
  });
}

export async function connect(): Promise<Client> {
  const url = databaseUrl();
  const client = clientFor(url);

  try {
    await client.connect();
    return client;
  } catch (error) {
    const fallback = isUnreachable(error) ? poolerUrl(url) : null;
    if (!fallback) throw error;

    // Say which route carried the connection: a script that reports the target
    // back to the operator would otherwise name a host it never reached.
    console.warn(
      `db: ${new URL(url).hostname} is unreachable (${(error as { code?: string }).code}); ` +
        "retrying through the session pooler",
    );
    const pooled = clientFor(fallback);
    await pooled.connect();
    return pooled;
  }
}

/** Hides the password when echoing the target back to the operator. */
export function describeTarget(url: string = databaseUrl()): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname} as ${parsed.username}`;
  } catch {
    return "(unparseable connection string)";
  }
}
