# DEMO — KALDIĞIMIZ YER

**Tarih:** 2026-09-16 · **Branch:** `feature/market-refresh-playwright-v1` · **HEAD:** `0ef653a`

---

## Şu anki durum

| | |
|---|---|
| Test | **1198 / 1198 geçiyor** · 94/94 suite (oturum başında 1175) |
| Demo | `/demo` hazır, üretim derlemesi temiz, gösterilen her fiyat doğrulandı |
| Vercel | tek komut kaldı (aşağıda) |
| Disk | **313 GB boş** (253,4 GB geri alındı) — koşu sürdürülebilir |

---

## Bu oturumda ne yapıldı

### 1. Kırmızı 23 testin tamamı kapandı — `30781e6`

Üçü de **testin kendi kurulumundan** kaynaklanıyordu, korudukları koddan değil:

| suite | gerçek sebep | sonuç |
|---|---|---|
| security penetration (21) | izole `test_security.db` **0 bayt**tı; şema yoktu, her istek eksik tablodan 500 dönüyordu | suite artık açılışta migration'ları uygulayıp fikstürleri ekiyor · **37/37**, uygulama davranışı hiç değişmedi |
| notification contact config (1) | `.env.example` `'\n'` ile bölünüyordu; CRLF checkout'ta satırda `\r` kalıyor, şablon değer taşıyor gibi görünüyordu | `/\r?\n/` |
| dynamic corpus (1) | kontrol "HTML'i olan her klasör" diyordu, sözleşmesi ise "**ilan üreten** her klasör" | ELİ ve Roewe gerçek "ilan bulunamadı" sayfaları; artık klasör ancak gerçekten ilan satırı üretiyorsa sayılıyor |

### 2. Korpus yeniden kuruldu (dynamic corpus testinin istediği)

DB 35 bin ilan bayattı. `rebuild_raw_listings_v3.ts` ile:

```
RawVehicleListing   280.738 -> 315.977
marka klasörü       97 (16 yeni marka DB'ye girdi: Lotus, Morgan, Polestar, RKS, Reeder, Saipa, XEV …)
karantina           439 -> 593
```

`dev.db` yedeği: `backend/prisma/dev.db.bak-20260916-215920` (250 MB, git dışı).

### 3. Invariant taraması bitti — `f54102b`

Yarım kalan iş kapandı. `sweep_demo_invariants.ts` demonun **gerçekten çalıştırdığı** `quote()` fonksiyonunu tüm veri setinde koşturuyor (rastgele örnek yok, ~1 sn):

```
gösterilen fiyat            36.381
sıralama ihlali             0        <- sert kural: nakit < konsinye net <= beklenen satış <= ilan
manuel değerlendirme        %6,1     (medyan km'de) — ucuz araçta müşteri koruma tabanı, backend ile aynı
emsal eşiği altında         %19,04   — demo zaten fiyat üretmez
```

### 4. Demo linki çıkmaz sokağa düşmüyor — `f54102b`

`/demo` dışındaki her sayfa backend istiyor; Vercel'de backend yok. `DEMO_ONLY=1` ile `/`, `/degerleme`, `/konsinye`, `/arac-secimi`, `/admin`, `/admin_panel/*` → `/demo` (307). Bayrak kapalıyken ürün yönlendirmesi **değişmez**.

---

## Vercel'e çıkmak

```bash
cd /c/dev/NakitGaraj-market-refresh/frontend && npx vercel --prod
```

**Root Directory = `frontend`**, ortam değişkeni **`DEMO_ONLY=1`**. Backend gerekmiyor.
Link: `https://<proje>.vercel.app` — artık kök adres de demoyu açar.

---

## Kapatılan iki karar

### A) Kimlik kayması — içe aktarım düzeltildi + test bağımsızlaştırıldı · `0ef653a`

Aynı ilan birden fazla sayfada yayınlanıyor (markanın kendi sayfası, model
sayfası, gövde tipi sayfası) ve **kimlik ilandan değil SAYFADAN** türetiliyor.
`1323477606` model sayfasında "Qute RE 60", Bajaj marka sayfasında sadece
"RE 60". Mükerrer kayıt yalnızca ilan tarihine göre seçildiği için, **en son
hangi sayfa kaydedildiyse aracın adını o belirliyordu**; Eylül'de eklenen marka
sayfası adı sessizce kırptı. Kimlik = fiyat havuzu anahtarı olduğundan havuz da
kaydı.

