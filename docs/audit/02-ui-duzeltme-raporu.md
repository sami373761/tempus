# UI denetimi ve düzeltme raporu

Sitedeki her sayfa gerçek tarayıcıda, birçok ekran genişliğinde gezildi ve oynandı. Bulunan bariz UI sorunları ve küçük kullanım iyileştirmeleri düzeltildi. Oyun kuralları, akış, içerik ve kasıtlı responsive davranışlar (ör. Date Guessing'de dar ekranda açıklamanın gizlenmesi) **değiştirilmedi**.

## Kısaca

| | |
|---|---|
| Denetlenen alan | Ana sayfa + menü + 404, /guess, /compare, /daily + /survival, /football + /basketball + /screen + /when-born, /versus (arkadaş odası ve online eşleşme), /leaderboard + /contact + /account + /achievements + /signin, statik kod taraması, 4 dilde (de/fr/tr/es) taşma kontrolü |
| Test boyutları | 320x568, 375x667, 390x844, 430x932, 640/700x900, 768x1024, 1024x768, 1280x720, 1280x650, 1366x768, 1440x900, **1680x844 (senin tarayıcın)**, 1920x1080, 2560x1440; ayrıca kırılma noktalarının iki yanı (639/640, 767/768, 1023/1024) ve kısa ekranlar (844x390 yatay telefon, 1280x560-600) |
| Bulgu | 187 bulgu → her biri ayrı bir doğrulayıcıyla tarayıcıda yeniden ölçüldü → 172 doğrulandı, 15'i "kasıtlı" ya da "tekrarlanamadı" diye elendi |
| Birleştirme | Ortak bileşenlerden gelen tekrarlar birleşince 96 ayrı düzeltme kaldı |
| Uygulanan | **95 düzeltme** (1'i kısmi); 1'i bilerek uygulanmadı (aşağıda) |
| Kontrol | Her takımın işi ayrı bir doğrulayıcıyla tarayıcıda yeniden ölçüldü. Ardından tüm diff kod incelemesinden geçti (2 hata bulunup düzeltildi) ve tüm sayfalar 4 boyutta son bir regresyon taramasından geçti (regresyon yok). `npx tsc --noEmit` temiz. |
| Commit | **Yapılmadı.** Değişiklikler diskte, `git diff` ile görülebilir (44 dosya + yeni `components/link-pending.tsx`). |

## Senin ekranında (1680x844) fark edeceklerin

- **/achievements artık kaydırma istemiyor**, ok tuşları ekranın içinde (önceden sayfa kayıyor, oklar kesiliyordu).
- **/football ve /basketball'da "Tarih gir" açılınca "Lock in" 84px aşağı kaymıyor.**
- **Sekme başlıkları** artık oyun adını taşıyor ("Date Guessing · Tempus" gibi); önceden hepsi "Tempus"tu.
- **Film & TV ve Born When? sonuç kartları:** "YOUR RESULT" üst kenara yapışmıyor, TP satırı delikli çizginin üstüne binmiyor (TP artık başlık satırında).
- **Klavye odak halkası:** butonların neredeyse hepsinde artık mavi accent halka var (önceden tarayıcının soluk varsayılanıydı ya da hiç görünmüyordu).
- **Butonlarda el imleci:** link olmayan butonlarda da artık el imleci çıkıyor.

## Sayfa sayfa değişiklikler

### Ana sayfa, menü, 404, iletişim
- **Menü paneli** kısa ekranlarda (yatay telefon, ~550px altı) alttan taşmıyor; kendi içinde kayıyor, dil çipleri her zaman erişilebilir. Uzun ekranlarda hiçbir şey değişmedi.
- **Menü klavye davranışı:** Escape ya da dil çipi sonrası odak menü düğmesine dönüyor; Tab ile menüden çıkınca menü kapanıyor.
- **Explorer hapları:** klavye odak halkası artık görünüyor (önceden kırpılıyordu). X ile panel kapanınca odak açık olan hapa dönüyor. Sayfa explorer görünürken yüklenince etiketler artık "…" ile kesilmiyor (ölçüm, scroll-reveal animasyonunun ölçeğinden etkilenmiyor). 320px'te "Achievement/s" gibi tek harfli satır kırılmaları giderildi.
- **Event library istatistikleri:** 768-959px ve 360px altında rakamlar kutudan taşmıyor, üçü aynı hizada.
- **Oyun panosu (Other Games):** 768-959px'te "COMING SOON" yazısı Inventions ikonunun üstüne binmiyor. 320px'te "Coming Soon" başlığı kesilmiyor. Üst etiketler dengeli kırılıyor, uzun tek kelimelik başlıklar (Karşılaştırma, Comparaison) kart kenarında kesilmiyor, heceden bölünüyor.
- **Telefonda pano yükseklik animasyonu** artık yalnızca görünüm değişirken çalışıyor; döndürme/boyut değişiminde alttaki bölüm kartların üstüne kaymıyor.
- **FAQ:** klavye odağında soru ve "+" işareti hover'daki gibi parlıyor, mavi halka var.
- **404:** iki buton aynı yükseklikte, küçük telefonda sayfa 10px kaymıyor, başlıkta tek kelime alt satırda kalmıyor.
- **İletişim:** e-posta adresi kelime ortasından bölünmüyor, bütün olarak alt satıra geçiyor. Başlıkta "Kaffee" gibi tek kelime alt satırda kalmıyor.
- **/daily'de menü düğmesi** diğer tam ekran oyunlardaki gibi şeffaf cam görünümünde.

### Date Guessing, Daily (ray ve olay kartı)
- **Kısa pencerelerde olay kartı 4px'lik bir çizgiye çökmüyor** (844x390 gibi); fotoğraf ve başlık her zaman görünüyor. Gerekirse sayfanın mevcut kaydırma emniyeti devreye giriyor.
- **Kısa fotoğrafta sonuç katmanı** (320px telefon, yatay telefon) kırpılmıyor, köşe çiplerinin (sayaç, puan) üstüne yazılmıyor.
- **Olay başlıkları** telefonda bir kademe küçük ve 3 satıra kadar çıkabiliyor (önceden 2 satırda "…" ile kesiliyordu). Tüm başlıklar dengeli; son satırda tek kelime kalmıyor.
- **Dönem başlığı** ("Humans & Evolution", "Après Jésus-Christ") 375px altında taşmıyor, panelleri uzatmıyor.
- **Cevap işaretçisi** ray üstündeki yıl rakamına değmiyor (4px aşağı alındı).
- **Telefonda ilk açılışta** tüm yıl etiketleri üst üste basılmıyor; ölçülene kadar yalnız uçtakiler görünüyor. Etiket genişliği tahmini rakamlar için düzeltildi, sıkışık etiketler artık 5px aralıkla basılmıyor.
- **Gizli dönem kapıları** `inert` (CLAUDE.md kuralı); odaktayken kapanan kapı odağı bırakıyor.
- **Hareket azaltma tercihi** (reduced motion) artık ray işaretçisi ve yıl balonunun kaymasında da geçerli. Eğri aynı kaldı.

### Tüm solo oyunların kontrolleri (guess, daily, football, basketball, screen, when-born)
- **Klavye odağı kaybolmuyor:** Lock in sonrası Next round'a, Next round sonrası Lock in'e geçiyor. Play again sonrası yeni setin Lock in'ine dönüyor. "Report a wrong date" kapatılınca kendi düğmesine dönüyor. Fareyle oynayan hiçbir fark görmüyor.
- **Lock in ve Next round** geçişte üst üste görünmüyor (sıralı solma).
- **Lock in'e basınca** puanlanırken (~1sn) Next round'daki yükleme izi görünüyor.
- **"Please enter a valid date."** uyarısı tek-ekran çerçevesini 2px taşırmıyor. Süre dolunca eski uyarı ve kırmızı çerçeve sonuç ekranında kalmıyor.
- **Telefondaki sonuç satırı** bir bilginin ortasından kırılmıyor ("1013 / CE", "+0 / TP" olmuyor).
- **"1 years off" → "1 year off"** (5 dilde tekil biçim eklendi).
- **Sonuç kartı etiketleri** (DISTANCE, YOUR GUESS) daha okunur kontrastta (white/40 → /55).
- **Football/Basketball'da fotoğraf üstündeki "Report a wrong date"** parlak fotoğrafta okunur (koyu cam zemin). Kapat bağlantısı büyüdü ve parladı; fr/es'de etiket dengeli kırılıyor.
- **Film & TV / Born When?:** kilitlenince "1 of 10" sayacı yana kaymıyor (zamanlayıcı yerinde gizleniyor). Kısa masaüstü pencerede (≤640px) Born When? kartları portrenin altına sarkmıyor.
- **Daily:** puan çipi zamanlayıcıyla aynı hizada, kilitlenince zıplamıyor.
- **Tarih yazma kutusu** odaktayken kenarı belirginleşiyor (önceden hiçbir odak işareti yoktu).
- **Oyun başlık hapı** (RoundHead) odak halkası artık kırpılmıyor.

### Comparison ve Survival
- **Telefonda "Lock in" ekranın altına düşmüyordu → düzeltildi.** `--compare-chrome` bütçesine telefondaki buton satırı (12px + 48px) eklendi, uzun adların 3. satırı için 22px pay bırakıldı. 1680x844'te kartlar yine 360px tavanında, değişmedi. 768px yüksekliğindeki dizüstünde kartlar ~20px daha küçük.
- **Uzun adlar** kartları şeritlerinden taşırmıyor. Telefonda en fazla 3 satır, heceden bölünme, daha sıkı tarih harf aralığı.
- **Tablet genişliğinde (768-1200px)** yüzen Lock in / Next round düğmesi iki fotoğrafın üstüne binmiyor.
- **Telefonda yatay sonuç kartı:** "+N TP"nin "TP"si kesilmiyor; gerçek tarih ve tahmin "…" ile kesilmiyor (telefonda alt alta diziliyor).
- **Next round'da kart yüksekliği** yeni başlık göründükten sonra zıplamıyor.
- **Süre dolup hiç seçim yapılmadıysa** gerçek tarihin yanındaki kart "seçilmiş" gibi vurgulanmıyor.
- **Yan yana iki kart** aynı yükseklikte, tarih satırları aynı hizada.
- **Play again sonrası** odak kaydırıcıya dönüyor. Kart kayması reduced motion'a uyuyor.
- **Survival özeti:** "Answer by answer" nokta satırları birbirine yapışmıyor. Telefonda masaüstü dolgusu yok, ritim sıkılaştı.

### Özet ekranları (set, daily, survival, versus)
- **Kısa pencerelerde (≤820px yükseklik)** set özeti ve daily özeti sıkılaşıyor: 1366x768'de taşma 0. 1280x720'de daily artık kaymıyor; set özetinde "Back to home" görünür alana girdi. 820px'ten uzun ekranlar değişmedi.
- **Özet ekranları açılırken** kendiliğinden aşağı kaymış başlamıyor (panelin üstü bar altında kalmıyor).
- **"Try …" bağlantısı** artık 16px'lik tüm-genişlik şerit değil, metni saran 28px'lik dokunma alanı. Tam sayfa yenilemesi yerine istemci tarafı geçiş yapıyor.
- **Daily'de "New questions in …"** geri sayımı artık güncelleniyor (önceden donuktu). "Share result" ve "Back to home" arası diğer özetlerle aynı (10px).
- **Paylaş / bağlantıyı kopyala** düğmelerinin "Kopyalandı" durumu ekran okuyucuya duyuruluyor.

### Versus (head-to-head)
- **Film & TV maçı küçük telefonda çökmüyor:** sayaç, skor ve saat başlığın üstüne alındı (640px altı). Poster kendi minimum boyunun altına inmiyor.
- **Rakibin yıl etiketi** kendi balonunun altında kaybolmuyor, ray uçlarında kesilmiyor.
- **Mod seçim kartlarında** açıklama satırı harflerin ortasından kesilmiyor.
- **Klavye odağı:** Ready / Play again / Accept-Decline kendi basışlarında odağı düşürmüyor. Rövanş penceresi açılınca odak Accept'e geçiyor, arkadaki panel `inert`. Maçta Lock in sonrası odak bir sonraki turda raya dönüyor.
- **İstek sürerken** Ready, Play again, Accept/Decline, Cancel düğmelerinde yükleme izi var. Ağ hatası "Joining…" ekranında sonsuza kadar asılı bırakmıyor, hata kartı gösteriyor.
- **"Joining…" ve hata kartı** çıplak siyah sayfa yerine zaman çizelgesi arka planında. Bozuk davet adresi gri bir cümle yerine "Play a friend" bağlantılı hata kartı gösteriyor.
- **Lobi:** iki oyuncu da girince başlık "Your opponent is here." oluyor, davet metni gizleniyor. Maç kodu tam ortada. 768px yüksekliğindeki dizüstünde koltuk satırları kaydırmadan görünüyor (küçük QR). "Head to head · <oyun>" oyun adının ortasından kırılmıyor.
- **Süre dolduktan sonraki sonuçta** ray kapanıyor; cevap işaretçisi ve rakibin halkası çiziliyor (önceden ray canlı kalıyordu).
- **Son turda** "Next round in N" yerine "Results in N" (5 dil).
- **Sonuç:** skor küçük telefonda iki satıra bölünmüyor, tire/kısa çizgi karışıklığı giderildi ("3 – 2", "−5"). Chrono Rating bloğu sonradan gelip düğmeleri ~108px aşağı itmiyor (yerinde yükleme noktaları). Rövanş Accept/Decline aynı yükseklikte.
- **Online:** "Opponent found" kartında kendi adın ve puanın hemen görünüyor. Uzun rakip adı skor hapını geri sayım halkasının altına itmiyor. Arama ekranında noktalar metne yapışık, "20 CR" bölünmüyor. Rating satırındaki "·" satır sonunda asılı kalmıyor. "Rakibin bağlantısı koptu" uyarısı düğmeye değmiyor. 640-767px'te "Find opponent" tam genişlik şerit olmuyor. "Back" ve "Try date guessing" 32px dokunma alanı. Film & TV başlığında sayaç ve skor hapları aynı boyda. Bekleme durumu bir kez duyuruluyor; rakip kilitlediyse "Your opponent locked in" yazıyor.

### Hesap sayfaları
- **/achievements:** 1680x844'te kaydırma yok, oklar ekranda. Kart üzerindeki gri metin daha okunur (4.33:1 → ~5.4:1). Ray odak halkası dört kenarıyla görünüyor. Ok tuşu rayın sonuna gelince odağı kaybetmiyor.
- **/leaderboard:** 640-1279px'te sabit menü düğmesi sağ sütunu örtmüyor. Telefonda kullanıcı adları 2-3 harfe kesilmiyor (2 satıra iniyor). İspanyolca "PUESTO" başlığı taşmıyor. Sekme haplarına basınca sayfa gelene kadar yükleniyor efekti var (yeni `components/link-pending.tsx`).
- **/account:** "Change photo" ve "Remove" aynı yükseklikte. Editör kapanınca odak "Change …" düğmesine dönüyor. "See the badges" bağlantısında yükleniyor efekti var.
- **/signin (kayıt modu):** 1440x900, 1366x768, 1280x720 ve telefon boylarında kart ekranı 3-52px taşmıyor (yükseklik eşikleri düzeltildi).
- **Sayı biçimi:** liderlik tablosu, hesap, rozetler ve daily özeti artık seçili dilin biçimini kullanıyor (önceden hep en-US: "1,234"). Daily paylaşım metnindeki sabit "pts" dile çevrildi. "10,000 / TP" ve "4 / MB" bölünmesi engellendi (bölünmez boşluk).

## Bilerek dokunulmayanlar

**Benim çıkardığım:**
- **/guess'te uzun ekranlarda içeriği dikeyde ortalamak** (fix-20). Kolon üstte duruyor ve 1920x1080'de altta boşluk kalıyor. Bu yerleşim tasarım tercihi olabilir; aynı şeyin Film & TV versiyonu kodda kasıtlı diye belgelenmiş. Bu yüzden değiştirmedim.

**Birleştirme aşamasında elenenler:**
- **Oyun çerçevesinin kaydırma çubuğunun geniş ekranda ortada çizilmesi:** düzeltmek site genelinde scrollbar stilini değiştirmek demek.
- **Versus'ta yazılı tarih kutusunun fotoğrafa taşması:** tek çözüm "Rakibin bekleniyor" cümlesini yerinden almak, ki o yerleşim kodda kasıtlı diye belgelenmiş.

**Doğrulayıcıların "kasıtlı" ya da "kusur değil" bulduğu 15 bulgudan öne çıkanlar** (kodda gerekçesi yazılı):
- Pano kartlarındaki hover açıklamasının md karolarda kesilmesi
- Kısa dizüstünde panonun 2. satırının ekranın altında kalması
- 640-767px'te poster boyutlu karolar
- Header'ın yüzeysiz olması
- "More to come" yer tutucu kartları
- Dar ekranda oyun hapında mod adının "…" ile kısalması
- Explorer satırındaki uzun Fransızca/İspanyolca adların tablette kısalması
- Kart açıklamalarının yalnızca hover'da açılması

## Açık kalanlar / not

- **fix-68 (kısmi):** versus lobisi 1280x720 ve 1280x650'de durum satırı için hâlâ biraz kaydırma istiyor. Tamamen sığdırmak içerik gizlemeyi gerektirirdi.
- **/compare 320px'te** çok uzun adlar 3 satırda "…" ile bitiyor ("Foundation of the Ptolemaic…"). 320x568'i kaydırmasız tutmanın bedeli bu.
- **/compare 375px'te** İngilizce adlar heceden bölünebiliyor ("de-/velopment").
- **768px yükseklikteki dizüstünde /compare kartları ~20px küçüldü.** Üçüncü satır payı bunu gerektirdi. 1680x844'te fark yok.
- **Versus Film & TV 320x568'de** sayfa 46px kayıyor (mevcut kaydırma emniyeti). Önceden içerik üst üste biniyordu.
- **Hâlâ kaydırma isteyen kısa ekranlar:** 375x667 kayıt formu, /versus "Play a friend" seçici ve uzun survival koşuları. Bunlar önceden de böyleydi ve kodda belgelenmiş.
- **Doğrudan test edilemeyenler:** reduced-motion emülasyonu yapılamadı (koddan doğrulandı). Online versus özetinin bazı kısımları koddan doğrulandı.

## Test sırasında oluşan yan etkiler

- Test hesabında (ibosk2n) oyunlar oynandı: TP arttı (ör. 759 → ~767). Online versus maçları oynandığı için Chrono Rating de değişmiş olabilir.
- Bir arkadaş odası (/versus/6P2N6M) beklemede bırakıldı. `versus_sweep()` çalıştırıldığında temizlenir.
- Bir doğrulayıcı Tab ile gezerken yanlışlıkla rozet "giy" düğmesine birkaç kez bastı. Hesap son durumda eski haline döndü (Silver giyili).
- Dil çerezi en sonda temizlendi; site İngilizce. Hesap ayarlarına dokunulmadı, çıkış yapılmadı, form gönderilmedi.
- Dev sunucusu çalışma sırasında bir ara durmuştu. Yeniden başlatıldı ve şu an localhost:3000'de çalışıyor.

## Değişen dosyalar

`app/globals.css`, `app/not-found.tsx`, 10 oyun `page.tsx` (sekme başlıkları), `app/(public)/versus/[code]/page.tsx`, `app/(public)/leaderboard|account|achievements|contact/page.tsx`, `components/` altında: site-menu, site-header, home-explorer, game-board, faq-section, contact-email, contact-section, timeline-stage, timeline-game, round-flank, round-head, date-entry, daily-game, daily-summary, screen-game, when-born-game, comparison-game, set-summary, survival-summary, versus-game, versus-lobby, versus-start, versus-search, badge-showcase, account-panel, yeni `link-pending.tsx`; `lib/i18n/dictionary.ts` (yeni anahtarlar 5 dilde: `yearOff`, `versusResultsIn`), `lib/game/chrono-rating.ts` (yalnızca gösterim: gerçek eksi işareti), `lib/game/daily.ts` (paylaşım metni yerel biçimli puan alıyor).

SQL'e, migration'lara, puanlama/rozet kurallarına ve CLAUDE.md'ye dokunulmadı.
