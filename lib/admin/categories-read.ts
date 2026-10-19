import "server-only";

import { adminRpc } from "../db/admin/rpc.ts";
import { topicLabel } from "./labels.ts";

export interface AdminCategoryRow {
  slug: string;
  title: string;
  layout: string;
  status: string;
  isBuiltin: boolean;
  showOnHome: boolean;
  homeOrder: number;
  imagePrefix: string;
  events: number;
  playable: number;
}

export async function adminCategories(): Promise<AdminCategoryRow[]> {
  return ((await adminRpc("admin_category_list", {} as Record<PropertyKey, never>)) as unknown as AdminCategoryRow[]) ?? [];
}

/** Filter options: every category the database has, plus the history pool. */
export function topicOptions(categories: AdminCategoryRow[], all = "Tümü"): [string, string][] {
  return [
    ["", all],
    ["history", topicLabel("history")],
    ...categories.map((c) => [c.slug, c.title] as [string, string]),
  ];
}