Artık: bir ad ötekini **tam kelime olarak içeriyorsa** uzun olan kazanır; geri
kalan her durumda karar yine tarihe kalır.

Ölçüt bilerek dar. Korpus üzerinde ölçüldü: daha geniş ölçütler ("daha çok
kelime", "daha çok tekil kelime") yanlış yerden bölünmüş adları da ödüllendirip
(`XJ XJ6` + `2.7 D`, `XJ` + `XJ6 2.7 D`yi yeniyor) **motor kodunu taşıyan kaydı
eliyordu** — emsal eşleştirme buna bağlı.

| ölçüt | kimlik değişen | motor kodu |
| --- | --- | --- |
| kelime sayısı | 849 | 256.715 |
| tekil kelime kümesi | 2.705 | 255.472 ⬇ |
| **kırpılmış ad (seçilen)** | **945 (%0,3)** | **256.110 (%81,1)** |

`quote-fallback` testi `canonicalModel = '500e'`e sabitlenmişti; Eylül'de gövde
tipi sayfaları gelince araç `500e Coupe` oldu ve korpus artık `500e` üretmiyor.
Testin konusu belirli bir aracın varlığı değil, **"1-3 gerçek emsal yine de
fiyat üretir"** kuralı; artık toplam 1-3 ilanlı bir marka+model veriden
seçiliyor, tüm iddialar duruyor.

### B) Disk açıldı

```
silinen      3.542 eski sürüm
geri alınan  253,4 GB
kalan        1 dosya (güncel sürüm, 150,5 MB)
C: boş       61 GB -> 313 GB
```

Kalıcı çözüm hâlâ açık: yayınlayıcı her hedefte tam kopya yerine **artımlı**
yazmalı, yoksa aynı yığılma tekrar eder.

---

## Bilinen bayatlık (demoyu etkilemiyor)

`data/vehicle-hierarchy/` artefaktları **4 Eylül** tarihli, korpus ise 5 Eylül'de
büyüdü — bu bayatlık bu oturumdan önce de vardı. Demo etkilenmiyor: veri seti
yayınlanan hiyerarşi sürümüne (`89fe05a8…`) birebir bağlı. Bir noktada
`hierarchy:build` + `listings:build` + `coverage:manifest` tazelenmeli.

---
## Sonraki işler

1. **Koşuyu sürdür** (disk artık hazır): `market-baseline-6205-2026-09-08` → 3728 COMPLETE / 5 INCOMPLETE / 2472 PENDING, Cloudflare'de durmuş.
   ```bash
   cd /c/dev/NakitGaraj-market-refresh/backend && npm run market:weekly:bridge -- --run-id market-baseline-6205-2026-09-08 --all-targets --pace-mode overnight --initial-baseline-pages 20
   ```
   Önce Chrome'da doğrulamayı elle geç, uzantıyı yenile (v1.5.0), popup'tan START.
2. **Veri büyüdükçe demoyu tazele:** `npx ts-node --transpile-only src/scripts/build_demo_dataset.ts` → yeniden deploy. (Şu an gerek yok: yayınlanan artefakt 08:34, demo veri seti 13:01.)
3. **Buluta taşıma:** backend + veri Railway/Fly/Render'a, Vercel sadece arayüz.

---

## Fiyat motoru — arka plan (değişmedi)

40 büyük havuz × 327 noktada motorun FMV'si gerçek ilan medyanıyla karşılaştırıldı: sapma medyanı %0,0, |sapma| ≤ %10 oranı %98, nakit teklif gerçek medyanın %9,4 altında.

**Dikkat:** FMV **ilan** fiyatına dayanıyor; araçlar ilan fiyatının altında satılıyor ve motorda "ilan → satış" kırımı bilinçli olarak `0`. Kâğıttaki %9,4 marj gerçekte %4–6 olabilir. Kendi alım/satım verisi birikince `negotiationRate` ölçülmüş değerle açılmalı — yapılacak en kârlı tek değişiklik.

## Doğrulama komutları

```bash
cd /c/dev/NakitGaraj-market-refresh/backend
npx ts-node --transpile-only src/scripts/verify_demo_dataset.ts      # demo <-> motor: medyan km'de 168/168 birebir
npx ts-node --transpile-only src/scripts/sweep_demo_invariants.ts    # gösterilen her fiyat tutarlı mı
```
