# Performans raporu

Sitenin yavaşlığının nereden geldiğini ölçmek için yapılan inceleme. Her sayı
bu makinede ölçüldü; türetilen (ölçülmeyip zincirden hesaplanan) değerler
"türetilmiş" diye işaretlendi. Hiçbir koda dokunulmadı — bu dosya yalnızca
teşhis.

## Tek paragrafta özet

Yavaşlığın **iki** kaynağı var ve ikisi birbirinden bağımsız:

1. **Gecikme (latency).** Veritabanı sorguları hızlı — SQL tarafında 0,1–6,5 ms.
   Ama her sorgu ap-southeast-2'ye bir gidiş-dönüş demek ve o tur **~400 ms**.
   Sayfalar bu turları seri diziyor. Oturum açıkken **her** sayfa, içeriğinden
   önce 3 tur (≈1,2 s) ödüyor; `/account` 10 tur (3,3 s), `/achievements` 9 tur
   (2,8 s). Bu, sorgu optimizasyonuyla veya index'le çözülmez — çözüm tur
   sayısını düşürmek ve önbelleklemek.
2. **Bayt.** Görseller JPEG ve gereğinden ~2,3 kat ağır. Ana sayfa **7,8 MB /
   62 istek**; `/compare` 3,8 MB; `/guess` 3,7 MB. Aynı dosyaların WebP q80
   karşılığı **%57**, AVIF q50 karşılığı **%76** daha küçük — ölçüldü, tahmin
   değil.

En göze çarpan tek kalem: **oturum açık her sayfanın başındaki ~1,2 saniye**,
ve bunun tek işi menüde bir isim ile rozet noktasını göstermek.

---

## Ölçüm yöntemi

- **Prodüksiyon build'i** üzerinde ölçüldü (`next build` + `next start`), dev
  sunucusu değil. CLAUDE.md'deki uyarı gereği (`build` çalışan dev sunucusunu
  bozuyor) repo `/tmp` altındaki ayrı bir kopyaya alınıp orada derlendi ve
  **3100** portunda koşturuldu. Senin 3000'deki dev sunucusuna dokunulmadı.
- Tarayıcı tarafı: **headless Chrome 155**, DevTools Protocol üzerinden,
  1680×844 / dpr 2 (senin görüntü alanın), her ölçümden önce önbellek
  temizlenerek. Chrome eklentisi bağlanmadığı için protokol doğrudan sürüldü;
  ölçülen şey aynı: Resource Timing, LCP, FCP, bayt.
- Oturum açık sayılar projenin **QA hesabıyla** (`.env.test.local`) alındı.
- Sunucudaki Supabase çağrıları, kopyaya konan geçici bir `instrumentation.ts`
  ile tek tek loglandı — aşağıdaki tur dökümleri bu logdan.
- Görsel boyutları hem R2'den (S3 API) hem `public.image` tablosundan okundu.

### Sayıları okurken

| Ölçülen | Gerçekte ne olur |
| --- | --- |
| Uygulama sunucusu localhost | Gerçekte +ağ gecikmesi. Sunucu süreleri **alt sınır**. |
| Görseller `/api/r2` dev proxy'sinden | Prodüksiyonda CDN'den gelir, yani görsel *gecikmesi* daha iyi olur. **Bayt sayıları aynı.** |
| Veritabanı gerçek (ap-southeast-2) | ~400 ms tur süresi gerçek, senin ağından ölçüldü. |

---

## 1. Gecikme: ~400 ms'lik tur ve seri zincirler

### 1.1 Veritabanı yavaş değil, uzak

`explain (analyze)` ile sunucu tarafı süre, aynı sorgunun duvar saati süresinden
ayrıldı:

