/**
 * The admin panel's contract, as data: the SQL functions, tables and columns
 * the code relies on. Read by scripts/admin-check.ts (against any database)
 * and scripts/admin-test-db/test-functions.ts (against the throwaway one).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The contract's SQL functions (§5–§7, §9), with their argument types. */
export const CONTRACT_FUNCTIONS: readonly string[] = [
  "admin_log(uuid, text, text, text, jsonb, jsonb, text)",
  "admin_login_gate(text, inet, text)",
  "admin_login_record(text, inet, text, boolean)",
  "admin_login_attempt_prune()",
  "admin_dashboard()",
  "admin_challenge_list(jsonb, integer)",
  "admin_challenge_detail(uuid)",
  "admin_year_change_preview(uuid, bigint)",
  "admin_update_event_year(uuid, uuid, bigint, text, text)",
  "admin_dismiss_challenges(uuid, uuid, text)",
  "admin_event_list(jsonb, integer)",
  "admin_event_detail(uuid)",
  "admin_upsert_event_translations(uuid, uuid, jsonb, text)",
  "admin_set_event_status(uuid, uuid[], text, text)",
  "admin_set_event_sensitive(uuid, uuid, boolean, text)",
  "admin_set_event_category(uuid, uuid, text, text, text)",
  "admin_delete_event_preview(uuid)",
  "admin_delete_event(uuid, uuid, text, text)",
  "admin_duplicate_candidates()",
  "admin_create_event(uuid, jsonb, text, text)",
  "admin_import_events(uuid, text, jsonb, text, text)",
  "admin_attach_image(uuid, uuid, jsonb, jsonb, jsonb, text)",
  "admin_update_image_attribution(uuid, uuid, jsonb, text)",
  "admin_repoint_image(uuid, uuid, jsonb, text)",
  "admin_delete_image_rows(uuid, uuid[], text)",
  "admin_image_report(text, text, integer)",
  "admin_user_list(text, integer)",
  "admin_user_detail(uuid)",
  "admin_suspicious_users()",
  "admin_rename_user(uuid, uuid, text, boolean, text, boolean)",
  "admin_clear_avatar(uuid, uuid, text)",
  "admin_set_hidden_from_boards(uuid, uuid, boolean, text)",
  "admin_adjust_score(uuid, uuid, integer, text)",
  "admin_user_delete_preview(uuid)",
  "admin_versus_overview()",
  "admin_abandon_match(uuid, uuid, text)",
  "admin_daily_overview(date, integer)",
  "admin_reroll_daily(uuid, date, text, uuid[], uuid[], text)",
  "admin_health_checks()",
  "admin_audit_list(jsonb, integer)",
  "admin_audit_entry(bigint)",
  "admin_category_list()",
  "admin_category_detail(text)",
  "admin_create_category(uuid, jsonb, text)",
  "admin_update_category(uuid, text, jsonb, text)",
  "admin_set_category_art(uuid, text, text, text, text)",
  "admin_save_category_tags(uuid, text, jsonb, text)",
  "admin_category_publish_gaps(text)",
  "admin_set_category_status(uuid, text, text, text)",
  "admin_set_category_home(uuid, text, boolean, integer, text)",
  "admin_delete_category(uuid, text, text, text)",
];

/** Internal helpers that must not be callable by anyone but their owner. */
export const INTERNAL_FUNCTIONS = [
  "admin_insert_event(jsonb, text)",
  "admin_link_event_category(uuid, text, text)",
  "admin_write_category_titles(text, jsonb)",
];

export const NEW_TABLES = [
  "admin_audit",
  "admin_login_attempt",
  "event_challenge_review",
  "game_category",
  "game_category_translation",
];

export const COLUMNS: [string, string][] = [
  ["event", "admin_edited_at"],
  ["profile", "is_hidden_from_boards"],
  ["event_date_challenge", "user_id"],
  ["event_date_challenge", "year_at_vote"],
  ["event_date_challenge", "is_legacy"],
  ["event_challenge_stats", "all_votes"],
  ["event_challenge_stats", "reviewed_at"],
  ["category", "tag_kind"],
];

/** Every exported async function's first statement is `await requireAdmin()`. */
export function scanActions(dir = "app/actions/admin"): { file: string; fn: string }[] {
  const bad: { file: string; fn: string }[] = [];
  if (!existsSync(dir)) return [{ file: dir, fn: "(folder missing)" }];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, file), "utf8");
    const re = /export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // Skip the parameter list (balanced parentheses), an optional return
      // type, then the body's first statement.
      let i = m.index + m[0].length;
      let depth = 1;
      while (i < src.length && depth > 0) {
        if (src[i] === "(") depth += 1;
        else if (src[i] === ")") depth -= 1;
        i += 1;
      }
      const brace = src.indexOf("{", i);
      // A return type may itself contain braces; the body starts at the
      // first `{` followed by a newline.
      let body = brace;
      while (body !== -1 && !/^\{\s*\n/.test(src.slice(body, body + 3))) body = src.indexOf("{", body + 1);
      const first = src
        .slice(body + 1)
        .replace(/^\s*(\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*/, "")
        .trimStart();
      const ok = /^(?:const\s+\{[^}]*\}\s*=\s*|const\s+\w+\s*=\s*)?await requireAdmin\(\);/.test(first);
      if (!ok) bad.push({ file, fn: m[1]! });
    }
  }
  return bad;
}

