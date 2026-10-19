"use server";

import { fail, guard } from "@/lib/admin/guard";
import { uploadCategoryArt as upload } from "@/lib/admin/image-upload";
import { revalidate } from "@/lib/admin/revalidate";
import { requireAdmin } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import type { Json } from "@/lib/db/database.types";
import { SUPPORTED_LOCALES } from "@/lib/db/types";
import { autoBands, panesProblem } from "@/lib/game/auto-bands";
import type { CategoryPane } from "@/lib/game/builtin-categories";

/**
 * Game category writes (§7.9). Bands are never an input: they are computed
 * from the panes here (lib/game/auto-bands.ts) and stored by SQL; a built-in
 * category keeps its tuned ladder unless `applyBands` is set. First line of
 * each: `await requireAdmin()`.
 */

type Arg = string | number | boolean | null | undefined;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface CategoryInput {
  slug?: string;
  layout: "landscape" | "poster";
  panes: CategoryPane[];
  defaultPane: string;
  imagePrefix: string;
  tagKind: string | null;
  titles: { locale: string; title: string; blurb: string | null }[];
  /** Built-in only: replace the tuned bands with the computed ones. */
  applyBands?: boolean;
}

function checked(input: CategoryInput, slug: string) {
  if (!input || typeof input !== "object") fail("Eksik form.");
  if (input.layout !== "landscape" && input.layout !== "poster") fail("Geçersiz görünüm.");
  if (!SLUG.test(slug)) fail("Geçersiz kısa ad (slug).");
  if (!/^[a-z0-9-]+$/.test(input.imagePrefix ?? "")) fail("Geçersiz görsel klasörü.");
  if (input.tagKind && !SLUG.test(input.tagKind)) fail("Geçersiz etiket grubu adı.");
  // New categories' pane keys are `<slug>--<n>`: the double hyphen cannot
  // occur in a slug, so they never collide with a built-in pane id.
  const problem = panesProblem(input.panes ?? [], input.defaultPane);
  if (problem) fail(problem);
  for (const t of input.titles ?? []) {
    if (!SUPPORTED_LOCALES.includes(t.locale as never)) fail("Geçersiz dil.");
  }
  return {
    layout: input.layout,
    panes: input.panes,
    defaultPane: input.defaultPane,
    bands: autoBands(input.panes),
    imagePrefix: input.imagePrefix,
    tagKind: input.tagKind || null,
    titles: input.titles ?? [],
    applyBands: Boolean(input.applyBands),
  };
}

export async function createCategory(input: CategoryInput) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const slug = String(input?.slug ?? "");
    const body = checked(input, slug);
    if (body.panes.some((p) => !p.key.startsWith(`${slug}--`))) fail("Dönem anahtarları <slug>--<n> biçiminde olmalı.");
    const created = await adminRpc("admin_create_category", {
      p_actor: actorId,
      p_input: { slug, ...body } as unknown as Json,
      p_note: null,
    });
    revalidate("categories");
    return created;
  }, "Kategori taslak olarak oluşturuldu.");
}

export async function updateCategory(slug: Arg, input: CategoryInput) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const s = String(slug ?? "");
    const body = checked(input, s);
    await adminRpc("admin_update_category", { p_actor: actorId, p_slug: s, p_input: body as unknown as Json, p_note: null });
    revalidate("categories", "events");
    return null;
  }, "Kategori kaydedildi.");
}

export async function uploadCategoryArt(slug: Arg, kind: Arg, file: File) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const k = String(kind ?? "");
    if (k !== "card" && k !== "backdrop") fail("Geçersiz görsel türü.");
    const key = await upload(actorId, String(slug ?? ""), k, file);
    revalidate("categories");
    return key;
  }, "Görsel yüklendi.");
}

export async function saveCategoryTags(slug: Arg, tags: { slug: string; names: Record<string, string> }[]) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    if (!Array.isArray(tags)) fail("Eksik liste.");
    for (const t of tags) if (!SLUG.test(t.slug ?? "")) fail(`Geçersiz etiket: ${t.slug}`);
    await adminRpc("admin_save_category_tags", {
      p_actor: actorId,
      p_slug: String(slug ?? ""),
      p_tags: tags as unknown as Json,
      p_note: null,
    });
    revalidate("categories", "events");
    return null;
  }, "Etiketler kaydedildi.");
}

export async function setCategoryStatus(slug: Arg, status: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const result = (await adminRpc("admin_set_category_status", {
      p_actor: actorId,
      p_slug: String(slug ?? ""),
      p_status: String(status ?? ""),
      p_note: null,
    })) as { ok: boolean; missing: string[] };
    if (!result.ok) {
      const label: Record<string, string> = {
        "playable-events": "en az 10 görselli yayında olay",
        titles: "5 dilde başlık",
        "card-image": "kart görseli",
        backdrop: "arka plan görseli",
      };
      fail(`Yayınlanamaz; eksik: ${result.missing.map((m) => label[m] ?? m).join(", ")}.`);
    }
    revalidate("categories");
    return null;
  }, "Durum güncellendi.");
}

export async function setCategoryHome(slug: Arg, show: Arg, order: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const n = order === null || order === undefined || order === "" ? null : Number(order);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 32000)) fail("Sıra 0–32000 arası tam sayı olmalı.");
    await adminRpc("admin_set_category_home", {
      p_actor: actorId,
      p_slug: String(slug ?? ""),
      p_show: show === true || show === "true",
      p_order: n,
      p_note: null,
    });
    revalidate("categories");
    return null;
  }, "Ana sayfa ayarı kaydedildi.");
}

export async function deleteCategory(slug: Arg, typedSlug: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    await adminRpc("admin_delete_category", {
      p_actor: actorId,
      p_slug: String(slug ?? ""),
      p_typed: String(typedSlug ?? ""),
      p_note: null,
    });
    revalidate("categories");
    return null;
  }, "Kategori silindi.");
}