| Sorgu | SQL süresi | Duvar saati |
| --- | --- | --- |
| `select 1` | 0,0 ms | **324 ms** |
| `random_events(2)` (history dağıtımı) | 4,7 ms | 367 ms |
| `random_events(30)` | 6,5 ms | 330 ms |
| `leaderboard()` | 1,6 ms | 325 ms |
| `chrono_leaderboard(50)` | 1,0 ms | 326 ms |
| `game_play_standing()` | 0,2 ms | 328 ms |
| `versus_db_now()` | 0,1 ms | 325 ms |
| `event_localized` (50 satır) | 1,0 ms | 410 ms |

Supabase REST üzerinden de aynı: en basit sorgu `TLS 30 ms`, `TTFB 430 ms`.

**Sonuç: her gidiş-dönüşün %99'u mesafe.** Index eklemek, sorgu yazmak, SQL'i
sadeleştirmek hiçbir şey kazandırmaz. Kazandıran tek şey **daha az tur**.

### 1.2 Oturum açık her sayfanın ödediği sabit vergi

Aynı sayfa, oturum kapalı ve açık (medyan TTFB, prodüksiyon build, 5 tekrar):

| Sayfa | Kapalı | Açık | Fark |
| --- | --- | --- | --- |
| `/` | 12 ms | **1294 ms** | +1282 ms |
| `/guess` | 17 ms | **1149 ms** | +1132 ms |
| `/compare` | 10 ms | **1126 ms** | +1116 ms |
| `/when-born` | 12 ms | **1131 ms** | +1119 ms |
| `/screen` | 11 ms | **1145 ms** | +1133 ms |
| `/versus` | 11 ms | **1255 ms** | +1244 ms |
| `/daily` | 788 ms | **1962 ms** | +1175 ms |
| `/leaderboard` | 402 ms | **1169 ms** | +766 ms |
| `/achievements` | (307) | **2898 ms** | — |
| `/account` | (307) | **3556 ms** | — |
| `POST /api/deal` (history) | 396 ms | **799 ms** | +403 ms |

Sunucu logundan `/` için tur dökümü:

```
415 ms  GET /auth/v1/user          ← middleware.ts
364 ms  GET /auth/v1/user          ← getCurrentUser(), layout içinde
449 ms  GET /rest/v1/profile...    ← readProfileChrome(), kullanıcı id'sine bağlı
──────
1228 ms  → ölçülen TTFB 1292 ms
```

Zincir şu:

```
istek
 ├─ middleware.ts                  supabase.auth.getUser()   ~400 ms  (ağ çağrısı)
 └─ app/(public)/layout.tsx
     └─ getCurrentAccount()
         ├─ getCurrentUser()       supabase.auth.getUser()   ~400 ms  (seri)
         └─ readProfileChrome()    profile select            ~400 ms  (seri, user.id'ye bağlı)
```

Üç nokta, üç ayrı sorun:

- **`auth.getUser()` iki kez çağrılıyor.** `@supabase/ssr`'de `getUser()` yerel
  bir okuma değil; JWT'yi doğrulamak için Supabase Auth'a **ağ çağrısı** yapar.
  Biri middleware'de, biri layout'ta — ikisi de aynı token'ı aynı servise
  doğruluyor. Saf tekrar: her gezinmede ~400 ms.
- **`getCurrentUser()` `cache()` ile sarılmamış.** `lib/auth/server.ts:18` düz
  bir async fonksiyon. Aynı render içinde kim çağırırsa yeni bir tur. React'in
  `cache()`'i bunu render başına tek çağrıya indirir.
- **Profil okuması auth çağrısına seri bağlı**, çünkü `user.id`'yi ondan
  bekliyor. Oysa `user.id` **JWT'nin içinde** — çerezden ağ çağrısı olmadan
  okunabilir. Okunursa profil sorgusu 0. ms'de başlar ve zincir 1,2 s'den
  ~0,4 s'ye iner.

Dikkat: bu vergi `/api/deal`'e de biniyor (+403 ms), çünkü deal oturum okuyor
ve middleware matcher'ının içinde. Yani oyun içinde her tur yenilemesi iki
gereksiz auth turu ödüyor.

