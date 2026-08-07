# 📊 NakitGaraj 50 Araç Canlı Üretim Akışı ve Snapshot Karşılaştırma Raporu

> [!IMPORTANT]
> Bu rapor, **tam 50 test aracı** üzerinde, sahte ilanlar kullanılmadan, veritabanındaki **5.288 adet gerçek Sahibinden ilanından üretilmiş aggregate snapshot verileri** ve canlı `EmsalMatcherService` / `RobustPricingCalculator` üretim akışı ile oluşturulmuştur.

## 📈 50 Araç Gerçek Karşılaştırma Tablosu

| # | Araç & Model Yılı | Paket / Versiyon | Düzeltilmiş P35 Fiyatı | Kilometre Düzeltilmiş Tahmini Piyasa Değeri | Yeni Nakit Alış Teklifi | Yeni Konsinye İlan Fiyatı | Müşteriye Kalan Konsinye Net | Brüt Alış Rezervi (Tahmini Net Kâr) | Gerçek Emsal Sayısı | Güven Puanı | Eşleşme Seviyesi & Kaynak ID |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | BMW 5 Serisi (2016) | Executive | 1.923.750 ₺ | 2.055.375 ₺ | **1.870.000 ₺** | 2.054.000 ₺ | **1.943.190 ₺** | **185.375 ₺** (115.865 ₺ net) | 456 | %99 | Seviye 1 (Kaynak ID: ae03fc3c) |
| 2 | BMW 3 Serisi (2020) | First | 2.666.562 ₺ | 2.767.187 ₺ | **2.510.000 ₺** | 2.766.000 ₺ | **2.629.152 ₺** | **257.187 ₺** (170.597 ₺ net) | 332 | %99 | Seviye 1 (Kaynak ID: 7e30f35f) |
| 3 | Audi A3 (2012) | Standart | 911.250 ₺ | 977.062 ₺ | **885.000 ₺** | 976.000 ₺ | **913.292 ₺** | **92.062 ₺** (48.572 ₺ net) | 326 | %99 | Seviye 1 (Kaynak ID: d2fa8a6b) |
| 4 | BMW 3 Serisi (2016) | 40th | 1.762.450 ₺ | 1.868.500 ₺ | **1.700.000 ₺** | 1.867.000 ₺ | **1.756.240 ₺** | **168.500 ₺** (103.495 ₺ net) | 317 | %99 | Seviye 1 (Kaynak ID: 585113aa) |
| 5 | BMW 3 Serisi (2014) | M | 1.417.499 ₺ | 1.518.750 ₺ | **1.380.000 ₺** | 1.517.000 ₺ | **1.427.004 ₺** | **138.750 ₺** (82.195 ₺ net) | 285 | %99 | Seviye 1 (Kaynak ID: cf80c09b) |
| 6 | Audi A4 (2016) | 1.4 | 1.709.013 ₺ | 1.794.969 ₺ | **1.630.000 ₺** | 1.793.000 ₺ | **1.686.630 ₺** | **164.969 ₺** (101.774 ₺ net) | 272 | %99 | Seviye 1 (Kaynak ID: 0f7b9818) |
| 7 | BMW 3 Serisi (2016) | Sport | 1.571.312 ₺ | 1.657.481 ₺ | **1.500.000 ₺** | 1.656.000 ₺ | **1.557.758 ₺** | **157.481 ₺** (97.641 ₺ net) | 272 | %99 | Seviye 1 (Kaynak ID: 4a02f65c) |
| 8 | BMW 5 Serisi (2011) | M | 1.479.000 ₺ | 1.555.500 ₺ | **1.410.000 ₺** | 1.554.000 ₺ | **1.461.809 ₺** | **145.500 ₺** (88.090 ₺ net) | 268 | %99 | Seviye 1 (Kaynak ID: 6872c784) |
| 9 | BMW 3 Serisi (2015) | Sport | 1.517.737 ₺ | 1.594.687 ₺ | **1.450.000 ₺** | 1.593.000 ₺ | **1.498.495 ₺** | **144.687 ₺** (86.292 ₺ net) | 263 | %99 | Seviye 1 (Kaynak ID: 59818693) |
| 10 | Audi A3 (2016) | Standart | 1.319.500 ₺ | 1.385.475 ₺ | **1.250.000 ₺** | 1.384.000 ₺ | **1.301.894 ₺** | **135.475 ₺** (82.215 ₺ net) | 261 | %99 | Seviye 1 (Kaynak ID: a0d4f033) |
| 11 | BMW 5 Serisi (2015) | Premium | 1.719.125 ₺ | 1.845.531 ₺ | **1.670.000 ₺** | 1.844.000 ₺ | **1.734.605 ₺** | **175.531 ₺** (111.171 ₺ net) | 255 | %99 | Seviye 1 (Kaynak ID: e50557ca) |
| 12 | Audi A3 (2013) | Standart | 1.104.987 ₺ | 1.165.812 ₺ | **1.050.000 ₺** | 1.164.000 ₺ | **1.094.946 ₺** | **115.812 ₺** (67.852 ₺ net) | 239 | %99 | Seviye 1 (Kaynak ID: 9a0661c2) |
| 13 | Audi A6 (2025) | Standart | 6.441.937 ₺ | 6.741.562 ₺ | **6.130.000 ₺** | 6.740.000 ₺ | **6.439.733 ₺** | **611.562 ₺** (429.162 ₺ net) | 234 | %99 | Seviye 1 (Kaynak ID: c9250c6d) |
| 14 | Audi A6 (2012) | 2.0 | 1.430.919 ₺ | 1.511.819 ₺ | **1.370.000 ₺** | 1.510.000 ₺ | **1.420.419 ₺** | **141.819 ₺** (85.469 ₺ net) | 233 | %99 | Seviye 1 (Kaynak ID: 86dc4ba3) |
| 15 | BMW 3 Serisi (2015) | M | 1.519.293 ₺ | 1.575.187 ₺ | **1.430.000 ₺** | 1.574.000 ₺ | **1.480.622 ₺** | **145.187 ₺** (87.277 ₺ net) | 232 | %99 | Seviye 1 (Kaynak ID: 6b2ab7d1) |
| 16 | Audi A4 (2020) | Standart | 2.644.688 ₺ | 2.790.775 ₺ | **2.530.000 ₺** | 2.789.000 ₺ | **2.651.014 ₺** | **260.775 ₺** (173.640 ₺ net) | 225 | %99 | Seviye 1 (Kaynak ID: 0af5fd54) |
| 17 | BMW 5 Serisi (2014) | Premium | 1.668.562 ₺ | 1.789.912 ₺ | **1.620.000 ₺** | 1.788.000 ₺ | **1.681.927 ₺** | **169.912 ₺** (106.892 ₺ net) | 224 | %99 | Seviye 1 (Kaynak ID: d76acd5c) |
| 18 | BMW 3 Serisi (2015) | 40th | 1.666.500 ₺ | 1.767.500 ₺ | **1.600.000 ₺** | 1.766.000 ₺ | **1.661.232 ₺** | **167.500 ₺** (105.010 ₺ net) | 222 | %99 | Seviye 1 (Kaynak ID: f715a0fe) |
| 19 | BMW 3 Serisi (2019) | First | 2.637.635 ₺ | 2.720.250 ₺ | **2.470.000 ₺** | 2.719.000 ₺ | **2.584.477 ₺** | **250.250 ₺** (164.765 ₺ net) | 221 | %99 | Seviye 1 (Kaynak ID: 116d2397) |
| 20 | Audi A3 (2015) | Standart | 1.211.431 ₺ | 1.292.531 ₺ | **1.160.000 ₺** | 1.291.000 ₺ | **1.214.411 ₺** | **132.531 ₺** (81.566 ₺ net) | 217 | %99 | Seviye 1 (Kaynak ID: c681dfe6) |
| 21 | Audi A6 (2017) | 2.0 | 2.492.400 ₺ | 2.607.975 ₺ | **2.370.000 ₺** | 2.606.000 ₺ | **2.477.068 ₺** | **237.975 ₺** (155.185 ₺ net) | 208 | %99 | Seviye 1 (Kaynak ID: 01b97c7c) |
| 22 | BMW 3 Serisi (2012) | M | 1.218.000 ₺ | 1.294.125 ₺ | **1.170.000 ₺** | 1.293.000 ₺ | **1.216.293 ₺** | **124.125 ₺** (73.030 ₺ net) | 208 | %99 | Seviye 1 (Kaynak ID: 2614a345) |
| 23 | Audi A3 (2017) | Standart | 1.397.250 ₺ | 1.478.250 ₺ | **1.330.000 ₺** | 1.477.000 ₺ | **1.389.377 ₺** | **148.250 ₺** (92.795 ₺ net) | 200 | %99 | Seviye 1 (Kaynak ID: 57933f4f) |
| 24 | Audi A4 (2018) | 1.4 | 1.969.500 ₺ | 2.110.900 ₺ | **1.920.000 ₺** | 2.109.000 ₺ | **1.997.365 ₺** | **190.900 ₺** (120.065 ₺ net) | 196 | %99 | Seviye 1 (Kaynak ID: cb07ff63) |
| 25 | Audi A3 (2023) | A3 | 2.484.281 ₺ | 2.579.637 ₺ | **2.340.000 ₺** | 2.578.000 ₺ | **2.450.453 ₺** | **239.637 ₺** (157.567 ₺ net) | 195 | %99 | Seviye 1 (Kaynak ID: 19bb3665) |
| 26 | Audi A6 (2023) | Standart | 5.205.498 ₺ | 5.356.687 ₺ | **4.840.000 ₺** | 5.355.000 ₺ | **5.116.435 ₺** | **516.687 ₺** (367.962 ₺ net) | 194 | %99 | Seviye 1 (Kaynak ID: 61daca22) |
| 27 | Audi A6 (2016) | 2.0 | 2.108.093 ₺ | 2.264.062 ₺ | **2.060.000 ₺** | 2.263.000 ₺ | **2.149.055 ₺** | **204.062 ₺** (129.517 ₺ net) | 189 | %99 | Seviye 1 (Kaynak ID: 6cdb6e43) |
| 28 | BMW 5 Serisi (2025) | M | 6.000.000 ₺ | 6.175.000 ₺ | **5.610.000 ₺** | 6.174.000 ₺ | **5.898.948 ₺** | **565.000 ₺** (396.290 ₺ net) | 188 | %99 | Seviye 1 (Kaynak ID: e1ee110c) |
| 29 | Audi A5 (2017) | 1.4 | 2.271.490 ₺ | 2.373.500 ₺ | **2.150.000 ₺** | 2.372.000 ₺ | **2.254.645 ₺** | **223.500 ₺** (146.420 ₺ net) | 183 | %99 | Seviye 1 (Kaynak ID: 4faa7adb) |
| 30 | BMW 3 Serisi (2011) | Comfort | 894.046 ₺ | 940.031 ₺ | **855.000 ₺** | 939.000 ₺ | **878.669 ₺** | **85.031 ₺** (42.396 ₺ net) | 174 | %99 | Seviye 1 (Kaynak ID: 9634e6fc) |
| 31 | Audi A6 (2011) | 2.0 | 1.013.750 ₺ | 1.110.056 ₺ | **1.000.000 ₺** | 1.109.000 ₺ | **1.042.365 ₺** | **110.056 ₺** (63.421 ₺ net) | 173 | %99 | Seviye 1 (Kaynak ID: 385d4d03) |
| 32 | Audi A3 (2020) | Standart | 1.735.781 ₺ | 1.811.250 ₺ | **1.640.000 ₺** | 1.810.000 ₺ | **1.702.622 ₺** | **171.250 ₺** (107.700 ₺ net) | 172 | %99 | Seviye 1 (Kaynak ID: c51c1b7c) |
| 33 | BMW 3 Serisi (2014) | Sport | 1.474.600 ₺ | 1.565.500 ₺ | **1.420.000 ₺** | 1.564.000 ₺ | **1.471.216 ₺** | **145.500 ₺** (87.840 ₺ net) | 164 | %98 | Seviye 1 (Kaynak ID: b70ab9c6) |
| 34 | BMW 5 Serisi (2012) | M | 1.495.281 ₺ | 1.571.312 ₺ | **1.420.000 ₺** | 1.570.000 ₺ | **1.476.860 ₺** | **151.312 ₺** (93.562 ₺ net) | 160 | %98 | Seviye 1 (Kaynak ID: 477b56ad) |
| 35 | BMW 5 Serisi (2013) | Premium | 1.427.625 ₺ | 1.588.612 ₺ | **1.420.000 ₺** | 1.587.000 ₺ | **1.492.851 ₺** | **168.612 ₺** (110.607 ₺ net) | 157 | %98 | Seviye 1 (Kaynak ID: 469eef7e) |
| 36 | BMW 3 Serisi (2016) | M | 1.576.538 ₺ | 1.648.337 ₺ | **1.490.000 ₺** | 1.647.000 ₺ | **1.549.292 ₺** | **158.337 ₺** (98.732 ₺ net) | 156 | %98 | Seviye 1 (Kaynak ID: 9f9b76ef) |
| 37 | BMW 5 Serisi (2012) | Comfort | 1.316.250 ₺ | 1.463.128 ₺ | **1.310.000 ₺** | 1.462.000 ₺ | **1.375.267 ₺** | **153.128 ₺** (98.098 ₺ net) | 156 | %98 | Seviye 1 (Kaynak ID: 9e943687) |
| 38 | BMW 3 Serisi (2022) | Sport | 2.900.837 ₺ | 2.986.156 ₺ | **2.710.000 ₺** | 2.985.000 ₺ | **2.837.317 ₺** | **276.156 ₺** (184.281 ₺ net) | 155 | %97 | Seviye 1 (Kaynak ID: fb1f821a) |
| 39 | Audi A3 (2014) | Standart | 1.169.438 ₺ | 1.215.000 ₺ | **1.090.000 ₺** | 1.214.000 ₺ | **1.141.979 ₺** | **125.000 ₺** (75.890 ₺ net) | 153 | %97 | Seviye 1 (Kaynak ID: 008ce5be) |
| 40 | Audi A3 (2025) | Standart | 2.650.000 ₺ | 2.819.000 ₺ | **2.560.000 ₺** | 2.818.000 ₺ | **2.678.579 ₺** | **259.000 ₺** (171.130 ₺ net) | 152 | %97 | Seviye 1 (Kaynak ID: b06695e5) |
| 41 | Audi A3 (2025) | A3 | 2.877.156 ₺ | 2.977.231 ₺ | **2.700.000 ₺** | 2.976.000 ₺ | **2.828.762 ₺** | **277.231 ₺** (185.591 ₺ net) | 152 | %97 | Seviye 1 (Kaynak ID: 7620d989) |
| 42 | BMW 3 Serisi (2017) | Edition | 1.576.538 ₺ | 1.668.562 ₺ | **1.510.000 ₺** | 1.667.000 ₺ | **1.568.105 ₺** | **158.562 ₺** (98.457 ₺ net) | 152 | %97 | Seviye 1 (Kaynak ID: 65792744) |
| 43 | Ferrari Roma (2022) | 3.9 V8 | - | - | - | - | - | - | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 44 | Bentley Continental GT (2021) | 6.0 W12 | - | - | - | - | - | - | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 45 | Lamborghini Urus (2023) | 4.0 V8 | - | - | - | - | - | - | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 46 | Rolls-Royce Cullinan (2022) | 6.75 V12 | - | - | - | - | - | - | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 47 | McLaren 720S (2021) | 4.0 V8 | - | - | - | - | - | - | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 48 | Bugatti Chiron (2022) | 8.0 W16 | - | - | - | - | - | - | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 49 | Pagani Huayra (2021) | 6.0 V12 | - | - | - | - | - | - | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 50 | Koenigsegg Jesko (2023) | 5.0 V8 | - | - | - | - | - | - | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |

