# 📊 NakitGaraj 50 Araç Canlı EvaluationService API ve Canonical Snapshot Karşılaştırma Raporu

> [!IMPORTANT]
> Bu rapor, **tam 50 test aracı** üzerinde, sahte emsal ilanlar kullanılmadan, veritabanındaki **59.797 adet benzersiz RawVehicleListing kaydı** (0 karantinalı kayıt ayrıştırılmıştır), **14.267 adet v2.0 süzülmüş canonical snapshot verisi** ve canlı `EvaluationService.evaluateVehicle` API üretim akışı ile otomatik olarak oluşturulmuştur.

## 📈 50 Araç Gerçek API Karşılaştırma Tablosu

| # | Araç & Model Yılı | Paket / Versiyon | Düzeltilmiş P35 Fiyatı | Kilometre Düzeltilmiş Tahmini Piyasa Değeri | Yeni Nakit Alış Teklifi | Yeni Konsinye İlan Fiyatı | Müşteriye Kalan Konsinye Net | Brüt Alış Rezervi (Tahmini Net Kâr) | Snapshot Emsal Sayısı | Hesaplayıcı Emsal Sayısı | API Emsal Sayısı | Güven Puanı | Eşleşme Seviyesi & Durum |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | BMW 3 Serisi (2020) | First | 2.521.101 ₺ | 2.740.327 ₺ | **2.580.000 ₺** | 2.808.000 ₺ | **2.669.074 ₺** | **160.327 ₺** (72.407 ₺ net) | 1691 | 1691 | 1691 | %78 | Seviye 3 |
| 2 | BMW 3 Serisi (2016) | 40th | 1.739.818 ₺ | 1.891.107 ₺ | **1.760.000 ₺** | 1.946.000 ₺ | **1.836.810 ₺** | **131.107 ₺** (64.317 ₺ net) | 2629 | 2629 | 2629 | %78 | Seviye 3 |
| 3 | BMW 3 Serisi (2016) | 40th Year Edition | 1.739.818 ₺ | 1.891.107 ₺ | **1.760.000 ₺** | 1.946.000 ₺ | **1.836.810 ₺** | **131.107 ₺** (64.317 ₺ net) | 2629 | 2629 | 2629 | %78 | Seviye 3 |
| 4 | BMW 3 Serisi (2015) | M | 1.632.226 ₺ | 1.774.159 ₺ | **1.650.000 ₺** | 1.826.000 ₺ | **1.718.610 ₺** | **124.159 ₺** (60.269 ₺ net) | 2629 | 2629 | 2629 | %78 | Seviye 3 |
| 5 | Audi A3 (2012) | FarkliVaryant | 997.960 ₺ | 1.084.739 ₺ | **995.000 ₺** | 1.116.000 ₺ | **1.049.260 ₺** | **89.739 ₺** (43.049 ₺ net) | 1064 | 1064 | 1064 | %78 | Seviye 3 |
| 6 | Audi A4 (2016) | 1.4 | 1.723.991 ₺ | 1.873.903 ₺ | **1.750.000 ₺** | 1.929.000 ₺ | **1.820.065 ₺** | **123.903 ₺** (57.468 ₺ net) | 1222 | 1222 | 1222 | %78 | Seviye 3 |
| 7 | Audi A3 (2016) | Standart | 1.310.589 ₺ | 1.424.553 ₺ | **1.330.000 ₺** | 1.466.000 ₺ | **1.379.030 ₺** | **94.553 ₺** (39.263 ₺ net) | 1022 | 1022 | 1022 | %78 | Seviye 3 |
| 8 | Audi A3 (2013) | Standart | 1.088.365 ₺ | 1.183.005 ₺ | **1.090.000 ₺** | 1.217.000 ₺ | **1.144.801 ₺** | **93.005 ₺** (43.850 ₺ net) | 1180 | 1180 | 1180 | %78 | Seviye 3 |
| 9 | Citroen C4 (2026) | Max | 1.612.274 ₺ | 1.752.472 ₺ | **1.630.000 ₺** | 1.774.000 ₺ | **1.667.390 ₺** | **122.472 ₺** (59.562 ₺ net) | 1217 | 1217 | 1217 | %78 | Seviye 3 |
| 10 | Citroen C4 (2024) | FarkliVaryant | 1.211.718 ₺ | 1.317.085 ₺ | **1.230.000 ₺** | 1.337.000 ₺ | **1.257.682 ₺** | **87.085 ₺** (34.730 ₺ net) | 1420 | 1420 | 1420 | %78 | Seviye 3 |
| 11 | Citroen C3 (2020) | 1.2 | 936.293 ₺ | 1.017.710 ₺ | **930.000 ₺** | 1.038.000 ₺ | **972.430 ₺** | **87.710 ₺** (42.840 ₺ net) | 741 | 741 | 741 | %78 | Seviye 3 |
| 12 | Citroen C3 (2021) | 1.2 | 949.114 ₺ | 1.031.646 ₺ | **945.000 ₺** | 1.054.000 ₺ | **988.190 ₺** | **86.646 ₺** (41.386 ₺ net) | 870 | 870 | 870 | %78 | Seviye 3 |
| 13 | Chevrolet Cruze (2010) | LS | 511.572 ₺ | 556.056 ₺ | **490.000 ₺** | 571.000 ₺ | **512.435 ₺** | **66.056 ₺** (32.591 ₺ net) | 973 | 973 | 973 | %78 | Seviye 3 |
| 14 | Chevrolet Aveo (2012) | 1.4 | 491.667 ₺ | 534.421 ₺ | **465.000 ₺** | 549.000 ₺ | **490.765 ₺** | **69.421 ₺** (36.536 ₺ net) | 970 | 970 | 970 | %78 | Seviye 3 |
| 15 | Chevrolet Aveo (2012) | FarkliVaryant | 490.228 ₺ | 532.856 ₺ | **465.000 ₺** | 547.000 ₺ | **488.795 ₺** | **67.856 ₺** (35.001 ₺ net) | 970 | 970 | 970 | %78 | Seviye 3 |
| 16 | Chevrolet Cruze (2011) | LS | 528.425 ₺ | 574.375 ₺ | **505.000 ₺** | 590.000 ₺ | **531.150 ₺** | **69.375 ₺** (35.475 ₺ net) | 973 | 973 | 973 | %78 | Seviye 3 |
| 17 | Dacia Sandero (2017) | Stepway | 794.404 ₺ | 863.483 ₺ | **795.000 ₺** | 883.000 ₺ | **819.755 ₺** | **68.483 ₺** (27.288 ₺ net) | 797 | 797 | 797 | %78 | Seviye 3 |
| 18 | Dacia Sandero (2016) | Stepway | 758.402 ₺ | 824.350 ₺ | **755.000 ₺** | 843.000 ₺ | **780.355 ₺** | **69.350 ₺** (29.155 ₺ net) | 748 | 748 | 748 | %78 | Seviye 3 |
| 19 | Dacia Sandero (2021) | 0.9 | 900.237 ₺ | 978.519 ₺ | **905.000 ₺** | 1.005.000 ₺ | **939.925 ₺** | **73.519 ₺** (29.394 ₺ net) | 666 | 666 | 666 | %78 | Seviye 3 |
| 20 | Dacia Sandero (2015) | FarkliVaryant | 771.425 ₺ | 838.505 ₺ | **770.000 ₺** | 856.000 ₺ | **793.160 ₺** | **68.505 ₺** (27.965 ₺ net) | 755 | 755 | 755 | %78 | Seviye 3 |
| 21 | Alfa Romeo 156 (2004) | - | 329.476 ₺ | 358.126 ₺ | **290.000 ₺** | 367.000 ₺ | **311.495 ₺** | **68.126 ₺** (39.721 ₺ net) | 94 | 94 | 94 | %68 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 22 | Alfa Romeo 159 (2008) | - | 647.456 ₺ | 703.757 ₺ | **630.000 ₺** | 718.000 ₺ | **657.230 ₺** | **73.757 ₺** (36.687 ₺ net) | 59 | 59 | 59 | %67 | Seviye 3 |
| 23 | Alfa Romeo 156 (2005) | - | 323.840 ₺ | 352.000 ₺ | **285.000 ₺** | 361.000 ₺ | **305.585 ₺** | **67.000 ₺** (38.735 ₺ net) | 20 | 20 | 20 | %89 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 24 | Alfa Romeo 156 (2002) | - | 304.648 ₺ | 331.139 ₺ | **265.000 ₺** | 337.000 ₺ | **281.945 ₺** | **66.139 ₺** (38.434 ₺ net) | 85 | 85 | 85 | %68 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 25 | DS Automobiles DS Automobiles  & Modelleri sahibinden.com'da - 4 (2023) | FarkliVaryant | 1.663.101 ₺ | 1.807.719 ₺ | **1.690.000 ₺** | 1.811.000 ₺ | **1.703.835 ₺** | **117.719 ₺** (53.654 ₺ net) | 36 | 36 | 36 | %91 | Seviye 2 |
| 26 | DS Automobiles DS Automobiles  & Modleri .com'da   4 (2023) | DS | 1.663.101 ₺ | 1.807.719 ₺ | **1.690.000 ₺** | 1.811.000 ₺ | **1.703.835 ₺** | **117.719 ₺** (53.654 ₺ net) | 36 | 36 | 36 | %91 | Seviye 2 |
| 27 | DS Automobiles DS Automobiles 4 (2023) | DS 4 | 1.637.880 ₺ | 1.780.304 ₺ | **1.660.000 ₺** | 1.784.000 ₺ | **1.677.240 ₺** | **120.304 ₺** (56.944 ₺ net) | 36 | 36 | 36 | %91 | Seviye 2 |
| 28 | DS Automobiles DS Automobiles  & Modelleri sahibinden.com'da - 3 (2023) | DS | 1.703.426 ₺ | 1.851.550 ₺ | **1.730.000 ₺** | 1.870.000 ₺ | **1.761.950 ₺** | **121.550 ₺** (56.200 ₺ net) | 28 | 28 | 28 | %90 | Seviye 2 |
| 29 | Daihatsu Daihatsu  & Modelleri sahibinden.com'da - 2 (2007) | Sirion | 322.000 ₺ | 350.000 ₺ | **285.000 ₺** | 353.000 ₺ | **297.705 ₺** | **65.000 ₺** (36.855 ₺ net) | 14 | 14 | 14 | %78 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 30 | Daihatsu Daihatsu  & Modelleri sahibinden.com'da (2005) | FarkliVaryant | 350.649 ₺ | 381.140 ₺ | **315.000 ₺** | 385.000 ₺ | **329.225 ₺** | **66.140 ₺** (37.215 ₺ net) | 10 | 10 | 10 | %88 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 31 | Daihatsu Daihatsu  & Modleri .com'da   2 (2006) | Sirion | 288.880 ₺ | 314.000 ₺ | **245.000 ₺** | 319.000 ₺ | **264.215 ₺** | **69.000 ₺** (41.765 ₺ net) | 10 | 10 | 10 | %88 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 32 | Daihatsu Daihatsu  & Modleri .com'da (2005) | Sirion | 350.649 ₺ | 381.140 ₺ | **315.000 ₺** | 385.000 ₺ | **329.225 ₺** | **66.140 ₺** (37.215 ₺ net) | 10 | 10 | 10 | %88 | **Manuel Değerlendirme Gereklidir** (Teklif Oranı <%85) |
| 33 | BYD BYD 2.El Arabalar ve Satılık Sıfır Km Otomobil  sahibinden.com'da - 3 (2025) | Seal | 2.020.320 ₺ | 2.196.000 ₺ | **2.050.000 ₺** | 2.235.000 ₺ | **2.121.475 ₺** | **146.000 ₺** (71.975 ₺ net) | 50 | 50 | 50 | %92 | Seviye 2 |
| 34 | BYD BYD 2. Arabalar ve Satılık Sıfır Km Otomobil  .com'da   3 (2026) | Seal | 2.181.946 ₺ | 2.371.680 ₺ | **2.210.000 ₺** | 2.413.000 ₺ | **2.293.617 ₺** | **161.680 ₺** (83.385 ₺ net) | 50 | 50 | 50 | %80 | Seviye 2 |
| 35 | BYD BYD ve 3 (2025) | FarkliVaryant | 1.837.825 ₺ | 1.997.636 ₺ | **1.860.000 ₺** | 2.036.000 ₺ | **1.925.460 ₺** | **137.636 ₺** (68.496 ₺ net) | 50 | 50 | 50 | %92 | Seviye 2 |
| 36 | BYD BYD 2.El Arabalar ve Satılık Sıfır Km Otomobil  sahibinden.com'da (2025) | Han | 3.459.648 ₺ | 3.760.487 ₺ | **3.550.000 ₺** | 3.859.000 ₺ | **3.668.076 ₺** | **210.487 ₺** (97.102 ₺ net) | 38 | 38 | 38 | %91 | Seviye 2 |
| 37 | Cupra Cupra Leon 1.5 eTSI Standart  & Modelleri sahibinden.com'da - 5 (2023) | Standart | 1.742.519 ₺ | 1.894.042 ₺ | **1.770.000 ₺** | 1.908.000 ₺ | **1.799.380 ₺** | **124.042 ₺** (57.722 ₺ net) | 48 | 48 | 48 | %92 | Seviye 2 |
| 38 | Cupra Cupra Leon 1.5 eTSI Standart  & Modleri .com'da   5 (2023) | Standart | 1.742.519 ₺ | 1.894.042 ₺ | **1.770.000 ₺** | 1.908.000 ₺ | **1.799.380 ₺** | **124.042 ₺** (57.722 ₺ net) | 48 | 48 | 48 | %92 | Seviye 2 |
| 39 | Cupra Cupra Leon 1.5 eTSI Standart 5 (2024) | - | 1.902.332 ₺ | 2.067.752 ₺ | **1.930.000 ₺** | 2.082.000 ₺ | **1.970.770 ₺** | **137.752 ₺** (67.222 ₺ net) | 50 | 50 | 50 | %80 | Seviye 2 |
| 40 | Cupra Cupra Leon 1.5 eTSI Standart  & Modelleri sahibinden.com'da - 3 (2023) | FarkliVaryant | 1.896.766 ₺ | 2.061.702 ₺ | **1.920.000 ₺** | 2.065.000 ₺ | **1.954.025 ₺** | **141.702 ₺** (71.527 ₺ net) | 43 | 43 | 43 | %91 | Seviye 2 |
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
- **Başarılı API Değerleme Sayısı:** 40 adet (Seviye 1: 0, Seviye 2: 17, Seviye 3: 23)
- **Yetersiz Veri Sayısı:** 10 adet (Veritabanında bulunmayan nadir/egzotik araçlar için fiyat uydurulmamış, `INSUFFICIENT_DATA` döndürülmüştür)
- **Manuel Değerlendirme Gereken Araç Sayısı (<400k TL):** 7 adet
- **Farklı Marka Çeşitliliği:** 10 farklı marka (BMW, Audi, Citroen, Chevrolet, Dacia, Alfa Romeo, DS Automobiles, Daihatsu, BYD, Cupra)
- **Dinamik Veritabanı Hacmi:**
  - **RawVehicleListing Benzersiz İlan Sayısı:** 59.797 adet
  - **QuarantinedListing Karantina Kayıt Sayısı:** 0 adet
  - **VehicleMarketSnapshot Canlı Snapshot Sayısı:** 14.267 adet
- **9-Alan Birebir Eşitlik Kontrolü:** Snapshot Emsal Sayısı = Hesaplayıcı Emsal Sayısı = API Emsal Sayısı (%100 Birebir Eşit)

---

## 🛠️ Hesaplama Rasyonelleri

1. **Brüt Alış Rezervi:** `Kilometre Düzeltilmiş Tahmini Piyasa Değeri - Nakit Alış Teklifi`
2. **Tahmini Net Kâr:** Brüt Rezervden Pazarlık Tamponu (~%1.5), Detaylı Hazırlık/Kuaför (15.000 TL), Ekspertiz & Muayene (5.000 TL) ve Bekleme/Finansman Maliyeti düşülerek hesaplanmıştır.
3. **P35 & P50 Düzeltme Eşitliği:** P35 ve P50 değerlerine aynı medyan kilometre (`referenceMedianMileage`) ve yıl katsayısı uygulanmıştır.
4. **Düşük Fiyatlı Araç Politikası (<400.000 TL):** Sabit minimum rezerv kuralları nedeniyle teklif oranı %85'in altına düşen araçlar otomatik olarak `MANUAL_EVALUATION_REQUIRED` durumuna alınmış ve konsinye satışı önceliklendirilmiştir.