Server Action'lar bu vergiden muaf (`missing: next-action`) — orası doğru
kurulmuş.

### 1.3 Sayfa başına tur dökümü (oturum açık)

Sunucu logundan sayılan gerçek Supabase çağrıları:

**`/account` — 10 tur, TTFB 3,3 s** (sitenin en yavaş sayfası)
```
369 ms  /auth/v1/user                      middleware
365 ms  /auth/v1/user                      layout
381 ms  /rest/v1/profile (chrome)          layout
397 ms  /rest/v1/profile (avatar_key)      ← aynı tabloya ikinci sorgu
545 ms  /rest/v1/badge
545 ms  /rest/v1/user_badge_progress
548 ms  /rest/v1/rpc/player_stats
401 ms  /rest/v1/user_badge_progress       upsert
388 ms  /rest/v1/rpc/shown_badge
433 ms  /rest/v1/rpc/leaderboard_position
```
İki ayrı `profile` sorgusu var (`username,unseen_badges,chrono_rating` ve
`avatar_key`) — tek sorguda okunabilir, bedava 400 ms.

**`/achievements` — 9 tur, TTFB 2,9 s, FCP 4,2 s**
```
358 ms  /auth/v1/user                      middleware
358 ms  /auth/v1/user                      layout
390 ms  /rest/v1/profile (chrome)
414 ms  /rest/v1/user_badge_progress       ┐
417 ms  /rest/v1/rpc/player_stats          │ refreshBadges()
425 ms  /rest/v1/badge                     │
404 ms  /rest/v1/user_badge_progress upsert┘
384 ms  /rest/v1/rpc/shown_badge
424 ms  /rest/v1/rpc/mark_badges_seen
```
`refreshBadges()` **her sayfa görüntülemesinde** yeniden hesaplanıyor ve
yazıyor. Rozetler oyun oynanmadıkça değişmez; bu iş sayfa açılışının kritik
yolunda olmak zorunda değil.

**`/leaderboard` — 9 tur, TTFB 1,9 s**
```
366 ms  /auth/v1/user                      middleware
358 ms  /auth/v1/user                      layout
447 ms  /rest/v1/rpc/leaderboard_position  ┐
446 ms  /rest/v1/rpc/chrono_leaderboard_position
447 ms  /rest/v1/rpc/leaderboard_position  │ Promise.allSettled — paralel
439 ms  /rest/v1/profile (chrome)          │
444 ms  /rest/v1/rpc/chrono_leaderboard    │
447 ms  /rest/v1/rpc/leaderboard           │
1186 ms /rest/v1/rpc/leaderboard           ┘
```
Altı okuma zaten paralel — orası iyi yapılmış. İki sorun kaldı:
`leaderboard` ve `leaderboard_position` **ikişer kez** çağrılıyor, ve
`await getCurrentUser()` paralel bloğun **önünde** seri duruyor
(`app/(public)/leaderboard/page.tsx`). Liderlik tablosu dakikalarca aynı
kalır — önbelleğe en uygun sayfa, ama `force-dynamic`.

**`/daily` — 6 tur, TTFB 2,0 s.** Zincir seri:
`getCurrentUser` → `ensureDailyChallenges` → `readDailyQuestions` →
`readDailyAttempt`. Son üçü birbirine veri bağımlı olduğu için paralelleşmesi
kolay değil, ama günün soruları gün boyu sabit — önbelleklenebilir.

### 1.4 Dağıtım (deal) turları

| Oyun | Kapalı | Açık | Tur sayısı |
| --- | --- | --- | --- |
| history | 396 ms | 799 ms | 1 (+2 auth) |
| compare | 419 ms | 871 ms | 1 (+2 auth) |
| football | 394 ms | 801 ms | 1 (+2 auth) |
| basketball | ~390 ms | — | 1 (+2 auth) |
| survival | 411 ms | — | 1 (+2 auth) |
| **screen** | **905 ms** | 1213 ms | **2** (+2 auth) |
| **when-born** | **833 ms** | 1243 ms | **2** (+2 auth) |

