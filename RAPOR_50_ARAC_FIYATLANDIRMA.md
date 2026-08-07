# 📊 NakitGaraj 50 Araç Canlı EvaluationService API ve Canonical Snapshot Karşılaştırma Raporu

> [!IMPORTANT]
> Bu rapor, **tam 50 test aracı** üzerinde, sahte emsal ilanlar kullanılmadan, veritabanındaki **63.444 adet benzersiz RawVehicleListing kaydı** (2.358 karantinalı kayıt ayrıştırılmıştır), **6.257 adet v2.0 süzülmüş canonical snapshot verisi** ve canlı `EvaluationService.calculateVehicleValuationPreview` API üretim akışı ile otomatik olarak oluşturulmuştur.

## 📈 50 Araç Gerçek API Karşılaştırma Tablosu

| # | Araç & Model Yılı | Paket / Versiyon | Düzeltilmiş P35 Fiyatı | Kilometre Düzeltilmiş Tahmini Piyasa Değeri | Yeni Nakit Alış Teklifi | Yeni Konsinye İlan Fiyatı | Müşteriye Kalan Konsinye Net | Brüt Alış Rezervi (Tahmini Net Kâr) | Snapshot Emsal Sayısı | Hesaplayıcı Emsal Sayısı | API Emsal Sayısı | Güven Puanı | Eşleşme Seviyesi & Durum |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | Audi A3 (2021) | 30 TFSI | 1.975.000 ₺ | 2.099.000 ₺ | **1.960.000 ₺** | 2.158.000 ₺ | **2.045.630 ₺** | **139.000 ₺** (67.030 ₺ net) | 16 | 16 | 16 | %96 | Seviye 1 |
| 2 | Audi A3 (2023) | 35 TFSI | 2.455.000 ₺ | 2.625.000 ₺ | **2.410.000 ₺** | 2.702.000 ₺ | **2.568.319 ₺** | **215.000 ₺** (130.370 ₺ net) | 5 | 5 | 5 | %85 | Seviye 1 |
| 3 | Audi A4 (2020) | 40 TDI | 2.675.000 ₺ | 2.795.000 ₺ | **2.570.000 ₺** | 2.877.000 ₺ | **2.734.660 ₺** | **225.000 ₺** (136.145 ₺ net) | 5 | 5 | 5 | %85 | Seviye 1 |
| 4 | Audi A4 (2022) | 40 TDI | 3.300.000 ₺ | 3.358.750 ₺ | **3.090.000 ₺** | 3.357.000 ₺ | **3.190.912 ₺** | **268.750 ₺** (167.495 ₺ net) | 6 | 6 | 6 | %85 | Seviye 1 |
| 5 | Audi A4 (2023) | 40 TDI | 3.499.000 ₺ | 3.530.000 ₺ | **3.240.000 ₺** | 3.568.000 ₺ | **3.391.473 ₺** | **290.000 ₺** (184.080 ₺ net) | 7 | 7 | 7 | %85 | Seviye 1 |
| 6 | Audi A4 (2024) | 40 TDI | 3.798.000 ₺ | 3.870.000 ₺ | **3.650.000 ₺** | 3.869.000 ₺ | **3.677.581 ₺** | **220.000 ₺** (105.465 ₺ net) | 8 | 8 | 8 | %95 | Seviye 1 |
| 7 | Audi A4 (2019) | 45 TFSI | 2.440.000 ₺ | 2.520.000 ₺ | **2.380.000 ₺** | 2.594.000 ₺ | **2.465.662 ₺** | **140.000 ₺** (57.290 ₺ net) | 12 | 12 | 12 | %96 | Seviye 1 |
| 8 | Audi A4 (2020) | 45 TFSI | 2.725.000 ₺ | 2.799.000 ₺ | **2.640.000 ₺** | 2.848.000 ₺ | **2.707.095 ₺** | **159.000 ₺** (69.880 ₺ net) | 22 | 22 | 22 | %96 | Seviye 1 |
| 9 | Audi A4 (2021) | 45 TFSI | 3.310.000 ₺ | 3.330.000 ₺ | **3.140.000 ₺** | 3.334.000 ₺ | **3.169.050 ₺** | **190.000 ₺** (88.590 ₺ net) | 10 | 10 | 10 | %95 | Seviye 1 |
| 10 | Audi A4 (2022) | 45 TFSI | 3.225.000 ₺ | 3.325.000 ₺ | **3.140.000 ₺** | 3.423.000 ₺ | **3.253.647 ₺** | **185.000 ₺** (82.255 ₺ net) | 30 | 30 | 30 | %97 | Seviye 1 |
| 11 | Audi A4 (2023) | 45 TFSI | 3.625.000 ₺ | 3.675.000 ₺ | **3.470.000 ₺** | 3.749.000 ₺ | **3.563.518 ₺** | **205.000 ₺** (94.065 ₺ net) | 44 | 44 | 44 | %98 | Seviye 1 |
| 12 | Audi A4 (2024) | 45 TFSI | 3.849.900 ₺ | 3.975.000 ₺ | **3.750.000 ₺** | 4.093.000 ₺ | **3.910.657 ₺** | **225.000 ₺** (106.105 ₺ net) | 29 | 29 | 29 | %97 | Seviye 1 |
| 13 | Audi A4 (2016) | 1.4 TFSI | 1.475.000 ₺ | 1.675.000 ₺ | **1.470.000 ₺** | 1.699.000 ₺ | **1.593.515 ₺** | **205.000 ₺** (144.815 ₺ net) | 10 | 10 | 10 | %95 | Seviye 1 |
| 14 | Audi A5 (2019) | 40 TDI | 2.850.000 ₺ | 2.899.000 ₺ | **2.730.000 ₺** | 2.984.000 ₺ | **2.836.367 ₺** | **169.000 ₺** (76.940 ₺ net) | 27 | 27 | 27 | %97 | Seviye 1 |
| 15 | Audi A5 (2020) | 40 TDI | 3.149.500 ₺ | 3.350.000 ₺ | **3.140.000 ₺** | 3.399.000 ₺ | **3.230.834 ₺** | **210.000 ₺** (107.615 ₺ net) | 35 | 35 | 35 | %97 | Seviye 1 |
| 16 | Audi A5 (2021) | 40 TDI | 3.469.000 ₺ | 3.530.000 ₺ | **3.330.000 ₺** | 3.599.000 ₺ | **3.420.939 ₺** | **200.000 ₺** (92.715 ₺ net) | 35 | 35 | 35 | %97 | Seviye 1 |
| 17 | Audi A5 (2022) | 40 TDI | 3.850.000 ₺ | 4.050.000 ₺ | **3.820.000 ₺** | 4.099.000 ₺ | **3.916.390 ₺** | **230.000 ₺** (110.315 ₺ net) | 44 | 44 | 44 | %98 | Seviye 1 |
| 18 | Audi A5 (2023) | 40 TDI | 3.900.000 ₺ | 3.997.500 ₺ | **3.770.000 ₺** | 4.116.000 ₺ | **3.932.632 ₺** | **227.500 ₺** (108.060 ₺ net) | 54 | 54 | 54 | %99 | Seviye 1 |
| 19 | Audi A5 (2024) | 40 TDI | 4.280.000 ₺ | 4.350.000 ₺ | **4.110.000 ₺** | 4.479.000 ₺ | **4.279.461 ₺** | **240.000 ₺** (111.715 ₺ net) | 63 | 63 | 63 | %99 | Seviye 1 |
| 20 | Audi A5 (2020) | 45 TFSI | 3.570.000 ₺ | 3.700.000 ₺ | **3.490.000 ₺** | 3.810.000 ₺ | **3.621.500 ₺** | **210.000 ₺** (97.950 ₺ net) | 20 | 20 | 20 | %96 | Seviye 1 |
| 21 | Audi A5 (2021) | 45 TFSI | 3.970.000 ₺ | 4.175.000 ₺ | **3.840.000 ₺** | 4.174.000 ₺ | **3.988.048 ₺** | **335.000 ₺** (213.990 ₺ net) | 6 | 6 | 6 | %85 | Seviye 1 |
| 22 | Audi A5 (2022) | 45 TFSI | 3.990.000 ₺ | 4.400.000 ₺ | **3.990.000 ₺** | 4.449.000 ₺ | **4.250.797 ₺** | **410.000 ₺** (283.365 ₺ net) | 10 | 10 | 10 | %95 | Seviye 1 |
| 23 | Audi A5 (2023) | 45 TFSI | 4.230.000 ₺ | 4.295.000 ₺ | **4.050.000 ₺** | 4.354.000 ₺ | **4.160.029 ₺** | **245.000 ₺** (119.190 ₺ net) | 37 | 37 | 37 | %98 | Seviye 1 |
| 24 | Audi A5 (2024) | 45 TFSI | 4.728.000 ₺ | 4.780.000 ₺ | **4.510.000 ₺** | 4.848.000 ₺ | **4.632.022 ₺** | **270.000 ₺** (132.180 ₺ net) | 16 | 16 | 16 | %96 | Seviye 1 |
| 25 | Audi A5 (2010) | 2.0 TDI | 990.000 ₺ | 1.080.000 ₺ | **990.000 ₺** | 1.111.000 ₺ | **1.044.335 ₺** | **90.000 ₺** (43.435 ₺ net) | 10 | 10 | 10 | %95 | Seviye 1 |
| 26 | Audi A5 (2011) | 2.0 TDI | 1.130.000 ₺ | 1.205.000 ₺ | **1.120.000 ₺** | 1.240.000 ₺ | **1.166.437 ₺** | **85.000 ₺** (35.200 ₺ net) | 48 | 48 | 48 | %99 | Seviye 1 |
| 27 | Audi A5 (2012) | 2.0 TDI | 1.199.000 ₺ | 1.285.000 ₺ | **1.190.000 ₺** | 1.322.000 ₺ | **1.243.572 ₺** | **95.000 ₺** (43.270 ₺ net) | 72 | 72 | 72 | %99 | Seviye 1 |
| 28 | Audi A5 (2013) | 2.0 TDI | 1.370.000 ₺ | 1.450.000 ₺ | **1.350.000 ₺** | 1.492.000 ₺ | **1.403.487 ₺** | **100.000 ₺** (44.120 ₺ net) | 19 | 19 | 19 | %96 | Seviye 1 |
| 29 | Audi A5 (2014) | 2.0 TDI | 1.360.000 ₺ | 1.430.000 ₺ | **1.330.000 ₺** | 1.471.000 ₺ | **1.383.733 ₺** | **100.000 ₺** (44.635 ₺ net) | 25 | 25 | 25 | %97 | Seviye 1 |
| 30 | Audi A5 (2015) | 2.0 TDI | 1.450.000 ₺ | 1.550.000 ₺ | **1.440.000 ₺** | 1.595.000 ₺ | **1.491.075 ₺** | **110.000 ₺** (51.675 ₺ net) | 43 | 43 | 43 | %98 | Seviye 1 |
| 31 | Audi A6 (2019) | 40 TDI | 3.500.000 ₺ | 3.800.000 ₺ | **3.500.000 ₺** | 3.878.000 ₺ | **3.686.136 ₺** | **300.000 ₺** (186.830 ₺ net) | 14 | 14 | 14 | %96 | Seviye 1 |
| 32 | Audi A6 (2020) | 40 TDI | 3.950.000 ₺ | 4.150.000 ₺ | **3.920.000 ₺** | 4.273.000 ₺ | **4.082.638 ₺** | **230.000 ₺** (106.705 ₺ net) | 31 | 31 | 31 | %97 | Seviye 1 |
| 33 | Audi A6 (2021) | 40 TDI | 4.075.000 ₺ | 4.290.000 ₺ | **4.050.000 ₺** | 4.374.000 ₺ | **4.179.138 ₺** | **240.000 ₺** (113.890 ₺ net) | 28 | 28 | 28 | %97 | Seviye 1 |
| 34 | Audi A6 (2022) | 40 TDI | 4.590.000 ₺ | 4.780.000 ₺ | **4.510.000 ₺** | 4.874.000 ₺ | **4.656.863 ₺** | **270.000 ₺** (131.790 ₺ net) | 24 | 24 | 24 | %97 | Seviye 1 |
| 35 | Audi A6 (2023) | 40 TDI | 5.155.900 ₺ | 5.400.000 ₺ | **5.100.000 ₺** | 5.449.000 ₺ | **5.206.247 ₺** | **300.000 ₺** (147.265 ₺ net) | 50 | 50 | 50 | %99 | Seviye 1 |
| 36 | Audi A6 (2024) | 40 TDI | 5.550.000 ₺ | 5.795.000 ₺ | **5.470.000 ₺** | 5.949.000 ₺ | **5.683.972 ₺** | **325.000 ₺** (161.065 ₺ net) | 32 | 32 | 32 | %97 | Seviye 1 |
| 37 | Audi A6 (2025) | 40 TDI | 6.600.000 ₺ | 6.895.000 ₺ | **6.510.000 ₺** | 7.100.000 ₺ | **6.783.695 ₺** | **385.000 ₺** (193.400 ₺ net) | 62 | 62 | 62 | %99 | Seviye 1 |
| 38 | Audi A6 (2018) | 50 TDI | 4.150.000 ₺ | 4.390.000 ₺ | **4.140.000 ₺** | 4.399.000 ₺ | **4.203.025 ₺** | **250.000 ₺** (122.615 ₺ net) | 17 | 17 | 17 | %96 | Seviye 1 |
| 39 | Audi A6 (2006) | 2.0 TDI | 825.000 ₺ | 850.000 ₺ | **785.000 ₺** | 849.000 ₺ | **786.265 ₺** | **65.000 ₺** (24.415 ₺ net) | 8 | 8 | 8 | %95 | Seviye 1 |
| 40 | Audi A6 (2008) | 2.0 TDI | 850.000 ₺ | 899.000 ₺ | **830.000 ₺** | 924.000 ₺ | **860.140 ₺** | **69.000 ₺** (26.840 ₺ net) | 41 | 41 | 41 | %98 | Seviye 1 |
| 41 | Ferrari Roma (2022) | 3.9 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 42 | Bentley Continental GT (2021) | 6.0 W12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 43 | Lamborghini Urus (2023) | 4.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 44 | Rolls-Royce Cullinan (2022) | 6.75 V12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 45 | McLaren 720S (2021) | 4.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 46 | Bugatti Chiron (2022) | 8.0 W16 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 47 | Pagani Huayra (2021) | 6.0 V12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 48 | Koenigsegg Jesko (2023) | 5.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 49 | Rimac Nevera (2023) | EV | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |
| 50 | Maybach S 680 (2023) | 6.0 V12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **NOT_TESTABLE_THROUGH_LIVE_API** |

