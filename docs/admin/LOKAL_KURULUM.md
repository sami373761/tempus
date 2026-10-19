# Admin Paneli — Yerel Kurulum ve Test

Bu dosya `admin-panel-web` branch'ini canlıya taşıyacak yerel (Mac) oturum içindir.
Kaynak talimat: `docs/admin/ADMIN_PANEL_RAPORU.md`. Bu dosya dışında bilgiye ihtiyaç
olmamalı. Bulut oturumu canlı Supabase / R2 / Auth'a **hiç bağlanmadı**; her şey §3'teki
geçici Postgres 17'de denendi.

## 0. Durum

- **Bitenler:**
  - Migration'lar (11 dosya, §4): işlem kaydı, giriş deneme sınırı, oy kuralları
    (hesap başına tek oy, yıl damgası, inceleme), `event.admin_edited_at`, PD'de
    kaynak isteğe bağlı, pano gizleme/yasak filtresi, puan düzeltmesi
    (`adjustment`), `game_category` + 4 yerleşik kategorinin taşınması + oyun adı
    trigger'ı, sözleşmedeki tüm `admin_*` fonksiyonları.
  - Güvenlik (§4): gizli klasör, kullanıcı adı + şifre girişi, deneme sınırı
    (IP + kullanıcı adı, katlanan bekleme, 1 saat kilit, ≥ 400 ms yanıt), TOTP kurulum
    ve doğrulama ekranları, `requireAdmin()` (getUser + role + **aal2** + 30 dk boşta
    kalma), `requireAdminPage()`, panel yanıt başlıkları, `/admin` kaldırıldı,
    `scripts/make-admin.ts`.
  - Ortak altyapı (§5): `admin_log`, tag'li önbellek + `lib/admin/revalidate.ts`,
    panel kabuğu ve menü, sabit Türkçe hata mesajları, yıl girişi (MÖ/MS).
  - Modüller (§6): Pano, İtirazlar (liste + detay + tarih düzeltme önizlemeli +
    kapatma), Olaylar (liste, toplu durum, kopya sekmesi, editör, kalıcı silme),
    İçerik ekleme (tekli form + toplu içe aktarma), Görseller (5 sekme, yükleme =
    master + WebP birlikte, atıf düzeltme, klasöre taşı, öksüz silme), Kullanıcılar
    (liste, profil, şüpheli hareket, yeniden adlandır, avatar, askı, panolardan gizle,
    puan düzelt, hesabı sil), Versus, Günlük, Sağlık, İşlem kaydı (geri al dahil).
  - §8: itiraz oyu için giriş zorunluluğu; misafire "Oy vermek için giriş yapın" +
    giriş bağlantısı, ikinci oya "Bu olay için oyunuz alındı" (5 dilde).
  - §7 kategori sistemi: veri modeli, taşıma, `category-parity.ts` (30/30), panel
    kategori editörü (çizelge düzenleyici, otomatik bantlar, dağılım grafiği, ek
    etiket, kart/arka plan yükleme, yayın şartları, ana sayfa, silme), genel rota
    `/oyun/[slug]` (yatay görünüm), `dealCategoryEvents` + `/api/deal` slug kabulü,
    kategori bantlarıyla reveal, kategori başına TP/rozet/günlük hak, ana sayfada
    yeni kategori kartları ve yerleşik kartları gizleme.
  - Seed koruması: tüm `scripts/seed-*.ts` panelde düzenlenmiş olayları atlar ve
    "Skipped (edited in the admin panel): N" yazar.
  - `npm run admin:check`, `scripts/admin-test-db/` (kurulum, sahte veri,
    `test-functions.ts` 135/135, `category-parity.ts` 30/30).
- **Bitmeyenler / yarım kalanlar** (ayrıntı §10):
  - **Yapılmadı:** `PosterGame` birleştirmesi (§7.5). `screen-game.tsx` ve
    `when-born-game.tsx` ayrı kaldı; panelde açılan **yeni** kategoriler yalnız
    **yatay** görünümde oynanabilir (poster seçeneği editörde kapalı).
  - **Yarım:** yerleşik 4 kategorinin oyun sayfaları hâlâ koddaki sabitleri okuyor
    (değerler DB satırlarıyla birebir eşit, `category-parity` ve `admin:check`
    kanıtlıyor). Bu yüzden panelde yerleşik kategorinin **çizelgesi salt okunur** ve
    §7.4'teki "Uygula" düğmesi yok; başlık, ek etiket, ana sayfa ve yayın
    düzenlenebilir.
  - **Yarım:** ana sayfada `home_order` yalnız yeni kategori kartlarını sıralar;
    yerleşik 4 kartın yeri sabit (göster/gizle çalışır).
  - **Yapılmadı:** kategori editöründe "gerçek çizelge bileşeniyle canlı önizleme"
    (yerine sınırlar + olay dağılımı grafiği var) ve olay editöründe "gerçek oyun
    bileşeniyle önizleme" (yerine kategorinin 16:9 / 2:3 çerçevesinde görsel + ad).
  - **Yapılmadı:** `kind = 'other'` kategori bağlarının süreç-içi memo'su
    (`lib/db/queries.ts`, 10 dk TTL) `unstable_cache`'e taşınmadı; panelde etiket
    değişikliği oyunda en geç 10 dakikada görünür.
  - **Yapılmadı (bulutta mümkün değil):** tarayıcı testleri, canlı migration,
    admin hesabı, TOTP kurulumu, R2 yükleme denemesi.

## 1. Panel adresi

http://localhost:3000/a8t2bjytk2dcv4n3jcarvdtbh10cmtenmofuncpi/giris   (yayında: https://<alan-adı>/a8t2bjytk2dcv4n3jcarvdtbh10cmtenmofuncpi/giris)