`screen` ve `when-born` tek turluk hedefi tutmuyor: `dealScreenEvents`
(`app/actions/rounds.ts:167`) ve `dealWhenBornEvents` (`:225`) olayları
çektikten **sonra** ikinci bir tur daha atıyor —
`eventCategorySlugs()` / `/rest/v1/event_category`. Diğer beş oyun bunu
yapmıyor. Kategori eşlemesi olay sorgusuna katılabilir veya süreç başına
önbelleklenebilir (kategoriler neredeyse hiç değişmez).

Ayrıca `random_events` duvar saati süresi 409 ms ile **1264 ms** arasında
oynuyor (SQL tarafı hep 4–6 ms). Bu PostgREST bağlantı havuzunun soğuk
olmasından; ilk istekler düzenli olarak bir saniyeyi aşıyor.

### 1.5 Tur açma (reveal) — oyun içinde hissedilen bekleme

`app/actions/scoring.ts` okunarak zincirden **türetilmiş** (Server Action olduğu
için doğrudan ölçülemedi; tur sayıları koddan, 400 ms sabiti ölçümden):

| An | Turlar | Tahmini bekleme |
| --- | --- | --- |
| Set ortası, misafir | `readDates` (paralel blok) | ~0,4 s |
| Set ortası, üye | paralel blok + `bankSoloRound` | **~0,8 s** |
| **Setin 10. sorusu, üye** | + `refreshBadges` (3 tur) + `badgesEarnedDuringSet` | **~2,4 s** |

Yani set özeti açılırken ~2,4 saniyelik bir duvar var. Kodda bunun farkında
olan bir yorum da var (`scoring.ts:337`) ve set ortası için `after()` ile
erteleme yapılmış — doğru karar; eksik olan setin son turunda aynı ertelemenin
yapılamaması, çünkü özet rozetleri hemen anons ediyor.

### 1.6 Hiçbir yerde önbellek yok

Oynanabilir ve okunabilir her rota `export const dynamic = "force-dynamic"`
(11 dosya). `unstable_cache`, `revalidate`, `cache()` hiç kullanılmamış. Yani:

- Liderlik tablosu her görüntülemede baştan hesaplanıyor.
- Günün daily soruları her görüntülemede yeniden okunuyor.
- `badge` tablosu (sabit referans verisi) her rozet hesabında yeniden çekiliyor.
- `event_category` eşlemesi her `screen`/`when-born` dağıtımında yeniden
  çekiliyor.

`force-dynamic`'in gerekçesi yerinde (dil çerezden okunuyor, çekilişler
rastgele), ama bu **veri** önbelleğini engellemez; engellediği **sayfa**
önbelleği. İçerik okumaları hâlâ `cache()`/`unstable_cache` ile
sarılabilir.

---

## 2. Bayt: görseller

### 2.1 Sayfa ağırlıkları

Önbellek temiz, 1680×844 dpr 2, prodüksiyon build:

| Sayfa | Toplam | İstek | FCP | LCP | Açık oturumda LCP |
| --- | --- | --- | --- | --- | --- |
| `/` | **7747 KB** | **62** | 664 ms | 1112 ms | 1412 ms |
| `/compare` | **5095 KB** | 32 | 200 ms | 824 ms | 2164 ms |
| `/daily` | 3831 KB | 28 | 1300 ms | 1712 ms | — |
| `/guess` | 3661 KB | 32 | 668 ms | 2212 ms | 2168 ms |
| `/versus` | 3237 KB | 29 | 484 ms | 884 ms | — |
| `/when-born` | 2535 KB | 29 | 92 ms | 2840 ms | 2048 ms |
| `/screen` | 1181 KB | 29 | 56 ms | 1204 ms | — |
| `/achievements` | 752 KB | 28 | — | — | **4168 ms** |
| `/leaderboard` | 518 KB | 27 | 896 ms | 896 ms | — |