---

## 🎯 Canlı Akış Özeti ve Doğrulama İstatistikleri

- **Toplam Test Aracı:** 50 adet
- **Başarılı API Değerleme Sayısı:** 40 adet (Seviye 1: 40, Seviye 2: 0, Seviye 3: 0)
- **Yetersiz Veri Sayısı:** 10 adet (Veritabanında bulunmayan nadir/egzotik araçlar için fiyat uydurulmamış, `INSUFFICIENT_DATA` döndürülmüştür)
- **Manuel Değerlendirme Gereken Araç Sayısı (<400k TL):** 0 adet
- **Farklı Marka Çeşitliliği:** 1 farklı marka (Audi)
- **Dinamik Veritabanı Hacmi:**
  - **RawVehicleListing Benzersiz İlan Sayısı:** 63.444 adet
  - **QuarantinedListing Karantina Kayıt Sayısı:** 2.358 adet
  - **VehicleMarketSnapshot Canlı Snapshot Sayısı:** 6.257 adet
- **11-Alan Birebir Eşitlik Kontrolü:** Snapshot Emsal Sayısı = Hesaplayıcı Emsal Sayısı = API Emsal Sayısı (%100 Birebir Eşit)

---

## 🛠️ Hesaplama Rasyonelleri

1. **Brüt Alış Rezervi:** `Kilometre Düzeltilmiş Tahmini Piyasa Değeri - Nakit Alış Teklifi`
2. **Tahmini Net Kâr:** Brüt Rezervden Pazarlık Tamponu (~%1.5), Detaylı Hazırlık/Kuaför (15.000 TL), Ekspertiz & Muayene (5.000 TL) ve Bekleme/Finansman Maliyeti düşülerek hesaplanmıştır.
3. **P35 & P50 Düzeltme Eşitliği:** P35 ve P50 değerlerine aynı medyan kilometre (`referenceMedianMileage`) ve yıl katsayısı uygulanmıştır.
4. **Düşük Fiyatlı Araç Politikası (<400.000 TL):** Sabit minimum rezerv kuralları nedeniyle teklif oranı %85'in altına düşen araçlar otomatik olarak `MANUAL_EVALUATION_REQUIRED` durumuna alınmış ve konsinye satışı önceliklendirilmiştir.
