# TEMPUS İnceleme — Aşama 1: Sistem Haritası

Bu belge, dört eksenli incelemenin (UI, işleyiş/mantık, rozet-ödeme, serbest
öneriler) ilk aşamasının çıktısıdır: **sitenin bugün nasıl çalıştığının**
koddan okunmuş, satır referanslı özeti. İkinci bölümde, okuma sırasında göze
çarpan ve **henüz doğrulanmamış** şüpheli noktalar listelenir; bunlar mantık
incelemesinde teker teker ele alınacaktır. Hiçbir kod değiştirilmedi.

Kaynak: 12 alt sistem okuması (puanlama, /guess, /compare+survival, versus,
daily, konu modları, hesap+rozet, ana sayfa+chrome+i18n, veri katmanı, stil
sistemi, commit edilmemiş değişiklikler, veri setleri) + canlı siteye kısa bir
mobil/masaüstü bakış.

---

## 1. Tek cümlelik mimari

Next.js 15 sunucu bileşenleri her oyun sayfasında iki tur dağıtır
(`app/actions/rounds.ts` → `randomEvents()` → Supabase), istemci bileşeni
kuyruğu 3'e tamamlar, oyuncu tahmin eder, **puanlama solo oyunlarda
tarayıcıda**, daily ve versus'ta **sunucuda/Postgres'te** yapılır; solo
oyunlardan hiçbir şey kaydedilmez.

---

## 2. Puanlama ve set mantığı (`lib/game/`)

### 2.1 `gradeGuess()` — tek puanlama noktası (`lib/game/scoring.ts`)

```
mesafe   = |tahmin − gerçek|
derinlik = max(1, |2026 − gerçek|)          # PRESENT_YEAR = 2026
tolerans = max(bant.tabanYıl, bant.oran × derinlik)
ilk tutan bant kazanır: perfect → great → good → bad → (hiçbiri) wayOff
```

| Bant set | great | good | bad | Not |
|---|---|---|---|---|
| Genel `BANDS` | %5 / 8 yıl | %20 / 35 yıl | %85 / 100 yıl | /guess, /compare, daily, versus-tarih |
| `FOOTBALL_BANDS` | ±3 | ±8 | ±25 | düz yıl, oran 0 |
| `BASKETBALL_BANDS` | ±2 | ±7 | ±20 | |
| `SCREEN_BANDS` | ±2 | ±6 | ±15 | |
| `WHEN_BORN_BANDS` | %2,5 / 12 | %10 / 30 | %20 / 75 | derinlik tabanlı |

`perfect` her sette **yalnızca tam yıl**. Örnekler (genel): 1900→1950 tahmini
= bad (40 puan); MÖ 99.000→MÖ 89.000 = good (62 puan); 2020→2019 = great (88).
`prompt_unutma.txt`'deki niyetin (göreli hata) birebir uygulaması; ancak oradaki
"MÖ 110.000'de 10.000 yıl sapma çok başarılı" örneği bugünkü eşiklerle
**good** çıkıyor, **great** değil (modül başlığı hâlâ great diyor).

### 2.2 `roundPoints()` — 0–100 puan