### 2.2 En büyük tek kalem: zaman çizelgesi fonları

| Dosya | Boyut | Çözünürlük | Göründüğü sayfalar |
| --- | --- | --- | --- |
| `date-guessing-game/game-backgrounds-001-2560.jpg` | **1399 KB** | 2560×1706 | `/guess`, `/when-born`, `/daily`, `/versus` |
| `date-guessing-game/game-backgrounds-002-2560.jpg` | **1067 KB** | 2560×1706 | `/guess`, `/daily`, `/versus` |
| `comparison-game/cosmos-2560.jpg` | **1059 KB** | 2560 | `/compare` |

`timelineBackdropUrl()` `src` olarak **en geniş** varyantı veriyor
(`lib/storage/images.ts:252,280`) ve `srcset` 1440/2560 ile `sizes="100vw"`
çalışıyor. Retina bir ekranda tarayıcı **her zaman** 2560'ı seçer. Yani
neredeyse her oyun sayfası, sadece dekoratif bir fon için **1,4 MB** indiriyor.

`/versus` lobisi ikisini birden indiriyor: **2,4 MB**, üstelik orada henüz
oynanan bir zaman çizelgesi yok.

Bu üç dosyanın WebP q80 karşılığı ölçüldü: 717 KB, 342 KB, 385 KB. q72'de
548 KB, 245 KB, 297 KB. Yani **3,5 MB → 1,1 MB**, gözle görülür kayıp olmadan.
(Not: bu bir **format** değişikliği, yeniden boyutlandırma değil — fonların
çözünürlüğü aynı kalır. `tempus-never-resample-backdrops` kuralına aykırı
değil.)

### 2.3 Format: ölçülen kazanç

Sitenin gerçekten servis ettiği dosyalar yeniden kodlandı:

| Dosya | Şu an | WebP q80 | WebP q72 | AVIF q50 | Kazanç |
| --- | --- | --- | --- | --- | --- |
| `game-backgrounds-001-2560.jpg` | 1399 KB | 717 KB | 548 KB | 372 KB | %73 |
| `game-backgrounds-002-2560.jpg` | 1067 KB | 342 KB | 245 KB | 259 KB | %76 |
| `cosmos-2560.jpg` | 1059 KB | 385 KB | 297 KB | 288 KB | %73 |
| `homepage/pattern-1600.jpg` | 606 KB | 346 KB | 288 KB | 177 KB | %71 |
| `homepage/survival-stage-1600.jpg` | 444 KB | 130 KB | 111 KB | 65 KB | **%85** |
| `homepage/versus-card.jpg` | 183 KB | 58 KB | 49 KB | 32 KB | %83 |
| `homepage/screen-card.jpg` | 115 KB | 59 KB | 48 KB | 30 KB | %74 |
| `ce/beginning-of-the-council-of-trent-1600.jpg` | 955 KB | 559 KB | 477 KB | 253 KB | %74 |
| `ce/japanese-invasion-of-manchuria-1600.jpg` | 575 KB | 237 KB | 172 KB | 118 KB | %80 |
| `film-dizi/titanic-1600.jpg` | 524 KB | 216 KB | 165 KB | 115 KB | %78 |
| `when-born/john-lennon-1600.jpg` | 383 KB | 118 KB | 89 KB | 72 KB | %81 |
| **Örneklem toplamı** | **7,14 MB** | **3,09 MB (−%57)** | — | **1,74 MB (−%76)** | |

Veritabanındaki dağılım bunu doğruluyor — aynı sitede üç format yan yana
duruyor ve aradaki fark bu:

| Format | Adet | Ortalama boyut |
| --- | --- | --- |
| `image/jpeg` | 588 | **342 KB** |
| `image/avif` | 36 | 217 KB |
| `image/webp` | 101 | **182 KB** |

