/**
 * Fixed Turkish messages for every refusal the panel can meet. The panel is
 * Turkish-only by the owner's decision, so these do not go through
 * lib/i18n/dictionary.ts (which is the player-facing five-language
 * dictionary).
 */
const MESSAGES: Record<string, string> = {
  "not-found": "Kayıt bulunamadı.",
  "note-required": "Bu işlem için not zorunlu.",
  "bad-precision": "Geçersiz hassasiyet.",
  "bad-year": "Geçersiz yıl.",
  "bad-status": "Geçersiz durum.",
  "bad-slug": "Geçersiz kısa ad (slug). Yalnız küçük harf, rakam ve tire.",
  "slug-taken": "Bu kısa ad (slug) zaten kullanılıyor.",
  "prefix-taken": "Bu görsel klasörü zaten kullanılıyor veya ayrılmış.",
  "out-of-bounds": "Yıl, kategorinin zaman çizelgesinin dışında.",
  "name-required": "Ad zorunlu (eksik dil var).",
  "bad-locale": "Geçersiz dil.",
  "bad-input": "Eksik veya hatalı giriş.",
  "bad-tag": "Bu etiket bu kategoriye ait değil.",
  "confirm-mismatch": "Onay metni eşleşmiyor.",
  "in-daily": "Olay yaklaşan bir günlük bulmacada. Önce o günü yeniden çekin.",
  "key-taken": "Görsel anahtarı başka bir olaya ait.",
  "not-history": "Yalnız tarih konusundaki görseller era klasörüne taşınır.",
  "bad-folder": "Hedef klasör olayın erasıyla uyuşmuyor.",
  "is-primary": "Seçilenlerden biri ana görsel; ana görsel silinemez.",
  "bad-username": "Geçersiz kullanıcı adı.",
  "username-taken": "Bu kullanıcı adı alınmış veya ayrılmış.",
  "bad-amount": "Tutar sıfır olamaz.",
  "bad-audience": "Geçersiz kitle.",
  locked: "Bu gün kilitli: bugün, geçmiş veya oynanmış günler yeniden çekilemez.",
  overlap: "Üye ve misafir bulmacası aynı olayı içeremez.",
  "bad-panes": "Zaman çizelgesi geçersiz (dönemler bitişik ve çakışmasız olmalı).",
  builtin: "Yerleşik kategoride bu alan değiştirilemez.",
  "bad-kind": "Geçersiz görsel türü.",
  "bad-key": "Geçersiz görsel anahtarı.",
  "no-tag-kind": "Önce ek etiketi açın.",
  "tag-in-use": "Kullanımdaki etiket silinemez.",
  "not-published": "Yalnız yayındaki kategori ana sayfada gösterilir.",
  "has-events": "Kategoride olay var; önce olayları taşıyın veya silin.",
  "has-plays": "Kategori oynanmış; silmek yerine yayından alın.",
  forbidden: "Bu işlem için yetkiniz yok.",
  "r2-failed": "Görsel depolamaya yüklenemedi.",
  "bad-file": "Dosya okunamadı veya desteklenmeyen tür.",
  "too-large": "Dosya çok büyük.",
  "too-small": "Görsel çok küçük.",
  "auth-failed": "Kimlik işlemi başarısız oldu.",
  unknown: "Beklenmeyen bir hata oluştu.",
};

export function adminMessage(code: string): string {
  if (code.startsWith("row-")) return `Satır ${code.slice(4)} hatalı.`;
  return MESSAGES[code] ?? MESSAGES.unknown!;
}
