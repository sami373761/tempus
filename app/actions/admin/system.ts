"use server";

import { fail, guard } from "@/lib/admin/guard";
import { revalidate, revalidateAll as clearAll } from "@/lib/admin/revalidate";
import { requireAdmin } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import type { Json } from "@/lib/db/database.types";

/** Health and audit-log actions (§6.10, §6.11). First line: `await requireAdmin()`. */

type Arg = string | number | boolean | null | undefined;

export async function revalidateAll() {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    clearAll();
    await adminRpc("admin_log", {
      p_actor: actorId,
      p_action: "system.revalidate",
      p_table: "cache",
      p_id: "*",
      p_before: null,
      p_after: null,
      p_note: null,
    });
    return null;
  }, "Tüm önbellekler temizlendi.");
}

export async function pruneLoginAttempts() {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const n = await adminRpc("admin_login_attempt_prune", {} as Record<PropertyKey, never>);
    await adminRpc("admin_log", {
      p_actor: actorId,
      p_action: "system.prune_login_attempts",
      p_table: "admin_login_attempt",
      p_id: "*",
      p_before: null,
      p_after: { deleted: n },
      p_note: null,
    });
    return n;
  }, "30 günden eski giriş denemeleri silindi.");
}

/** The actions §6.11 allows undoing, and nothing else. */
const UNDOABLE = new Set([
  "event.update_year",
  "event.update_translations",
  "event.set_status",
  "event.set_sensitive",
  "event.set_category",
  "user.rename",
  "user.hide_from_boards",
]);

type Entry = {
  id: number;
  action: string;
  targetId: string;
  before: Record<string, unknown> | Record<string, unknown>[] | null;
  after: Record<string, unknown> | null;
  undoneBy: number | null;
};

/**
 * Undo = apply the entry's `before` through the same admin_* function,
 * which writes its own audit row with note "geri alındı: #<id>".
 */
export async function undoAudit(auditId: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const id = Number(auditId);
    if (!Number.isInteger(id)) fail("Geçersiz kayıt.");
    const entry = (await adminRpc("admin_audit_entry", { p_id: id })) as Entry | null;
    if (!entry) fail("Kayıt bulunamadı.");
    if (!UNDOABLE.has(entry.action)) fail("Bu işlem geri alınamaz.");
    if (entry.undoneBy) fail(`Bu işlem zaten geri alındı (#${entry.undoneBy}).`);
    const note = `geri alındı: #${entry.id}`;
    const b = (entry.before ?? {}) as Record<string, unknown>;

    switch (entry.action) {
      case "event.update_year":
        await adminRpc("admin_update_event_year", {
          p_actor: actorId,
          p_event_id: entry.targetId,
          p_year: Number(b.year),
          p_precision: String(b.precision ?? "year"),
          p_note: note,
        });
        break;
      case "event.update_translations": {
        const rows = Array.isArray(entry.before) ? entry.before : [];
        if (rows.length === 0) fail("Önceki çeviri yok; geri alınacak bir şey yok.");
        await adminRpc("admin_upsert_event_translations", {
          p_actor: actorId,
          p_event_id: entry.targetId,
          p_rows: rows as unknown as Json,
          p_note: note,
        });
        break;
      }
      case "event.set_status":
        await adminRpc("admin_set_event_status", {
          p_actor: actorId,
          p_ids: [entry.targetId],
          p_status: String(b.status),
          p_note: note,
        });
        break;
      case "event.set_sensitive":
        await adminRpc("admin_set_event_sensitive", {
          p_actor: actorId,
          p_event_id: entry.targetId,
          p_value: Boolean(b.isSensitive),
          p_note: note,
        });
        break;
      case "event.set_category":
        await adminRpc("admin_set_event_category", {
          p_actor: actorId,
          p_event_id: entry.targetId,
          p_topic: (b.topic as string | null) ?? null,
          p_tag: (b.tag as string | null) ?? null,
          p_note: note,
        });
        break;
      case "user.rename":
        if (!b.username) fail("Önceki kullanıcı adı boştu; geri alınamaz.");
        await adminRpc("admin_rename_user", {
          p_actor: actorId,
          p_user_id: entry.targetId,
          p_new_name: String(b.username),
          p_reserve_old: false,
          p_note: note,
          p_release_reserved: Boolean(entry.after?.reservedOld),
        });
        break;
      case "user.hide_from_boards":
        await adminRpc("admin_set_hidden_from_boards", {
          p_actor: actorId,
          p_user_id: entry.targetId,
          p_value: Boolean(b.hidden),
          p_note: note,
        });
        break;
    }
    revalidate("events", "daily", "leaderboard", "chrono-leaderboard", "categories");
    return null;
  }, "Geri alındı.");
}
