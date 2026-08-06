# NakitGaraj Araç Fiyatlandırma & Kâr Marjı Kuralları (Kalıcı Kural Dosyası)

Bu dosya NakitGaraj platformunun araç değerleme, Sahibinden ilan tavan fiyatları ve kâr marjı kurallarını kesinleştirmek için tanımlanmıştır. Her sohbet başlatıldığında ve veritabanı kurulduğunda geçerlidir.

---

## 1. Fiyatlandırma ve Kâr Marjı Kuralları

- **Sahibinden Piyasa Satış Değeri (Piyasa Değeri / MAX)**:
  - Sahibinden.com üzerindeki gerçek temiz ilan tavan ve ortalama fiyatlarıdır.
  - Asla ölü, taksi çıkması veya 800.000+ km hurda araçların taban fiyatına düşürülemez.

- **Dükkana (Konsinye) Bırakma Fiyatı (Galerinin Minimum Kârı)**:
  - Lüks & Yüksek Değerli Araçlar (>= 2.000.000 TL): Net **200.000 TL KÂR** (`fairMarketValue - 200.000 TL`).
  - Orta & Bütçe Araçlar (< 2.000.000 TL): Net **30.000 TL - 80.000 TL KÂR** (Örn: 600.000 TL araçta 560.000 TL Konsinye).

- **Anında Nakit Alım Teklifi (Galerinin Maximum Kârı)**:
  - Lüks & Yüksek Değerli Araçlar (>= 2.000.000 TL): Net **300.000 TL KÂR** (`fairMarketValue - 300.000 TL`).
  - Orta & Bütçe Araçlar (< 2.000.000 TL): Net **50.000 TL - 100.000 TL KÂR** (Örn: 600.000 TL araçta 530.000 TL Nakit Alım).

---

## 2. Türkiye 2. El Piyasa Yıl Çarpanları (Sahibinden 2026 Kalibrasyonu)

- **2026 Model**: %100 (`1.00`)
- **2025 Model**: %91 (`0.91`)
- **2024 Model**: %83 (`0.83`)
- **2023 Model**: %75 (`0.75`)
- **2022 Model**: %68 (`0.68`)
- **2020 Model**: %56 (`0.56`)
- **2015 Model**: %35 (`0.35`)
- **2010 Model**: %25 (`0.25`)
- **2005 Model**: %20 (`0.20`) *(Örn: Accent Admire 1.6 2005 = 3.000.000 x 0.20 = 600.000 TL)*

---

## 3. Kod Dosyaları ve Kalıcılık

- Kod seviyesindeki mantık `backend/src/recalibrate_all_vehicle_variants.ts` ve `backend/src/evaluation/evaluation.service.ts` içinde sabittir.
- Veritabanı seed komutu (`npx prisma db seed`) her çalıştığında bu kurallar otomatik olarak 55.000+ araca uygulanır.