`POINT_BOUNDS = [100, 90, 70, 45, 20, 0]`: perfect 100; great (70–90];
good (45–70]; bad (20–45]; wayOff 0–20 (hiperbolik azalma, cevap vermek
her zaman 0'dan iyi). 91–99 arası bilerek erişilemez. **Sadece versus ve
daily kullanır**; solo oyunlar puan değil isabet sayar.

### 2.3 Set (`lib/game/set.ts`)

- `QUESTIONS_PER_SET = 10`; her soru `{hit, verdict}`.
- **Isabet = wayOff dışındaki her şey** (`bad` bile isabet). Bu kural üç yerde
  elle tekrar yazılmış (set.ts, daily.ts, actions/daily.ts).
- Derece: flawless (10/10) / strong (≥%70) / fair (≥%40) / rough.
- Paylaşım metni: Wordle tarzı 🟦🟩🟨🟧🟥 kareler.
- Set sadece bileşen state'inde; sekme kapanınca yok olur.

### 2.4 Tur kuyruğu

Sunucu 2 tur dağıtır (`ROUND_QUEUE_DEPTH`), istemci 3'e tamamlar
(`ROUND_QUEUE_TARGET`), sunucu çağrısı başına en çok 4 (`MAX_DRAW`), son 64
olay "tercihen hariç" (`EXCLUDED_EVENT_LIMIT`; filtre değil tercih — havuz
bitince tekrar eder). `randomEvents` kronolojik döner, **dağıtan karıştırmak
zorunda**. "İleri" düğmesi hiç `disabled` olmaz; tur yoksa basış kilitlenir
(`pendingNext`) ve tur gelince oynatılır. Bu kuyruk makinesi **dört bileşene
kopyalanmış**: timeline-game, comparison-game, screen-game, when-born-game.

---

## 3. Oyun modları

### 3.1 `/guess` (+ `/football`, `/basketball` aynı bileşen)

- Dört pano (cosmos, evolution, civilization, ce) — soldaki ikisi logaritmik;
  sürükleme panonun ızgarasına oturur (cosmos 100 yıl, evolution 10, diğerleri 1).
- Sürükle / ok tuşları / dönem kapıları / **≥768px'te klavyeyle yıl yazma**
  (`useKeyboardEntry`; telefonda yazma yok — commit edilmemiş değişiklik).
- Kilitle → 700 ms bekle → kamera cevabın panosuna uçar → cevap işareti +
  renkli mesafe çubuğu. Sonuç ≥1120px'te kartın yanında iki panel
  (sonuç bileti + "Bu olay hakkında" Lorem Ipsum + "Yanlış tarih bildir"),
  altında fotoğrafın üstüne binen overlay.
- **Cevap (yıl) sayfa yüklenirken tarayıcıya gider**; puanlama istemcide
  (`timeline-game.tsx:503`). Bugün zararsız (kayıt yok); skor/rozet gelince
  güvenilemez — versus'un `MaskedEvent` + sunucu puanlama kalıbı hazır.
- Tek DB yazımı: "Yanlış tarih bildir" → `event_date_challenge` (servis
  rolü, kimliksiz, sınırsız).
- Tek-ekran bütçesi: sayfa `100dvh − --site-bar-h`, `overflow-y-auto`
  emniyet supabı; sabit parçalar ~452px, bar 58px → **~510px'ten kısa
  ekranlarda (yatay telefon) kaydırır**. Yatay/`max-height` dalı yok.

### 3.2 `/compare` + `/survival` (aynı bileşen, `mode` farkı)

- 3 olay: en eski sol, en yeni sağ, ortadaki yüzen kart. Tüm tarihler
  kilitlenene dek "???". Ray 6 bölme; 0–2 sol, 3–5 sağ. Doğruluk = hedef yıl
  hangi çapaya daha yakın (eşitlikte ikisi de doğru).
- Derece: doğru yarıda 0/1/2 bölme uzak → perfect/great/good; yanlış yarıda
  ≤1 → bad, değilse wayOff.
- **Set modu derece kaydetmez** (`verdict: null`, yalnız doğru/yanlış) —
  survival aynı turu dereceyle kaydeder; iki modun özet/paylaşım grafiği farklı.
- Survival: can yok, zorluk artışı yok, süre yok; ilk yanlış yarıda biter.
  Dereceler: 40+ legendary, 20+ deep, 8+ solid.
- Yükseklik bütçesi `--compare-chrome = 20.75rem` (332px) elle tutulan
  toplam; kart genişliği viewport yüksekliğinden çözülür (132–360px),
  telefonda `50vw − 30px` tavanı.
- Havuz: genel havuz, yıl ≥ −9999, aynı yıl iki olay olmaz.
- Hiçbir şey kaydedilmez (en iyi seri dahil).

### 3.3 `/daily`

- Gün anahtarı = **sunucu UTC tarihi** (İstanbul 03:00'te sıfırlanır).
- Günde **iki ayrı 10'luk set**: `member` ve `guest` (misafir cevapları görüp
  üye olup tekrar oynayamasın diye). Genel havuzdan 20 olay çekilir,
  karıştırılır, 10/10 bölünür; ilk ziyaretçi dağıtımı yapar
  (`daily_ensure_challenges`, yarışta kaybeden atılır).
- İstemciye yalnız `MaskedEvent` (yıl yok). Her tahmin `submitDailyGuess` ile
  sunucuda puanlanır; üyeye `roundPoints × 3` (günlük azami 3000),
  misafire 0. Postgres `daily_record_answer` sıralı yazımı zorlar
  (`select … for update`), `completed_at` sonrası yazım reddedilir.
- Üye: başka cihazdan devam eder / tekrar oynayamaz. Misafir: deneme
  `localStorage`'da, kolayca sıfırlanır (bilerek kabul edilmiş).
- **Günler arası hiçbir şey okunmaz**: seri yok, geçmiş yok, liderlik
  tablosu `daily_attempt`'i okumuyor, rozet çağrısı yok.
- `/guess`'ten farkları: klavyeyle yıl girişi yok, masthead pili yok,
  özet ekranında geri sayım bir kez hesaplanır ve ilerlemez.

### 3.4 Konu modları

| Mod | Bileşen | Veri | Ray | Fark |
|---|---|---|---|---|
| `/football` | TimelineGame | 97 | 1850–2026 | `railHeading=false`, pil başlık |
| `/basketball` | TimelineGame | 105 | 1875–2026 | versus'ta "yakında" |
| `/screen` | ScreenGame (2:3 poster) | 200 | 1900–2026 | Film/Dizi pili; dizi = ilk yayın yılı |
| `/when-born` | WhenBornGame (3 ray) | 150 | MÖ 1500–2026 | 14 meslek pili; derinlik bantları |

- Havuz kuralı: `kind='topic'` kategorisi olan olay yalnızca o modda; genel
  oyunlar topic bağı olmayanları çeker (`poolRestriction`).
- Oynanabilir havuz = **görseli olan** alt küme; koddaki sayılar
  (66 futbol, 138 doğum…) dosya sayıları, DB'den doğrulanmalı.
- `is_sensitive` hiçbir çekilişten dışlamıyor; sadece bulanıklaştırma kapısı
  (`EventVisual`), tek işaretli olay `rwandan-genocide`.
- Poster/portre çerçevesi yalnız ≥1120px'te 2:3; altında serbest kırpılıyor.

### 3.5 `/versus` (1v1)

- **Postgres hakem**: `lobby → playing → revealed → playing … → complete`
  geçişleri plpgsql'de `for update` altında; `versus_reconcile()` neredeyse
  her giriş noktasında süresi geçen pencereleri uygular. 20 sn tur, 6 sn
  reveal, 10 tur, 3 mod (tarih, futbol, film-dizi).
- Koltuk = `sessionStorage`'da 32 baytlık taşıyıcı jeton (DB'de sha256).
  Sekme kapanınca koltuk yok; linki tekrar açan "dolu" görür. "Maçtan ayrıl"
  (`leaveVersusMatch`) UI'da bağlı değil; `abandoned` pratikte erişilemez.