734 primary görselin toplamı **225 MB**. WebP q80 ile ~97 MB, AVIF ile ~54 MB
olurdu.

### 2.4 Boyut aşımı: 160 görsel 1600 px tavanını geçiyor

`images:shrink`'in tavanı 1600 px, ama `is_primary` satırların 160'ı bunu aşıyor:

| Önek | 1600'ü aşan | En geniş |
| --- | --- | --- |
| `ce/` | 89 | **3840×2560** |
| `basketball/` | 27 | 3840×2560 |
| `when-born/` | 17 | 1824×2671 |
| `film-dizi/` | 14 | 2000×3000 |
| `bce/` | 13 | 3840×1920 |

Ayrıca anahtarında `-NNNN` eki olmayan (yani hiç küçültülmemiş) **531** primary
satır var: `ce/` 215, `film-dizi/` 97, `bce/` 80, `when-born/` 70,
`basketball/` 69. Bunların en büyüğü 752 KB — yani tavan ihlali korkunç değil,
ama `images:shrink` tüm önekler üzerinde eksiksiz koşmamış.

İyi haber: **non-primary yetim satır yok** (0 adet), yani `attach`/`shrink`
sırası bu an itibarıyla bozulmamış.

### 2.5 Ana sayfa: 3,1 MB'ı en yüksek öncelikle ön yüklüyor

Ana sayfa HTML'i **9 adet `<link rel="preload" as="image">`** yayıyor ve bunlar
**3149 KB**. React 19, SSR'de gördüğü `<img>`'leri otomatik olarak preload'a
yükseltiyor — ve sitede `loading="lazy"` yalnızca **tek** yerde kullanılmış
(`components/leaderboard-boards.tsx:233`). Yani ana sayfadaki 20 görselin hepsi
istekli (eager) yükleniyor, React de ilk görülenleri yüksek öncelikli preload
yapıyor.

Ön yüklenenler arasında ekranın altında kalan veya henüz açılmamış bir sahneye
ait olanlar var:

```
607 KB  homepage/pattern-1600.jpg                 ← dekoratif doku
483 KB  date-guessing-game/game-backgrounds-001-1440.jpg
444 KB  homepage/survival-stage-1600.jpg          ← explorer sahnesi
387 KB  homepage/comparison-game-cover-1-1600.jpg
213 KB  homepage/date-guessing-game-cover-2-1600.jpg
 68 KB  badges/gold.webp
```

Bunlar LCP öğesiyle ve sayfanın JS'iyle aynı bant genişliği için yarışıyor.
Ekran altındaki `<img>`'lere `loading="lazy"` eklemek React'in preload'ını da
kapatır; kritik yoldan ~2 MB düşer.

Ölçümde küçük JS parçalarının (1–5 KB) 875–900 ms sürdüğü görüldü — bu, 40+
isteğin localhost'ta HTTP/1.1'in 6 bağlantı sınırına sıkışmasından. Prodüksiyonda
görseller CDN'den (ayrı origin, HTTP/2) geleceği için bu tam olarak böyle
yaşanmaz; yine de isteklerin preload ile öne çekilmesi JS'i geciktiriyor.

### 2.6 3,7 MB'lık madeni para

`3d-models/tetradrachme_uit_macedonia-v1.glb` — **3802 KB**, ana sayfanın tek
en büyük indirmesi. Artı `three` modülü. `components/explorer-coin.tsx` bunu
doğru yapmış: dinamik `import()`, ve ya blok görüş alanına girince ya da
`load` sonrası ilk boşlukta başlıyor — yani kritik yolda değil, LCP'yi
etkilemiyor.

