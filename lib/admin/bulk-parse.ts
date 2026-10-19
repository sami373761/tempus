/**
 * Bulk import, step one: parse and report (§6.4). Never guesses — a bad row
 * is a row in `failures` with its index and reason, exactly like the seed
 * parsers, which it reuses for the four built-in categories:
 *
 *   football    scripts/parse-football.ts   (data/football.json shape)
 *   basketball  scripts/parse-basketball.ts (data/basketball.json shape)
 *   screen      scripts/parse-screen.ts     (data/screen.json shape; type -> format tag)
 *   when-born   scripts/parse-when-born.ts  (data/when-born.json shape; type -> field tag)
 *
 * A category made in the panel takes the football shape — an array of
 * { id, year, names, description } — with an optional `tag` per row for a
 * category that has a tag group. The history pool takes the same shape.
 *
 * The parsers read a path, so the upload is written to a temp file first.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseBasketballFile } from "../../scripts/parse-basketball.ts";
import { PARSED_LOCALES } from "../../scripts/parse-events.ts";
import { parseFootballFile } from "../../scripts/parse-football.ts";
import { parseScreenFile } from "../../scripts/parse-screen.ts";
import { parseWhenBornFile } from "../../scripts/parse-when-born.ts";

export interface BulkRow {
  slug: string;
  year: number;
  precision: "year";
  tag: string | null;
  translations: { locale: string; name: string; description: string | null }[];
}

export interface BulkParse {
  rows: BulkRow[];
  failures: { index: number; id: string; reason: string }[];
}

type Parsed = {
  slug: string;
  year: number;
  names: Record<string, string>;
  descriptions: Record<string, string | null>;
};

function toRow(e: Parsed, tag: string | null): BulkRow {
  return {
    slug: e.slug,
    year: e.year,
    precision: "year",
    tag,
    translations: PARSED_LOCALES.map((locale) => ({
      locale,
      name: e.names[locale] ?? "",
      description: e.descriptions[locale] ?? null,
    })),
  };
}

export function parseBulk(topic: string, text: string): BulkParse {
  const dir = mkdtempSync(join(tmpdir(), "tempus-bulk-"));
  const path = join(dir, "upload.json");
  try {
    writeFileSync(path, text);
    switch (topic) {
      case "football": {
        const r = parseFootballFile(path);
        return { rows: r.events.map((e) => toRow(e, null)), failures: r.failures };
      }
      case "basketball": {
        const r = parseBasketballFile(path);
        return { rows: r.events.map((e) => toRow(e, null)), failures: r.failures };
      }
      case "screen": {
        const r = parseScreenFile(path);
        return { rows: r.events.map((e) => toRow(e, e.format)), failures: r.failures };
      }
      case "when-born": {
        const r = parseWhenBornFile(path);
        return { rows: r.events.map((e) => toRow(e, e.field)), failures: r.failures };
      }
      default:
        return parseGeneric(text);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The football shape plus an optional `tag`, for panel-made categories. */
function parseGeneric(text: string): BulkParse {
  const failures: BulkParse["failures"] = [];
  const rows: BulkRow[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { rows, failures: [{ index: -1, id: "", reason: "JSON okunamadı" }] };
  }
  const items = Array.isArray(raw) ? raw : (raw as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    return { rows, failures: [{ index: -1, id: "", reason: "dizi veya { items: [...] } bekleniyordu" }] };
  }
  const seen = new Set<string>();
  for (const [index, entry] of items.entries()) {
    const e = entry as Record<string, unknown>;
    const id = typeof e?.id === "string" ? e.id : "";
    const fail = (reason: string) => failures.push({ index, id, reason });
    const slug = id.replace(/_/g, "-").toLowerCase();
    if (!SLUG.test(slug)) {
      fail("geçersiz id/slug");
      continue;
    }
    if (seen.has(slug)) {
      fail("aynı dosyada tekrar eden id");
      continue;
    }
    if (typeof e.year !== "number" || !Number.isInteger(e.year)) {
      fail("year tam sayı olmalı");
      continue;
    }
    const names = (e.names ?? e.title) as Record<string, unknown> | undefined;
    const desc = (e.description ?? {}) as Record<string, unknown>;
    const missing = PARSED_LOCALES.filter((l) => typeof names?.[l] !== "string" || !String(names[l]).trim());
    if (missing.length > 0) {
      fail(`ad eksik: ${missing.join(", ")}`);
      continue;
    }
    seen.add(slug);
    rows.push({
      slug,
      year: e.year,
      precision: "year",
      tag: typeof e.tag === "string" && e.tag ? e.tag : null,
      translations: PARSED_LOCALES.map((locale) => ({
        locale,
        name: String(names![locale]).trim(),
        description: typeof desc[locale] === "string" && String(desc[locale]).trim() ? String(desc[locale]).trim() : null,
      })),
    });
  }
  return { rows, failures };
}