- İstemci yalnız `public.match` satırını okur (Realtime); sorular
  `MaskedEvent` olarak iki tur önceden gelir. Kazanan = toplam puan; eşitlik
  berabere.
- Sonuç **hesaba yazılmaz**; `match_player`'da `user_id` yok.
  `versus_sweep()` tanımlı ama **hiç çağrılmıyor** (satırlar birikir).
- Davet kodu: 28 harflik alfabe, 6 karakter; QR elde yazılmış kodlayıcı.

---

## 4. Hesaplar, rozetler, liderlik

- Supabase Auth (e-posta/şifre + Google). Tek tablo `profile` (username).
  Tüm yazımlar Server Action (`app/actions/auth.ts`); hata kodları sözlükten.
- Korunan yollar yalnız `/account` ve `/achievements`.
- **Olmayan akışlar**: şifremi unuttum/sıfırlama, e-posta değiştirme, hesap
  silme. E-postası doğrulanmamış kullanıcıya "şifre yanlış" mesajı gidiyor.
- Rozetler: bronze/silver/gold/diamond (sıralı) + ruby/amethyst (bağımsız).
  Sözlükteki kurallar: Bronz "bir set bitir", Gümüş 6/10, Altın 8/10, Elmas
  10/10, Yakut "10 düello kazan", Ametist "her dönemde bir perfect".
- `user_badge_progress` tablosu var, `writeBadgeProgress()` var, **çağıran
  yok**. Bugün hiçbir kod yolu rozet vermiyor; taze hesap 6 kartı %0 ve
  kapalı düğmelerle görür, "henüz sayılmıyor" açıklaması
  (`achievementsNotLive`) sözlükte var ama **render edilmiyor**.
