"use server";

import { fail, guard } from "@/lib/admin/guard";
import { revalidate } from "@/lib/admin/revalidate";
import { requireAdmin } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { createAdminDbClient } from "@/lib/db/admin";

/**
 * Account actions (§6.7). Bans and deletion go through the Supabase Auth
 * admin API and are logged with admin_log; everything else is an admin_*
 * function. First line of each: `await requireAdmin()`.
 */

type Arg = string | number | boolean | null | undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const t = (v: Arg) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
function uuid(v: Arg): string {
  if (!UUID.test(String(v ?? ""))) fail("Geçersiz kimlik.");
  return String(v);
}

export async function renameUser(userId: Arg, newName: Arg, reserveOld: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const name = await adminRpc("admin_rename_user", {
      p_actor: actorId,
      p_user_id: uuid(userId),
      p_new_name: String(newName ?? "").trim(),
      p_reserve_old: reserveOld === true || reserveOld === "true",
      p_note: null,
    });
    revalidate("leaderboard", "chrono-leaderboard");
    return name;
  }, "Kullanıcı adı değiştirildi.");
}

export async function removeAvatar(userId: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    await adminRpc("admin_clear_avatar", { p_actor: actorId, p_user_id: uuid(userId), p_note: null });
    revalidate("leaderboard", "chrono-leaderboard");
    return null;
  }, "Avatar kaldırıldı.");
}

export async function banUser(userId: Arg, hours: Arg, note: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const id = uuid(userId);
    const h = Number(hours);
    if (!Number.isInteger(h) || h < 1 || h > 24 * 365 * 10) fail("Süre 1 saat ile 10 yıl arasında olmalı.");
    const db = createAdminDbClient();
    const before = await db.auth.admin.getUserById(id);
    if (before.error || !before.data.user) fail("Kullanıcı bulunamadı.");
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: `${h}h` });
    if (error) fail("Askıya alınamadı.");
    await adminRpc("admin_log", {
      p_actor: actorId,
      p_action: "user.ban",
      p_table: "auth.users",
      p_id: id,
      p_before: { bannedUntil: before.data.user.banned_until ?? null },
      p_after: { hours: h },
      p_note: t(note),
    });
    revalidate("leaderboard", "chrono-leaderboard");
    return null;
  }, "Kullanıcı askıya alındı.");
}

export async function unbanUser(userId: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const id = uuid(userId);
    const { error } = await createAdminDbClient().auth.admin.updateUserById(id, { ban_duration: "none" });
    if (error) fail("Askı kaldırılamadı.");
    await adminRpc("admin_log", {
      p_actor: actorId,
      p_action: "user.unban",
      p_table: "auth.users",
      p_id: id,
      p_before: null,
      p_after: { banned: false },
      p_note: null,
    });
    revalidate("leaderboard", "chrono-leaderboard");
    return null;
  }, "Askı kaldırıldı.");
}

export async function setHiddenFromBoards(userId: Arg, value: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    await adminRpc("admin_set_hidden_from_boards", {
      p_actor: actorId,
      p_user_id: uuid(userId),
      p_value: value === true || value === "true",
      p_note: null,
    });
    revalidate("leaderboard", "chrono-leaderboard");
    return null;
  }, "Güncellendi.");
}

export async function adjustScore(userId: Arg, tp: Arg, note: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const amount = Number(tp);
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100_000) fail("Tutar sıfırdan farklı bir tam sayı olmalı.");
    const audit = await adminRpc("admin_adjust_score", {
      p_actor: actorId,
      p_user_id: uuid(userId),
      p_tp: amount,
      p_note: t(note) ?? fail("Not zorunlu."),
    });
    revalidate("leaderboard");
    return audit;
  }, "Puan düzeltmesi deftere yazıldı.");
}

export async function previewDeleteUser(userId: Arg) {
  await requireAdmin();
  return guard(async () => {
    const preview = await adminRpc("admin_user_delete_preview", { p_user_id: uuid(userId) });
    if (!preview) fail("Kullanıcı bulunamadı.");
    return preview;
  });
}

export async function deleteUser(userId: Arg, typedUsername: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const id = uuid(userId);
    if (id === actorId) fail("Kendi hesabınızı silemezsiniz.");
    const preview = (await adminRpc("admin_user_delete_preview", { p_user_id: id })) as
      | { username: string | null; email: string | null }
      | null;
    if (!preview) fail("Kullanıcı bulunamadı.");
    const expected = preview.username ?? preview.email ?? id;
    if (String(typedUsername ?? "").trim() !== expected) fail("Onay metni eşleşmiyor.");
    // The log row goes first: once the account is gone there is nothing to
    // read the "before" from.
    await adminRpc("admin_log", {
      p_actor: actorId,
      p_action: "user.delete",
      p_table: "auth.users",
      p_id: id,
      p_before: preview,
      p_after: null,
      p_note: null,
    });
    const { error } = await createAdminDbClient().auth.admin.deleteUser(id);
    if (error) fail("Hesap silinemedi (işlem kaydına yazıldı, hesap duruyor).");
    revalidate("leaderboard", "chrono-leaderboard");
    return null;
  }, "Hesap silindi.");
}
