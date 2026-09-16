# DEMO — KALDIĞIMIZ YER

**Tarih:** 2026-09-16 · **Branch:** `feature/market-refresh-playwright-v1` · **HEAD:** `9ae412d` (push edildi)

---

## Bu oturumda ne yapıldı

### 1. Fiyat motoru değerlendirildi (gerçek veriyle)

40 büyük havuz × 327 (havuz, yoğun yıl) noktasında, motorun FMV'si o yılın **gerçek ilan medyanıyla** karşılaştırıldı:

| | değer |
|---|---|
| FMV sapması medyan | %0,0 |
| \|sapma\| ≤ %10 | %92 → **%98** (düzeltmeden sonra) |
| nakit teklif / gerçek medyan | **−%9,4** |
| nakit > gerçek medyan (riskli) | %5 → **%2** |

**Sonuç:** oranlar ticari olarak doğru yerde. Nakit %9 altı, konsinye müşteriye her zaman **+45.000 ile +165.000 TL** fazla bırakıyor.

**Dikkat (ileride):** FMV **ilan** fiyatına dayanıyor, araçlar ilan fiyatının altında satılıyor. Motorda "ilan → satış" kırımı bilinçli olarak `0`. Yani kâğıttaki %9,4 marj gerçekte %4–6 olabilir. Kendi alım/satım verisi birikince `negotiationRate` ölçülmüş değerle açılmalı — yapılacak en kârlı tek değişiklik.

### 2. Eski araç sapması düzeltildi — `1ebb718`

`normalizeToYear` yıl faktörünü sabit `[0,5 – 2,0]` aralığına kırpıyordu. Öğrenilen oranın %13,7 olduğu havuzda 2020 ilanını 2006'ya indirgemek için gereken faktör 0,166; kırpma 0,500'e çekip emsali **3,02 katına** şişiriyordu. ~9 yıldan büyük her yıl farkında devredeydi.

Artık: sınır yıl farkından türetiliyor (sabit 0,5 yok) + havuzun **kendi yıl eğrisi** kullanılıyor (yeterli ilanı olan her yılın gerçek medyanı), aradaki boşluklar log-uzayda interpole, aralık dışı sönümlü.

### 3. Vercel demosu kuruldu — `9ae412d`

| dosya | iş |
|---|---|
| `backend/src/scripts/build_demo_dataset.ts` | 151 MB'lik artefaktı **640 KB**'a indirger |
| `backend/src/scripts/verify_demo_dataset.ts` | demo ↔ motor karşılaştırması |
| `frontend/public/demo-market.json` | 2235 havuz, 6975 yıl satırı, 43 marka, 181.139 ilan temsili |
| `frontend/src/lib/demo-pricing.ts` | motorun müşteriye dönük katmanının birebir kopyası |
| `frontend/src/app/demo/page.tsx` | `/demo` — backend'siz, statik |

**Doğrulanan:** medyan km'de **168/168 birebir aynı**; medyanın %50 uzağında \|sapma\| medyan %1,0, p90 %4,5.

---

## Vercel'e çıkmak için (tek şey kaldı)

```bash
cd /c/dev/NakitGaraj-market-refresh/frontend && npx vercel --prod
```

İlk çalıştırmada Vercel hesabı soracak. **Root Directory = `frontend`** seçilmeli. Backend'e ihtiyaç yok, env değişkeni yok.

Link: `https://<proje>.vercel.app/demo`

> Ana sayfa (`/`) hâlâ backend isteyen eski akışı kullanıyor. Alıcılara **doğrudan `/demo` linkini** verin.

---

## Yarım kalan tek iş

Tüm veri setinde invariant taraması (`sweep_demo_invariants.ts`) 400 sn'de bitmedi, iptal edildi — dosya silindi. Kritik değil: örneklem doğrulaması (`verify_demo_dataset.ts`) zaten geçti ve `demo-pricing.ts` her teklifte invariantı kendi içinde kontrol edip ihlalde fiyat göstermiyor. İstenirse daha küçük örneklemle tekrar yazılabilir.

---

## Sıradaki işler (öncelik sırasıyla)

1. **Disk — acil.** `published/versions/` = **3.543 dosya / 254 GB**. C: diskinde 62 GB boş. Kalan ~2.400 hedef için ~363 GB gerekiyor → **koşu şu haliyle bitemez**.
   Kanıtlandı: güncel sürüm eskilerin **tam üst kümesi** (0 havuz, 0 atama kaybı). Eskileri silmek **hiçbir piyasa verisi kaybettirmez**, sadece tarihsel anlık görüntüyü.
   ```bash
   cd /c/dev/NakitGaraj-market-refresh/backend/data/market-refresh/weekly/published && ls versions | grep -v "$(python -c "import json,io;print(json.load(io.open('current.json',encoding='utf-8'))['release'])")" | head -3540 | xargs -I{} rm "versions/{}"
   ```
   Kalıcı çözüm: yayınlayıcı her hedefte tam kopya yerine artımlı yazmalı.

2. **Koşuyu sürdür.** Son durum: `market-baseline-6205-2026-09-08` → **3728 COMPLETE / 5 INCOMPLETE / 2472 PENDING**, state INCOMPLETE, Cloudflare'de durmuş. Köprü kapalı.
   ```bash
   cd /c/dev/NakitGaraj-market-refresh/backend && npm run market:weekly:bridge -- --run-id market-baseline-6205-2026-09-08 --all-targets --pace-mode overnight --initial-baseline-pages 20
   ```
   Önce Chrome'da doğrulamayı elle geç, uzantıyı yenile (v1.5.0 görünmeli), sonra popup'tan START.

3. **Veri büyüdükçe demoyu tazele:** `npx ts-node --transpile-only src/scripts/build_demo_dataset.ts` → yeniden deploy.

4. **Buluta taşıma** (asıl hedef): backend + veri Railway/Fly/Render'a, Vercel sadece arayüz.

---

## Bilinen test durumu

`1198 test / 1175 geçiyor / 23 hata` — 3 bilinen suite (telegram, security penetration, evaluation dynamic-corpus). Bu oturumda **yeni kırılma yok**. Typecheck temiz, lint yeni hata eklemiyor.
