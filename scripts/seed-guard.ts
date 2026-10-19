/**
 * The admin panel is the source of truth for any event it has touched
 * (`event.admin_edited_at`, set by every admin_* write). The seed scripts
 * still upsert everything else, but leave such events' year, precision,
 * status, translations and category links alone, and say how many they
 * skipped — a re-seed must never undo a correction made in the panel.
 *
 * The guards themselves are `where … admin_edited_at is null` clauses in each
 * script's SQL; this only counts, for the report line.
 */

type Queryable = {
  query: <R extends Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function countAdminEdited(client: Queryable, slugs: readonly string[]): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    "select count(*)::text as n from public.event where slug = any($1::text[]) and admin_edited_at is not null",
    [slugs],
  );
  return Number(rows[0]?.n ?? 0);
}

export function skippedLine(n: number): string {
  return `\nSkipped (edited in the admin panel): ${n}`;
}
