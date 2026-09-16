# DEMO — KALDIĞIMIZ YER

**Tarih:** 2026-09-16 · **Branch:** `feature/market-refresh-playwright-v1` · **HEAD:** `f54102b`

---

## Şu anki durum

| | |
|---|---|
| Test | **1196 / 1198 geçiyor** (oturum başında 1175) |
| Demo | `/demo` hazır, üretim derlemesi temiz, gösterilen her fiyat doğrulandı |
| Vercel | tek komut kaldı (aşağıda) |
| Engel | disk — koşu sürdürülemiyor |

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

## Açık kalan iki karar

### A) İki test kırmızı: korpus kaymasi (KARAR SİZİN)

Korpusa Eylül'de eklenen sayfalar, **aynı ilanın kimliğini** değiştirdi:

| test | eskiden | şimdi | sebep |
|---|---|---|---|
| `quote-fallback` (Abarth) | model `500e` | `500e Coupe` / `500e Cabrio` | 5 Eylül'de eklenen gövde tipi sayfaları; aynı 3 ilan artık daha özel sayfada |
| `catalog-artifact` (Bajaj) | `Qute RE 60` | `RE 60` | 4 Eylül'de eklenen **marka sayfası**, aynı ilanı daha az özel adla listeliyor |

Bajaj'daki **gerçek bir ayıklama kusuru**: `1323477606` hem marka sayfasında hem kendi sayfasında var; içe aktarım aynı `data-id` için "en güncel ilan tarihli" kaydı tutuyor, adın **ne kadar özel** olduğuna bakmıyor. Marka sayfası kazanınca "Qute" düşüyor.

Seçenekler:
1. **İçe aktarımı düzelt** — aynı ilanda daha özel sayfayı tercih et, tarihi yalnızca eşit özellikte ayraç yap. Bajaj düzelir. Ama bu kural **40.624 mükerrer kaydın** hepsini etkiler; kimlik = fiyat havuzu demek, bu yüzden tek başıma değiştirmedim.
2. **Testleri bugünkü korpusa göre yeniden sabitle** — Abarth için zaten tek yol; `500e` artık korpusta yok.
3. **Karışık** — (1) + Abarth testini korpustan bağımsız hale getir (1-3 emsalli *herhangi* bir havuz fiyat üretmeli).

Önerim: **3**. Ama fiyat kimliğine dokunduğu için onayınızı bekliyorum.

### B) Disk — koşuyu hâlâ bu engelliyor

```
published/versions/   3.543 dosya · 253,5 GB
güncel sürüm          150,5 MB  (1 dosya)
silinebilir           253,4 GB
C: boş                61 GB
```

Güncel sürümün eskilerin tam üst kümesi olduğu daha önce kanıtlandı — eskileri silmek piyasa verisi kaybettirmez, yalnızca tarihsel anlık görüntüyü. **3.542 dosya silmek geri alınamaz; onayınız olmadan yapmadım.**

---

## Sonraki işler

1. Yukarıdaki iki kararı ver.
2. **Koşuyu sürdür** (disk açıldıktan sonra): `market-baseline-6205-2026-09-08` → 3728 COMPLETE / 5 INCOMPLETE / 2472 PENDING, Cloudflare'de durmuş.
   ```bash
   cd /c/dev/NakitGaraj-market-refresh/backend && npm run market:weekly:bridge -- --run-id market-baseline-6205-2026-09-08 --all-targets --pace-mode overnight --initial-baseline-pages 20
   ```
   Önce Chrome'da doğrulamayı elle geç, uzantıyı yenile (v1.5.0), popup'tan START.
3. **Veri büyüdükçe demoyu tazele:** `npx ts-node --transpile-only src/scripts/build_demo_dataset.ts` → yeniden deploy. (Şu an gerek yok: yayınlanan artefakt 08:34, demo veri seti 13:01.)
4. **Buluta taşıma:** backend + veri Railway/Fly/Render'a, Vercel sadece arayüz.

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