- Ana sayfadaki "Gold · 8 of 10": herkese gösterilen sabit önizleme, hesap
  durumu değil.
- Liderlik tablosu: 10 sabit örnek satır; şekli (set başına isabet) sitenin
  kaydettiği tek skorla (daily puanı) uyuşmuyor. RLS, başkasının kullanıcı
  adını okumayı engelliyor — gerçek tablo için view/servis rolü gerekir.
- **Skor defteri eklemek için dokunulacak yerler** (hesap haritasından):
  yeni migrasyon (hesap başına sonuç tablosu + security-definer kaydedici,
  `daily_record_answer` örnek), `database.types.ts` el düzenlemesi, `lib/db/`
  modülü, Server Action (+ güvenilir skor için sunucu puanlama ve maskeli
  tur), rozet kural modülü (`writeBadgeProgress`'in ilk çağıranı), yakut için
  koltuk→hesap bağı, liderlik sorgusu.

---

## 5. Ana sayfa, chrome, i18n

- Ana sayfa sıfır DB okuması yapar; tüm sayılar sabit metin: "1000+ olay,
  her biri fotoğraflı", SSS "1.000'den fazla", bento "500 olay daha".
  Gerçek: 497 genel olayın 236'sı görselsiz → gizli (~261 görünür);
  tüm havuzlar ~1049 satır, görselli olan belirsiz.
- Explorer: 3,9 MB GLB + three.js **her ziyaretçiye** boşta iner
  (mobil veri / saveData kapısı yok).
- Bento'daki dört kart `<button>` ama hiçbir şey yapmıyor.
- Menü düğmesi ana sayfa dışında `fixed`; bar gizlenince telefonda sayfa
  içeriğinin sağ üstünü örtüyor — sadece leaderboard `pr-12` ile kaçıyor.
- Dil: yalnız çerez (`tempus_locale`), varsayılan **en**; Accept-Language
  yok, URL'de dil yok, hreflang yok → Türk ziyaretçi ilk ekranı İngilizce
  görür, arama motoru dört dili görmez.
- Beş sözlük 365'er anahtar, eksik yok; 10 anahtar ölü (kullanılmıyor).
- İletişim e-postası `hello@tempusgame.com` sahip olunmayan bir alan adında,
  canlı `mailto:` olarak basılıyor; mobilde kelime ortasından kırılıyor.

---

## 6. Veri katmanı, güvenlik, görseller

- Şema sağlam: her yeni tabloda varsayılan grant'lar geri alınıp RLS açılmış;
  içerik anon'a salt okunur (published); tüm `versus_*`/`daily_*` fonksiyonları
  anon'a kapalı; `match` tek Realtime tablosu.
- İstisnalar: `match` select politikası `using (true)` (kodlar listelenebilir);
  `event_date_challenge` kimliksiz ve sınırsız yazılabilir (tek anon yazım
  yolu).
- `randomEvents` her çekilişte **tüm** id'leri, **tüm** birincil görselleri ve
  tüm topic bağlarını indirir (3–4 istek), sonra 2–4 olay seçer. `.limit()`
  yok → Supabase'in varsayılan **1000 satır tavanı** aşıldıysa kuyruk sessizce
  kesilir (toplam ~1049 satır; DB'den doğrulanmalı).
- Görseller: `<era>/<slug>.<ext>`; dev'de `/api/r2` proxy'si, prod'da proxy
  404 döner → Vercel'de `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` mutlak olmalı,
  hiçbir şey bunu doğrulamıyor. R2 nesneleri `immutable, 1 yıl` ile
  yükleniyor ama anahtarlarda hash yok (aynı anahtara yeniden yükleme CDN'de
  bayat kalır).
- Arka planlar yalnız 1440/2560 genişlik; 375px telefon da 1440'ı indirir.
- `PRESENT_YEAR = 2026` TS'te ve IMMUTABLE SQL fonksiyonunda sabit; 2027'de
  çift taraflı güncelleme gerekir.
- `next.config.ts`'de güvenlik başlığı yok; `images.remotePatterns` ölü
  (next/image kullanılmıyor).
- Middleware her istekte `auth.getUser()` (ağ) çağırıyor, layout aynı istekte
  tekrar ediyor.

---

## 7. Stil sistemi

- Tek dosya `app/globals.css` (1865 satır), Tailwind v4 `@theme`.
  Palet: saf siyah + 4 gri (kontrast oranıyla çözülmüş) + mavi/yeşil/kırmızı
  + 5 kademeli tier merdiveni; Inter tek font.
- CSS'te genişlik kırılımı yalnız `max-width: 639px` ve `min-width: 768px`;
  yükseklik kırılımı yalnız sign-in kartında. **Oyun ekranlarının hiçbirinde
  `max-height` / `orientation` kuralı yok.**
- 23 keyframe'in hepsi `prefers-reduced-motion`'a saygılı; sonsuz hareket
  durur. Ölü CSS sınıfı yok.
- İki kırılım sistemi farklı birimde (639px vs `sm` = 40rem): büyük
  tarayıcı fontunda ayrışır.
- `touch-action: none` hem karşılaştırma kartlarında hem rayda: sayfa
  kaydırmak zorunda kalırsa dokunarak kaydırılamaz.

---

## 8. Commit edilmemiş çalışma (27 dosya, +1485/−572)

Tutarlı bir mobil/UX geçişi; **bitmiş görünüyor**, `npm run typecheck`
temiz, beş dilde anahtarlar tam:
1. `RoundHead` masthead pili ayrı modüle çıkarıldı, dokunmatikte basarak
   açılır; futbol/basketbol da kullanıyor.
2. Klavyeyle yıl girişi masaüstüne (≥768px) sınırlandı.
3. `future` panosu kaldırıldı (SQL era kuralı ve `future/` klasörü duruyor).
4. Ray cilası: kapılar hep görünür 34px ok, baloncuk kenarda kırpılmıyor.
5. Dört özet paneli artık içte kaydırmıyor, sayfa kaydırıyor; "Ana sayfa"
   düğmesi eklendi (bu, CLAUDE.md'deki "asla kaydırmaz" kuralıyla çelişir —
   karar gerekir).
6. Ana sayfa: olay sayısı DB'den okunmak yerine sabit "1000+".
7. SSS 6→8 soru; kullanıcı adı doğrulaması 4 ayrı hataya bölündü.
- `scripts/tmp-*.ts` ve `tmp-exclude-check.ts` salt okunur teşhis;
  **silinebilir** (yalnız `tmp-run.ts`'teki pooler host bilgisi
  `scripts/db.ts`'e taşınmaya değer). `.claude/` gitignore'da değil.
- `CARD_BOX_WIDE` (26rem + 194px) kompakt raylı futbol/basketbol için artık
  yanlış ölçü; masaüstünde yazma modunda düğme zıplayabilir.

---

## 9. Veri setleri

- Ana set 500 satır (135 BCE / 365 CE), 477 yıl + 23 yüzyıl hassasiyeti;
  açıklama 320/500. **`npm run events:check` varsayılan yolla çöküyor**
  (`data/events.txt` yok); `db:seed:events` de aynı yanlış varsayılan.
- Üç birebir kopya satır (380, 387, 449) hâlâ dosyada; slugger sessizce
  `-2` ekliyor (kuralı "rapor et, tahmin etme" iken).
- **when-born.json'da 15 MÖ doğum yılı bir yıl kayık**: dosya "551 BC" için
  −551 yazıyor, ayrıştırıcı dönüştürmeden astronomik sayıyor (−551 = MÖ 552).
  Konfüçyüs için tam yıl "perfect" imkânsız. Canlı DB'de de böyleyse veri
  düzeltmesi + yeniden seed gerekir.
- Yüzyıl olayları orta noktada "yıl" gibi puanlanıyor (İskenderiye
  Kütüphanesi → MÖ 250); derin zaman olayları "year" hassasiyetiyle;
  ~108 süreç adı ("…'nın başlangıcı") tek yıl.
- Spor sezonları tek yıla indirgenmiş, kural yok (73 galibiyet = 2016);
  dizilerde ilk yayın yılı (Doctor Who = 1963) — UI'da açıkça söylenmeli.
- Konu seed'leri açıklama yazıyor; ana set için `db:seed:descriptions` ayrı
  geçiş (çalıştırılıp çalıştırılmadığı DB'den anlaşılır).

---

## 10. Şüpheli noktalar — doğrulanacak liste

Aşağıdakiler okuma sırasında işaretlendi; **mantık incelemesinde kanıtla
doğrulanıp sınıflanacak**. Şimdilik "iddia" statüsünde.

### Yüksek
| # | Yer | İddia |
|---|---|---|
| H1 | `lib/db/matches.ts:142` | Versus turları kronolojik dağıtılıyor (shuffle yok) → her soru öncekinden sonra. |
| H2 | `lib/db/matches.ts:410` | `roundPoints(accuracy)` moda özel bant olmadan → futbol/film maçlarında puanlar dilim dışına taşar. |
| H3 | `app/actions/daily.ts:96` | UTC gece yarısını geçen daily oyunu ertesi günün cevap anahtarıyla puanlanır; üyeyi eski sorular/yeni anahtarla devam ettirir. |
| H4 | `lib/db/queries.ts:230` | `randomEvents` limitsiz; 1000 satır tavanı aşıldıysa havuzun kuyruğu sessizce yok. |
| H5 | `app/actions/rounds.ts:53` | Solo oyunlarda cevap istemcide; kalıcı skor/rozet/ödeme öncesi değişmeli. |
| H6 | `app/actions/auth.ts:158` | Şifre sıfırlama akışı yok → unutulan şifre = kaybedilen hesap. |
| H7 | `data/when-born.json` | MÖ doğum yılları bir yıl kayık. |
| H8 | `lib/i18n/dictionary.ts:215` | "1000+ olay, her biri fotoğraflı" iddiası veriyle çelişir. |
| H9 | `scripts/check-events.ts:10` | Belgelenen `events:check` komutu varsayılan yolla çöküyor. |

### Orta (seçme)
- `supabase/…versus_matches.sql:721` — `match` herkese `using (true)`; açık lobi kodları listelenebilir.
- `lib/db/matches.ts:451` — Rematch'i isteyen koltuk kontrol edilmiyor; herkes tek taraflı başlatabilir.
- `lib/game/versus.ts:269/285` — `MaskedEvent` açıklamayı (yıl içerebilir) ve `bce/`/`ce/` görsel yolunu sızdırır.
- `comparison-game.tsx:326` — Kart oynatılmadan "Lock in" sessizce "sağ" cevabı verir.
- `comparison-game.tsx:681` — 768–1000px'te yüzen düğme çapa kartlarına biner (Almanca en kötü).
- `app/globals.css:164` — `--compare-chrome` <768px'teki düğme satırını (~60px) saymıyor; kısa ekranlarda taşar.
- `timeline-game.tsx:909` — "Next round" kilitlenir kilitlenmez aynı noktada canlanır; çift dokunuş sonucu okumadan geçer.
- `timeline-stage.tsx:723` — Ray dokunma hedefi 6px; yorumda yazan 44px yok.
- `timeline-stage.tsx:1361` — Poster/portre <1120px'te 2:3 değil, keyfi kırpılır.
- `round-flank.tsx:623` — Kısa fotoğrafta genişleyen "yanlış tarih bildir" overlay'i fotoğrafı/sayacı örter.
- `app/actions/challenges.ts:35` — Kimliksiz, sınırsız tarih itirazı (tek anon yazım yolu).
- `lib/db/types.ts:90` — CC-BY görseller için ekranda atıf yok (lisans gereği).
- `app/actions/auth.ts:114` — Doğrulanmamış e-posta → "şifre yanlış" mesajı.
- `app/actions/auth.ts:272` — Google ön kontrolü HEAD 405 dönerse Google girişini kalıcı kapatır.
- `account-panel.tsx:127` — Hesap silme / e-posta değiştirme yok (ödeme gelince KVKK/GDPR gereği).
- `achievements/page.tsx:67` — "henüz sayılmıyor" metni var, basılmıyor; sayfa bozuk görünür.
- Yakut rozeti mevcut veriyle hesaplanamaz (koltukta `user_id` yok); Ametist "dönem" kelimesi iki farklı sözlüğe (4 pano vs 3 era) işaret eder ve tam-yıl perfect log panolarda neredeyse imkânsız.
- `apple-bento.tsx:82` — Dört ölü `<button>`.
- `explorer-coin.tsx:299` — 4–5 MB dekoratif indirme, kapısız.
- `site-menu.tsx:402` — Sabit menü düğmesi telefonda içeriğin üstüne biner (yalnız leaderboard kaçıyor).
- `lib/i18n/server.ts:19` — Dil yalnız çerez, varsayılan İngilizce, SEO yok.
- `app/api/r2/[...key]/route.ts:53` — Prod'da proxy 404; env mutlak URL değilse tüm görseller kaybolur, build geçer.
- `lib/storage/r2.ts:47` — `immutable` önbellek + hash'siz anahtar.
- `lib/i18n/dictionary.ts:244` — SSS puan/rozet/liderlik vadediyor; hiçbiri çalışmıyor; "online 1v1 geliştiriliyor" diyor, versus zaten online.
- `lib/i18n/dictionary.ts:394` — Daily kartı "günde bir olay" diyor; mod 10 soru.
- `timeline-game.tsx:604` — `CARD_BOX_WIDE` kompakt ray için yanlış.
- `parse-events.ts:309` — Slug çakışması sessizce `-2`; üç kopya satır.
- Kuyruk makinesi 4 kopya; `MISSED_VERDICT` 3 kopya; `REFILL_RETRY_MS` 4 kopya.

### Düşük (örnekler)
Ok tuşuyla ray sonunu aşma (`timeline-stage.tsx:650`); eşitlikte 3 bölme
uzak "good" (`rounds.ts:235`); "BC" vs "BCE" karışık İngilizce; `noEvents`
metni geliştirici dili; özet "See results" gereksiz yere yeni tur bekliyor;
daily geri sayımı donuk; `elapsed_ms` iki saatten çıkarılıyor ve hiç
gösterilmiyor; `versus_sweep` çağrılmıyor; dead export'lar (`requireUser`,
`yearDistance`, `listEvents`…); çerezde `secure` yok; `@types/three`
dependencies'te; dev seed'i uygulamanın kurallarını bozuyor; docs/
design-notes ve VERSUS checkpoint birçok yerde eskimiş.

---

## 11. Kod okumasıyla cevaplanamayan sorular (senden/DB'den)

1. Supabase projesinde PostgREST `max-rows` kaç? Yayınlanmış olay ve
   birincil görsel sayısı 1000'i geçti mi? (H4)
2. Her konu havuzunda **görseli olan** olay sayısı kaç? (tekrar riski)
3. `db:seed:descriptions` canlıya hiç çalıştırıldı mı? Futbol/film
   açıklamaları canlıda dolu mu? (versus sızıntısının canlı olup olmadığı)
4. when-born MÖ yılları canlı DB'de de kayık mı?
5. Vercel'de `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` ne? (prod görsel yolu)
6. E-posta doğrulama ve Google sağlayıcısı dashboard'da açık mı?
7. Daily'nin UTC sıfırlanması istenen davranış mı, İstanbul saati mi?
8. Ametist "dönem"i 4 pano mu 3 era mı? (Ödemeli rozet planında zaten
   yeniden tanımlanacak.)
9. "1000+" metni hedef mi, canlı sayıma mı dönsün?
10. Bento'daki dört kart neye dönüşecek (zaman çizelgesi, kütüphane…)?
11. Özet panellerinin sayfayı kaydırması kabul mü; CLAUDE.md kuralı
    "tur sırasında kaydırmaz" diye mi yeniden yazılsın?
12. Film-dizi posterleri hâlâ `UNCLEARED` lisanslı mı? (yayın engeli)

---

## 12. Sonraki aşamalar (henüz başlamadı)

- **Derin UI testi** — 320/375/430px, yatay telefon, 768/1024/1280/1680;
  ölçümlerle (taşma, dokunma hedefi, kırpma, tutarlılık).
- **İşleyiş/mantık incelemesi** — §10'daki listeyi kanıtla doğrulama,
  oyun mantığı ve sayfa akışlarında yeni sorun arama.
- **Rozet + ödeme tasarımı** — bronz→yakut ücretsiz, ametist ücretli;
  skor defteri, güvenilir puanlama, ödeme yolu seçenekleri.
- **Serbest öneriler** ve birleşik **ilerleme taslağı**.