Gizli klasör: `app/a8t2bjytk2dcv4n3jcarvdtbh10cmtenmofuncpi/` (sabit:
`lib/admin/path.ts` → `ADMIN_SEGMENT`). Bu adres CLAUDE.md'ye yazılmaz.

## 2. Admin bilgileri
(Yerel oturum make-admin çalıştırınca doldurur)
- Kullanıcı adı:
- Şifre:

> Bu iki satır dolduktan sonra dosyayı **commit etmeyin** (şifre içerir). Gerekirse
> `git update-index --skip-worktree docs/admin/LOKAL_KURULUM.md` ya da şifreyi bir
> parola yöneticisine taşıyıp satırı boşaltın.

## 3. Bu branch'te ne değişti

**Veritabanı** — `supabase/migrations/20261018170000…171000_*.sql` (11 dosya, §4).

**Güvenlik ve giriş**
- `app/a8t2bjytk2dcv4n3jcarvdtbh10cmtenmofuncpi/layout.tsx` — noindex, no-referrer, force-dynamic.
- `…/giris/page.tsx`, `…/mfa/page.tsx`, `…/mfa/kurulum/page.tsx` — giriş, TOTP kodu, TOTP kurulumu.
- `app/actions/admin-auth.ts` — `adminSignIn`, `adminVerifyTotp`, `adminStartEnrollment`, `adminVerifyEnrollment`, `adminSignOut` (requireAdmin almayan tek admin action'ları; bu yüzden `app/actions/admin/` dışında).
- `lib/auth/admin.ts` — `isAdmin`, `requireAdmin` (aal2 + boşta kalma), `requireAdminPage`, `readAal`.
- `lib/admin/path.ts` (gizli adres, `@admin.tempus.invalid`), `client-ip.ts` (`TRUSTED_PROXY_HEADER`), `session-seen.ts` (30 dk), `guard.ts`, `errors.ts` (Türkçe sabit mesajlar), `result.ts`, `labels.ts`, `year-input.ts`, `revalidate.ts`, `categories-read.ts`, `bulk-parse.ts`, `image-upload.ts`.
- `middleware.ts` — panel sayfa yüklemesinde boşta kalma çerezini ileri alır (yetki kararı vermez).
- `next.config.ts` — yalnız panel yolu için `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Robots-Tag`; Server Action gövde sınırı 26 MB (25 MB yükleme için).
- `app/admin/layout.tsx` — **silindi** (`/admin` artık 404).
- `scripts/make-admin.ts` — `--create`, `--reset-mfa`, `--reset-password`, `--revoke`.

**Panel sayfaları** (`app/a8t2bjytk2dcv4n3jcarvdtbh10cmtenmofuncpi/(panel)/`)
- `layout.tsx` (kapı + menü), `page.tsx` (Pano), `itirazlar/`, `itirazlar/[id]/`, `olaylar/`, `olaylar/[id]/`, `olaylar/yeni/`, `olaylar/yeni/toplu/`, `gorseller/`, `kategoriler/`, `kategoriler/yeni/`, `kategoriler/[slug]/`, `kullanicilar/`, `kullanicilar/[id]/`, `versus/`, `gunluk/`, `saglik/`, `kayit/`, `kayit/[id]/`.
- `components/admin/*` — `ui.tsx`, `action-form.tsx` (bekleme/başarı/hata, yazarak onay, önizleme), `auth-forms.tsx`, `auth-shell.tsx`, `nav.tsx`, `event-table.tsx`, `translations-editor.tsx`, `image-upload.tsx`, `new-event-form.tsx`, `bulk-import.tsx`, `orphan-table.tsx`, `forms.tsx`, `delete-preview.tsx`, `year-forms.tsx`, `category-editor.tsx`, `category-extras.tsx`.

**Server Action'lar** (`app/actions/admin/`, her export'un ilk satırı `await requireAdmin()`)
- `events.ts`, `images.ts`, `users.ts`, `versus.ts`, `daily.ts`, `system.ts`, `categories.ts`.
- `lib/db/admin/rpc.ts` — `admin_*` çağrılarının tek kapısı (service role, hata kodu).

