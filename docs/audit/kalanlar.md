# Kalanlar

`01-sistem-haritasi.md`'den çıkarılan 10 önerinin 1, 2, 5 ve 8 numaralıları
yapıldı. Aşağıdakiler şimdilik ertelendi. Her madde kodda doğrulandı; aksi
yazıyorsa belirtildi.

## Ertelenen öneriler

### 3. when-born MÖ doğum yılları bir yıl kayık
`scripts/parse-when-born.ts` `year` alanını astronomik kabul ediyor (1 BCE = 0),
ama `data/when-born.json` "551 BC" için `-551` yazıyor (doğrusu `-550`). 15 MÖ
kaydının hepsi bir yıl erken; tam yıl "perfect" imkânsız. Çözüm: 15 değeri
`+1` kaydır, `when-born:check` çalıştır, canlı DB'ye yeniden seed et (canlı
yazım — onay gerekir).

### 4. `randomEvents` 1000 satır tavanı
`lib/db/queries.ts` — `event` id sorgusu ve `onlyWithPrimaryImage` içindeki
`image` sorgusu `.range()`/sayfalama kullanmıyor. PostgREST `max-rows`
(varsayılan 1000) aşılırsa havuzun kuyruğu sessizce düşer. Çözüm: iki sorguyu
sayfala veya görsel sorgusunu `.in("event_id", aday id'ler)` ile daralt. Önce
canlı sayıları kontrol et.

### 6. Rozet sayfası "henüz sayılmıyor" notunu basmıyor
`achievementsNotLive` beş dilde var, `app/(public)/achievements/page.tsx`
render etmiyor; yeni hesap altı kartı %0 görüyor.

### 7. Yanıltıcı metinler (beş dil, `lib/i18n/dictionary.ts`)
- SSS: "çevrim içi sürüm geliştiriliyor" — versus zaten çevrim içi.
- Daily kartı "günde bir olay" — mod 10 soru.
- "1000+ olay, her biri fotoğraflı" (`explorerStatEventsValue`, SSS) — görünür
  olay ~261. Karar gerekli: canlı sayım mı, "yüzlerce" gibi ifade mi.

### 9. Ana sayfa 3D modeli kapısız iniyor
`explorer-coin.tsx` — 3,9 MB GLB + three.js her ziyaretçiye. Çözüm:
`navigator.connection.saveData` / yavaş bağlantıda yükleme.

### ~~10. Commit dışı dağınıklık~~ — kapandı
Dört `tmp-*` teşhis dosyası silindi. Pooler host bilgisi artık
`scripts/db.ts`'te: doğrudan host erişilemezse (`ENOTFOUND`/`ENETUNREACH`/…)
`connect()` oturum pooler'ı üzerinden bir kez yeniden deniyor, yani her db
script'i IPv4-only ağda da çalışıyor. `.claude/settings.local.json`
`.gitignore`'a eklendi (paylaşılan proje ayarları commit'te kalır).

## Listeye girmeyen adaylar
- Daily UTC gece yarısını geçince ertesi günün anahtarıyla puanlama (H3,
  doğrulanmadı) — `app/actions/daily.ts`.
- `versus_sweep()` tanımlı, hiç çağrılmıyor; maç satırları birikiyor.
- "Yanlış tarih bildir" kimliksiz ve sınırsız (`app/actions/challenges.ts`).
- CC-BY görsellerde ekranda atıf yok (lisans gereği).
- Şifre sıfırlama / e-posta değiştirme / hesap silme akışları yok.

## Raporda yanlış çıkan iddia
- **H2** (versus'ta moda özel bant yok): yanlış. `lib/db/matches.ts`
  `submitVersusGuess` `versusModeSpec(...).bands` ile puanlıyor.
