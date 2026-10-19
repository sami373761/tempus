/**
 * Fake players, images, matches and challenges for the throwaway admin test
 * database. The content (events, translations) comes from the real seeds;
 * this adds the rows that only exist in production because people played.
 *
 *   node --experimental-strip-types scripts/admin-test-db/seed-fake.ts
 *
 * **Never against the live database.** The guard below refuses any host but
 * localhost before a connection is opened — the fake rows include auth.users
 * inserts, which on a real project would be accounts nobody owns.
 *
 * Deterministic (a seeded PRNG) so a failing test can be re-run on the same
 * data.
 */

import { connect, loadEnvFile } from "../db.ts";

loadEnvFile("scripts/admin-test-db/.env.test-db");

const url = process.env.SUPABASE_DB_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(`seed-fake: refusing to run against "${host || "(no url)"}" — localhost only`);
  process.exit(1);
}

let state = 0x5eed;
function rand(): number {
  state = (state * 1103515245 + 12345) & 0x7fffffff;
  return state / 0x7fffffff;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

const TOPICS = ["football", "basketball", "screen", "when-born"] as const;
const FOLDER: Record<string, string> = {
  football: "ce",
  basketball: "basketball",
  screen: "film-dizi",
  "when-born": "when-born",
};
const VERDICTS = ["perfect", "great", "good", "bad", "wayOff"] as const;
const TP: Record<string, number> = { perfect: 10, great: 5, good: 3, bad: 1, wayOff: 0 };

async function main(): Promise<void> {
  const db = await connect();
  try {
    await db.query("begin");

    // --- images: ~20 per subject, 20 history events -------------------------
    const { rows: events } = await db.query<{
      id: string;
      slug: string;
      year: string;
      topic: string | null;
      era: string;
    }>(`
      select e.id, e.slug, e.year::text,
        (select c.slug from public.event_category ec join public.category c on c.id = ec.category_id
          where ec.event_id = e.id and c.kind = 'topic' limit 1) as topic,
        public.era_slug_for_year(e.year) as era
      from public.event e order by e.slug`);

    const byTopic = new Map<string, typeof events>();
    for (const e of events) {
      const key = e.topic ?? "history";
      byTopic.set(key, [...(byTopic.get(key) ?? []), e]);
    }

    let images = 0;
    const imaged: string[] = [];
    for (const [topic, list] of byTopic) {
      const take = list.slice(0, topic === "history" ? 40 : 22);
      for (const [i, e] of take.entries()) {
        // One deliberate folder mismatch on the history side, for the health
        // and "klasör uyumsuzluğu" tabs.
        const folder =
          topic === "history" ? (i === 0 ? (e.era === "ce" ? "bce" : "ce") : e.era) : FOLDER[topic]!;
        const license = i % 9 === 3 ? "CC-BY-SA-4.0" : i % 11 === 5 ? "CC-BY-NC-4.0" : "PD";
        await db.query(
          `insert into public.image (event_id, is_primary, r2_bucket, r2_object_key, mime_type,
             width, height, source_page_url, license_code, author)
           values ($1, true, 'history-images', $2, 'image/jpeg', 2400, 1600,
             'https://commons.wikimedia.org/', $3, $4)`,
          [e.id, `${folder}/${e.slug}.jpg`, license, license === "PD" || i % 2 ? null : "Fake Author"],
        );
        images += 1;
        imaged.push(e.id);
        // A few shrunk-then-reattached orphans.
        if (i % 10 === 7) {
          await db.query(
            `insert into public.image (event_id, is_primary, r2_bucket, r2_object_key, mime_type,
               width, height, source_page_url, license_code)
             values ($1, false, 'history-images', $2, 'image/webp', 1600, 1067,
               'https://commons.wikimedia.org/', 'PD')`,
            [e.id, `${folder}/${e.slug}-1600.webp`],
          );
        }
      }
    }

    // --- 30 players ----------------------------------------------------------
    const users: string[] = [];
    for (let i = 1; i <= 30; i += 1) {
      const { rows } = await db.query<{ id: string }>(
        `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, created_at, last_sign_in_at)
         values ($1, jsonb_build_object('username', $2::text),
                 jsonb_build_object('provider', $3::text), now() - ($4 || ' days')::interval, now() - ($5 || ' hours')::interval)
         returning id`,
        [`player${i}@test.local`, `oyuncu${i}`, i % 4 === 0 ? "google" : "email", 60 - i, i],
      );
      const id = rows[0]!.id;
      users.push(id);
      await db.query(
        `insert into auth.identities (user_id, provider, provider_id) values ($1, $2, $3)`,
        [id, i % 4 === 0 ? "google" : "email", id],
      );
    }
    // One banned, for the leaderboard filter.
    await db.query(`update auth.users set banned_until = now() + interval '7 days' where id = $1`, [users[29]]);

    // --- solo sets and TP ----------------------------------------------------
    const historyIds = (byTopic.get("history") ?? []).map((e) => e.id);
    let answers = 0;
    for (const [u, userId] of users.slice(0, 12).entries()) {
      for (let s = 0; s < 3; s += 1) {
        const game = s === 0 ? "history" : pick(TOPICS);
        const pool = game === "history" ? historyIds : (byTopic.get(game) ?? []).map((e) => e.id);
        const setId = crypto.randomUUID();
        const n = 10;
        let tp = 0;
        let perfects = 0;
        await db.query(
          `insert into public.solo_set (id, user_id, game, kind, created_at) values ($1, $2, $3, 'set', now() - ($4 || ' hours')::interval)`,
          [setId, userId, game, String(u * 3 + s)],
        );
        for (let r = 0; r < n; r += 1) {
          // User 0 is the "suspicious" one: perfects all the way down.
          const verdict = u === 0 ? "perfect" : pick(VERDICTS);
          const points = TP[verdict]!;
          tp += points;
          if (verdict === "perfect") perfects += 1;
          const roundId = crypto.randomUUID();
          await db.query(
            `insert into public.solo_answer (round_id, set_id, user_id, game, event_id, verdict, correct, tp, answered_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, now() - ($9 || ' seconds')::interval)`,
            [roundId, setId, userId, game, pick(pool), verdict, verdict !== "wayOff", points, String((n - r) * (u === 0 ? 2 : 20))],
          );
          if (points > 0) {
            await db.query(
              `insert into public.score_entry (user_id, game, kind, source, tp) values ($1, $2, 'round', $3, $4)`,
              [userId, game, `round:${roundId}`, points],
            );
          }
          answers += 1;
        }
        await db.query(
          `update public.solo_set set answered = 10, correct = 10, perfects = $2, tp = $3, closed_at = now() where id = $1`,
          [setId, perfects, tp],
        );
      }
    }

    // --- 10 versus matches, 2 stuck ------------------------------------------
    for (let m = 0; m < 10; m += 1) {
      const stuck = m >= 8;
      const phase = stuck ? "playing" : m < 6 ? "complete" : "abandoned";
      const { rows } = await db.query<{ id: string }>(
        `insert into public.match (code, phase, total_rounds, round_seconds, reveal_seconds, current_idx,
           round_started_at, round_deadline_at, seat1_joined, seat2_joined, updated_at, created_at)
         values ($1, $2, 5, 25, 6, $3, $4, $5, true, true, now() - $6::interval, now() - $6::interval)
         returning id`,
        [
          `FAKE${m}`,
          phase,
          stuck ? 2 : 0,
          stuck ? new Date(Date.now() - 3 * 3600_000) : null,
          stuck ? new Date(Date.now() - 3 * 3600_000 + 25_000) : null,
          stuck ? "3 hours" : `${m + 1} hours`,
        ],
      );
      const matchId = rows[0]!.id;
      await db.query(
        `insert into public.match_player (match_id, seat, token_hash, user_id) values ($1::uuid, 1, md5($1::text || '1'), $2)`,
        [matchId, users[m]],
      );
      const bot = m % 2 === 0;
      await db.query(
        `insert into public.match_player (match_id, seat, token_hash, user_id, bot_archetype, bot_level)
         values ($1::uuid, 2, md5($1::text || '2'), $2, $3, $4)`,
        [matchId, bot ? null : users[m + 10], bot ? "steady" : null, bot ? (m % 3) + 1 : null],
      );
      for (let r = 0; r < 5; r += 1) {
        const eventId = pick(historyIds);
        await db.query(
          `insert into public.match_round (match_id, generation, idx, event_id) values ($1, 1, $2, $3)`,
          [matchId, r, eventId],
        );
        if (!stuck || r < 2) {
          for (const seat of [1, 2]) {
            await db.query(
              `insert into public.match_answer (match_id, generation, idx, seat, guess, verdict, points, elapsed_ms)
               select $1, 1, $2, $3, e.year + $4, 'good', 50, 9000 from public.event e where e.id = $5`,
              [matchId, r, seat, Math.round((rand() - 0.5) * 200), eventId],
            );
          }
        }
      }
    }

    // --- 200 date challenges -------------------------------------------------
    // One vote per account per event per year, so the dense events are spread
    // over all 30 players; 40 legacy (pre-account) rows sit on the hottest
    // event, and one event is challenged from a single language only.
    const hot = imaged.slice(0, 3);
    const oneLocale = imaged[5]!;
    const locales = ["en", "tr", "de", "fr", "es"];
    let votes = 0;
    for (let c = 0; c < 160; c += 1) {
      const eventId = c < 75 ? hot[c % 3]! : c < 95 ? oneLocale : pick(imaged);
      const user = users[c % users.length]!;
      const { rowCount } = await db.query(
        `insert into public.event_date_challenge (event_id, user_id, direction, locale_code, created_at)
         values ($1, $2, $3, $4, now() - ($5 || ' hours')::interval)
         on conflict do nothing`,
        [eventId, user, rand() < 0.7 ? 1 : -1, eventId === oneLocale ? "de" : pick(locales), String(Math.floor(rand() * 24 * 60))],
      );
      votes += rowCount ?? 0;
    }
    // Legacy rows: bypass the stamping trigger the way the migration's
    // backfill did.
    await db.query("alter table public.event_date_challenge disable trigger event_date_challenge_stamp");
    for (let c = 0; c < 200 - votes; c += 1) {
      await db.query(
        `insert into public.event_date_challenge (event_id, direction, locale_code, year_at_vote, is_legacy, created_at)
         select e.id, $2, $3, e.year, true, now() - ($4 || ' days')::interval from public.event e where e.id = $1`,
        [hot[0], rand() < 0.5 ? 1 : -1, pick(locales), String(1 + Math.floor(rand() * 20))],
      );
    }
    await db.query("alter table public.event_date_challenge enable trigger event_date_challenge_stamp");

    await db.query("commit");
    console.log(
      `seed-fake: ${images} images, ${users.length} players, ${answers} solo answers, 10 matches (2 stuck), 200 challenges`,
    );
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