**Kategori sistemi (§7)**
- `lib/game/builtin-categories.ts` — 4 yerleşik kategorinin koddan türetilmiş değerleri (yalnız kontrol için).
- `lib/game/auto-bands.ts` — otomatik zorluk, çizelge yardımcıları.
- `lib/db/game-categories.ts`, `lib/db/cached.ts` (`readGameCategoriesCached`, tag `categories`; diğer cache'lere tag eklendi).
- `lib/game/timeline.ts` — `TimelinePane` string'e genişledi, `PANE_SPEC` export, `registerPanes`, `paneSpec`, `registeredPaneLabel`.
- `lib/game/register-category.ts`, `components/category-runtime.tsx`.
- `app/(public)/oyun/[slug]/page.tsx` + `loading.tsx` — genel kategori rotası.
- `app/actions/rounds.ts` — `dealCategoryEvents(slug, n)`; `app/api/deal/route.ts` slug kabul eder.
- `app/actions/scoring.ts` — kategori bantlarıyla reveal.
- `lib/game/points.ts` (`CategoryGame`, `isCategoryGameName`, `isYearGame`), `play-limit.ts` (`LimitedGame` = yerleşik 4 + kategori, `limitedGamePath`), `badge-rules.ts` (perfects her kategoriyi sayar), `deal.ts`.
- `components/game-board.tsx`, `app/(public)/page.tsx` — yeni kategori kartları, yerleşik kart gizleme. `components/site-header.tsx` — `/oyun` şeffaf bar.
- `lib/storage/images.ts` (kayıtlı arka plan plakaları), `lib/storage/masked-image.ts` (`football` + kategori klasörleri), `app/api/r2/[...key]/route.ts` (`football/` + kategori klasörleri).
- `components/timeline-stage.tsx`, `timeline-backdrop.tsx`, `timeline-game.tsx`, `daily-game.tsx`, `versus-game.tsx`, `when-born-game.tsx` — yalnız `TimelinePane` genişlemesinin tip düzeltmeleri (`fractions[x] ?? 0.5`), kayıtlı dönem etiketleri; davranış aynı.

**İtiraz oyu (§8)**
- `app/actions/challenges.ts`, `lib/db/challenges.ts`, `components/round-flank.tsx`, `lib/i18n/dictionary.ts` (`challengeSignIn`, `challengeSignInLink`, `challengeAlreadyVoted` — 5 dil).

**Görsel kütüphanesi**
- `lib/storage/image-derive.ts` (WebP türetme, backdrop türevleri, probe), `lib/storage/image-probe.ts` (scripts/'ten taşındı), `lib/storage/r2.ts` (`copyObject`, `getObjectBytes`).
- `scripts/shrink-event-images.ts`, `scripts/derive-backdrops.ts`, `scripts/attach-core.ts` bu kütüphaneyi kullanır.

**Seed koruması** — `scripts/seed-guard.ts`; `seed-events/football/basketball/screen/when-born/descriptions.ts`.

**Kontrol ve test** — `scripts/admin-check.ts`, `scripts/admin-contract.ts`, `scripts/versus-sweep.ts`, `scripts/admin-test-db/{supabase-shim.sql, setup.sh, seed-fake.ts, test-functions.ts, category-parity.ts}`; `package.json`: `admin:check`, `admin:test`, `admin:parity`, `versus:sweep`; `.gitignore`: `scripts/admin-test-db/.env.test-db`.

**Tipler** — `lib/db/database.types.ts` elle güncellendi (yeni tablolar, sütunlar, 59 fonksiyon).

## 4. Migration'lar

| Sıra | Dosya | Ne yapar | Geri alma notu |
|---|---|---|---|
| 1 | `20261018170000_admin_audit.sql` | `admin_audit` tablosu (RLS, service role), `admin_log()` | `drop function public.admin_log(...)`, `drop table public.admin_audit` — kayıtlar kaybolur |
| 2 | `20261018170100_admin_login_attempt.sql` | `admin_login_attempt`, `admin_login_gate/record/attempt_prune()` | tablo + 3 fonksiyonu düşür |
| 3 | `20261018170200_challenge_votes.sql` | `event_date_challenge`: `user_id`, `year_at_vote` (trigger damgası), `is_legacy` (mevcut satırlar), tekillik, hesap zorunlu check; `event_challenge_review`; `event_challenge_stats` yeniden (açık oylar) | Kolonları/constraint'leri düşürmek eski görünümü geri getirmez; eski view tanımı `20261006120000`'de. Geri alınırsa §8 kodu da geri alınmalı |
| 4 | `20261018170300_event_admin_edited.sql` | `event.admin_edited_at` | `alter table event drop column admin_edited_at` (seed koruması kalkar) |
| 5 | `20261018170400_image_source_optional_for_pd.sql` | `image.source_page_url` nullable + `image_source_required_unless_pd` | NULL satır varsa `not null` geri konamaz; önce doldurun |
| 6 | `20261018170500_board_visibility.sql` | `profile.is_hidden_from_boards`, `board_visible()`, 4 pano fonksiyonu gizli/yasaklıyı süzer | Eski fonksiyon tanımları `20261017120000_scoring.sql`, `20261017200000_chrono_leaderboard.sql`, `20261017160000_profile_avatar.sql`'de |
| 7 | `20261018170600_score_adjustment.sql` | `score_entry.kind` + `adjustment`, `tp <> 0` (adjustment), diğerleri `tp > 0` | Adjustment satırı varsa eski check geri konamaz |
| 8 | `20261018170700_game_category.sql` | `game_category`, `game_category_translation`, `category.tag_kind`, 4 yerleşik taşıma, `assert_game_name()` trigger'ı (check listeleri kaldırıldı), `bank_solo_round` + `player_stats` genelleştirildi | Trigger'ları düşürüp eski check'leri geri koymak mümkün (kategori oyunu yoksa); fonksiyonların eski hâli `20261017120000_scoring.sql`'de |
| 9 | `20261018170800_admin_content.sql` | Yardımcılar + olay/itiraz/görsel `admin_*` fonksiyonları | Yalnız fonksiyon; düşürülebilir |
| 10 | `20261018170900_admin_people.sql` | Kullanıcı/versus/günlük/sağlık/kayıt + `admin_dashboard` | Yalnız fonksiyon |
| 11 | `20261018171000_admin_categories.sql` | Kategori `admin_*` fonksiyonları, `panes_problem()` | Yalnız fonksiyon |

Migration'lar append-only'dir; uygulandıktan sonra düzenlenmez. Geri alma gerekirse
yeni bir migration yazılır.

## 5. Yerelde çalıştırılacak komutlar (sırayla)

1. `git fetch && git switch admin-panel-web`
   → beklenen: branch'e geçildi. Hata: `git fetch origin admin-panel-web`.
2. `npm install`
   → beklenen: yeni bağımlılık yok (lockfile değişmedi). Hata: `rm -rf node_modules && npm ci`.
3. `npm run db:migrate -- --dry-run`
   → beklenen: 31 `skip` ve **11 dosya** `would apply`:
   `20261018170000_admin_audit.sql`, `…170100_admin_login_attempt.sql`,
   `…170200_challenge_votes.sql`, `…170300_event_admin_edited.sql`,
   `…170400_image_source_optional_for_pd.sql`, `…170500_board_visibility.sql`,
   `…170600_score_adjustment.sql`, `…170700_game_category.sql`,
   `…170800_admin_content.sql`, `…170900_admin_people.sql`,
   `…171000_admin_categories.sql`.
   Hata: `!! file changed since it was applied` görülürse durun; bir migration
   dosyası canlıdakinden farklı demektir.
4. `npm run db:migrate`
   → beklenen: `Applied 11 migration(s).` Her dosya kendi transaction'ında; biri
   düşerse yalnız o geri alınır, mesajı okuyun (en olası: §9 Varsayımlar 1–4).
5. `npm run admin:check`
   → beklenen: tümü ✓ (`191/191 passed.`). ✗ satırının altındaki `→` ne yapılacağını
   söyler.
   Ek olarak `npm run admin:parity` (salt okunur; `scripts/admin-test-db/.env.test-db`
   yoksa `.env.local`'ı, yani canlıyı kullanır).
   → beklenen: `30 passed, 0 failed.`
6. `node --experimental-strip-types scripts/make-admin.ts --create`
   → beklenen: `admin created: <uuid>`, kullanıcı adı ve şifre ekrana ve bu dosyanın
   §2'sine yazılır. Hata `NEXT_PUBLIC_SUPABASE_URL … must be set`: `.env.local` eksik.
7. `npm run typecheck && npm run era:check && npm run versus:bot:check`
   → beklenen: hatasız; `era:check` → `ok`; `versus:bot:check` → `ok — no violations.`
8. `npm run dev`
   → `http://localhost:3000/a8t2bjytk2dcv4n3jcarvdtbh10cmtenmofuncpi/giris`.
   **Not:** `npm run build` dev açıkken çalıştırılırsa dev bozulur (CLAUDE.md).

İsteğe bağlı (yerelde de çalışır): geçici veritabanı testi — `scripts/admin-test-db/.env.test-db`
içine `SUPABASE_DB_URL=postgresql://postgres@127.0.0.1:<port>/tempus_test` yazıp
`scripts/admin-test-db/setup.sh`, sonra `SUPABASE_DB_URL=… npm run admin:test` (135/135)
ve `npm run admin:parity` (30/30). Script localhost dışında çalışmayı reddeder.

## 6. TOTP kurulumu (kullanıcıyla)

**Önce kontrol:** Supabase panosu → Authentication → **Multi-Factor** → **TOTP**
"Enabled" olmalı (varsayılan açık). Kapalıysa açın.

**TOTP nedir?** Telefondaki bir uygulamanın her 30 saniyede bir ürettiği 6 haneli
koddur (örnek: `482 913`). İnternetten gelmez; SMS veya e-posta değildir. Telefon ile
panel, ilk kurulumda bir kez ortak bir gizli anahtar paylaşır; ikisi de bu anahtar ve
saatten aynı kodu hesaplar. Ücretsizdir, telefon numarası istemez; şifre çalınsa bile
telefon olmadan panele girilemez.

**Uygulama:** Google Authenticator (App Store / Play Store, ücretsiz). Microsoft
Authenticator, 1Password, Authy de olur.

**İlk kurulum (bir kez):**
1. Telefona Google Authenticator'ı kurun.
2. `…/giris` sayfasında **Kullanıcı adı** ve **Şifre** (§2) → **Giriş**.
3. Panel **"İki adımlı doğrulamayı kurun"** sayfasını açar → **"QR kodu oluştur"**.
4. Authenticator'da **"+" → "QR kodu tara"** → ekrandaki QR'ı okutun. Uygulamada
   **"TEMPUS Admin"** satırı ve değişen 6 haneli bir kod belirir.
5. O kodu **"Doğrulama kodu (6 hane)"** kutusuna yazın → **Doğrula**. Pano açılır.
6. QR'ın altındaki **"Metin anahtarı"**nı kâğıda yazıp saklayın (telefon değişirse
   aynı hesabı başka uygulamaya elle eklemek için).

**Her girişte:** kullanıcı adı + şifre → **"Doğrulama kodu"** sayfası → Authenticator'daki
"TEMPUS Admin" kodunu yazın. Daire bitmek üzereyse yenisini bekleyin.

**Telefon kaybolursa:** saklanan metin anahtarıyla yeni telefona elle ekleyin; yoksa
`node --experimental-strip-types scripts/make-admin.ts --reset-mfa <kullanıcıadı>` →
bir sonraki girişte yeni QR çıkar.

**Telefon saati** otomatik olmalı (Ayarlar → Genel → Tarih ve Saat → Otomatik).

## 7. Test listesi

Her madde: adım → beklenen sonuç. Geçince `[x]`.

**Güvenlik**
- [ ] Oturum yokken `/<GIZLI>` → `/<GIZLI>/giris`'e yönlenir.
- [ ] `/admin` → 404.
- [ ] Oyuncu hesabıyla (make-test-account) giriş yapıp `/<GIZLI>` → 404.
- [ ] Oyuncu hesabının e-postası/şifresiyle panel girişi → "Kullanıcı adı veya şifre hatalı."
- [ ] Yanlış şifre ×5 → 3., 4., 5. denemelerde "Çok fazla deneme. N saniye…" ve N artıyor (1, 2, 4…).
- [ ] Aynı kullanıcı adına 1 saatte 10 hata → doğru şifre de aynı sabit mesajı alır (1 saat).
- [ ] Yanlış TOTP kodu ×5 → kod adımında da bekleme mesajı.
- [ ] Doğru giriş → TOTP kurulum/kod → pano. Yanıt başlıkları (DevTools → Network): `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- [ ] 30 dakika hiçbir sayfa açmadan bekleyin → bir sonraki tıklama girişe atar, "30 dakika işlem yapılmadığı için oturum kapandı".
- [ ] Şifreyle giriş yapıp TOTP adımında `/<GIZLI>/olaylar` adresine elle gidin → `/mfa`'ya döner (aal1 yetmez).
- [ ] **Admin action'ı admin olmayan oturumla:** panelde DevTools → Network'te bir kaydetme isteğini (POST, `Next-Action` başlıklı) "Copy as cURL" yapın; oyuncu hesabıyla oturum açmış ayrı bir tarayıcı profilinin çerezleriyle (`-H 'cookie: …'`) aynı isteği gönderin → yanıt hata (500 / "Forbidden: admin …"), veritabanında değişiklik yok (`/kayit`'ta yeni satır yok).
- [ ] Panelde bir dış bağlantıya (Wikipedia) tıklayın → hedef sitenin Referer'ında panel adresi yok.

**Pano**
- [ ] Sayılar görünüyor; sağlık uyarısı > 0 ise kırmızı.

**İtirazlar**
- [ ] Liste: filtreler (konu, era, dil, tarih, kapsam) ve sıralama URL'de; sayfalama 50.
- [ ] Detay: görsel, 5 dil, 90 gün grafiği, dil kırılımı (%70 uyarısı), solo/versus sinyali, Wikipedia bağlantıları.
- [ ] **Tarihi düzelt:** yeni yıl → **Önizle** (era, klasör uyarısı, günlükler, kapanacak oy) → not yaz → **Tarihi düzelt** → açık oy 0; `/kayit`'ta `event.update_year`.
- [ ] Kategori çizelgesi dışında yıl (ör. futbol olayına 1500) → önizleme reddeder.
- [ ] **Tarih doğru, kapat** → olay listede açık görünmez; `challenge.dismiss` kaydı.
- [ ] "Adı düzelt / editör" → olay editörü.

**Olaylar**
- [ ] Arama (5 dil + slug), filtreler, toplu seçim → **Durumu değiştir** → her olay için `event.set_status`.
- [ ] "Olası kopyalar" sekmesi listeleniyor.
- [ ] Editör: **Çevirileri kaydet** (boş ad reddedilir; eksik dil rozetli) → `event.update_translations`; oy sayacı değişmez.
- [ ] **Durumu değiştir**, **Hassas** (görsel bulanık), **Konuyu/etiketi değiştir** (çizelge dışı yıl reddedilir; era bağı değişmez).
- [ ] **Kalıcı sil:** Önizle (dökümler) → TR adı yazılmadan düğme kapalı → yazınca siler; yaklaşan günlükteki olay reddedilir; `event.delete` kaydında `before` dökümü ve R2 anahtarları.
- [ ] Panelde düzenlenen bir olaydan sonra `npm run db:seed:events` → "Skipped (edited in the admin panel): 1" ve değişiklik duruyor.

**İçerik ekleme**
- [ ] Tekli form: kategori → yıl (sınır kontrolü) → 5 dil → (etiket) → görsel → slug (EN addan, "Uygun/Kullanılıyor") → **Taslak kaydet** / **Yayınla**; görselli olayda master + `-<kenar>.webp` R2'de, primary WebP.
- [ ] Toplu: `data/football.json` benzeri dosya → ayrıştırma raporu (hatalı satır numaralı) → **Hepsini ekle (taslak)** → tek `event.import` kaydı.

**Görseller**
- [ ] 5 sekme dolu/boş doğru.
- [ ] Görsel yükle (PD, kaynak boş) → olur; CC-BY-4.0 kaynak boş → reddedilir; 16:9 dışı görselde kırpma uyarısı.
- [ ] **Atıf bilgisini düzelt**, **Klasöre taşı** (R2'de yeni klasöre kopya, eski kalır), **Öksüzleri sil** (çift onay).
- [ ] Dev'de önizlemeler `/api/r2/…` üzerinden görünüyor (r2.dev erişilemez).

**Kategoriler**
- [ ] 4 yerleşik kategori listede; editörde çizelge salt okunur, bantlar "Harika ±3 yıl, İyi ±8, Kötü ±25" (futbol) gibi.
- [ ] **Yeni kategori (taslak):** slug, klasör, 5 başlık, dönem(ler) → çakışan/boşluklu dönem kaydı engellenir; otomatik bant metni görünür.
- [ ] Ek etiket aç → seçenek ekle/sil (kullanımdaki silinemez).
- [ ] Kart görseli ve arka plan (JPEG ≥ 2560 px; küçükse reddedilir) yükle → R2'de `-1440/-2560` .jpg + .webp.
- [ ] **Yayınla:** eksikler listelenir (≥ 10 görselli yayında olay, 5 başlık, kart, arka plan); tamamlanınca yayında.
- [ ] **Ana sayfada göster / sıra** → ana sayfada yeni kart görünür; `/oyun/<slug>` oynanır, bir set biter, TP ve rozet ilerlemesi sayılır, günlük hak 3 (misafir 1).
- [ ] Yerleşik bir kategoriyi "Ana sayfada göster" kapalı → ana sayfadan kartı kalkar; açınca geri gelir.
- [ ] **Kategoriyi sil** (olay yoksa, slug yazılarak).

**4 yerleşik konu oyunu** (davranış aynı olmalı)
- [ ] `/football`, `/basketball`, `/screen`, `/when-born`: her birinde bir set oyna; çizelge, bantlar, etiketler (film/dizi, meslek) eskisi gibi; günlük hak sayacı çalışıyor.
- [ ] `/guess`, `/compare`, `/daily`, `/versus` etkilenmemiş; `/guess` ve `/compare` 0 px taşma.

**Kullanıcılar**
- [ ] Liste/arama; profil (TP defteri, setler, maçlar, rozetler, itirazlar).
- [ ] **Kullanıcı adını değiştir** (eski adı ayır), **Avatarı kaldır**, **Askıya al** (liderlikten düşer) / **Askıyı kaldır**, **Panolardan gizle**, **Puan düzelt** (−50 + not), **Hesabı sil** (önizleme + kullanıcı adı yazarak).
- [ ] "Şüpheli hareket" sekmesi açılıyor.

**Versus / Günlük / Sağlık / Kayıt**
- [ ] Versus: canlı maçlar, takılı rozet, **Maçı sonlandır** (KP değişmez), **Bitmiş maçları temizle**.
- [ ] Günlük: bugün + 14 gün, iki kitle; bugün kilitli; gelecek gün **Bu günü yeniden çek** (çekilmemiş günde iki kitle birlikte çekilir).
- [ ] Sağlık: 9 kontrol, **Önbellekleri temizle**, **Eski giriş denemelerini sil**; migration defteri son dosya = `20261018171000_admin_categories.sql`.
- [ ] Kayıt: filtre, satır detayı önce/sonra; **Geri al** yalnız izinli eylemlerde, yeni satır `geri alındı: #<id>` notuyla; ikinci geri alma reddedilir.

**İtiraz oyu (oyun içi)**
- [ ] Misafir: "Tarih yanlış mı?" → yön seç → "Oy vermek için giriş yapın" + **Giriş yap** (girişten sonra aynı sayfaya döner).
- [ ] Üye: bir kez oy → teşekkür; aynı olaya ikinci oy → "Bu olay için oyunuz alındı", düğmeler tekrar çıkmaz.
- [ ] Panelde yıl değişince aynı üye yeniden oy verebiliyor.

## 8. Sözleşmeden sapmalar

| Belgede | Uygulamada | Neden |
|---|---|---|
| `admin-panel` branch'i | `admin-panel-web` | Proje sahibinin talimatı |
| Migration 9 tek "tüm admin_* fonksiyonları" | Üç dosya (`170800` içerik, `170900` kişiler/sistem, `171000` kategoriler) | Okunabilirlik; `admin_dashboard`, `admin_health_checks`'i çağırdığı için ikinci dosyada |
| Kategori migration'ı (§9.8) admin fonksiyonlarından sonra | 8. sırada (`170700`), fonksiyonlardan önce | Kategori fonksiyonları ve sınır kontrolleri `game_category`'ye bağlı |
| `game_play.game` check listesi | Yok | `game_play` tablosu `20261018150000_…` ile kaldırılmış; günlük hak `solo_set`'ten okunuyor. Trigger yalnız `score_entry` ve `solo_set`'te |
| `createEvent(input, file?)` | `createEvent(input, publish)`; görsel aynı formda ardından `uploadEventImage` ile | Server Action'a dosya + büyük nesne birlikte göndermek yerine iki adım; ikisi de aynı istek akışında |
| `moveImageToEraFolder(eventId)` → `admin_repoint_image` | Aynı; fonksiyon `(actor, event, moves jsonb, note)` alır | R2 kopyası TS'te, satır güncellemesi SQL'de |
| `admin_reroll_daily(date, audience)` | `(actor, date, audience, event_ids, other_ids, note)` | Çekiliş sitenin kendi `randomEvents`'iyle TS'te yapılır; gün hiç çekilmemişse iki kitle birlikte yazılır (ayrık kalsın diye) |
| `admin_attach_image(...)` | `(actor, event, master jsonb, webp jsonb, meta jsonb, note)` | Bayt/boyut/özet R2'ye giden baytlardan okunur ve iki satır tek çağrıda yazılır |
| `admin_rename_user` | Ek `p_release_reserved` (varsayılan false) | "Geri al" eski adı ayırmış bir yeniden adlandırmayı geri alabilsin diye |
| `panes` jsonb: `minDisplay/maxDisplay` | `PANE_SPEC`'in kendi biçimi: `year` ölçeği `minYear/maxYear`, BCE ölçekleri `minDisplay/maxDisplay/stepYears` | Kodla birebir eşit kalsın, dönüşüm olmasın |
| Yerleşik kategori çizelgesi panelde düzenlenir, bantlar "Uygula" ile | Salt okunur, "Uygula" yok | Yerleşik oyun sayfaları hâlâ sabitleri okuyor (§0); düzenleme oyunu değiştirmeyeceği için yanıltıcı olurdu |
| Yeni kategori `poster` görünümü | Yalnız `landscape` | PosterGame birleştirmesi yapılmadı |
| Ana sayfa `home_order` tüm kartlar | Yalnız yeni kartlar; yerleşikler göster/gizle | `game-board.tsx` bento düzenini bozmamak |
| Kategori/etiket okumaları `unstable_cache` + `categories` | `game_category` okuması tag'li cache'te; `kind='other'` memo'su 10 dk TTL olarak kaldı | `lib/db/queries.ts` scripts/ tarafından import ediliyor (`next/cache` giremez) |
| "kaç kez dağıtıldı" istatistiği | Cevaplanan solo tur + oynanan versus turu | Dağıtımlar hiçbir yerde kaydedilmiyor |
| Puan düzeltmesi oyunu | `score_entry.game = 'history'` | Defter bir oyun adı istiyor; toplamlar tüm oyunları topladığı için etkisiz |
| `scripts/derive-backdrops.ts` mantığı kütüphaneye | WebP ve adlandırma kütüphanede; script JPEG yeniden örneklemede macOS `sips` kullanmaya devam ediyor, panel `sharp` (lanczos3) | VPS Linux; script'in mevcut dosyalarla aynı çıktısı korunsun |
| `scripts/attach-core.ts` kütüphaneye | Probe (`lib/storage/image-probe.ts`) ve türetme kütüphanede; CLI'nin pg yazımı script'te | Panel `admin_attach_image` (audit'li) kullanıyor; CLI audit actor'ı yok |
| "Rozet ilerlemesi tüm konu kategorilerini sayar" | Toplam ve "kaç oyunda Kusursuz" tüm kategorileri sayar; "her oyunda 5 Kusursuz" (ametist) yerleşik 5 oyun üzerinden | Her yeni kategoride hedefin büyüyüp ilerlemeyi geri alması önlendi |

## 9. Varsayımlar (gerçek veriyle çakışabilecekler)

1. **Canlı şema = repodaki 31 migration.** `170700` dosyasındaki `bank_solo_round` ve
   `player_stats` gövdeleri geçici DB'nin `pg_get_functiondef` çıktısından alınıp
   yalnız oyun listeleri değiştirildi. *Doğrulama:* canlıda
   `select pg_get_functiondef('public.bank_solo_round'::regproc)` çıktısını
   `20261017120000_scoring.sql` ile karşılaştırın. *Yanlışsa:* migration'ı uygulamadan
   önce farkı `170700`'e taşıyan yeni bir migration yazın.
2. **Topic kategorileri canlıda var** (`football`, `basketball`, `screen`, `when-born`,
   kind = 'topic') ve `film/series` + 14 meslek `other` kategorisi var. *Doğrulama:*
   `select kind, slug from category order by 1,2`. *Yanlışsa:* `170700`'deki insert
   eksik satırı atlar → `admin:check` "4 built-in rows" ✗ verir.
3. **`event_date_challenge`'de yalnız anonim satırlar var** ve hiçbir olayın yılı oy
   verildikten sonra değişmedi → `year_at_vote = event.year`, `is_legacy = true`.
   *Doğrulama:* `select count(*) from event_date_challenge`. *Yanlışsa:* eski oylar
   yeni yıla sayılır; panelde "Tarih doğru, kapat" ile sıfırlanabilir.
4. **`pg_trgm` canlıda kurulu olmayabilir.** `admin_duplicate_candidates` uzantıyı
   çalışma anında arar; yoksa normalize edilmiş eşitlik kullanır. *Doğrulama:*
   `select extname, extnamespace::regnamespace from pg_extension`. *İsterseniz:*
   `create extension pg_trgm with schema extensions;`.
5. **Supabase TOTP açık** ve `getClaims()` içinde `aal` claim'i var. *Doğrulama:* §6.
   *Yanlışsa:* `requireAdmin` her zaman `needs-mfa` döner; panel girilemez.
6. **Ters vekil başlığı:** IP `x-forwarded-for`'un ilk değerinden okunur
   (`lib/admin/client-ip.ts`, `TRUSTED_PROXY_HEADER`). *Yanlışsa:* IP sayacı
   yayılabilir; kullanıcı adı sayacı çalışmaya devam eder. Yayında vekil belli olunca
   tek sabiti değiştirin ve vekilin istemci başlığını ezdiğinden emin olun.
7. **Canlıda ~1050 olay, binlerce `solo_answer`.** Liste fonksiyonları sayfalı (50) ama
   bazıları (kopya tespiti, pano, sağlık, şüpheli hareket) tüm tabloyu tarar; geçici
   DB'de hızlı olmaları kanıt değil (her sorgu ~300 ms + tarama). *Doğrulama:* panelde
   sayfa sürelerine bakın; yavaşsa `explain analyze` ile index ekleyin
   (`solo_answer(answered_at)` var; `event_date_challenge(user_id)` gerekebilir).
8. **Canlıda gerçek `image` satırları ve `-<width>.webp` öksüzleri var**; görseller
   sekmesindeki "öksüz" kuralı `-<sayı>.<uzantı>` ile biten primary olmayan satırlar.
   Slug'ı sayıyla biten bir master (ör. `germany-brazil-7-1.jpg`) primary değilse
   öksüz görünebilir — silmeden önce bakın.
9. **Üç `*-2` kopya slug canlıda silinmiş.** Sağlık kontrolü yalnız `-2` ile bitip
   eki atılınca başka bir slug'a denk gelenleri sayar (ör. `bayern-barcelona-8-2`
   sayılmaz).
10. **Panel yüklemeleri aynı anahtarı yeniden kullanır** (`<klasör>/<slug>.<ext>`);
    bu yüzden panel nesneleri `Cache-Control: public, max-age=86400` ile yazılır
    (immutable değil). Bir görseli değiştirince CDN'de en geç 1 gün eski görünebilir.
11. **Admin hesabının `profile` satırı** trigger'la oluşur; `make-admin --create`
    kullanıcı adını boşaltıp `is_hidden_from_boards = true` yapar. *Doğrulama:*
    `select * from profile where id = '<admin id>'`.
12. **Boşta kalma çerezi imzasız** (`admin_session_seen`). Oturum çerezleri olmadan
    işe yaramaz; korunan şey açık bırakılmış bir tarayıcı.
13. **`versus_sweep` cron'u** kurulmadı (§13 açık nokta). Hazır komut:
    `npm run versus:sweep` (ör. saatte bir).
14. Bulut testleri Supabase'i taklit eden bir şema üzerinde koştu
    (`scripts/admin-test-db/supabase-shim.sql`: roller, `auth.users`, `auth.uid()`,
    Supabase'in "yeni tabloya anon'a ALL" varsayılanı). Gerçek PostgREST/Auth
    katmanı test edilmedi.

## 10. Bilinen sorunlar / yapılmayanlar

**Yapılmadı**
- PosterGame birleştirmesi (§7.5); yeni kategoriler yalnız yatay.
- Yerleşik 4 oyunun sayfalarının DB satırından okuması (sabitler kullanılıyor, değerler eşit).
- Kategori editöründe gerçek çizelge bileşeniyle canlı önizleme; olay editöründe gerçek oyun bileşeniyle önizleme.
- `kind='other'` memo'sunun tag'li önbelleğe taşınması.
- Ana sayfada yerleşik kartların `home_order` ile yeniden sıralanması.
- Tarayıcı testleri, canlı migration, admin hesabı, TOTP kurulumu, R2'ye gerçek yükleme (bulutta yasak/imkânsız).

**Bilinen sınırlamalar**
- Çeviri "geri al"ı, düzenlemeyle **eklenen** bir dili silmez (yalnız önceki metinleri geri yazar).
- Olay silme `solo_answer` satırlarını cascade ile siler: TP defteri durur, ama "Kusursuz" sayaçları (rozet ilerlemesi) o olaydan gelenleri kaybeder; kazanılmış rozetler geri alınmaz (`unlocked_at` hiç silinmez).
- Admin action'ları yetkisiz çağrıda istisna fırlatır (istemciye genel hata); bilerek ayrıntı verilmez.
- Panel sayfaları istemci tarafında `DICTIONARIES` (5 dil) yükler (yıl biçimi için); panel için kabul edilebilir boyut.
- Ana sayfa yeni kategori kartları mevcut bento ızgarasının sonuna eklenir; birden fazla yeni kart ızgarayı uzatır (görsel olarak kontrol edin).

**CLAUDE.md'de güncellenmesi önerilen maddeler** (§12, proje sahibi onaylarsa yerel oturum uygular; bulut CLAUDE.md'yi düzenlemedi)
- "targeted at Vercel" → VPS.
- "There is no admin UI yet" ve Known gaps #5 → admin paneli var; adres CLAUDE.md'ye **yazılmaz**.
- Admin auth: `app_metadata.role` + aal2 + gizli adres; `app/admin/layout.tsx` artık yok.
- "Tune difficulty only via `BANDS`" → konu kategorilerinin bantları `game_category.bands`'te, otomatik (`lib/game/auto-bands.ts`); tarih oyunu `BANDS`.
- Daily play limit: `LIMITED_GAMES` → yerleşik 4 + tüm konu kategorileri (`isLimitedGame`, `limitedGamePath`).
- `event_date_challenge`: artık giriş zorunlu, hesap başına olay başına yıl başına tek oy; `year_at_vote` trigger'la.
- Görsel: panel yüklemesi master + webp'i birlikte yazar; PD/PD-US/CC0'da kaynak isteğe bağlı (`image_source_required_unless_pd`).
- `EVENT_IMAGE_PREFIXES` / `ALLOWED_PREFIXES`: çekirdek (+ `football`) + kategori klasörleri (önbellekli okuma).
- Paired rules listesine: `assert_game_name()` ↔ `CORE_GAMES`/`isCategoryGameName` (`lib/game/points.ts`); `panes_year_bounds()`/`panes_problem()` ↔ `paneYearRange()`/`panesProblem()` (`lib/game/auto-bands.ts`); `game_category` yerleşik satırları ↔ `lib/game/builtin-categories.ts` (`admin:check` ve `category-parity.ts` doğrular).
- Seed scriptleri `admin_edited_at` olan satırları ezmez.
- Yeni tablolar listesine: `admin_audit`, `admin_login_attempt`, `event_challenge_review` → service role only; `game_category*` → yayındakiler okunur, yazma yalnız `admin_*`.
- Komutlar: `npm run admin:check`, `admin:test`, `admin:parity`, `versus:sweep`, `scripts/make-admin.ts`.

**Bulutta alınan sonuçlar** (geçici Postgres 17.10, `scripts/admin-test-db/`)

| Komut | Sonuç |
|---|---|
| `scripts/admin-test-db/setup.sh` | 31 + 11 migration temiz; 500 + 97 + 105 + 200 + 150 olay, 1600 açıklama; sahte: 128 görsel, 30 oyuncu, 360 solo cevap, 10 maç (2 takılı), 200 itiraz |
| `npm run typecheck` | ✓ hatasız |
| `npm run build` | ✓ başarılı (tüm rotalar, panel dahil) |
| `npm run events:check` | ✓ 0 hatalı satır |
| `npm run versus:bot:check` | ✓ `ok — no violations.` |
| `npm run era:check` (geçici DB) | ✓ `ok` |
| `npm run admin:check` (geçici DB) | ✓ `191/191 passed.` |
| `npm run admin:test` (geçici DB) | ✓ `135 passed, 0 failed.` (anon/authenticated tüm admin fonksiyonlarında ve yeni tablolarda reddedildi) |
| `npm run admin:parity` (geçici DB) | ✓ `30 passed, 0 failed.` |
| `next start` duman testi (erişilemeyen sahte Supabase adresiyle) | `/admin` 404; `/<GIZLI>` ve alt sayfalar → `/<GIZLI>/giris`; giriş sayfası 200 + noindex; panel başlıkları (`no-store`, `no-referrer`, `DENY`, `noindex`) var; `/oyun/football` → `/football`'a yönlenir; bilinmeyen slug → not-found |

## 11. main'e birleştirme

Testler tamamsa kullanıcıya sorulacak; onaysız birleştirme yok.
