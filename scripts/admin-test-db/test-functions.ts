/**
 * Every admin SQL function, called against the throwaway test database
 * (§3.4): the result, the admin_audit row it must write, and the refusals.
 * Then the same functions and the new tables as `anon` and `authenticated`
 * — every one of those must be refused.
 *
 *   SUPABASE_DB_URL=postgresql://postgres@127.0.0.1:54317/tempus_test \
 *     node --experimental-strip-types scripts/admin-test-db/test-functions.ts
 *
 * Runs inside ONE transaction that is rolled back at the end, so the
 * database is left exactly as it was. localhost only.
 */

import type { Client } from "pg";

import { connect, loadEnvFile } from "../db.ts";
import { CONTRACT_FUNCTIONS, NEW_TABLES } from "../admin-contract.ts";

loadEnvFile("scripts/admin-test-db/.env.test-db");

const host = (() => {
  try {
    return new URL(process.env.SUPABASE_DB_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (host !== "localhost" && host !== "127.0.0.1") {
  console.error("test-functions: localhost only");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function ok(cond: unknown, name: string, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.log(`✗ ${name}${detail === undefined ? "" : `  — ${JSON.stringify(detail)}`}`);
  }
}

let sp = 0;
/** Runs `sql` expecting an error; returns its message (or null if none). */
async function refused(db: Client, sql: string, values: unknown[] = []): Promise<string | null> {
  const name = `sp${(sp += 1)}`;
  await db.query(`savepoint ${name}`);
  try {
    await db.query(sql, values);
    await db.query(`release savepoint ${name}`);
    return null;
  } catch (error) {
    await db.query(`rollback to savepoint ${name}`);
    return error instanceof Error ? error.message : String(error);
  }
}

async function one<T = Record<string, unknown>>(db: Client, sql: string, values: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, values);
  return rows[0] as T;
}

async function auditCount(db: Client, action: string): Promise<number> {
  return Number((await one<{ n: string }>(db, "select count(*) as n from public.admin_audit where action = $1", [action])).n);
}

/** Calls fn, then asserts exactly one more audit row of `action`. */
async function audited<T>(db: Client, action: string, name: string, fn: () => Promise<T>): Promise<T> {
  const before = await auditCount(db, action);
  const value = await fn();
  ok((await auditCount(db, action)) === before + 1, `${name} writes one ${action} audit row`);
  return value;
}

async function main(): Promise<void> {
  const db = await connect();
  try {
    await db.query("begin");

    const actor = (await one<{ id: string }>(db,
      `insert into auth.users (email, raw_app_meta_data) values ('qqqqqqqqqqqqqqqq@admin.tempus.invalid', '{"role":"admin"}') returning id`)).id;

    // ---- login throttle ---------------------------------------------------
    ok(Number((await one(db, "select public.admin_login_gate('password', '10.0.0.9', 'x') as w")).w) === 0, "gate: no wait before any failure");
    for (let i = 0; i < 5; i += 1) await db.query("select public.admin_login_record('password', '10.0.0.9', 'x', false)");
    const w5 = Number((await one(db, "select public.admin_login_gate('password', '10.0.0.9', 'x') as w")).w);
    ok(w5 >= 7 && w5 <= 8, "gate: 5 failures → 2^3 = 8 s", w5);
    ok(Number((await one(db, "select public.admin_login_gate('password', '10.0.0.1', 'x') as w")).w) >= 7, "gate: per-username counter applies from another IP");
    ok(Number((await one(db, "select public.admin_login_gate('totp', '10.0.0.9', 'x') as w")).w) === 0, "gate: totp has its own counter");
    await db.query("select public.admin_login_record('password', '10.0.0.9', 'x', true)");
    ok(Number((await one(db, "select public.admin_login_gate('password', '10.0.0.9', 'x') as w")).w) > 0, "gate: a success does not reset the window");
    for (let i = 0; i < 5; i += 1) await db.query("select public.admin_login_record('password', ('10.0.0.' || $1)::inet, 'y', false)", [i + 20]);
    await db.query("update public.admin_login_attempt set created_at = now() - interval '20 minutes' where username = 'y'");
    for (let i = 0; i < 5; i += 1) await db.query("select public.admin_login_record('password', ('10.0.1.' || $1)::inet, 'y', false)", [i]);
    const lock = Number((await one(db, "select public.admin_login_gate('password', '10.9.9.9', 'y') as w")).w);
    ok(lock > 2000, "gate: 10 failures on one username in an hour → locked ~1h", lock);
    await db.query("insert into public.admin_login_attempt (kind, ip, username, success, created_at) values ('password', '1.1.1.1', 'old', false, now() - interval '31 days')");
    ok(Number((await one(db, "select public.admin_login_attempt_prune() as n")).n) >= 1, "prune deletes rows older than 30 days");

    // ---- challenges -------------------------------------------------------
    const ev = await one<{ id: string; year: string; slug: string }>(db,
      `select e.id, e.year::text, e.slug from public.event e
       where public.event_topic_slug(e.id) is null and exists (select 1 from public.image i where i.event_id = e.id and i.is_primary)
       order by e.slug limit 1`);
    const user = (await one<{ id: string }>(db, "select id from auth.users where email = 'player1@test.local'")).id;
    await db.query("insert into public.event_date_challenge (event_id, user_id, direction, year_at_vote) values ($1, $2, 1, 99999)", [ev.id, user]);
    ok(String((await one(db, "select year_at_vote::text as y from public.event_date_challenge where event_id = $1 and user_id = $2", [ev.id, user])).y) === ev.year,
      "vote: year_at_vote is stamped from event.year, not the caller");
    ok((await refused(db, "insert into public.event_date_challenge (event_id, user_id, direction) values ($1, $2, -1)", [ev.id, user]))?.includes("one_vote"),
      "vote: a second vote by the same account is refused");
    ok((await refused(db, "insert into public.event_date_challenge (event_id, direction) values ($1, 1)", [ev.id]))?.includes("account_required"),
      "vote: a vote without an account is refused");
    const list = await one<{ v: { total: number } }>(db, "select public.admin_challenge_list('{}', 1) as v");
    ok(list.v.total > 0, "admin_challenge_list returns open events");
    const detail = await one<{ v: { tally: { total: number } } }>(db, "select public.admin_challenge_detail($1) as v", [ev.id]);
    ok(detail.v.tally.total >= 1, "admin_challenge_detail counts the open vote");

    const preview = await one<{ v: { closingVotes: number; inBounds: boolean; newEra: string } }>(db,
      "select public.admin_year_change_preview($1, $2) as v", [ev.id, Number(ev.year) + 1]);
    ok(preview.v.closingVotes >= 1 && preview.v.inBounds, "year preview: votes to close, in bounds");
    ok((await refused(db, "select public.admin_update_event_year($1, $2, $3, 'year', '')", [actor, ev.id, Number(ev.year) + 1]))?.includes("note-required"),
      "year change refuses an empty note");
    const r = await audited(db, "event.update_year", "admin_update_event_year", () =>
      one<{ v: { closedVotes: number } }>(db, "select public.admin_update_event_year($1, $2, $3, 'year', 'kaynak: test') as v", [actor, ev.id, Number(ev.year) + 1]));
    ok(r.v.closedVotes >= 1, "year change reports the closed votes");
    ok((await one<{ total_votes: number }>(db, "select total_votes from public.event_challenge_stats where event_id = $1", [ev.id])).total_votes === 0,
      "year change: open votes drop to 0 (they were for the old year)");
    ok((await one(db, "select admin_edited_at is not null as v from public.event where id = $1", [ev.id])).v === true, "year change sets admin_edited_at");
    await db.query("insert into public.event_date_challenge (event_id, user_id, direction) values ($1, $2, -1)", [ev.id, user]);
    ok((await one<{ total_votes: number }>(db, "select total_votes from public.event_challenge_stats where event_id = $1", [ev.id])).total_votes === 1,
      "after a year change the same account may vote again (new year)");
    await audited(db, "challenge.dismiss", "admin_dismiss_challenges", () => db.query("select public.admin_dismiss_challenges($1, $2, 'doğru')", [actor, ev.id]));
    ok((await one<{ total_votes: number }>(db, "select total_votes from public.event_challenge_stats where event_id = $1", [ev.id])).total_votes === 0,
      "dismiss: votes up to now no longer count as open");

    // ---- topic bounds ------------------------------------------------------
    const fb = await one<{ id: string }>(db,
      "select e.id from public.event e join public.event_category ec on ec.event_id = e.id join public.category c on c.id = ec.category_id where c.slug = 'football' limit 1");
    ok((await refused(db, "select public.admin_update_event_year($1, $2, 1500, 'year', 'x')", [actor, fb.id]))?.includes("out-of-bounds"),
      "year change outside the category timeline is refused");

    // ---- events ------------------------------------------------------------
    ok(Number((await one<{ v: { total: number } }>(db, "select public.admin_event_list('{\"topic\":\"football\"}', 1) as v")).v.total) === 97,
      "admin_event_list filters by topic (97 football events)");
    ok((await one<{ v: { rows: unknown[] } }>(db, "select public.admin_event_list('{}', 2) as v")).v.rows.length === 50, "admin_event_list pages by 50");
    ok((await one<{ v: { event: { slug: string } } }>(db, "select public.admin_event_detail($1) as v", [ev.id])).v.event.slug === ev.slug, "admin_event_detail");
    await audited(db, "event.update_translations", "admin_upsert_event_translations", () =>
      db.query(`select public.admin_upsert_event_translations($1, $2, '[{"locale":"tr","name":"Yeni ad","description":""}]', null)`, [actor, ev.id]));
    ok((await refused(db, `select public.admin_upsert_event_translations($1, $2, '[{"locale":"tr","name":"  "}]', null)`, [actor, ev.id]))?.includes("name-required"),
      "translations refuse a blank name");
    await audited(db, "event.set_status", "admin_set_event_status", () => db.query("select public.admin_set_event_status($1, array[$2]::uuid[], 'review', null)", [actor, ev.id]));
    await audited(db, "event.set_sensitive", "admin_set_event_sensitive", () => db.query("select public.admin_set_event_sensitive($1, $2, true, null)", [actor, ev.id]));
    await audited(db, "event.set_category", "admin_set_event_category", () => db.query("select public.admin_set_event_category($1, $2, 'history', null, null)", [actor, fb.id]));
    ok((await one(db, "select public.event_topic_slug($1) as t", [fb.id])).t === null, "set_category: event left the football pool");
    const eraLinks = Number((await one(db,
      "select count(*) as n from public.event_category ec join public.category c on c.id = ec.category_id where ec.event_id = $1 and c.kind = 'era'", [fb.id])).n);
    ok(eraLinks === 1, "set_category: the era link (trigger's) is untouched");
    ok((await refused(db, "select public.admin_set_event_category($1, $2, 'screen', 'leader', null)", [actor, fb.id]))?.includes("bad-tag"),
      "set_category refuses a tag from another group");

    const created = (await audited(db, "event.create", "admin_create_event", () => one<{ id: string }>(db,
      `select public.admin_create_event($1, $2, 'draft', null) as id`,
      [actor, JSON.stringify({ slug: "test-admin-event", year: 1950, precision: "year", topic: "football",
        translations: ["tr", "en", "de", "fr", "es"].map((l) => ({ locale: l, name: `Test ${l}` })) })]))).id;
    ok(Boolean(created), "admin_create_event returns the id");
    ok((await refused(db, `select public.admin_create_event($1, $2, 'draft', null)`, [actor, JSON.stringify({ slug: "test-admin-event", year: 1950, topic: "football",
      translations: ["tr", "en", "de", "fr", "es"].map((l) => ({ locale: l, name: "x" })) })]))?.includes("slug-taken"), "create refuses a taken slug");
    ok((await refused(db, `select public.admin_create_event($1, $2, 'draft', null)`, [actor, JSON.stringify({ slug: "test-two", year: 1950, topic: "football",
      translations: [{ locale: "tr", name: "x" }] })]))?.includes("name-required"), "create refuses missing names");

    const imported = await audited(db, "event.import", "admin_import_events", () => one<{ n: number }>(db,
      `select public.admin_import_events($1, 'basketball', $2, 'draft', null) as n`,
      [actor, JSON.stringify([1990, 1991].map((y) => ({ slug: `test-bulk-${y}`, year: y, translations: ["tr", "en", "de", "fr", "es"].map((l) => ({ locale: l, name: `B ${y}` })) })))]));
    ok(imported.n === 2, "admin_import_events inserts every row");
    ok((await refused(db, `select public.admin_import_events($1, 'basketball', $2, 'draft', null)`,
      [actor, JSON.stringify([{ slug: "test-bulk-x", year: 1990, translations: [] }])]))?.startsWith("row-1"), "import names the failing row");

    const dup = await one<{ v: unknown[] }>(db, "select public.admin_duplicate_candidates() as v");
    ok(Array.isArray(dup.v), "admin_duplicate_candidates returns a list");

    // Delete: refused while in an upcoming daily, allowed otherwise.
    const delPreview = await one<{ v: { name: string } }>(db, "select public.admin_delete_event_preview($1) as v", [created]);
    ok(delPreview.v.name === "Test tr", "admin_delete_event_preview names the event");
    ok((await refused(db, "select public.admin_delete_event($1, $2, 'yanlış', null)", [actor, created]))?.includes("confirm-mismatch"), "delete needs the exact TR name");
    const other = (await db.query("select id from public.event where id <> $1 order by slug limit 20", [created])).rows.map((x) => x.id as string);
    await db.query("insert into public.daily_challenge (puzzle_date, audience, event_ids) values (public.admin_utc_today() + 3, 'member', $1), (public.admin_utc_today() + 3, 'guest', $2)",
      [[created, ...other.slice(0, 9)], other.slice(10, 20)]);
    ok((await refused(db, "select public.admin_delete_event($1, $2, 'Test tr', null)", [actor, created]))?.includes("in-daily"), "delete refused while in an upcoming daily");

    // ---- daily -------------------------------------------------------------
    const days = await one<{ v: { day: string; drawn: boolean }[] }>(db, "select public.admin_daily_overview(public.admin_utc_today(), 15) as v");
    ok(days.v.length === 30, "admin_daily_overview: 15 days × 2 audiences");
    const fresh = (await db.query("select id from public.event where not (id = any($1::uuid[])) and id <> $2 order by slug desc limit 10", [other, created])).rows.map((x) => x.id as string);
    await audited(db, "daily.reroll", "admin_reroll_daily", () =>
      db.query("select public.admin_reroll_daily($1, public.admin_utc_today() + 3, 'member', $2, null, null)", [actor, fresh]));
    ok((await refused(db, "select public.admin_reroll_daily($1, public.admin_utc_today(), 'member', $2, $3, null)", [actor, fresh, other]))?.includes("locked"),
      "reroll refuses today");
    ok((await refused(db, "select public.admin_reroll_daily($1, public.admin_utc_today() + 3, 'guest', $2, null, null)", [actor, fresh]))?.includes("overlap"),
      "reroll refuses overlapping audiences");
    await audited(db, "event.delete", "admin_delete_event", () => db.query("select public.admin_delete_event($1, $2, 'Test tr', null)", [actor, created]));
    ok(Number((await one(db, "select count(*) as n from public.event where id = $1", [created])).n) === 0, "event deleted");

    // ---- images ------------------------------------------------------------
    // The folder-mismatch fixture is read first: the attach below must not be
    // the thing that fixes it.
    const mis = await one<{ id: string; key: string; event_id: string; era: string }>(db,
      `select i.id, i.r2_object_key as key, e.id as event_id, public.era_slug_for_year(e.year) as era from public.image i join public.event e on e.id = i.event_id
       where i.is_primary and public.event_topic_slug(e.id) is null and split_part(i.r2_object_key, '/', 1) <> public.era_slug_for_year(e.year) limit 1`);
    ok(Boolean(mis), "fixture: one general-pool image sits in the wrong era folder");
    const imgEvent = mis.event_id === ev.id ? fb.id : ev.id;
    const img = await audited(db, "image.attach", "admin_attach_image", () => one<{ id: string }>(db,
      `select public.admin_attach_image($1, $2, $3, $4, '{"license":"PD"}', null) as id`,
      [actor, imgEvent,
        JSON.stringify({ bucket: "history-images", key: `ce/${ev.slug}-new.jpg`, mime: "image/jpeg", bytes: 1000, width: 3000, height: 2000, sha256: "a".repeat(64) }),
        JSON.stringify({ bucket: "history-images", key: `ce/${ev.slug}-new-1600.webp`, mime: "image/webp", bytes: 500, width: 1600, height: 1067, sha256: "b".repeat(64) })]));
    const prim = await one<{ id: string; source_page_url: string | null }>(db, "select id, source_page_url from public.image where event_id = $1 and is_primary", [imgEvent]);
    ok(prim.id === img.id && prim.source_page_url === null, "attach: the WebP is primary; PD needs no source page");
    ok((await refused(db, `select public.admin_attach_image($1, $2, $3, $4, '{"license":"CC-BY-4.0"}', null)`,
      [actor, imgEvent,
        JSON.stringify({ bucket: "history-images", key: "ce/zz.jpg", mime: "image/jpeg", bytes: 1 }),
        JSON.stringify({ bucket: "history-images", key: "ce/zz-1.webp", mime: "image/webp", bytes: 1 })]))?.includes("image_source_required_unless_pd"),
      "CC-BY without a source page is refused by the check");
    await audited(db, "image.update_attribution", "admin_update_image_attribution", () =>
      db.query(`select public.admin_update_image_attribution($1, $2, '{"license":"CC-BY-4.0","sourcePageUrl":"https://commons.wikimedia.org/","author":"A"}', null)`, [actor, img.id]));
    const orphan = await one<{ id: string }>(db, "select id from public.image where not is_primary and r2_object_key ~ '-[0-9]+\\.[a-z0-9]+$' limit 1");
    ok((await refused(db, "select public.admin_delete_image_rows($1, array[$2]::uuid[], null)", [actor, img.id]))?.includes("is-primary"), "primary rows cannot be deleted");
    await audited(db, "image.delete_rows", "admin_delete_image_rows", () => db.query("select public.admin_delete_image_rows($1, array[$2]::uuid[], null)", [actor, orphan.id]));
    await audited(db, "image.move", "admin_repoint_image", () => db.query("select public.admin_repoint_image($1, $2, $3, null)",
      [actor, mis.event_id, JSON.stringify([{ imageId: mis.id, key: `${mis.era}/${mis.key.split("/")[1]}` }])]));
    for (const tab of ["missing", "license", "folder", "unshrunk", "orphans"]) {
      const rep = await one<{ v: { total: number } }>(db, "select public.admin_image_report($1, null, 1) as v", [tab]);
      ok(typeof rep.v.total === "number", `admin_image_report(${tab})`);
    }

    // ---- users -------------------------------------------------------------
    ok((await one<{ v: { total: number } }>(db, "select public.admin_user_list('oyuncu1', 1) as v")).v.total >= 1, "admin_user_list search");
    ok((await one<{ v: { user: { id: string } } }>(db, "select public.admin_user_detail($1) as v", [user])).v.user.id === user, "admin_user_detail");
    const sus = await one<{ v: { perfectRate: unknown[]; fastSets: unknown[] } }>(db, "select public.admin_suspicious_users() as v");
    ok(sus.v.perfectRate.length >= 1 && sus.v.fastSets.length >= 1, "admin_suspicious_users flags the seeded cheater");
    await audited(db, "user.rename", "admin_rename_user", () => db.query("select public.admin_rename_user($1, $2, 'yeniisim', true, null)", [actor, user]));
    ok(Number((await one(db, "select count(*) as n from public.reserved_username where username = 'oyuncu1'")).n) === 1, "rename reserved the old name");
    ok((await refused(db, "select public.admin_rename_user($1, $2, 'oyuncu1', false, null)", [actor, user]))?.includes("username-taken"),
      "renaming back onto a reserved name is refused (unless released)");
    await db.query("select public.admin_rename_user($1, $2, 'oyuncu1', false, 'geri al', true)", [actor, user]);
    ok((await one(db, "select username from public.profile where id = $1", [user])).username === "oyuncu1", "undo path releases the reservation and renames back");
    await audited(db, "user.clear_avatar", "admin_clear_avatar", () => db.query("select public.admin_clear_avatar($1, $2, null)", [actor, user]));
    const boardBefore = (await db.query("select username from public.leaderboard(null, 100)")).rows.map((x) => x.username);
    await audited(db, "user.hide_from_boards", "admin_set_hidden_from_boards", () => db.query("select public.admin_set_hidden_from_boards($1, $2, true, null)", [actor, user]));
    const boardAfter = (await db.query("select username from public.leaderboard(null, 100)")).rows.map((x) => x.username);
    ok(boardBefore.includes("oyuncu1") && !boardAfter.includes("oyuncu1"), "hidden account leaves the leaderboard");
    ok((await db.query("select * from public.leaderboard_position($1, null)", [user])).rows.length === 0, "hidden account has no board position");
    await db.query("update auth.users set banned_until = now() + interval '1 day' where id = (select id from auth.users where email = 'player2@test.local')");
    ok(!(await db.query("select username from public.leaderboard(null, 100)")).rows.some((x) => x.username === "oyuncu2"), "banned account leaves the leaderboard");
    const tpBefore = Number((await one(db, "select coalesce(sum(tp), 0) as s from public.score_entry where user_id = $1", [user])).s);
    await audited(db, "score.adjust", "admin_adjust_score", () => db.query("select public.admin_adjust_score($1, $2, -7, 'hile düzeltmesi')", [actor, user]));
    ok(Number((await one(db, "select coalesce(sum(tp), 0) as s from public.score_entry where user_id = $1", [user])).s) === tpBefore - 7, "adjust: signed ledger row, total moves by −7");
    ok((await refused(db, "select public.admin_adjust_score($1, $2, 5, '')", [actor, user]))?.includes("note-required"), "adjust needs a note");
    ok((await refused(db, "insert into public.score_entry (user_id, game, kind, source, tp) values ($1, 'history', 'round', 'x:neg', -1)", [user]))?.includes("tp_check"),
      "non-adjustment rows still need tp > 0");
    ok((await one<{ v: { scoreEntries: number } }>(db, "select public.admin_user_delete_preview($1) as v", [user])).v.scoreEntries > 0, "admin_user_delete_preview");
    ok(Number((await one(db, "select public.admin_log($1, 'user.ban', 'auth.users', $2, null, '{}', null) as id", [actor, user])).id) > 0, "admin_log writes a row");

    // ---- versus ------------------------------------------------------------
    const vo = await one<{ v: { stuck: number; live: { id: string }[] } }>(db, "select public.admin_versus_overview() as v");
    ok(vo.v.stuck === 2, "admin_versus_overview finds the two stuck matches", vo.v.stuck);
    const ratingBefore = await one<{ s: string }>(db, "select coalesce(sum(chrono_rating), 0)::text as s from public.profile");
    await audited(db, "versus.abandon", "admin_abandon_match", () => db.query("select public.admin_abandon_match($1, $2, null)", [actor, vo.v.live[0]!.id]));
    ok((await one(db, "select phase::text as p from public.match where id = $1", [vo.v.live[0]!.id])).p === "abandoned", "abandon ends the match");
    ok((await one<{ s: string }>(db, "select coalesce(sum(chrono_rating), 0)::text as s from public.profile")).s === ratingBefore.s, "abandon moves no KP");

    // ---- health, audit, dashboard ------------------------------------------
    const health = await one<{ v: { key: string; count: number }[] }>(db, "select public.admin_health_checks() as v");
    ok(health.v.length === 9, "admin_health_checks: nine checks");
    ok((await one<{ v: { openChallenges: number } }>(db, "select public.admin_dashboard() as v")).v.openChallenges >= 0, "admin_dashboard");
    const audit = await one<{ v: { total: number; rows: { id: number }[] } }>(db, "select public.admin_audit_list('{}', 1) as v");
    ok(audit.v.total > 10, "admin_audit_list lists the writes above");
    ok((await one<{ v: { id: number } }>(db, "select public.admin_audit_entry($1) as v", [audit.v.rows[0]!.id])).v.id === audit.v.rows[0]!.id, "admin_audit_entry");

    // ---- categories --------------------------------------------------------
    const pane = { key: "kitap--1", label: { tr: "Kitap", en: "Books", de: "Bücher", fr: "Livres", es: "Libros" }, scale: "year", minYear: 1800, maxYear: 2026, tickStep: 50 };
    const input = { slug: "kitap", layout: "landscape", panes: [pane], defaultPane: "kitap--1",
      bands: [{ verdict: "perfect", relative: 0, floorYears: 0 }, { verdict: "great", relative: 0, floorYears: 3 }, { verdict: "good", relative: 0, floorYears: 11 }, { verdict: "bad", relative: 0, floorYears: 29 }],
      imagePrefix: "kitap", tagKind: null, titles: ["tr", "en", "de", "fr", "es"].map((l) => ({ locale: l, title: `Kitap ${l}`, blurb: null })) };
    await audited(db, "category.create", "admin_create_category", () => db.query("select public.admin_create_category($1, $2, null)", [actor, JSON.stringify(input)]));
    ok((await refused(db, "select public.admin_create_category($1, $2, null)", [actor, JSON.stringify(input)]))?.includes("slug-taken"), "category slug unique");
    ok((await refused(db, "select public.admin_create_category($1, $2, null)", [actor, JSON.stringify({ ...input, slug: "kitap-iki", imagePrefix: "kitap-iki",
      panes: [pane, { ...pane, key: "kitap--2", minYear: 2000, maxYear: 2030 }] })]))?.includes("bad-panes"), "overlapping rails are refused");
    ok((await refused(db, "select public.admin_create_category($1, $2, null)", [actor, JSON.stringify({ ...input, slug: "kitap-uc", imagePrefix: "ce" })]))?.includes("prefix-taken"),
      "a reserved image folder is refused");
    ok((await refused(db, "select public.admin_create_category($1, $2, null)", [actor, JSON.stringify({ ...input, slug: "history" })]))?.includes("bad-slug"),
      "a core game name is refused as a slug");
    const gaps = await one<{ v: string[] }>(db, "select public.admin_category_publish_gaps('kitap') as v");
    ok(gaps.v.includes("playable-events") && gaps.v.includes("card-image") && gaps.v.includes("backdrop"), "publish gaps listed", gaps.v);
    const st = await audited(db, "category.set_status", "admin_set_category_status (refusal is logged? no)", async () => {
      // A refused publish writes nothing; publish after filling the gaps.
      const refusedPublish = await one<{ v: { ok: boolean } }>(db, "select public.admin_set_category_status($1, 'kitap', 'published', null) as v", [actor]);
      ok(refusedPublish.v.ok === false, "publishing with gaps returns ok=false");
      await db.query("select public.admin_set_category_art($1, 'kitap', 'card', 'kitap/card.webp', null)", [actor]);
      await db.query("select public.admin_set_category_art($1, 'kitap', 'backdrop', 'kitap/backdrop.jpg', null)", [actor]);
      const ids = (await db.query("select e.id from public.event e where public.event_topic_slug(e.id) is null and e.year between 1800 and 2026 and e.status = 'published' and exists (select 1 from public.image i where i.event_id = e.id and i.is_primary) limit 10")).rows.map((x) => x.id as string);
      for (const id of ids) await db.query("select public.admin_set_event_category($1, $2, 'kitap', null, null)", [actor, id]);
      return one<{ v: { ok: boolean } }>(db, "select public.admin_set_category_status($1, 'kitap', 'published', null) as v", [actor]);
    });
    ok(st.v.ok === true, "publish succeeds once ≥ 10 playable events, titles, card and backdrop exist");
    await audited(db, "category.set_home", "admin_set_category_home", () => db.query("select public.admin_set_category_home($1, 'kitap', true, 50, null)", [actor]));
    await audited(db, "category.update", "admin_update_category", () =>
      db.query("select public.admin_update_category($1, 'kitap', $2, null)", [actor, JSON.stringify({ titles: [{ locale: "tr", title: "Kitaplar" }] })]));
    ok((await refused(db, "select public.admin_update_category($1, 'kitap', $2, null)", [actor, JSON.stringify({ panes: [{ ...pane, minYear: 1990 }] })]))?.includes("out-of-bounds"),
      "a timeline that would strand events is refused");
    ok((await refused(db, "select public.admin_update_category($1, 'football', '{\"layout\":\"poster\"}', null)", [actor]))?.includes("builtin"), "built-in layout is fixed");
    const bandsBefore = await one(db, "select bands from public.game_category where slug = 'football'");
    await db.query("select public.admin_update_category($1, 'football', $2, null)", [actor, JSON.stringify({ bands: input.bands })]);
    ok(JSON.stringify((await one(db, "select bands from public.game_category where slug = 'football'")).bands) === JSON.stringify(bandsBefore.bands),
      "built-in bands stay without applyBands");
    await db.query("update public.game_category set tag_kind = 'kitap-tur' where slug = 'kitap'");
    await audited(db, "category.save_tags", "admin_save_category_tags", () =>
      db.query(`select public.admin_save_category_tags($1, 'kitap', '[{"slug":"roman","names":{"tr":"Roman","en":"Novel"}}]', null)`, [actor]));
    const tagged = (await one<{ id: string }>(db, "select ec.event_id as id from public.event_category ec join public.game_category g on g.category_id = ec.category_id where g.slug = 'kitap' limit 1")).id;
    await db.query("select public.admin_set_event_category($1, $2, 'kitap', 'roman', null)", [actor, tagged]);
    ok((await refused(db, "select public.admin_save_category_tags($1, 'kitap', '[]', null)", [actor]))?.includes("tag-in-use"), "a used tag cannot be deleted");
    ok((await refused(db, "select public.admin_delete_category($1, 'kitap', 'kitap', null)", [actor]))?.includes("has-events"), "a category with events cannot be deleted");
    ok((await refused(db, "select public.admin_delete_category($1, 'football', 'football', null)", [actor]))?.includes("builtin"), "a built-in category cannot be deleted");
    ok(Array.isArray((await one<{ v: unknown[] }>(db, "select public.admin_category_list() as v")).v), "admin_category_list");
    ok((await one<{ v: { years: number[] } }>(db, "select public.admin_category_detail('kitap') as v")).v.years.length >= 10, "admin_category_detail lists event years");

    // Game names: a category slug is a game; anything else is refused.
    await db.query("insert into public.solo_set (id, user_id, game, kind) values (gen_random_uuid(), $1, 'kitap', 'set')", [user]);
    ok((await refused(db, "insert into public.solo_set (id, user_id, game, kind) values (gen_random_uuid(), $1, 'nope', 'set')", [user]))?.includes("unknown game"),
      "assert_game_name refuses an unknown game");
    ok((await refused(db, "insert into public.score_entry (user_id, game, kind, source, tp) values ($1, 'daily', 'round', 'zz', 1)", [user])) === null,
      "core game names still pass");
    const stats = await one<{ v: { perfects: Record<string, number> } }>(db, "select public.player_stats($1) as v", [user]);
    ok("kitap" in stats.v.perfects && "football" in stats.v.perfects, "player_stats counts perfects per category, new ones included");

    // ---- roles: anon and authenticated are refused everywhere --------------
    for (const role of ["anon", "authenticated"]) {
      let refusedAll = true;
      const leaked: string[] = [];
      for (const sig of CONTRACT_FUNCTIONS) {
        const name = sig.slice(0, sig.indexOf("("));
        const argc = sig.slice(sig.indexOf("(") + 1, -1).split(",").filter((x) => x.trim()).length;
        const args = Array.from({ length: argc }, () => "null").join(", ");
        const msg = await refused(db, `set local role ${role}; select public.${name}(${args}); reset role;`);
        await db.query("reset role");
        if (!msg?.includes("permission denied")) {
          refusedAll = false;
          leaked.push(name);
        }
      }
      ok(refusedAll, `${role}: every admin function is refused (permission denied)`, leaked);
      for (const table of [...NEW_TABLES]) {
        const r1 = await refused(db, `set local role ${role}; insert into public.${table} default values; reset role;`);
        await db.query("reset role");
        const r2 = await refused(db, `set local role ${role}; delete from public.${table}; reset role;`);
        await db.query("reset role");
        ok(Boolean(r1?.includes("permission denied") || r1?.includes("violates")) && Boolean(r2?.includes("permission denied")),
          `${role}: cannot write public.${table}`, { insert: r1, delete: r2 });
      }
      for (const table of ["admin_audit", "admin_login_attempt", "event_challenge_review", "event_date_challenge"]) {
        const r = await refused(db, `set local role ${role}; select * from public.${table} limit 1; reset role;`);
        await db.query("reset role");
        ok(Boolean(r?.includes("permission denied")), `${role}: cannot read public.${table}`, r);
      }
      // Published categories are readable (the game needs them); drafts not.
      await db.query(`set local role ${role}`);
      const visible = (await db.query("select slug from public.game_category")).rows.map((x) => x.slug);
      await db.query("reset role");
      ok(visible.includes("football") && visible.includes("kitap") && !visible.includes("taslak-yok"), `${role}: reads published game categories`);
    }
    await db.query("update public.game_category set status = 'draft' where slug = 'kitap'");
    await db.query("set local role anon");
    const draftHidden = !(await db.query("select slug from public.game_category")).rows.some((x) => x.slug === "kitap");
    await db.query("reset role");
    ok(draftHidden, "anon: a draft category is invisible");
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
