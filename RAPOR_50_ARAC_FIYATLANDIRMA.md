# 📊 NakitGaraj 50 Araç Canlı EvaluationService API ve Snapshot Karşılaştırma Raporu

> [!IMPORTANT]
> Bu rapor, **tam 50 test aracı** üzerinde, sahte emsal ilanlar kullanılmadan, veritabanındaki **83.552 adet gerçek Sahibinden ilanından üretilmiş 8.544 adet aggregate snapshot verisi** ve canlı `EvaluationService.evaluateVehicle` API üretim akışı ile oluşturulmuştur.

## 📈 50 Araç Gerçek API Karşılaştırma Tablosu

| # | Araç & Model Yılı | Paket / Versiyon | Düzeltilmiş P35 Fiyatı | Kilometre Düzeltilmiş Tahmini Piyasa Değeri | Yeni Nakit Alış Teklifi | Yeni Konsinye İlan Fiyatı | Müşteriye Kalan Konsinye Net | Brüt Alış Rezervi (Tahmini Net Kâr) | Snapshot Emsal Sayısı | Hesaplayıcı Emsal Sayısı | API Emsal Sayısı | Güven Puanı | Eşleşme Seviyesi & Durum |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | BMW 5 Serisi (2016) | Executive | 2.072.685 ₺ | 2.252.918 ₺ | **2.100.000 ₺** | 2.319.000 ₺ | **2.204.215 ₺** | **152.918 ₺** (77.133 ₺ net) | 1644 | 1644 | 1644 | %78 | Seviye 3 |
| 2 | BMW 3 Serisi (2020) | First | 2.424.697 ₺ | 2.635.540 ₺ | **2.490.000 ₺** | 2.704.000 ₺ | **2.570.220 ₺** | **145.540 ₺** (60.080 ₺ net) | 1461 | 1461 | 1461 | %78 | Seviye 3 |
| 3 | BMW 3 Serisi (2016) | 40th | 1.617.551 ₺ | 1.758.208 ₺ | **1.640.000 ₺** | 1.809.000 ₺ | **1.701.865 ₺** | **118.208 ₺** (54.673 ₺ net) | 2194 | 2194 | 2194 | %78 | Seviye 3 |
| 4 | BMW 3 Serisi (2015) | M | 1.477.881 ₺ | 1.606.392 ₺ | **1.500.000 ₺** | 1.653.000 ₺ | **1.548.205 ₺** | **106.392 ₺** (46.597 ₺ net) | 2205 | 2205 | 2205 | %78 | Seviye 3 |
| 5 | Audi A3 (2012) | FarkliVaryant | 909.224 ₺ | 988.287 ₺ | **910.000 ₺** | 1.016.000 ₺ | **950.760 ₺** | **78.287 ₺** (33.947 ₺ net) | 1027 | 1027 | 1027 | %78 | Seviye 3 |
| 6 | Audi A4 (2016) | 1.4 | 1.593.900 ₺ | 1.732.500 ₺ | **1.610.000 ₺** | 1.783.000 ₺ | **1.676.255 ₺** | **122.500 ₺** (59.655 ₺ net) | 900 | 900 | 900 | %78 | Seviye 3 |
| 7 | Audi A3 (2016) | Standart | 1.255.576 ₺ | 1.364.757 ₺ | **1.270.000 ₺** | 1.404.000 ₺ | **1.320.708 ₺** | **94.757 ₺** (40.997 ₺ net) | 913 | 913 | 913 | %78 | Seviye 3 |
| 8 | Audi A3 (2013) | Standart | 985.537 ₺ | 1.071.236 ₺ | **985.000 ₺** | 1.102.000 ₺ | **1.035.470 ₺** | **86.236 ₺** (39.856 ₺ net) | 1128 | 1128 | 1128 | %78 | Seviye 3 |
| 9 | Citroen C4 (2025) | Shine | 1.330.613 ₺ | 1.446.319 ₺ | **1.350.000 ₺** | 1.468.000 ₺ | **1.380.911 ₺** | **96.319 ₺** (40.799 ₺ net) | 1358 | 1358 | 1358 | %78 | Seviye 3 |
| 10 | Citroen C4 (2025) | FarkliVaryant | 1.363.369 ₺ | 1.481.923 ₺ | **1.380.000 ₺** | 1.503.000 ₺ | **1.413.835 ₺** | **101.923 ₺** (45.578 ₺ net) | 1358 | 1358 | 1358 | %78 | Seviye 3 |
| 11 | Citroen C4 (2023) | Shine | 1.262.487 ₺ | 1.372.269 ₺ | **1.280.000 ₺** | 1.391.000 ₺ | **1.308.479 ₺** | **92.269 ₺** (38.604 ₺ net) | 1452 | 1452 | 1452 | %78 | Seviye 3 |
| 12 | Citroen C4 (2012) | Confort | 607.152 ₺ | 659.948 ₺ | **590.000 ₺** | 678.000 ₺ | **617.830 ₺** | **69.948 ₺** (33.878 ₺ net) | 637 | 637 | 637 | %78 | Seviye 3 |
| 13 | Chevrolet Cruze (2010) | LS | 465.536 ₺ | 506.017 ₺ | **440.000 ₺** | 520.000 ₺ | **462.200 ₺** | **66.017 ₺** (33.817 ₺ net) | 1117 | 1117 | 1117 | %78 | Seviye 3 |
| 14 | Chevrolet Cruze (2012) | LS | 544.479 ₺ | 591.825 ₺ | **525.000 ₺** | 608.000 ₺ | **548.880 ₺** | **66.825 ₺** (32.455 ₺ net) | 1131 | 1131 | 1131 | %78 | Seviye 3 |
| 15 | Chevrolet Aveo (2011) | FarkliVaryant | 431.998 ₺ | 469.563 ₺ | **400.000 ₺** | 482.000 ₺ | **424.770 ₺** | **69.563 ₺** (38.333 ₺ net) | 797 | 797 | 797 | %78 | Seviye 3 |
| 16 | Chevrolet Aveo (2012) | 1.3 | 464.260 ₺ | 504.630 ₺ | **435.000 ₺** | 518.000 ₺ | **460.230 ₺** | **69.630 ₺** (37.510 ₺ net) | 761 | 761 | 761 | %78 | Seviye 3 |
| 17 | Dacia Sandero (2017) | Stepway | 703.926 ₺ | 765.137 ₺ | **700.000 ₺** | 787.000 ₺ | **725.195 ₺** | **65.137 ₺** (26.332 ₺ net) | 779 | 779 | 779 | %78 | Seviye 3 |
| 18 | Dacia Sandero (2016) | Stepway | 751.003 ₺ | 816.308 ₺ | **750.000 ₺** | 837.000 ₺ | **774.445 ₺** | **66.308 ₺** (26.253 ₺ net) | 714 | 714 | 714 | %78 | Seviye 3 |
| 19 | Dacia Sandero (2021) | 0.9 | 888.916 ₺ | 966.213 ₺ | **890.000 ₺** | 994.000 ₺ | **929.090 ₺** | **76.213 ₺** (32.403 ₺ net) | 521 | 521 | 521 | %78 | Seviye 3 |
| 20 | Dacia Sandero (2015) | FarkliVaryant | 708.980 ₺ | 770.630 ₺ | **705.000 ₺** | 791.000 ₺ | **729.135 ₺** | **65.630 ₺** (26.715 ₺ net) | 709 | 709 | 709 | %78 | Seviye 3 |
| 21 | Alfa Romeo Alfa Romeo  & Modelleri sahibinden.com'da - 14 (2004) | 156 | 281.231 ₺ | 305.686 ₺ | **240.000 ₺** | 308.000 ₺ | **253.380 ₺** | **65.686 ₺** (38.666 ₺ net) | 39 | 39 | 39 | %66 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 22 | Alfa Romeo Alfa Romeo  & Modleri .com'da   14 (2004) | 156 | 303.292 ₺ | 329.665 ₺ | **260.000 ₺** | 333.000 ₺ | **278.005 ₺** | **69.665 ₺** (42.070 ₺ net) | 16 | 16 | 16 | %89 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 23 | Alfa Romeo Alfa Romeo  & Modelleri sahibinden.com'da - 6 (2011) | Giulietta | 703.896 ₺ | 765.104 ₺ | **700.000 ₺** | 767.000 ₺ | **705.495 ₺** | **65.104 ₺** (26.599 ₺ net) | 32 | 32 | 32 | %66 | Seviye 3 |
| 24 | Alfa Romeo Alfa Romeo  & Modleri .com'da   6 (2012) | Giulietta | 734.850 ₺ | 798.750 ₺ | **730.000 ₺** | 797.000 ₺ | **735.045 ₺** | **68.750 ₺** (29.495 ₺ net) | 8 | 8 | 8 | %88 | Seviye 2 |
| 25 | DS Automobiles DS Automobiles  & Modelleri sahibinden.com'da - 4 (2023) | FarkliVaryant | 1.663.101 ₺ | 1.807.719 ₺ | **1.690.000 ₺** | 1.811.000 ₺ | **1.703.835 ₺** | **117.719 ₺** (53.654 ₺ net) | 36 | 36 | 36 | %91 | Seviye 2 |
| 26 | DS Automobiles DS Automobiles  & Modleri .com'da   4 (2023) | DS | 1.663.101 ₺ | 1.807.719 ₺ | **1.690.000 ₺** | 1.811.000 ₺ | **1.703.835 ₺** | **117.719 ₺** (53.654 ₺ net) | 36 | 36 | 36 | %91 | Seviye 2 |
| 27 | DS Automobiles DS Automobiles  & Modelleri sahibinden.com'da - 3 (2023) | DS | 1.703.426 ₺ | 1.851.550 ₺ | **1.730.000 ₺** | 1.870.000 ₺ | **1.761.950 ₺** | **121.550 ₺** (56.200 ₺ net) | 28 | 28 | 28 | %90 | Seviye 2 |
| 28 | DS Automobiles DS Automobiles  & Modelleri sahibinden.com'da - 8 (2012) | DS | 572.590 ₺ | 622.380 ₺ | **555.000 ₺** | 640.000 ₺ | **580.400 ₺** | **67.380 ₺** (32.230 ₺ net) | 28 | 28 | 28 | %90 | Seviye 2 |
| 29 | Daihatsu Daihatsu  & Modelleri sahibinden.com'da - 2 (2007) | Sirion | 315.024 ₺ | 342.417 ₺ | **275.000 ₺** | 345.000 ₺ | **289.825 ₺** | **67.417 ₺** (39.492 ₺ net) | 14 | 14 | 14 | %78 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 30 | Daihatsu Daihatsu  & Modelleri sahibinden.com'da (2005) | FarkliVaryant | 350.649 ₺ | 381.140 ₺ | **315.000 ₺** | 385.000 ₺ | **329.225 ₺** | **66.140 ₺** (37.215 ₺ net) | 10 | 10 | 10 | %88 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 31 | Daihatsu Daihatsu  & Modleri .com'da   2 (2006) | Sirion | 288.880 ₺ | 314.000 ₺ | **245.000 ₺** | 319.000 ₺ | **264.215 ₺** | **69.000 ₺** (41.765 ₺ net) | 10 | 10 | 10 | %88 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 32 | Daihatsu Daihatsu  & Modleri .com'da (2005) | Sirion | 350.649 ₺ | 381.140 ₺ | **315.000 ₺** | 385.000 ₺ | **329.225 ₺** | **66.140 ₺** (37.215 ₺ net) | 10 | 10 | 10 | %88 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 33 | BYD BYD 2.El Arabalar ve Satılık Sıfır Km Otomobil  sahibinden.com'da - 3 (2025) | Seal | 2.020.320 ₺ | 2.196.000 ₺ | **2.050.000 ₺** | 2.235.000 ₺ | **2.121.475 ₺** | **146.000 ₺** (71.975 ₺ net) | 50 | 50 | 50 | %92 | Seviye 2 |
| 34 | BYD BYD 2. Arabalar ve Satılık Sıfır Km Otomobil  .com'da   3 (2026) | Seal | 2.181.946 ₺ | 2.371.680 ₺ | **2.210.000 ₺** | 2.413.000 ₺ | **2.293.617 ₺** | **161.680 ₺** (83.385 ₺ net) | 50 | 50 | 50 | %80 | Seviye 2 |
| 35 | BYD BYD 2.El Arabalar ve Satılık Sıfır Km Otomobil  sahibinden.com'da (2025) | FarkliVaryant | 3.459.648 ₺ | 3.760.487 ₺ | **3.550.000 ₺** | 3.859.000 ₺ | **3.668.076 ₺** | **210.487 ₺** (97.102 ₺ net) | 38 | 38 | 38 | %91 | Seviye 2 |
| 36 | BYD BYD 2. Arabalar ve Satılık Sıfır Km Otomobil  .com'da (2025) | Han | 3.459.648 ₺ | 3.760.487 ₺ | **3.550.000 ₺** | 3.859.000 ₺ | **3.668.076 ₺** | **210.487 ₺** (97.102 ₺ net) | 38 | 38 | 38 | %91 | Seviye 2 |
| 37 | Cupra Cupra Leon 1.5 eTSI Standart  & Modelleri sahibinden.com'da - 5 (2023) | Standart | 1.742.519 ₺ | 1.894.042 ₺ | **1.770.000 ₺** | 1.908.000 ₺ | **1.799.380 ₺** | **124.042 ₺** (57.722 ₺ net) | 48 | 48 | 48 | %92 | Seviye 2 |
| 38 | Cupra Cupra Leon 1.5 eTSI Standart  & Modleri .com'da   5 (2023) | Standart | 1.742.519 ₺ | 1.894.042 ₺ | **1.770.000 ₺** | 1.908.000 ₺ | **1.799.380 ₺** | **124.042 ₺** (57.722 ₺ net) | 48 | 48 | 48 | %92 | Seviye 2 |
| 39 | Cupra Cupra Leon 1.5 eTSI Standart  & Modelleri sahibinden.com'da - 3 (2024) | Standart | 1.961.469 ₺ | 2.132.031 ₺ | **1.940.000 ₺** | 2.131.000 ₺ | **2.019.035 ₺** | **192.031 ₺** (120.666 ₺ net) | 6 | 6 | 6 | %78 | Seviye 2 |
| 40 | Cupra Cupra Leon 1.5 eTSI Standart  & Modelleri sahibinden.com'da - 4 (2023) | FarkliVaryant | 1.753.414 ₺ | 1.905.885 ₺ | **1.780.000 ₺** | 1.919.000 ₺ | **1.810.215 ₺** | **125.885 ₺** (59.300 ₺ net) | 43 | 43 | 43 | %91 | Seviye 2 |
| 41 | Ferrari Roma (2022) | 3.9 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 42 | Bentley Continental GT (2021) | 6.0 W12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 43 | Lamborghini Urus (2023) | 4.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 44 | Rolls-Royce Cullinan (2022) | 6.75 V12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 45 | McLaren 720S (2021) | 4.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 46 | Bugatti Chiron (2022) | 8.0 W16 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 47 | Pagani Huayra (2021) | 6.0 V12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 48 | Koenigsegg Jesko (2023) | 5.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 49 | Rimac Nevera (2023) | EV | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 50 | Maybach S 680 (2023) | 6.0 V12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |

