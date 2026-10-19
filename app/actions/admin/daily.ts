"use server";

import { fail, guard } from "@/lib/admin/guard";
import { revalidate } from "@/lib/admin/revalidate";
import { requireAdmin } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { createAdminDbClient } from "@/lib/db/admin";
import { randomEvents } from "@/lib/db/queries";
import { DEFAULT_LOCALE } from "@/lib/db/types";
import { QUESTIONS_PER_DAILY } from "@/lib/game/daily";

/**
 * Rerolling a future daily (§6.9). The draw is the site's own
 * (`randomEvents`, the general pool, illustrated, one per year — exactly
 * what ensureDailyChallenges draws), avoiding the other audience's events so
 * the two stay disjoint. Today and the past are locked in SQL.
 */

type Arg = string | number | boolean | null | undefined;

export async function rerollDaily(date: Arg, audience: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const day = String(date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("Geçersiz tarih.");
    const who = String(audience ?? "");
    if (who !== "member" && who !== "guest") fail("Geçersiz kitle.");
    const db = createAdminDbClient();

    const { data: rows, error } = await db.from("daily_challenge").select("audience, event_ids").eq("puzzle_date", day);
    if (error) throw error;
    const other = rows?.find((r) => r.audience !== who)?.event_ids ?? null;
    const current = rows?.find((r) => r.audience === who)?.event_ids ?? [];

    const pool = await randomEvents(db, {
      count: QUESTIONS_PER_DAILY * 2 + current.length,
      locale: DEFAULT_LOCALE,
      distinctYears: true,
      exclude: [...(other ?? []), ...current],
    });
    const avoid = new Set([...(other ?? []), ...current]);
    const fresh = shuffle(pool.filter((e) => !avoid.has(e.id)).map((e) => e.id));
    if (fresh.length < QUESTIONS_PER_DAILY * (other ? 1 : 2)) fail("Yeterli görselli olay yok.");

    await adminRpc("admin_reroll_daily", {
      p_actor: actorId,
      p_date: day,
      p_audience: who,
      p_event_ids: fresh.slice(0, QUESTIONS_PER_DAILY),
      p_other_ids: other ? null : fresh.slice(QUESTIONS_PER_DAILY, QUESTIONS_PER_DAILY * 2),
      p_note: null,
    });
    revalidate("daily");
    return null;
  }, "Gün yeniden çekildi.");
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