Ama kapısız: her ziyaretçi, mobil veri dahil, 3,8 MB ödüyor. `kalanlar.md`'de
9. madde olarak zaten duruyor. (Teşhis olarak: ölçümde 820 ms sürdü ve sayfanın
toplam 7,7 MB'ının yarısı bu tek dosya.)

### 2.7 Küçük ama her sayfada olanlar

| Dosya | Boyut | Not |
| --- | --- | --- |
| `app/icon.svg` | **68 KB** | Favicon. **Her** sayfada iniyor. |
| `public/logo.svg` | 68 KB | |
| `public/logo-mark.svg` | 68 KB | |

Üçü de base64 raster içermiyor — sadece 1–2 `<path>`, ama koordinatlar absürt
hassasiyette (`127.96350000000001`, `-367.9635`). Koordinat yuvarlama + yol
sadeleştirme bunları birkaç KB'ye indirir. 68 KB'lik bir favicon, sayfadaki
bazı fotoğraflardan büyük.

Rozet görselleri 48–76 KB arası (`diamond.webp` 76 KB, `gold.webp` 68 KB);
`/achievements` ve `/leaderboard` bunların birkaçını birden yüklüyor.

Fontlar: Inter variable, `latin` + `latin-ext` → iki woff2, 84 KB + 48 KB =
**132 KB**, her sayfada preload. Beş dil için `latin-ext` gerçekten gerekli
(CLAUDE.md'de gerekçesi yazılı); bu kalem makul, dokunulmasın.

---

## 3. Head-to-head: kalp atışı

`PUBLIC_TICK_MS = 1500` (±400 ms jitter). Çevrim içi maç boyunca istemci her
~1,5 saniyede `POST /api/versus/tick` atıyor, o da `versus_reconcile()`
çağırıyor — yani **her atış ~400 ms sunucu süresi**. Bot hamleleri bu atışla
işlendiği için bir botun tahmininin ekranda görünmesi en iyi hâlde
1,5 s + 400 ms gecikiyor.

Bu tasarım bilinçli (CLAUDE.md: "bir bot, tarayıcısı olmayan bir koltuktur";
worker/cron yok) ve rota middleware dışında tutulmuş — doğru. Rapora girmesinin
nedeni yük: iki oyunculu bir maçta dakikada ~80 reconcile turu demek. Ölçek
büyüdüğünde ilk sıkışacak yer burası.

---

## 4. Öncelik sırası

Etkisi ölçülmüş olanlar önce; her maddenin yanında beklenen kazanç ve nereye
dokunulacağı var.

### Çok yüksek etki

1. **Middleware'deki `auth.getUser()`'ı ağ çağrısından çıkar.**
   Ya tamamen kaldır (CLAUDE.md'nin kendi ifadesiyle matcher "sınır değil,
   optimizasyon"; `requireAccount()` zaten her korumalı sayfada yeniden
   kontrol ediyor), ya da JWT'yi yerel doğrulamaya geçir.
   → **Her istekte −400 ms**, `/api/deal` dahil.

2. **`getCurrentUser()`'ı `cache()` ile sar** (`lib/auth/server.ts:18`).
   → Render başına tekrarlanan auth turlarını siler, **−400 ms**.

3. **Profil okumasını auth turuna seri bağlamaktan çıkar.**
   `user.id` çerezdeki JWT'nin içinde; yerel okunursa `readProfileChrome()`
   0. ms'de başlar. Alternatif: menünün hesap bilgisini `<Suspense>` ile
   ertele, sayfa kabuğu beklemeden aksın.
   → **−400 ms**, ve sayfa kabuğu anında görünür.

   1+2+3 birlikte: oturum açık her sayfada **1,2 s → ~0,4 s**.

4. **Görselleri WebP'ye (veya AVIF'e) çevir.**
   Ölçülen: WebP q80 ile **−%57**, AVIF q50 ile **−%76**. Zaten sitede 101
   WebP var ve ortalamaları JPEG'lerin yarısı. Tek seferlik bir dönüştürme
   işi; `scripts/shrink-event-images.ts` buna en yakın yer.
   → `/compare` 5,1 MB → ~2,2 MB; `/guess` 3,7 MB → ~1,6 MB.

5. **Fonları yeniden kodla** (format, boyut değil).
   3,5 MB → 1,1 MB. `/versus` lobisinin iki fonu birden indirmesine de bak —
   orada zaman çizelgesi yok.

### Yüksek etki

6. **Ekran altı görsellere `loading="lazy"`.** React'in otomatik preload'ını da
   kapatır. Ana sayfanın kritik yolundan ~2 MB.

7. **`/account` ve `/achievements`'ı düzelt.** 10 ve 9 tur.
   - İki `profile` sorgusunu (`chrome` + `avatar_key`) tek sorguda oku: −400 ms.
   - `refreshBadges()`'ı sayfa açılışının kritik yolundan çıkar (`after()`
     ile ertele, veya rozetleri yalnızca TP değiştiyse yeniden hesapla).
     → 3 tur, **−1,2 s**.