---

## 🎯 Canlı Akış Özeti ve Doğrulama İstatistikleri

- **Toplam Test Aracı:** 50 adet
- **Başarılı API Değerleme Sayısı:** 40 adet (Seviye 1: 0, Seviye 2: 18, Seviye 3: 22)
- **Yetersiz Veri Sayısı:** 10 adet (Veritabanında bulunmayan nadir/egzotik araçlar için fiyat uydurulmamış, `INSUFFICIENT_DATA` döndürülmüştür)
- **Manuel Değerlendirme Gereken Araç Sayısı (<400k TL):** 6 adet
- **Farklı Marka Çeşitliliği:** 10 farklı marka (BMW, Audi, Citroen, Chevrolet, Dacia, Alfa Romeo, DS Automobiles, Daihatsu, BYD, Cupra)
- **Dinamik Veritabanı Hacmi:** 83.552 ilan / 8.544 snapshot (Prisma veritabanı toplamı)
- **9-Alan Birebir Eşitlik Kontrolü:** Snapshot Emsal Sayısı = Hesaplayıcı Emsal Sayısı = API Emsal Sayısı (%100 Birebir Eşit)

---

## 🛠️ Hesaplama Rasyonelleri

1. **Brüt Alış Rezervi:** `Kilometre Düzeltilmiş Tahmini Piyasa Değeri - Nakit Alış Teklifi`
2. **Tahmini Net Kâr:** Brüt Rezervden Pazarlık Tamponu (~%1.5), Detaylı Hazırlık/Kuaför (15.000 TL), Ekspertiz & Muayene (5.000 TL) ve Bekleme/Finansman Maliyeti düşülerek hesaplanmıştır.
3. **P35 & P50 Düzeltme Eşitliği:** P35 ve P50 değerlerine aynı medyan kilometre (`referenceMedianMileage`) ve yıl katsayısı uygulanmıştır.
4. **Düşük Fiyatlı Araç Politikası (<400.000 TL):** Sabit minimum rezerv kuralları nedeniyle teklif oranı %85'in altına düşen araçlar otomatik olarak `MANUAL_EVALUATION_REQUIRED` durumuna alınmış ve konsinye satışı önceliklendirilmiştir.
