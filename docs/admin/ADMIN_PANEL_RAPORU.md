# TEMPUS Admin Paneli — Uygulama Raporu

Bu belge, admin panelini kuracak **bulut oturumu** için yazılmış talimattır. Sonrasında
yerelde (Mac) aynı işi tamamlayacak oturum da bu belgeye ve bulutun bıraktığı
`docs/admin/LOKAL_KURULUM.md` dosyasına bakar.

Belgedeki her karar proje sahibiyle konuşularak verildi. **Yeniden tartışma, soru sorma,
alternatif önerme.** Belirsiz bir nokta çıkarsa en makul olanı seç, kodda yorumla açıkla
ve `LOKAL_KURULUM.md`'nin "Varsayımlar" bölümüne yaz.

CLAUDE.md'deki tüm kurallar geçerlidir. Bu belge onlara eklenir; çelişki olursa §12'ye
bak (CLAUDE.md'de değişecek maddeler). **CLAUDE.md'yi düzenleme.**

---

## İçindekiler

1. Kararlar özeti
2. Çalışma modeli: bulut ne yapar, yerel ne yapar
3. Bulut test ortamı (gerçeğe yakın veritabanı)
4. Güvenlik: gizli adres, giriş, deneme sınırı, TOTP, oturum, yetki
5. Ortak altyapı: işlem kaydı, yazma fonksiyonları, önbellek
6. Modüller ve işlem sözleşmeleri
7. Kategori sistemi: konu oyunlarını veriye taşımak
8. Uygulamadaki düzeltme: itiraz oyu için giriş zorunluluğu
9. Veritabanı değişiklikleri (migration listesi)
10. Bulutta çalışma sırası
11. Bulutun bitiş çıktıları ve `LOKAL_KURULUM.md` şablonu
12. CLAUDE.md'de güncellenmesi gereken maddeler (öneri listesi)
13. Açık noktalar
14. TOTP nedir, nasıl kullanılır (proje sahibi için)

---

## 1. Kararlar özeti

| Konu | Karar |
|---|---|
| Panel dili | Yalnızca Türkçe. Admin metinleri `lib/i18n/dictionary.ts`'e **girmez**. Sabit Türkçe metin; istisna kodda yorumla belgelenir. |
| Adres | `/admin` değil. Tahmin edilemez, ~40 karakterlik rastgele bir klasör adı (`app/<gizli>/…`). Bulut üretir. `/admin` ve gizli adres dışındaki her şey 404. |
| Admin hesabı | Oyunla ve herhangi bir e-postayla ilgisi yok. Kullanıcı adı + şifre, **yerel oturum** üretir ve `LOKAL_KURULUM.md`'ye yazar. |
| İkinci adım | TOTP (Google Authenticator vb.). Ücretsiz, telefon numarası yok, SMS yok. Zorunlu. |
| Brute force | Veritabanında deneme kaydı; IP + hesap başına katlanan bekleme; CAPTCHA yok. |
| Doğruluk kaynağı | Veritabanı. Panelde yapılan değişikliği hiçbir seed scripti ezemez. |
| Yayın ortamı | Özel VPS (Vercel değil). Uzun işler (görsel yükleme + küçültme) panelden yapılabilir. |
| Ham tablo editörü | Yok. Sadece amaca yönelik formlar. |
| Kalıcı silme | Var. Silinecek her şeyin dökümü gösterilir, onay için olay adı yazılır. |
| Kullanıcı TP'leri | Hiçbir admin işlemi geriye dönük değiştirmez (puan düzeltme modülü hariç, o da ters kayıtla). |
| Tarih itirazları | Sadece giriş yapmış kullanıcı oy verir. Kullanıcı başına olay başına tek oy, değiştirilemez, geri alınamaz. Olayın **yılı** değişince sayaç sıfırlanır (ad/açıklama değişikliği sıfırlamaz). |
| Ay/gün | Formlarda yok. Veritabanında hiçbir olayda ay/gün yok (hepsi `year` veya `century`). |
| Yeni kategori | Panelden açılabilir. Yalnızca tarih tahmini modu. Ana sayfada göster düğmesi + sıra. TP kazandırır, rozetlere sayılır. |
| Zorluk | Panelde girdi yok. Kategorinin zaman çizelgesinden otomatik hesaplanır (§7.4). |
| Günlük hak | Tüm konu kategorileri: üye 3, misafir 1 (`playsPerDay`). Ayar yok. |
| Görsel lisansı | Panelden yüklenen görseller varsayılan **PD**. PD'de kaynak adresi boş bırakılabilir. |
| Futbol görsel klasörü | Yeni yüklemeler `football/`. Mevcut 66 olay `ce/` anahtarlarında kalır. |

---

## 2. Çalışma modeli

### 2.1 Bulutta

Bulut oturumunda **`.env.local` yoktur**. Canlı Supabase'e, R2'ye, Supabase Auth'a
erişim yoktur ve denenmemelidir.

Bulut:

- Tüm kodu yazar: sayfalar, formlar, Server Action'lar, `lib/` modülleri, scriptler.
- Tüm migration dosyalarını yazar ve **kendi makinesindeki geçici Postgres'te** (§3) sırayla
  uygular. Hepsi temiz uygulanmalı.
- SQL fonksiyonlarını geçici veritabanında test eder (§3.4).
- `npm run typecheck`, `npm run build`, `npm run era:check` (geçici DB'ye karşı),
  `npm run events:check`, `npm run versus:bot:check` çalıştırır; hepsi geçmeli.
- `npm run admin:check` scriptini yazar (§11.3) ve geçici DB'ye karşı geçirir.
- `admin-panel` adında bir branch'e commit eder, GitHub'a gönderir, PR açar. **`main`'e
  birleştirmez.**
- `docs/admin/LOKAL_KURULUM.md`'yi §11.2'deki şablona göre eksiksiz doldurur.

Bulut **yapmaz**:

- Canlı veritabanına bağlanmaz, migration uygulamaz.
- R2'ye yükleme yapmaz.
- Admin hesabı oluşturmaz, şifre üretmez.
- `.env.local`'ı oluşturmaz veya taklit etmez (test için §3'teki ayrı dosyayı kullanır).
- Tarayıcıda görsel doğrulama yapamaz. Bunu `LOKAL_KURULUM.md`'deki test listesine bırakır.

### 2.2 Yerelde (Mac)

Yerel oturum, kullanıcıdan ek açıklama beklemeden yalnızca `LOKAL_KURULUM.md`'yi
izleyerek:

1. `admin-panel` branch'ine geçer.
2. Migration'ları önce `--dry-run`, sonra gerçek olarak canlıya uygular.
3. `database.types.ts`'in canlıyla uyumlu olduğunu doğrular.
4. `npm run admin:check`'i canlıya karşı çalıştırır, yeşile çevirir.
5. Admin hesabını oluşturur, bilgileri `LOKAL_KURULUM.md`'ye yazar.
6. Kullanıcıyla TOTP kurulumunu yapar (QR'ı kullanıcı okutur).
7. Test listesini tarayıcıda madde madde işaretler; bozuk olanı düzeltir.
8. Her şey geçince kullanıcıya `main`'e birleştirme onayı sorar. **Onaysız birleştirme yok.**

### 2.3 Eşleşmeyi garanti eden üç şey

- **İşlem sözleşmeleri (§6):** Her buton için bu belgede önceden tanımlı ad, action, SQL
  fonksiyonu, audit adı ve beklenen sonuç. Bulut adları **aynen** kullanır; değiştirmesi
  gerekirse `LOKAL_KURULUM.md`'de "Sözleşmeden sapmalar" tablosuna yazar.
- **`admin:check` (§11.3):** Sözleşmedeki her fonksiyonun, tablonun, iznin canlıda var
  olduğunu salt okuma ile kontrol eder.
- **`LOKAL_KURULUM.md` (§11.2):** Komutlar, sırası, beklenen çıktılar, test listesi,
  varsayımlar.

---

## 3. Bulut test ortamı

Repo, canlıyla aynı şemayı (31+ migration) ve aynı olay verisini (`data/*.json`,
`data/tarihsel_olaylar_500_5_dil.txt`) içerir. Bulut bunlarla gerçeğe çok yakın bir DB kurar.

### 3.1 Kurulum

- Postgres 17'yi bulut makinesine kur (apt veya Docker). Supabase canlı DB'si PG17.
- Supabase'e özgü şeyleri taklit et — **bunları `scripts/admin-test-db/` altında tut,
  `supabase/migrations/`'a koyma:**
  - `anon`, `authenticated`, `service_role` rolleri
  - `auth` şeması, `auth.users` tablosu (id, email, encrypted_password boş, raw_app_meta_data
    jsonb, created_at, banned_until), `auth.uid()` ve `auth.jwt()` fonksiyonları
  - `extensions` şeması ve `gen_random_uuid` (pgcrypto)
  - Realtime yayınları varsa migration'ın düşmemesi için `supabase_realtime` publication
- Ardından `supabase/migrations/*.sql`'i **dosya adı sırasıyla**, mevcut `scripts/migrate.ts`
  ile uygula. Migrate scripti `SUPABASE_DB_URL` okuyor; geçici DB için
  `scripts/admin-test-db/.env.test-db` dosyası yaz ve scripti oraya yönlendir
  (dosya gitignore'da olsun).

### 3.2 Veri

- `npm run db:seed:events`, `db:seed:football`, `db:seed:basketball`, `db:seed:screen`,
  `db:seed:when-born`, `db:seed:descriptions` (hangileri varsa) — geçici DB'ye karşı.
- Görsel satırları yok. Testlerin "görselli olay" görebilmesi için her konudan ~20 olaya
  sahte `image` satırı ekle (`r2_object_key` = beklenen anahtar, `license_code = 'PD'`).
- 30 sahte kullanıcı (`auth.users` + `profile`), birkaçına `solo_set`/`solo_answer`,
  `score_entry`, 10 versus maçı (2'si takılı), 200 tarih itirazı (birkaç olaya yoğun,
  bir olaya tek dilden).
- Bu tohumlama `scripts/admin-test-db/seed-fake.ts` olur. **Asla canlıya karşı çalışmaz:**
  bağlantı adresi `localhost`/`127.0.0.1` değilse çıkış yapar.

### 3.3 Gerçek veriden farklar (`LOKAL_KURULUM.md` "Varsayımlar"a da yaz)

- Canlıda ~1050 olay, binlerce `solo_answer` ve gerçek kullanıcılar var. Sorgular sayfalı ve
  index'li olmalı; geçici DB'de hızlı olması yeterli kanıt değil.
- Canlıda `image` satırları gerçek; bazı olayların `-<width>.webp` öksüz satırları var.
- Canlıda üç `*-2` kopya slug silinmiş durumda.
- Canlı DB Sydney'de; her sorgu ~300 ms. Bir sayfa en fazla 3–4 round-trip yapmalı.

### 3.4 Test

`scripts/admin-test-db/test-functions.ts`: her admin SQL fonksiyonunu geçici DB'de çağırır,
sonucu ve `admin_audit` satırını doğrular. Ayrıca `anon` ve `authenticated` rolleriyle
admin fonksiyonlarını ve yeni tabloları çağırmayı dener; **hepsi reddedilmeli**.

---

## 4. Güvenlik

### 4.1 Gizli adres

- Panel `app/<GIZLI>/` altında. `<GIZLI>` bulutun ürettiği ~40 karakterlik küçük harf +
  rakam dizisi (`crypto.randomBytes`). `LOKAL_KURULUM.md`'nin en başına tam URL'yi yaz.
- Var olan `app/admin/layout.tsx` kaldırılır; `/admin` doğal olarak 404 olur.
- Sitenin hiçbir yerinden panele link yok. `robots: noindex, nofollow`.
- Panel yanıtlarında `Referrer-Policy: no-referrer`, `Cache-Control: no-store`,
  `X-Frame-Options: DENY` (middleware veya `next.config` `headers()` ile, yalnız bu yol için).
- Panelde dışarıya açılan bağlantılar (Wikipedia, kaynak sayfası) `rel="noreferrer noopener"`.

### 4.2 Admin hesabı

- Supabase Auth e-posta ile giriş yapar. Kullanıcı adı, sunucu tarafında sabit bir sentetik
  e-postaya çevrilir: `<kullanıcıadı>@admin.tempus.invalid`. `.invalid` alan adına hiçbir zaman
  e-posta gitmez. Kullanıcı e-posta görmez, sadece "Kullanıcı adı" alanı vardır.
- `scripts/make-admin.ts` (bulut yazar, yerel çalıştırır):
  - `--create`: 16 karakterlik rastgele kullanıcı adı ve 32 karakterlik rastgele şifre
    üretir, `auth.admin.createUser({ email, password, email_confirm: true,
    app_metadata: { role: 'admin' } })`. Bilgileri ekrana ve `LOKAL_KURULUM.md`'nin
    "Admin bilgileri" bölümüne yazar.
  - `--reset-mfa <kullanıcıadı>`: kullanıcının tüm TOTP faktörlerini siler (telefon kaybı).
  - `--reset-password <kullanıcıadı>`: yeni şifre üretir.
  - `--revoke <kullanıcıadı>`: admin rolünü kaldırır.
- Admin hesabının `profile` satırı oluşur (trigger), ama kullanıcı adı boş kalır; liderlik
  tablolarında görünmez (§6.7 `is_hidden_from_boards` = true olarak işaretlenir).
- **Arayüzde admin rolü verme/alma yok.**

### 4.3 Giriş akışı

`/<GIZLI>/giris`:

1. Kullanıcı adı + şifre → Server Action `adminSignIn`.
2. Önce deneme sınırı (§4.4). Sınırdaysa: "Çok fazla deneme. N saniye sonra tekrar deneyin."
3. `signInWithPassword`. Başarısızsa sabit mesaj: "Kullanıcı adı veya şifre hatalı."
   (Hangisinin yanlış olduğu, hesabın var olup olmadığı, admin olup olmadığı **asla**
   söylenmez.)
4. Başarılı ama `app_metadata.role !== 'admin'` → oturumu kapat, aynı sabit mesaj.
5. Admin ise:
   - TOTP faktörü yoksa → `/<GIZLI>/mfa/kurulum` (QR + doğrulama).
   - Varsa → `/<GIZLI>/mfa` (6 haneli kod).
6. Kod doğru → oturum `aal2` olur → pano.

TOTP kod girişi de §4.4 sınırına tabidir (ayrı sayaç, `kind = 'totp'`).

Normal sitede açık bir oyuncu oturumu varsa panel onu **kullanmaz**: giriş sayfası
mevcut oturumu kapatıp admin olarak açar. Admin hesabıyla oyun sayfaları gezilirse
sorun yok, ama admin hesabı oyuncu değildir.

### 4.4 Deneme sınırı

Tablo `public.admin_login_attempt` (service-role only, RLS açık, politika yok):

```
id bigint identity, kind text ('password'|'totp'), ip inet, username text null,
success boolean, created_at timestamptz default now()
index (kind, ip, created_at desc), (kind, username, created_at desc)
```

Kurallar (fonksiyon `admin_login_gate(kind, ip, username) returns int` = beklenecek saniye):

- Son 15 dakikadaki başarısız denemeler sayılır; IP için ve kullanıcı adı için ayrı ayrı,
  büyük olan kullanılır.
- 0–2 hata: bekleme yok. Sonra her hatada `2^(n-2)` saniye: 1, 2, 4, 8 … en fazla 900.
- Aynı kullanıcı adına 1 saatte 10 hata → o kullanıcı adı 1 saat kilitli (doğru şifre de
  reddedilir, mesaj yine sabit).
- Başarılı giriş o IP + kullanıcı adının sayacını sıfırlamaz; sadece pencere kayar.
- 30 günden eski satırlar `admin_login_attempt_prune()` ile silinir (sağlık sayfasından da
  tetiklenebilir).
- Ayrıca her yanıt en az 400 ms sürer (zamanlama farkından bilgi sızmasın).

**IP okuma:** `lib/admin/client-ip.ts`. VPS'in önündeki ters vekil henüz belli değil (§13).
Varsayılan: `x-forwarded-for` başlığının **ilk** değeri, yoksa `x-real-ip`, yoksa `0.0.0.0`.
Tek bir sabitle (`TRUSTED_PROXY_HEADER`) değiştirilebilir olsun.

### 4.5 Oturum ve yetki

- `lib/auth/admin.ts`:
  - `isAdmin(user)` aynı kalır.
  - `requireAdmin()` → doğrulanmış kullanıcı + `role === 'admin'` + oturumun `aal === 'aal2'`
    (`getClaims()` içindeki `aal`). Herhangi biri eksikse `throw`.
  - Yeni: `requireAdminPage()` → aynı kontroller, eksikse uygun sayfaya `redirect`
    (giriş veya MFA). Admin olmayan için `notFound()`.
- **Her admin Server Action'ının ilk satırı `await requireAdmin()`.** Layout kapısı
  action'ları korumaz. `admin:check` bunu statik olarak da tarar (§11.3).
- Boşta kalma süresi: 30 dakika. `admin_session_seen` çerezine (httpOnly, sameSite=strict,
  path=/<GIZLI>) son işlem zamanı yazılır; 30 dakikayı geçen istekte oturum kapatılır,
  girişe yönlendirilir.
- Admin sayfaları `export const dynamic = "force-dynamic"`. `lib/db/cached.ts` asla
  admin okumaları için kullanılmaz.
- Middleware: gizli yol mevcut matcher'a eklenmez; kontrol sayfa ve action içinde yapılır.

---

## 5. Ortak altyapı

### 5.1 İşlem kaydı

```sql
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users (id),
  action text not null,
  target_table text not null,
  target_id text not null,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz not null default now()
);
-- index (target_table, target_id, created_at desc), (created_at desc)
-- revoke all from anon, authenticated; RLS açık, politika yok.
```

**Kural:** Her yazma bir plpgsql fonksiyonudur (`admin_*`). Fonksiyon `p_actor uuid` ve
`p_note text` alır, değişikliği yapar ve aynı transaction'da `admin_audit` satırı yazar.
Fonksiyonlar `security definer`, `set search_path = ''`, `revoke execute from public, anon,
authenticated`, `grant execute to service_role`.

R2 gibi veritabanı dışı adımlar içeren işlemler (görsel yükleme) TypeScript'te yapılır:
önce R2, sonra tek bir `admin_*` fonksiyonu (DB kısmı + audit). R2 adımı başarılı, DB
başarısızsa yüklenen nesne silinir.

### 5.2 Dosya düzeni

```
app/<GIZLI>/
  layout.tsx                kapı (requireAdminPage), nav, noindex
  giris/page.tsx            kullanıcı adı + şifre
  mfa/page.tsx              6 haneli kod
  mfa/kurulum/page.tsx      QR + ilk doğrulama
  page.tsx                  Pano
  itirazlar/…               §6.2
  olaylar/…                 §6.3
  olaylar/yeni/…            §6.4
  gorseller/…               §6.5
  kategoriler/…             §7
  kullanicilar/…            §6.7
  versus/…                  §6.8
  gunluk/…                  §6.9
  saglik/…                  §6.10
  kayit/…                   §6.11

app/actions/admin/*.ts      "use server"; her export: await requireAdmin()
lib/db/admin/*.ts           server-only; göreli .ts import; service-role
lib/admin/*.ts              audit yardımcıları, ip, oturum zamanı, yıl girişi
components/admin/*.tsx      panel bileşenleri
scripts/make-admin.ts
scripts/admin-check.ts      (npm run admin:check)
scripts/admin-test-db/*     sadece bulut testi
```

Not: Gizli klasör adı dosya yollarında görünür; bu proje sahibinin kararıdır.

### 5.3 Arayüz

- Mevcut palet ve token'lar (`app/globals.css`). Yeni renk yok.
- Admin sayfaları **kaydırılabilir**; tek-ekran kuralı yalnız `/guess` ve `/compare` için.
- Masaüstü öncelikli, 375px'te kullanılabilir.
- Tablolar sunucu tarafında sayfalanır (sayfa başı 50). Filtre ve sıralama URL'de
  (`?konu=screen&sirala=hacim&sayfa=2`).
- Yıl girişi: "MÖ 500" / "500" / "MS 500" kabul eder; dönüşümü `lib/admin/year-input.ts`
  yapar (1 BCE = 0, CLAUDE.md'deki astronomik kural). Yanında `formatYear` ile canlı
  önizleme.
- Her yazma butonu: bekliyor durumu, başarı bildirimi, hata mesajı (Türkçe, sabit).
- Geri alınamaz işlemler: modal + yazarak onay.

### 5.4 Önbellek

`lib/db/cached.ts`'teki her `unstable_cache` çağrısına tag eklenir:
`leaderboard`, `chrono-leaderboard`, `daily`, `events`, `categories`.
`lib/admin/revalidate.ts` → admin yazmaları sonrası ilgili `revalidateTag`.
Süreç-içi memo'lar (`kind = 'other'` kategori bağları, rozet kataloğu): kategori
sistemi (§7) bunları değiştirebildiği için kategori ve etiket okumaları `unstable_cache`
+ `categories` tag'ine taşınır. `next/cache` asla `scripts/`'in import ettiği modüllere
girmez (CLAUDE.md); gerekirse cache sarmalayıcısı ayrı bir dosyada durur.

---

## 6. Modüller ve işlem sözleşmeleri

Sözleşme tablolarındaki **action** ve **SQL fonksiyonu** adları bağlayıcıdır.

### 6.1 Pano (`/<GIZLI>`)

Salt okunur, tek SQL fonksiyonu `admin_dashboard()` (tek round-trip, jsonb döner):

- Açık itiraz sayısı, son 24 saatte gelen, en çok itiraz alan 5 olay
- Konu × durum olay sayıları; konu başına görselsiz (gizli) olay sayısı
- Dil başına açıklaması eksik çeviri sayısı
- Bugün: yeni kayıt, başlanan set, versus maçı, takılı maç
- Sağlık uyarıları sayısı (§6.10'daki kontrollerin toplamı; sıfır değilse kırmızı)

### 6.2 Tarih itirazları (`/itirazlar`)

**Liste** — `admin_challenge_list(p_filters jsonb, p_page int)`:
olay adı (TR), konu, yıl (`historical_year_label`), ↑ daha geç, ↓ daha erken, toplam,
net, son oy. Yalnız **güncel yıla** verilmiş oylar sayılır (`year_at_vote = event.year`).
Filtre: konu, era, dil, tarih aralığı, "yalnız açık". Sıralama: hacim / daha geç / daha
erken / en yeni.

**Detay** — `admin_challenge_detail(p_event_id)`:

1. Olay kartı: görsel, 5 dilde ad + açıklama, yıl, hassasiyet, konu, slug
2. Günlük oy grafiği (son 90 gün)
3. Dil kırılımı (oyların %70+'ı tek dilden → "Çeviri sorunu olabilir" uyarısı)
4. Oyuncu sinyali:
   - `solo_answer`: bu olayda `wayOff`+`bad` oranı vs. aynı konunun ortalaması
   - `match_answer.guess`: versus tahminlerinin medyanı ve saklanan yıla farkı
5. Geçmiş yıllar: `admin_audit`'ten bu olayın önceki yıl değişiklikleri ve kapanan oy sayıları
6. Hızlı bağlantılar: görselin kaynak sayfası, Wikipedia araması (TR ve EN adla)

**Sözleşme:**

| Buton | Action | SQL fonksiyonu | Audit | Sonuç |
|---|---|---|---|---|
| Tarihi düzelt | `correctEventYear(eventId, newYear, precision, note)` | `admin_update_event_year` | `event.update_year` | Yıl değişir; era trigger'ı çalışır; bu olayın açık oyları otomatik kapanır (yeni yılla eşleşmedikleri için); `event.admin_edited_at` dolar; `events`, `daily` tag'leri temizlenir. Not zorunlu. |
| Tarih doğru, kapat | `dismissChallenges(eventId, note)` | `admin_dismiss_challenges` | `challenge.dismiss` | `event_challenge_review` satırı; o ana kadarki oylar "incelendi" sayılır, listede açık görünmez. |
| Adı düzelt | — | — | — | Olay editörüne (§6.3) gider. |

**"Tarihi düzelt" etki önizlemesi** — `admin_year_change_preview(p_event_id, p_new_year)`
kaydetmeden önce gösterilir:

- Era değişiyor mu (`era_slug_for_year` eski/yeni)
- Görsel anahtarının klasörü yeni erayla uyuşuyor mu (tarih konusu için; konu oyunlarında
  klasör konuya göre olduğundan uyarı yok). Uyuşmuyorsa: "Görsel yanlış klasörde kalacak.
  Görseller sayfasından taşıyın." + o sayfaya link (§6.5 "Klasöre taşı").
- Yeni yıl, kategorinin zaman çizelgesi sınırları içinde mi (dışındaysa **kaydetme engellenir**)
- Kaç geçmiş günlük bulmacada kullanıldı (değişmez, bilgi), kaç gelecek günde var
- Kapanacak oy sayısı

### 6.3 Olaylar (`/olaylar`)

**Liste** — `admin_event_list(p_filters jsonb, p_page int)`:
arama (5 dildeki ad + slug, `ilike`), filtre: konu, durum, era, görseli yok, açıklaması
eksik dil, çevirisi eksik dil, hassas. Toplu seçim.

**Editör** (`/olaylar/[id]`) — `admin_event_detail(p_event_id)`:

- Yıl + hassasiyet (`year`/`century`/`decade`/`millennium`); "MÖ/MS" girişi
- 5 dil sekmesi: ad (zorunlu), açıklama. Eksik dil rozetle işaretli.
- Durum: taslak / incelemede / yayında / arşiv
- Hassas (görsel bulanık açılır)
- Konu (tek konu kategorisi) ve ek etiket (§7.6)
- Slug **salt okunur**
- Görseller bölümü (§6.5'e kısayol)
- İstatistik: kaç kez dağıtıldı, cevaplandı; verdict dağılımı; versus tahmin medyanı
- Oyunda önizleme: olay, kendi kategorisinin görünümüyle (yatay/poster) maskesiz gösterilir

**Sözleşme:**

| Buton | Action | SQL fonksiyonu | Audit | Sonuç |
|---|---|---|---|---|
| Tarihi kaydet | `correctEventYear` | `admin_update_event_year` | `event.update_year` | §6.2 ile aynı, önizlemeli. |
| Çevirileri kaydet | `saveEventTranslations(eventId, rows[])` | `admin_upsert_event_translations` | `event.update_translations` | 5 dil upsert; boş ad reddedilir; `admin_edited_at`; oy sayacı **sıfırlanmaz**. |
| Durumu değiştir | `setEventStatus(ids[], status)` | `admin_set_event_status` | `event.set_status` | Toplu olabilir. |
| Hassas aç/kapa | `setEventSensitive(eventId, bool)` | `admin_set_event_sensitive` | `event.set_sensitive` | |
| Konuyu/etiketi değiştir | `setEventCategory(eventId, topicSlug, tagSlug?)` | `admin_set_event_category` | `event.set_category` | Era bağlarına dokunmaz (trigger'ın). Yıl yeni konunun çizelgesi dışındaysa reddedilir. |
| Kalıcı sil | `deleteEventPermanently(eventId, typedName)` | `admin_delete_event` | `event.delete` | Önce `admin_delete_event_preview` → silinecek satır sayıları (çeviri, görsel, solo_answer, match_round, itiraz, daily_challenge'daki geçişler). `typedName` TR adla birebir eşleşmeli. Gelecek bir günlük bulmacada varsa **reddedilir** (önce o gün yeniden çekilir). R2 nesneleri silinmez; audit'e anahtarları yazılır. `before` = olayın tüm satırlarının jsonb dökümü. |

**Kopya tespiti** (`admin_duplicate_candidates()`): aynı konuda, TR veya EN adı
`similarity > 0.6` (pg_trgm; yoksa normalize edilmiş eşitlik) ve yıl farkı ≤ 5. Liste sayfasında
sekme.

**Seed koruması:** `event.admin_edited_at timestamptz` eklenir. Tüm `scripts/seed-*.ts`
upsert'leri `admin_edited_at is not null` olan olayların `year`, `precision`, `status`,
`is_sensitive` ve çevirilerini **güncellemez**, sadece "atlandı (panelde düzenlenmiş): N"
raporlar.

### 6.4 İçerik ekleme (`/olaylar/yeni`)

**Tekli form:**

1. Kategori seç (yayındaki + taslak kategoriler)
2. Yıl + hassasiyet; anında kategori çizelgesi sınır kontrolü
3. 5 dil sekmesi: ad (zorunlu), açıklama
4. Ek etiket (kategoride tanımlıysa, §7.6)
5. Görsel: sürükle-bırak (jpg/png/webp/avif, ≤ 25 MB). Lisans varsayılan PD; açılır listede
   diğer lisanslar; kaynak adresi PD/CC0'da isteğe bağlı, diğerlerinde zorunlu; yazar ve atıf
   metni isteğe bağlı
6. Hassas
7. Slug: EN addan otomatik (`caesar-s-gallic-wars` kuralı, CLAUDE.md), düzenlenebilir,
   benzersizlik canlı kontrol
8. Önizleme (oyundaki görünüm)
9. "Taslak kaydet" / "Yayınla"

| Buton | Action | SQL fonksiyonu | Audit | Sonuç |
|---|---|---|---|---|
| Taslak kaydet / Yayınla | `createEvent(input, file?)` | `admin_create_event` (+ görsel varsa §6.5 akışı) | `event.create` | Olay + çeviriler + konu bağı + (varsa) görsel satırı. Görsel R2'ye `<klasör>/<slug>.<ext>` olarak yüklenir, ardından aynı istekte küçültülür (§6.5). `admin_edited_at` dolar. |

**Toplu içe aktarma** (`/olaylar/yeni/toplu`): JSON dosyası, mevcut `data/screen.json` /
`data/football.json` biçimleri (konuya göre). Akış: yükle → **ayrıştır ve raporla** (satır
satır hata, mevcut parser'lar yeniden kullanılır: `scripts/parse-*.ts`) → önizleme tablosu
→ "Hepsini ekle (taslak)" / "Hepsini ekle (yayında)". Görseller toplu içe aktarmada yok;
olaylar görselsiz eklenir (sitede gizli kalırlar) ve görseller sayfasından eklenir.

| Buton | Action | SQL fonksiyonu | Audit |
|---|---|---|---|
| Ayrıştır | `parseBulkEvents(topicSlug, file)` | — | — |
| Hepsini ekle | `importBulkEvents(topicSlug, rows[], status)` | `admin_import_events` | `event.import` (tek satır, `after` = slug listesi) |

### 6.5 Görseller (`/gorseller`)

Sekmeler:

- **Görselsiz olaylar** — konu filtreli; her satırda beklenen anahtar ve "Görsel yükle".
- **Lisans denetimi** — `CC-BY*` olup `author` veya `attribution_text` boş olanlar;
  `CC-BY-NC-4.0` olanlar (ticari kullanım uyarısı).
- **Klasör uyumsuzluğu** — tarih konusunda anahtarın klasörü ≠ olayın erası.
- **Küçültülmemiş** — primary'si `-<edge>.webp` değil veya 1600px'ten büyük olanlar.
- **Öksüz satırlar** — primary olmayan `-<width>` satırları. Sadece listelenir +
  "Seçilenleri sil" (silme = kullanıcının kararı; çift onay).

**Yükleme akışı** (`lib/admin/image-upload.ts`, `scripts/attach-core.ts` ve
`scripts/shrink-event-images.ts` mantığını **kütüphaneye taşıyarak** yeniden kullanır; scriptler de
bu kütüphaneyi çağıracak şekilde güncellenir, iki kopya olmaz):

1. Dosya sunucuya gelir; sharp ile boyut/tür okunur (elle yazılmaz).
2. Master R2'ye `<klasör>/<slug>.<ext>` olarak yüklenir. Klasör: tarih konusu → era
   (`bce`/`ce`/`future`); diğer konular → kategorinin görsel klasörü (§7.2).
3. Master'dan WebP, uzun kenar ≤ 1600 → `<klasör>/<slug>-<edge>.webp` (shrink kuralı).
4. `admin_attach_image(...)`: master satırını (primary değil) ve webp satırını (primary)
   yazar; önceki primary'yi primary'likten çıkarır; audit.
5. `events` tag'i temizlenir.

"Shrink en son" kuralı böylece kendiliğinden sağlanır: panel her zaman ikisini birlikte yapar.

| Buton | Action | SQL fonksiyonu | Audit |
|---|---|---|---|
| Görsel yükle / değiştir | `uploadEventImage(eventId, file, license, sourceUrl?, author?, attribution?)` | `admin_attach_image` | `image.attach` |
| Atıf bilgisini düzelt | `updateImageAttribution(imageId, …)` | `admin_update_image_attribution` | `image.update_attribution` |
| Klasöre taşı | `moveImageToEraFolder(eventId)` | `admin_repoint_image` | `image.move` |
| Öksüzleri sil | `deleteOrphanImages(imageIds[])` | `admin_delete_image_rows` | `image.delete_rows` |

"Klasöre taşı": R2'de master ve webp'i yeni era klasörüne **kopyalar** (eskiyi silmez),
satırları yeni anahtara çevirir.

**Gerekli kod değişiklikleri:**

- `football/` → `EVENT_IMAGE_PREFIXES` (`lib/storage/masked-image.ts`) ve dev proxy
  `ALLOWED_PREFIXES` (`app/api/r2/[...key]/route.ts`).
- Kategori sistemiyle (§7) yeni bir kategori klasörü eklendiğinde bu iki liste **sabit dizi
  olmaktan çıkar**: sabit çekirdek (`bce`, `ce`, `future`, dekoratif klasörler) + yayındaki
  kategorilerin klasörleri (önbellekli okuma). Klasör adı `^[a-z0-9-]+$`.
- Migration: `image.source_page_url` nullable olur; check: `license_code in ('PD','PD-US','CC0-1.0')`
  değilse dolu olmak zorunda (`image_source_required_unless_pd`).
- Önizlemeler dev'de `/api/r2/` üzerinden (r2.dev erişilemez).

### 6.6 Kategoriler

§7'de ayrıntılı.

### 6.7 Kullanıcılar (`/kullanicilar`)

**Liste** — `admin_user_list(p_query, p_page)`: kullanıcı adı / e-posta / id araması;
kayıt tarihi, sağlayıcı, TP, KP, son aktivite, yasaklı mı.

**Profil** — `admin_user_detail(p_user_id)`: TP defteri (son 100), set geçmişi, versus maçları,
rozetler, giydiği rozet, avatar, verdiği itirazlar.

**Şüpheli hareket** sekmesi — `admin_suspicious_users()`: son 7 günde
- günlük TP'si en yüksek %1'in 3 katı üstü,
- 20+ cevapta `perfect` oranı > %60,
- 10 soruluk seti 30 saniyeden kısa sürede bitiren.

| Buton | Action | SQL / Auth | Audit | Sonuç |
|---|---|---|---|---|
| Kullanıcı adını değiştir | `renameUser(userId, newName, reserveOld)` | `admin_rename_user` | `user.rename` | `normalize_username` kuralı; `reserveOld` ise eskisi `reserved_username`'e. |
| Avatarı kaldır | `removeAvatar(userId)` | `admin_clear_avatar` | `user.clear_avatar` | `avatar_key = null`; R2 nesnesi kalır. |
| Askıya al | `banUser(userId, hours, note)` | Auth `updateUserById({ ban_duration })` + `admin_log` | `user.ban` | Liderlik tablolarından gizlenir (`banned_until` filtresi). |
| Askıyı kaldır | `unbanUser(userId)` | Auth + `admin_log` | `user.unban` | |
| Panolardan gizle | `setHiddenFromBoards(userId, bool)` | `admin_set_hidden_from_boards` | `user.hide_from_boards` | Test ve admin hesapları için. |
| Puan düzelt | `adjustScore(userId, tp, note)` | `admin_adjust_score` | `score.adjust` | `score_entry`'ye `kind='adjustment'`, işaretli tutar. Not zorunlu. |
| Hesabı sil | `deleteUser(userId, typedUsername)` | Önce `admin_user_delete_preview`, sonra Auth `deleteUser` + `admin_log` | `user.delete` | Cascade dökümü gösterilir; kullanıcı adı yazılarak onaylanır. |

`admin_log(p_actor, p_action, p_table, p_id, p_before, p_after, p_note)`: Auth API gibi DB
dışı işlemler için genel audit yazıcısı.

### 6.8 Versus (`/versus`)

`admin_versus_overview()`: canlı maçlar (faz, tur, son görülme), takılı/bitmiş maç sayısı,
son 7 gün `bot_level` başına bot kazanma oranı ve ortalama hata, KP dağılımı (histogram),
terk oranı, ortalama eşleşme bekleme süresi.

| Buton | Action | SQL fonksiyonu | Audit |
|---|---|---|---|
| Bitmiş maçları temizle | `runVersusSweep()` | `versus_sweep()` (mevcut) | `versus.sweep` (`admin_log`) |
| Maçı sonlandır | `abandonMatch(matchId, note)` | `admin_abandon_match` (→ `versus_abandon`) | `versus.abandon` |

Ayrıca `scripts/versus-sweep.ts` (VPS'te cron ile çalıştırılacak; kurulum §13'te açık nokta).

### 6.9 Günlük bulmaca (`/gunluk`)

`admin_daily_overview(p_from, p_days)`: bugün + 14 gün, member ve guest için olay listesi
(cevap anahtarı — yalnız burada görünür), her günün oynanma sayısı, açık itirazı veya
arşivlenmiş/silinmiş olayı olan günlere uyarı.

| Buton | Action | SQL fonksiyonu | Audit | Sonuç |
|---|---|---|---|---|
| Bu günü yeniden çek | `rerollDaily(date, audience)` | `admin_reroll_daily` | `daily.reroll` | **Sadece** o gün için hiç `daily_attempt` yoksa ve gün bugünden sonraysa. Bugün ve geçmiş kilitli. `daily` tag'i temizlenir. |

### 6.10 Sağlık (`/saglik`)

`admin_health_checks()` → her kontrol için ad, sayı, örnek 10 satır:

- Era kategori bağı ≠ `era_slug_for_year(year)`
- Tarih konusunda görsel klasörü ≠ era
- Yayında olup 5 dilden birinde çevirisi olmayan
- Birden fazla primary görseli olan olay
- Kategorisinin çizelgesi dışında yılı olan olay
- Kopya slug (`-2` ile biten)
- Bitmiş ama süpürülmemiş maç sayısı
- Migration defteri: `internal` ledger'daki son dosya adı (repodaki son dosyayla yerel
  oturum karşılaştırır)
- `admin_login_attempt` satır sayısı

| Buton | Action | Sonuç |
|---|---|---|
| Önbellekleri temizle | `revalidateAll()` | Tüm tag'ler; audit `system.revalidate`. |
| Eski giriş denemelerini sil | `pruneLoginAttempts()` | `admin_login_attempt_prune()`; audit. |

### 6.11 İşlem kaydı (`/kayit`)

Liste (filtre: eylem, hedef, tarih), satıra tıklayınca before/after farkı.
**Geri al** yalnız şu eylemlerde: `event.update_year`, `event.update_translations`,
`event.set_status`, `event.set_sensitive`, `event.set_category`, `user.rename`,
`user.hide_from_boards`. Geri alma, `before`'u uygulayan aynı `admin_*` fonksiyonunu
çağırır ve yeni bir audit satırı yazar (`note = 'geri alındı: #<id>'`).

---

## 7. Kategori sistemi

En büyük iş. Şu an dört konu oyunu (futbol, basketbol, film-dizi = `screen`, kim ne zaman
doğdu = `when-born`) koda gömülü. Hedef: bir kategori = bir veritabanı satırı; panelden
yeni kategori açılır, mevcut dördü de aynı sisteme taşınır ve **davranışları birebir aynı
kalır**.

### 7.1 Kategorinin şu an dağıldığı yerler (hepsi değişecek)

```
lib/game/topics.ts               konu slug sabitleri
lib/game/timeline.ts             *_PANES, *_DEFAULT_PANE, PANE_SPEC, *_MIN_YEAR
lib/game/scoring.ts              FOOTBALL_/BASKETBALL_/SCREEN_/WHEN_BORN_BANDS
lib/game/points.ts               SoloGame listeleri
lib/game/badge-rules.ts          oyun başına perfects
lib/game/play-limit.ts           LIMITED_GAMES
lib/game/deal.ts                 DealGame, dağıtım tipleri
lib/game/screen.ts, when-born.ts ek etiket (format / meslek), kind='other' kategoriler
app/actions/rounds.ts            dealFootballEvents, dealScreenEvents …
app/actions/scoring.ts           oyun adına göre reveal
app/api/deal/route.ts            oyun listesi
app/(public)/{football,basketball,screen,when-born}/page.tsx + loading.tsx
components/timeline-game.tsx     yatay görünüm
components/screen-game.tsx       poster görünüm (tek çizelge)
components/when-born-game.tsx    poster görünüm (çok dönemli)
components/timeline-stage.tsx, timeline-backdrop.tsx
components/game-board.tsx, site-header.tsx   ana sayfa kartları ve menü
lib/storage/images.ts            arka plan eşlemesi
lib/storage/masked-image.ts, app/api/r2/[...key]/route.ts   klasör izinleri
lib/i18n/dictionary.ts           footballTitle, screenTitle …
supabase: score_entry.game, solo_set.game, game_play.game check listeleri;
          topic kategori migration'ları
```

### 7.2 Veri modeli

```sql
create table public.game_category (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_id uuid not null unique references public.category (id),  -- kind='topic'
  layout text not null check (layout in ('landscape','poster')),
  panes jsonb not null,            -- §7.3
  default_pane text not null,
  bands jsonb not null,            -- §7.4, otomatik
  image_prefix text not null unique check (image_prefix ~ '^[a-z0-9-]+$'),
  card_image_key text,             -- ana sayfa kartı (dekoratif, .webp)
  backdrop_key text,               -- arka plan master anahtarı (-1440/-2560 türevleri zorunlu)
  tag_kind text,                   -- §7.6, null = ek etiket yok
  show_on_home boolean not null default false,
  home_order smallint not null default 100,
  status text not null default 'draft' check (status in ('draft','published')),
  is_builtin boolean not null default false,  -- mevcut 4: slug ve layout değiştirilemez
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_category_translation (
  slug text references public.game_category (slug) on update cascade on delete cascade,
  locale_code text references public.locale (code),
  title text not null,             -- "Futbol"
  blurb text,                      -- ana sayfa kartı / üst bar açıklaması
  primary key (slug, locale_code)
);
```

RLS: ikisi de `published` satırlar için `anon`/`authenticated`'a salt okunur (oyunun
okuması gerekir); yazma yalnız `admin_*` fonksiyonlarıyla. Grant'ler sütun bazlı ve açık.

**Oyun adı kısıtları:** `score_entry.game`, `solo_set.game`, `game_play.game` check
listeleri kaldırılır; yerine trigger `assert_game_name()`: değer sabit oyunlardan biri
(`history`, `compare`, `survival`, `daily`, `versus`) **veya** `game_category.slug` olmalı.
(FK kullanılamaz çünkü sabit oyunlar tabloda değil.)

**Taşıma migration'ı:** mevcut 4 kategori `is_builtin = true` ile eklenir. Değerleri
**bugünkü koddan birebir** alınır:

| slug | layout | panes | bands | image_prefix | home |
|---|---|---|---|---|---|
| football | landscape | `FOOTBALL_PANES` + `PANE_SPEC.football` | `FOOTBALL_BANDS` | football | evet |
| basketball | landscape | `BASKETBALL_PANES` + spec | `BASKETBALL_BANDS` | basketball | evet |
| screen | poster | `SCREEN_PANES` + spec | `SCREEN_BANDS` | film-dizi | evet |
| when-born | poster | `WHEN_BORN_PANES` (3) + spec | `WHEN_BORN_BANDS` | when-born | evet |

Başlıklar mevcut sözlük anahtarlarından (5 dil) alınır. `home_order`, `game-board.tsx`'teki
bugünkü sıra.

**Tarih oyunu (`history`) kategori değildir**; `TIMELINE_PANES`, genel `BANDS` ve `/guess`
olduğu gibi kalır.

### 7.3 Zaman çizelgesi (panes)

`panes` jsonb, `PANE_SPEC` girdisinin aynısının dizisi:

```json
[{ "key": "born-antiquity", "label": {"tr":"Antik Çağ", "en":"Antiquity", …},
   "scale": "bce-linear" | "year", "minDisplay": 0, "maxDisplay": 1500,
   "stepYears": 1, "tickStep": 250 }]
```

`lib/game/timeline.ts`: `PANE_SPEC` sabit çekirdek (tarih oyununun dönemleri) + kategori
satırlarından gelen dinamik dönemler. `TimelinePane` tipi `string`'e genişler; tarih oyununun
kendi dönemleri ayrı bir sabit tip olarak kalabilir.

**Panelde çizelge düzenleyici:**

- Dönem ekle / sil / sırala. Her dönem: ad (5 dil; tek dönemli kategoride gizli), başlangıç
  ve bitiş yılı ("MÖ 1500" girişi), çizgi aralığı (otomatik önerilir: aralık/6'ya yakın
  yuvarlak sayı), adım (varsayılan 1 yıl).
- Dönemler bitişik olmalı ve çakışmamalı; aksi halde kaydetme engellenir.
- Açılış dönemi seçimi.
- **Olay dağılımı grafiği:** kategorideki olayların yıllara göre histogramı, dönem sınırları
  üstüne çizili. Sınır dışında kalan olay varsa sayısı ve listesi kırmızı; kaydetme engellenir.
  Öneri metni: "Olayların %X'i son Y yılda; ayrı bir dönem düşünün" (en yoğun %60'lık
  dilim çizelgenin %20'sinden darsa).
- Canlı önizleme: gerçek çizelge bileşeni, örnek bir olayla.

### 7.4 Otomatik zorluk

Panelde girdi yok; çizelge kaydedilince `bands` hesaplanır (`lib/game/auto-bands.ts`,
saf fonksiyon, test edilir) ve salt okunur gösterilir ("Bu kategoride: Harika ±2 yıl,
İyi ±6, Kötü ±16").

Kural (mevcut konu oyunlarının elle ayarlanmış değerlerinden türetildi):

- `span` = ilk dönemin başı → son dönemin sonu (yıl).
- **Tek dönem ve span ≤ 400** → yaşa oranlı terim yok (`relative = 0`), tabanlar span'in yüzdesi:
  `great = max(1, round(span × 0.015))`, `good = max(great+1, round(span × 0.047))`,
  `bad = max(good+1, round(span × 0.13))`.
  (Kontrol: 176 → 3/8/23, 126 → 2/6/16, 151 → 2/7/20 — mevcutlarla ±2 içinde.)
- **Aksi halde** (çok dönem veya uzun span) → `WHEN_BORN_BANDS` kalıbı:
  `relative` 0.025 / 0.1 / 0.2, tabanlar 12 / 30 / 75.
- `perfect` her zaman tam yıl (`relative 0, floorYears 0`).
- **Yerleşik 4 kategori otomatik hesaplanmaz**; migration'daki değerlerini korur
  (`is_builtin`). Çizelgeleri panelden değişirse yeni değer gösterilir ama "Uygula" ile
  onaylanmadıkça eski bantlar kalır.

`gradeGuess()` tek derecelendirme noktası olarak kalır; bantları argüman alır (zaten
öyle). Bantlar sunucuda kategori satırından okunur; istemci bantları reveal sonucuyla alır.

### 7.5 Görünüm (layout)

- `landscape` → `TimelineGame` (yatay fotoğraf, çizelge altta).
- `poster` → **tek** bir `PosterGame` bileşeni: `screen-game.tsx` ve `when-born-game.tsx`
  birleşir; tek dönem / çok dönem farkı `panes` uzunluğundan gelir, ek etiket §7.6'dan.
  Paylaşılan görseller `timeline-stage.tsx`'e (CLAUDE.md kuralı).
- Görsel boyutlandırma: `landscape` 16:9 alan, `poster` 2:3 alan (bugünkü değerler).
  Panelde yükleme sırasında seçilen görünümün kırpma önizlemesi gösterilir; oran
  uyumsuzsa uyarı ("Bu görsel 16:9; poster görünümünde kenarları kırpılacak").

### 7.6 Ek etiket

Bugün: film-dizi'de format (film / dizi), kim-ne-zaman-doğdu'da meslek alanı;
`kind = 'other'` kategori bağları olarak tutuluyor.

Genelleştirme: `game_category.tag_kind` bir etiket grubu adı (`screen-format`,
`person-field`). Etiketler `category` satırları (`kind = 'other'`) + `category_translation`
(5 dil). Panelde kategori editöründe "Ek etiket" bölümü: aç/kapa, seçenek ekle/sil
(5 dil adıyla). Olay formunda açılır liste. Oyunda, bugünkü gibi olay kartında gösterilir.
`screenFormatOf` / `personFieldOf` genel `eventTagOf(event, tagKind)`'e dönüşür;
`poolRestriction()` `kind = 'other'`'ı yok saymaya devam eder.

### 7.7 Rota ve ana sayfa

- Yeni genel rota: `app/(public)/oyun/[slug]/page.tsx` + `loading.tsx` (GameLoading çerçevesi
  aynı, CLAUDE.md). Yalnız `published` kategori; değilse 404.
- Mevcut `/football`, `/basketball`, `/screen`, `/when-born` adresleri **kalır**; sayfaları
  aynı ortak render fonksiyonunu çağırır.
- Dağıtım: `dealCategoryEvents(slug, n)` tek action. Havuz sunucuda slug'a göre belirlenir;
  istemci başka havuzdan olay çekemez (bugünkü `rounds.ts` güvenlik notu korunur — slug
  yalnız yayındaki kategorilerden kabul edilir ve tarih havuzunu asla açmaz).
- `POST /api/deal` aynı şekilde slug alır.
- `game-board.tsx` ve `site-header.tsx`: konu kartları ve menü öğeleri `show_on_home`
  kategorilerden `home_order` sırasıyla gelir (önbellekli, `categories` tag'i). Kart görseli
  `card_image_key`.
- Arka plan: `backdrop_key`. Yüklemede kaynak genişliği ≥ 2560 değilse reddedilir;
  `-1440` / `-2560` (.jpg + .webp) türevleri `scripts/derive-backdrops.ts` mantığıyla üretilir
  (kütüphaneye taşınır). Master **asla büyütülmez**, kalite kaybı yok.
- Başlıklar: sözlük yerine `game_category_translation`. Yerleşik 4 kategorinin sözlük
  anahtarları silinmez (başka yerde kullanılıyorsa), ama kategori başlığı tablodan okunur.

### 7.8 TP, rozet, günlük hak

- `points.ts`: konu oyunu TP kuralları bugünkü konu oyunlarınınkiyle aynı; oyun adı listesi
  yerine "sabit oyunlar + kategori slug'ları". `scoring.sql`'deki eşleşmiş SQL tarafı da.
- `badge-rules.ts`: `perfects` sabit nesne yerine kategori başına sayaç (map). Rozet ilerlemesi
  tüm konu kategorilerini sayar.
- `play-limit.ts`: `LIMITED_GAMES` = tüm konu kategorileri (yayındakiler). `playsPerDay`
  değişmez (üye 3, misafir 1). SQL tarafı zaten limiti parametre alıyor.

### 7.9 Kategori sözleşmesi

| Buton | Action | SQL fonksiyonu | Audit | Sonuç |
|---|---|---|---|---|
| Yeni kategori (taslak) | `createCategory(input)` | `admin_create_category` | `category.create` | `category` (kind='topic') + `game_category` + çeviriler. Slug ve görsel klasörü benzersiz. |
| Kaydet | `updateCategory(slug, input)` | `admin_update_category` | `category.update` | Çizelge sınır kontrolü; bantlar yeniden hesaplanır (yerleşikte §7.4 kuralı). |
| Kart / arka plan görseli yükle | `uploadCategoryArt(slug, kind, file)` | `admin_set_category_art` | `category.set_art` | R2 `<klasör>/card.webp` veya backdrop türevleri. |
| Ek etiket seçeneği ekle/sil | `saveCategoryTags(slug, tags[])` | `admin_save_category_tags` | `category.save_tags` | Kullanımdaki etiket silinemez. |
| Yayınla / yayından al | `setCategoryStatus(slug, status)` | `admin_set_category_status` | `category.set_status` | Yayınlama şartı: ≥ 10 görselli yayında olay (`QUESTIONS_PER_SET`), 5 dil başlık, kart görseli, arka plan. Eksikler listelenir. |
| Ana sayfada göster / sıra | `setCategoryHome(slug, show, order)` | `admin_set_category_home` | `category.set_home` | |
| Kategoriyi sil | `deleteCategory(slug, typedSlug)` | `admin_delete_category` | `category.delete` | Yalnız `is_builtin = false` ve içinde olay yoksa. |

### 7.10 Kabul ölçütü (yerleşik 4 için davranış aynılığı)

Bulut, taşıma öncesi ve sonrası için şu karşılaştırmayı test olarak yazar
(`scripts/admin-test-db/category-parity.ts`):

- Her yerleşik kategori için `panes`, `default_pane`, `bands` değerleri eski sabitlerle
  birebir eşit.
- Aynı tohumla `gradeGuess` 1000 rastgele tahminde eski ve yeni bantlarla aynı verdict.
- Dağıtım havuzu: eski `poolRestriction` ve yeni slug tabanlı havuz aynı olay kümesi.
- `versus:bot:check` ve `era:check` geçiyor (tarih oyunu etkilenmemeli).

---

## 8. Uygulamadaki düzeltme: itiraz oyu

- `submitDateChallenge` (`app/actions/challenges.ts`): `getCurrentUser()` yoksa
  `{ ok: false, reason: 'needs-account' }`. Misafir arayüzde itiraz butonuna bastığında
  "Oy vermek için giriş yapın" ve giriş bağlantısı (`safeNextPath` ile geri dönüş) görür.
  Yeni sözlük anahtarları **5 dilde** (oyun arayüzü, admin değil).
- Satıra `user_id` ve `year_at_vote` (o anki `event.year`) yazılır.
- Tekillik: `unique (event_id, user_id, year_at_vote)`. İkinci oy → `{ ok: false, reason:
  'already-voted' }`; arayüz "Bu olay için oyunuz alındı" gösterir ve butonu tekrar göstermez.
  Değiştirme ve geri çekme yok.
- Mevcut anonim satırlar: `user_id` null kalır, `year_at_vote` = migration anındaki
  `event.year` ile doldurulur (yıl o zamandan beri değişmedi). Yeni satırlar için
  `user_id not null` bir check ile zorlanır (`created_at > <migration zamanı>` ya da ayrı
  bir `is_legacy` bayrağı; bulut seçer, açıklar).
- Mevcut migration'daki "hesap yok" açıklaması yeni migration'da `comment on` ile güncellenir.

---

## 9. Veritabanı değişiklikleri

Yeni migration dosyaları, bu sırayla (zaman damgaları bulutun çalıştığı güne göre).
Her yeni tabloda `revoke all on … from anon, authenticated` + RLS. `lib/db/database.types.ts`
elle güncellenir (Supabase CLI yok).

1. `admin_audit`, `admin_log()`
2. `admin_login_attempt`, `admin_login_gate()`, `admin_login_record()`, `admin_login_attempt_prune()`
3. `event_date_challenge`: `user_id`, `year_at_vote`, tekillik; `event_challenge_review`;
   `event_challenge_stats` yeniden tanımı (açık oylar = güncel yıl + son incelemeden sonra)
4. `event.admin_edited_at`
5. `image.source_page_url` nullable + `image_source_required_unless_pd`
6. `profile.is_hidden_from_boards`; `leaderboard`, `chrono_leaderboard` ve `*_position`
   fonksiyonları gizli ve yasaklı (`auth.users.banned_until > now()`) kullanıcıları filtreler
7. `score_entry`: `kind` listesine `adjustment`; `tp <> 0` (adjustment dışında `tp > 0`)
   — `points.ts` ↔ `scoring.sql` çiftini koru; toplamlar zaten `sum(tp)`
8. `game_category`, `game_category_translation`, oyun adı trigger'ı, 4 yerleşik kategorinin
   taşınması
9. Tüm `admin_*` fonksiyonları (§6, §7 sözleşmeleri)

---

## 10. Bulutta çalışma sırası

1. §3 test ortamını kur; mevcut 31 migration'ın geçici DB'ye temiz uygulandığını gör.
2. Migration 1–7 + ilgili `admin_*` fonksiyonları + `test-functions.ts`.
3. Güvenlik (§4): gizli klasör, giriş, deneme sınırı, TOTP ekranları, `requireAdmin`
   (aal2), oturum zaman aşımı, `make-admin.ts`.
4. Ortak altyapı (§5): audit yardımcıları, önbellek tag'leri, panel kabuğu ve nav.
5. Pano, İtirazlar, Olaylar, İçerik ekleme, Görseller.
6. §8 oyun içi düzeltme.
7. Kategori sistemi (§7): migration 8, taşıma, `category-parity.ts`, rota, ana sayfa,
   panel editörü. **En son**, çünkü çalışan oyunlara dokunuyor.
8. Kullanıcılar, Versus, Günlük, Sağlık, Kayıt.
9. `admin-check.ts`.
10. Tüm doğrulamalar (§2.1), `LOKAL_KURULUM.md`, commit, push, PR.

Bir adım bitmeden yarıda kalırsa: `LOKAL_KURULUM.md`'nin "Durum" bölümüne neyin bittiğini,
neyin bitmediğini yaz; bitmeyen sözleşmeleri "Yapılmadı" olarak işaretle. Yarım bir
özelliği bitmiş gibi gösterme.

---

## 11. Bulutun bitiş çıktıları

### 11.1 Teslim listesi

- `admin-panel` branch'i, GitHub'da; `main`'e açılmış PR (birleştirilmemiş)
- `docs/admin/LOKAL_KURULUM.md` (şablon aşağıda, eksiksiz)
- `npm run admin:check` scripti
- `scripts/make-admin.ts`
- `scripts/admin-test-db/` (yerelde de çalıştırılabilir)

### 11.2 `LOKAL_KURULUM.md` şablonu

Bulut bu şablonu **olduğu gibi** kullanır, her bölümü doldurur. Yerel oturum bu dosyanın
dışında bilgiye ihtiyaç duymamalı.

```markdown
# Admin Paneli — Yerel Kurulum ve Test

## 0. Durum
- Bitenler: …
- Bitmeyenler / yarım kalanlar: … (yoksa "Yok")

## 1. Panel adresi
http://localhost:3000/<GIZLI>/giris   (yayında: https://<alan-adı>/<GIZLI>/giris)

## 2. Admin bilgileri
(Yerel oturum make-admin çalıştırınca doldurur)
- Kullanıcı adı:
- Şifre:

## 3. Bu branch'te ne değişti
Dosya dosya kısa liste, modül başlıklarıyla.

## 4. Migration'lar
| Sıra | Dosya | Ne yapar | Geri alma notu |

## 5. Yerelde çalıştırılacak komutlar (sırayla)
Her adım: komut, beklenen çıktı, hata çıkarsa ne yapılır.
1. git fetch && git switch admin-panel
2. npm install
3. npm run db:migrate -- --dry-run   → beklenen: N dosya uygulanacak, liste …
4. npm run db:migrate
5. npm run admin:check               → beklenen: tümü ✓
6. node --experimental-strip-types scripts/make-admin.ts --create
7. npm run typecheck && npm run era:check && npm run versus:bot:check
8. npm run dev

## 6. TOTP kurulumu (kullanıcıyla)
Adım adım, ekranda ne görüneceği.

## 7. Test listesi
Her modül için: adım → beklenen sonuç → [ ] işaret kutusu.
Sözleşme tablosundaki her buton en az bir kez. Ayrıca:
- Admin olmayan oturumla gizli adres → 404
- /admin → 404
- Yanlış şifre ×5 → bekleme süreleri artıyor
- Admin action'ı admin olmayan oturumla çağrılınca reddediliyor (nasıl deneneceği yazılı)
- 4 yerleşik konu oyunu: her birinde bir set oyna, bantlar ve çizelge eskisi gibi
- Misafir itiraz → giriş istemi; üye → bir kez oy, ikincisi reddediliyor

## 8. Sözleşmeden sapmalar
| Belgede | Uygulamada | Neden |

## 9. Varsayımlar (gerçek veriyle çakışabilecekler)
Her biri: varsayım, canlıda nasıl doğrulanır, yanlışsa ne yapılır.

## 10. Bilinen sorunlar / yapılmayanlar

## 11. main'e birleştirme
Testler tamamsa kullanıcıya sorulacak; onaysız birleştirme yok.
```

### 11.3 `admin:check`

`scripts/admin-check.ts`, `SUPABASE_DB_URL`'e **salt okuma** ile bağlanır
(`set transaction read only`). Kontroller:

- Sözleşmedeki her `admin_*` fonksiyonu var; `service_role` execute edebiliyor; `anon` ve
  `authenticated` edemiyor (`has_function_privilege`).
- Yeni tablolar var; `anon`/`authenticated` için hiçbir yazma yetkisi yok; RLS açık.
- `game_category`'de 4 yerleşik satır; değerleri koddaki taşıma sabitleriyle eşit.
- `event_challenge_stats` yeni sütunlarla.
- Statik tarama: `app/actions/admin/*.ts` içindeki her export edilen async fonksiyonun ilk
  ifadesi `await requireAdmin()`.
- Gizli klasör dışında `app/admin` yok.

Çıktı: her kontrol ✓/✗ ve ✗ için ne yapılacağı. Bulut bunu geçici DB'ye karşı geçirir.

---

## 12. CLAUDE.md'de güncellenmesi gereken maddeler (öneri, düzenleme yok)

Bulut bu listeyi `LOKAL_KURULUM.md` §10'a da kopyalar; proje sahibi onaylarsa yerel oturum
uygular.

- "targeted at Vercel" → VPS.
- "There is no admin UI yet" ve Known gaps #5 → admin paneli var; adres CLAUDE.md'ye **yazılmaz**.
- Admin auth: `app_metadata.role` + aal2 + gizli adres; `app/admin/layout.tsx` artık yok.
- "Tune difficulty only via `BANDS`" → konu kategorilerinin bantları `game_category.bands`'te,
  otomatik; tarih oyunu `BANDS`.
- Daily play limit: `LIMITED_GAMES` → yayındaki konu kategorileri.
- `event_date_challenge`: artık giriş zorunlu, kullanıcı başına tek oy.
- Görsel: panel yüklemesi master + webp'i birlikte yazar; PD'de kaynak isteğe bağlı.
- `EVENT_IMAGE_PREFIXES` / `ALLOWED_PREFIXES`: çekirdek + kategori klasörleri.
- Paired rules listesine: `auto-bands.ts` ↔ (SQL'de bant hesabı varsa) ve oyun adı trigger'ı.
- Seed scriptleri `admin_edited_at` olan satırları ezmez.

---

## 13. Açık noktalar

- **VPS ters vekili** (nginx / Caddy / yok) bilinmiyor. IP okuma `TRUSTED_PROXY_HEADER`
  sabitiyle ayarlanır; yayına çıkarken belirlenecek.
- **`versus-sweep` cron'u** VPS'te kurulacak (`scripts/versus-sweep.ts`); yayın sırasında.
- **TOTP faktör tipi** Supabase projesinde açık olmalı (varsayılan açık).
  `LOKAL_KURULUM.md` §6'da kontrol adımı: Supabase panosu → Authentication →
  Multi-Factor → TOTP "Enabled".

---

## 14. TOTP nedir, nasıl kullanılır

Bu bölüm proje sahibi için. Bulut, aynı anlatımı `LOKAL_KURULUM.md` §6'ya ekran adlarıyla
uyarlayarak koyar.

**Nedir?** Telefondaki bir uygulamanın her 30 saniyede bir ürettiği 6 haneli koddur
(örnek: `482 913`). Kod internetten gelmez, SMS veya e-posta değildir. Telefon ile admin
paneli, ilk kurulumda bir kez **ortak bir gizli anahtar** paylaşır; ikisi de bu anahtar ve
saatten aynı kodu hesaplar. Bu yüzden:

- Ücretsizdir, telefon numarası istemez, internet gerekmez.
- Saldırgan kod "isteyemez"; her kod 30 saniye geçerlidir ve sadece senin telefonunda üretilir.
- Şifren çalınsa bile telefonun olmadan panele girilemez.

**Hangi uygulama?** Google Authenticator (ücretsiz, App Store / Play Store). Microsoft
Authenticator, 1Password, Authy de olur.

**İlk kurulum (bir kez):**

1. Telefona Google Authenticator'ı kur.
2. Panelin giriş sayfasında admin kullanıcı adı ve şifreyi gir.
3. İlk girişte panel "İki adımlı doğrulamayı kurun" sayfasını açar ve bir **QR kod** gösterir.
4. Authenticator'da "+" → "QR kodu tara" → ekrandaki QR'ı okut. Uygulamada "TEMPUS Admin"
   adlı bir satır ve değişen 6 haneli bir kod belirir.
5. O kodu paneldeki kutuya yaz → "Doğrula". Kurulum bitti, pano açılır.
6. QR'ın altında yazan **metin anahtarı** bir kâğıda yaz ve sakla (telefon değişirse
   aynı hesabı başka bir uygulamaya bu anahtarla elle ekleyebilirsin).

**Her girişte:**

1. Kullanıcı adı + şifre.
2. "Doğrulama kodu" sayfası → telefonda Authenticator'ı aç → "TEMPUS Admin" satırındaki
   6 haneli kodu yaz. Kodun yanındaki daire bitmek üzereyse yenisini bekle.

**Telefonu kaybedersen:** Saklanan metin anahtarı varsa yeni telefona elle ekle. Yoksa
Mac'te `node --experimental-strip-types scripts/make-admin.ts --reset-mfa <kullanıcıadı>`
çalıştırılır; bir sonraki girişte yeni QR çıkar.

**Telefon saati** otomatik olmalı (Ayarlar → Genel → Tarih ve Saat → Otomatik). Saat
birkaç dakika kayarsa kodlar tutmaz.