---

## 🎯 Canlı Akış Özeti ve Doğrulama İstatistikleri

- **Toplam Test Aracı:** 50 adet
- **Başarılı Değerleme Sayısı:** 42 adet (Seviye 1: 42, Seviye 2: 0, Seviye 3: 0)
- **Yetersiz Veri Sayısı:** 8 adet (Veritabanında bulunmayan nadir/egzotik araçlar için fiyat uydurulmamış, `INSUFFICIENT_DATA` döndürülmüştür)
- **Kullanılan Gerçek İlan Hacmi:** 5.288 adet tekilleştirilmiş Sahibinden ilan snapshot'ı
- **Seviye 1 Eşleşme Başarısı:** 42 adet (Şart koşulan min. 15 Seviye 1 eşleşme şartı sağlanmıştır)

---

## 🛠️ Hesaplama Rasyonelleri

1. **Brüt Alış Rezervi:** `Kilometre Düzeltilmiş Tahmini Piyasa Değeri - Nakit Alış Teklifi`
2. **Tahmini Net Kâr:** Brüt Rezervden Pazarlık Tamponu (~%1.5), Detaylı Hazırlık/Kuaför (15.000 TL), Ekspertiz & Muayene (5.000 TL) ve Bekleme/Finansman Maliyeti düşülerek hesaplanmıştır.
3. **P35 & P50 Düzeltme Eşitliği:** P35 ve P50 değerlerine aynı kilometre ve yıl katsayısı uygulanmıştır.
