"use server";

import { fail, guard } from "@/lib/admin/guard";
import { revalidate } from "@/lib/admin/revalidate";
import { requireAdmin } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { createAdminDbClient } from "@/lib/db/admin";

/** Head-to-head housekeeping (§6.8). First line of each: `await requireAdmin()`. */

type Arg = string | number | boolean | null | undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runVersusSweep() {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const { data, error } = await createAdminDbClient().rpc("versus_sweep", {});
    if (error) throw error;
    await adminRpc("admin_log", {
      p_actor: actorId,
      p_action: "versus.sweep",
      p_table: "match",
      p_id: "*",
      p_before: null,
      p_after: { deleted: data },
      p_note: null,
    });
    revalidate("chrono-leaderboard");
    return data;
  }, "Bitmiş maçlar temizlendi.");
}

export async function abandonMatch(matchId: Arg, note: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    if (!UUID.test(String(matchId ?? ""))) fail("Geçersiz maç.");
    return adminRpc("admin_abandon_match", {
      p_actor: actorId,
      p_match_id: String(matchId),
      p_note: note ? String(note) : null,
    });
  }, "Maç sonlandırıldı (KP değişmedi).");
}
