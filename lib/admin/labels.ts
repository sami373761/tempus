/** Turkish labels the panel prints for stored values. */
export const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  review: "İncelemede",
  published: "Yayında",
  archived: "Arşiv",
};

export const PRECISION_LABEL: Record<string, string> = {
  year: "Yıl",
  decade: "On yıl",
  century: "Yüzyıl",
  millennium: "Bin yıl",
};

export const ERA_LABEL: Record<string, string> = { bce: "MÖ", ce: "MS", future: "Gelecek" };

export const TOPIC_LABEL: Record<string, string> = {
  history: "Tarih",
  football: "Futbol",
  basketball: "Basketbol",
  screen: "Film & Dizi",
  "when-born": "Ne zaman doğdu?",
};

export function topicLabel(slug: string | null | undefined): string {
  return TOPIC_LABEL[slug ?? "history"] ?? slug ?? "Tarih";
}

export const LOCALE_LABEL: Record<string, string> = { tr: "Türkçe", en: "İngilizce", de: "Almanca", fr: "Fransızca", es: "İspanyolca" };

export const VERDICT_LABEL: Record<string, string> = {
  perfect: "Kusursuz",
  great: "Harika",
  good: "İyi",
  bad: "Kötü",
  wayOff: "Çok uzak",
};

export const HEALTH_LABEL: Record<string, string> = {
  era_link: "Era kategori bağı yıl ile uyuşmuyor",
  image_folder: "Tarih konusunda görsel klasörü ≠ era",
  missing_translation: "Yayında ama çevirisi eksik",
  multiple_primary: "Birden fazla ana görsel",
  out_of_timeline: "Yılı kategori çizelgesi dışında",
  duplicate_slug: "Kopya slug (-2)",
  unswept_matches: "Bitmiş ama süpürülmemiş maç",
  migration_ledger: "Migration defteri (son dosya)",
  login_attempts: "Giriş denemesi satırları",
};

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("tr-TR", { timeZone: "UTC" }) + " UTC";
}

export const TOPIC_OPTIONS: readonly (readonly [string, string])[] = [
  ["", "Tümü"],
  ["history", "Tarih"],
  ["football", "Futbol"],
  ["basketball", "Basketbol"],
  ["screen", "Film & Dizi"],
  ["when-born", "Ne zaman doğdu?"],
];
