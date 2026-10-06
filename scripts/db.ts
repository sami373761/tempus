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

export async function connect(): Promise<Client> {
  const url = databaseUrl();

  const client = new Client({
    connectionString: url,
    // Supabase terminates TLS with a managed cert; verification against the
    // local trust store fails, so trust the endpoint we explicitly dialled.
    ssl: isLocalHost(url) ? false : { rejectUnauthorized: false },
    statement_timeout: 120_000,
  });
  await client.connect();
  return client;
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