8. **`screen` ve `when-born` dağıtımlarını tek tura indir.**
   `eventCategorySlugs()` ikinci turu; kategorileri olay sorgusuna kat veya
   süreç içinde önbellekle (kategoriler değişmiyor).
   → **−400 ms**, bu iki oyunda her tur yenilemesinde.

9. **Sabit veriyi önbellekle.** `badge` tablosu, `event_category` eşlemesi,
   dil sözlüğü, günün daily soruları, liderlik tablosu (1–5 dk `revalidate`).
   `force-dynamic` sayfa önbelleğini kapatır ama veri önbelleğini kapatmaz.

10. **Setin son turundaki rozet hesabını özetten ayır.** Set özeti ~2,4 s
    bekliyor. Özeti hemen aç, rozet anonsunu geldiğinde göster.

### Orta / düşük

11. `app/icon.svg`, `logo.svg`, `logo-mark.svg`: koordinat yuvarlama →
    68 KB × 3 yerine birkaç KB. Favicon her sayfada iniyor.
12. `/leaderboard`: `leaderboard` ve `leaderboard_position` ikişer kez
    çağrılıyor; `await getCurrentUser()` paralel bloğun önünde seri duruyor.
13. `images:shrink`'i tüm önekler üzerinde eksiksiz koştur: 160 primary görsel
    hâlâ 1600 px'i aşıyor (en geniş 3840×2560).
14. GLB'ye kapı: `navigator.connection.saveData` / yavaş bağlantı kontrolü
    (`kalanlar.md` madde 9). 3,8 MB.
15. Rozet görsellerini (48–76 KB × 7) küçült.

### Mimari — ayrı bir karar

16. **Uygulama sunucusunu veritabanına yakın bir bölgede koştur.**
    Bu madde veritabanının bölgesiyle ilgili *değil* — DB yerinde kalır.
    Söz konusu olan Next sunucusunun nerede çalıştığı. Şu anda her tur
    ~400 ms; uygulama ap-southeast-2'de koşarsa aynı tur ~5 ms'ye düşer ve
    yukarıdaki bütün zincirler kendiliğinden çöker. Vercel'de bu, fonksiyon
    bölgesini `syd1` yapmak demek. Karşılığında oyuncuya en yakın edge'den
    uzaklaşılır — yani HTML'in ilk baytı biraz gecikir, ama arkasındaki 3–10
    tur neredeyse bedava olur. Mevcut sayılarla bu takas fazlasıyla kârlı:
    `/account` 3,3 s yerine ~0,5 s olur.

---

## Ek: ölçüm artıkları

İnceleme için üretilen her şey `/tmp` altındaki geçici dizinde kaldı ve
temizlendi; **repoda hiçbir değişiklik yapılmadı**. Dev sunucun (port 3000) hiç
durdurulmadı. Ölçüm için kullanılan geçici kopyada iki yama vardı — dev
proxy'sinin prodüksiyon kapısı ve bir `instrumentation.ts` — ikisi de o
kopyaya özeldi, bu repoda yok.
