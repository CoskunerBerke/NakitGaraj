# 📊 NakitGaraj 50 Araç Canlı Üretim Akışı ve Snapshot Karşılaştırma Raporu

> [!IMPORTANT]
> Bu rapor, **tam 50 test aracı** üzerinde, sahte ilanlar kullanılmadan, veritabanındaki **55.881 adet gerçek Sahibinden ilanından üretilmiş 5.288 adet aggregate snapshot verisi** ve canlı `EmsalMatcherService` / `RobustPricingCalculator` üretim akışı ile oluşturulmuştur.

## 📈 50 Araç Gerçek Karşılaştırma Tablosu

| # | Araç & Model Yılı | Paket / Versiyon | Düzeltilmiş P35 Fiyatı | Kilometre Düzeltilmiş Tahmini Piyasa Değeri | Yeni Nakit Alış Teklifi | Yeni Konsinye İlan Fiyatı | Müşteriye Kalan Konsinye Net | Brüt Alış Rezervi (Tahmini Net Kâr) | Snapshot Emsal Sayısı | Hesaplayıcı Emsal Sayısı | API Emsal Sayısı | Güven Puanı | Eşleşme Seviyesi & Kaynak ID |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | BMW 5 Serisi (2016) | Executive | 2.086.711 ₺ | 2.229.486 ₺ | **2.080.000 ₺** | 2.295.000 ₺ | **2.180.575 ₺** | **149.486 ₺** (74.261 ₺ net) | 456 | 456 | 456 | %99 | Seviye 1 (Kaynak ID: ae03fc3c) |
| 2 | BMW 3 Serisi (2020) | First | 2.678.384 ₺ | 2.779.455 ₺ | **2.620.000 ₺** | 2.848.000 ₺ | **2.707.095 ₺** | **159.455 ₺** (70.535 ₺ net) | 332 | 332 | 332 | %99 | Seviye 1 (Kaynak ID: 7e30f35f) |
| 3 | Audi A3 (2012) | Standart | 965.465 ₺ | 1.035.193 ₺ | **950.000 ₺** | 1.059.000 ₺ | **993.115 ₺** | **85.193 ₺** (39.808 ₺ net) | 326 | 326 | 326 | %99 | Seviye 1 (Kaynak ID: d2fa8a6b) |
| 4 | BMW 3 Serisi (2016) | 40th | 1.846.671 ₺ | 1.957.789 ₺ | **1.830.000 ₺** | 2.015.000 ₺ | **1.904.775 ₺** | **127.789 ₺** (59.264 ₺ net) | 317 | 317 | 317 | %99 | Seviye 1 (Kaynak ID: 585113aa) |
| 5 | BMW 3 Serisi (2014) | M | 1.412.191 ₺ | 1.513.063 ₺ | **1.410.000 ₺** | 1.557.000 ₺ | **1.453.645 ₺** | **103.063 ₺** (45.608 ₺ net) | 285 | 285 | 285 | %99 | Seviye 1 (Kaynak ID: cf80c09b) |
| 6 | Audi A4 (2016) | 1.4 | 1.803.115 ₺ | 1.893.804 ₺ | **1.770.000 ₺** | 1.917.000 ₺ | **1.808.245 ₺** | **123.804 ₺** (57.349 ₺ net) | 272 | 272 | 272 | %99 | Seviye 1 (Kaynak ID: 0f7b9818) |
| 7 | BMW 3 Serisi (2016) | Sport | 1.683.990 ₺ | 1.776.338 ₺ | **1.660.000 ₺** | 1.825.000 ₺ | **1.717.625 ₺** | **116.338 ₺** (52.363 ₺ net) | 272 | 272 | 272 | %99 | Seviye 1 (Kaynak ID: 4a02f65c) |
| 8 | BMW 5 Serisi (2011) | M | 1.500.015 ₺ | 1.577.602 ₺ | **1.470.000 ₺** | 1.621.000 ₺ | **1.516.685 ₺** | **107.602 ₺** (48.587 ₺ net) | 268 | 268 | 268 | %99 | Seviye 1 (Kaynak ID: 6872c784) |
| 9 | BMW 3 Serisi (2015) | Sport | 1.648.900 ₺ | 1.732.500 ₺ | **1.610.000 ₺** | 1.783.000 ₺ | **1.676.255 ₺** | **122.500 ₺** (59.655 ₺ net) | 263 | 263 | 263 | %99 | Seviye 1 (Kaynak ID: 59818693) |
| 10 | Audi A3 (2016) | Standart | 1.324.666 ₺ | 1.390.899 ₺ | **1.300.000 ₺** | 1.423.000 ₺ | **1.338.581 ₺** | **90.899 ₺** (36.554 ₺ net) | 261 | 261 | 261 | %99 | Seviye 1 (Kaynak ID: a0d4f033) |
| 11 | Citroen C3 (2020) | 1.2 | 1.044.100 ₺ | 1.140.559 ₺ | **1.040.000 ₺** | 1.158.000 ₺ | **1.089.302 ₺** | **100.559 ₺** (52.789 ₺ net) | 173 | 173 | 173 | %99 | Seviye 1 (Kaynak ID: 0a7b4196) |
| 12 | Citroen C4 (2008) | SX | 412.500 ₺ | 451.000 ₺ | **385.000 ₺** | 463.000 ₺ | **406.055 ₺** | **66.000 ₺** (35.205 ₺ net) | 165 | 165 | 165 | %98 | Seviye 1 (Kaynak ID: c7b6ceee) |
| 13 | Citroen C-Elysée (2019) | 1.5 | 658.224 ₺ | 681.121 ₺ | **615.000 ₺** | 696.000 ₺ | **635.560 ₺** | **66.121 ₺** (29.531 ₺ net) | 405 | 405 | 405 | %78 | Seviye 3 (Kaynak ID: 3c1500a0) |
| 14 | Chevrolet Aveo (2012) | 1.3 | 480.003 ₺ | 522.669 ₺ | **455.000 ₺** | 536.000 ₺ | **477.960 ₺** | **67.669 ₺** (35.079 ₺ net) | 176 | 176 | 176 | %99 | Seviye 1 (Kaynak ID: 87801f92) |
| 15 | Chevrolet Cruze (2012) | LT | 576.159 ₺ | 608.399 ₺ | **540.000 ₺** | 625.000 ₺ | **565.625 ₺** | **68.399 ₺** (33.624 ₺ net) | 142 | 142 | 142 | %96 | Seviye 1 (Kaynak ID: acaffbd7) |
| 16 | Chevrolet Aveo (2012) | 1.4 | 566.500 ₺ | 605.000 ₺ | **540.000 ₺** | 622.000 ₺ | **562.670 ₺** | **65.000 ₺** (30.270 ₺ net) | 138 | 138 | 138 | %96 | Seviye 1 (Kaynak ID: a503ab01) |
| 17 | Dacia Logan (2005) | 1.4 | 265.673 ₺ | 279.112 ₺ | **210.000 ₺** | 286.000 ₺ | **231.710 ₺** | **69.112 ₺** (42.722 ₺ net) | 28 | 28 | 28 | %79 | Seviye 2 (Kaynak ID: f91fd251) |
| 18 | Dacia Lodgy (2016) | 1.5 | 611.830 ₺ | 692.070 ₺ | **610.000 ₺** | 701.000 ₺ | **640.485 ₺** | **82.070 ₺** (45.455 ₺ net) | 49 | 49 | 49 | %89 | Seviye 1 (Kaynak ID: 31576b5d) |
| 19 | Daihatsu YRV (2004) | Standart | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 20 | Alfa Romeo Giulietta (2016) | Standart | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 21 | DS Automobiles DS (2016) | Standart | 941.423 ₺ | 975.618 ₺ | **900.000 ₺** | 997.000 ₺ | **932.045 ₺** | **75.618 ₺** (31.663 ₺ net) | 82 | 82 | 82 | %68 | Seviye 3 (Kaynak ID: 01166476) |
| 22 | Audi A6 (2023) | Standart | 5.275.845 ₺ | 5.429.077 ₺ | **5.130.000 ₺** | 5.578.000 ₺ | **5.329.500 ₺** | **299.077 ₺** (144.107 ₺ net) | 194 | 194 | 194 | %99 | Seviye 1 (Kaynak ID: 61daca22) |
| 23 | Audi A6 (2012) | 2.0 | 1.446.693 ₺ | 1.528.485 ₺ | **1.420.000 ₺** | 1.573.000 ₺ | **1.469.405 ₺** | **108.485 ₺** (50.690 ₺ net) | 233 | 233 | 233 | %99 | Seviye 1 (Kaynak ID: 86dc4ba3) |
| 24 | BMW 3 Serisi (2015) | M | 1.583.117 ₺ | 1.641.359 ₺ | **1.530.000 ₺** | 1.689.000 ₺ | **1.583.665 ₺** | **111.359 ₺** (50.724 ₺ net) | 232 | 232 | 232 | %99 | Seviye 1 (Kaynak ID: 6b2ab7d1) |
| 25 | Audi A4 (2020) | Standart | 2.774.756 ₺ | 2.928.028 ₺ | **2.760.000 ₺** | 3.007.000 ₺ | **2.858.229 ₺** | **168.028 ₺** (75.323 ₺ net) | 225 | 225 | 225 | %99 | Seviye 1 (Kaynak ID: 0af5fd54) |
| 26 | BMW 5 Serisi (2014) | Premium | 1.715.175 ₺ | 1.839.915 ₺ | **1.710.000 ₺** | 1.868.000 ₺ | **1.759.980 ₺** | **129.915 ₺** (64.795 ₺ net) | 224 | 224 | 224 | %99 | Seviye 1 (Kaynak ID: d76acd5c) |
| 27 | BMW 3 Serisi (2015) | 40th | 1.674.776 ₺ | 1.776.278 ₺ | **1.660.000 ₺** | 1.828.000 ₺ | **1.720.580 ₺** | **116.278 ₺** (52.258 ₺ net) | 222 | 222 | 222 | %99 | Seviye 1 (Kaynak ID: f715a0fe) |
| 28 | BMW 3 Serisi (2019) | First | 2.690.395 ₺ | 2.774.663 ₺ | **2.620.000 ₺** | 2.833.000 ₺ | **2.692.837 ₺** | **154.663 ₺** (65.968 ₺ net) | 221 | 221 | 221 | %99 | Seviye 1 (Kaynak ID: 116d2397) |
| 29 | Audi A3 (2015) | Standart | 1.303.320 ₺ | 1.390.572 ₺ | **1.300.000 ₺** | 1.431.000 ₺ | **1.346.106 ₺** | **90.572 ₺** (36.107 ₺ net) | 217 | 217 | 217 | %99 | Seviye 1 (Kaynak ID: c681dfe6) |
| 30 | Audi A6 (2017) | 2.0 | 2.539.485 ₺ | 2.657.243 ₺ | **2.510.000 ₺** | 2.735.000 ₺ | **2.599.686 ₺** | **147.243 ₺** (61.118 ₺ net) | 208 | 208 | 208 | %99 | Seviye 1 (Kaynak ID: 01b97c7c) |
| 31 | BMW 3 Serisi (2012) | M | 1.221.600 ₺ | 1.297.950 ₺ | **1.210.000 ₺** | 1.335.000 ₺ | **1.255.801 ₺** | **87.950 ₺** (35.825 ₺ net) | 208 | 208 | 208 | %99 | Seviye 1 (Kaynak ID: 2614a345) |
| 32 | Audi A3 (2017) | Standart | 1.463.306 ₺ | 1.548.135 ₺ | **1.440.000 ₺** | 1.593.000 ₺ | **1.489.105 ₺** | **108.135 ₺** (49.840 ₺ net) | 200 | 200 | 200 | %99 | Seviye 1 (Kaynak ID: 57933f4f) |
| 33 | Audi A4 (2018) | 1.4 | 2.025.584 ₺ | 2.171.011 ₺ | **2.020.000 ₺** | 2.220.000 ₺ | **2.106.700 ₺** | **151.011 ₺** (77.511 ₺ net) | 196 | 196 | 196 | %99 | Seviye 1 (Kaynak ID: cb07ff63) |
| 34 | Audi A3 (2023) | A3 | 2.522.669 ₺ | 2.619.499 ₺ | **2.470.000 ₺** | 2.648.000 ₺ | **2.516.990 ₺** | **149.499 ₺** (65.079 ₺ net) | 195 | 195 | 195 | %99 | Seviye 1 (Kaynak ID: 19bb3665) |
| 35 | Audi A6 (2023) | Standart | 5.237.422 ₺ | 5.389.538 ₺ | **5.090.000 ₺** | 5.538.000 ₺ | **5.291.282 ₺** | **299.538 ₺** (145.568 ₺ net) | 194 | 194 | 194 | %99 | Seviye 1 (Kaynak ID: 61daca22) |
| 36 | Audi A6 (2016) | 2.0 | 2.157.400 ₺ | 2.317.017 ₺ | **2.160.000 ₺** | 2.385.000 ₺ | **2.267.002 ₺** | **157.017 ₺** (79.642 ₺ net) | 189 | 189 | 189 | %99 | Seviye 1 (Kaynak ID: 6cdb6e43) |
| 37 | BMW 5 Serisi (2025) | M | 6.000.000 ₺ | 6.175.000 ₺ | **5.830.000 ₺** | 6.289.000 ₺ | **6.008.825 ₺** | **345.000 ₺** (172.365 ₺ net) | 188 | 188 | 188 | %99 | Seviye 1 (Kaynak ID: e1ee110c) |
| 38 | Audi A5 (2017) | 1.4 | 2.262.348 ₺ | 2.363.947 ₺ | **2.210.000 ₺** | 2.433.000 ₺ | **2.312.627 ₺** | **153.947 ₺** (75.352 ₺ net) | 183 | 183 | 183 | %99 | Seviye 1 (Kaynak ID: 4faa7adb) |
| 39 | BMW 3 Serisi (2011) | Comfort | 952.233 ₺ | 1.001.211 ₺ | **915.000 ₺** | 1.025.000 ₺ | **959.625 ₺** | **86.211 ₺** (41.686 ₺ net) | 174 | 174 | 174 | %99 | Seviye 1 (Kaynak ID: 9634e6fc) |
| 40 | Audi A6 (2011) | 2.0 | 1.069.393 ₺ | 1.170.985 ₺ | **1.070.000 ₺** | 1.205.000 ₺ | **1.133.513 ₺** | **100.985 ₺** (52.210 ₺ net) | 173 | 173 | 173 | %99 | Seviye 1 (Kaynak ID: 385d4d03) |
| 41 | Audi A3 (2020) | Standart | 1.785.481 ₺ | 1.863.111 ₺ | **1.740.000 ₺** | 1.892.000 ₺ | **1.783.620 ₺** | **123.111 ₺** (57.331 ₺ net) | 172 | 172 | 172 | %99 | Seviye 1 (Kaynak ID: c51c1b7c) |
| 42 | BMW 3 Serisi (2014) | Sport | 1.481.766 ₺ | 1.573.108 ₺ | **1.470.000 ₺** | 1.619.000 ₺ | **1.514.715 ₺** | **103.108 ₺** (44.123 ₺ net) | 164 | 164 | 164 | %98 | Seviye 1 (Kaynak ID: b70ab9c6) |
| 43 | Ferrari Roma (2022) | 3.9 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 44 | Bentley Continental GT (2021) | 6.0 W12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 45 | Lamborghini Urus (2023) | 4.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 46 | Rolls-Royce Cullinan (2022) | 6.75 V12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 47 | McLaren 720S (2021) | 4.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 48 | Bugatti Chiron (2022) | 8.0 W16 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 49 | Pagani Huayra (2021) | 6.0 V12 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |
| 50 | Koenigsegg Jesko (2023) | 5.0 V8 | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **Yeterli piyasa verisi bulunamadı** |

---

## 🎯 Canlı Akış Özeti ve Doğrulama İstatistikleri

- **Toplam Test Aracı:** 50 adet
- **Başarılı Değerleme Sayısı:** 40 adet (Seviye 1: 37, Seviye 2: 1, Seviye 3: 2)
- **Yetersiz Veri Sayısı:** 10 adet (Veritabanında bulunmayan nadir/egzotik araçlar için fiyat uydurulmamış, `INSUFFICIENT_DATA` döndürülmüştür)
- **Kullanılan Gerçek İlan Hacmi:** 55.881 adet tekilleştirilmiş Sahibinden ilanı (5.288 aggregate snapshot)
- **Emsal Sayısı Eşitliği Kontrolü:** Snapshot Emsal Sayısı = Hesaplayıcı Emsal Sayısı = API Emsal Sayısı (%100 Birebir Eşit)

---

## 🛠️ Hesaplama Rasyonelleri

1. **Brüt Alış Rezervi:** `Kilometre Düzeltilmiş Tahmini Piyasa Değeri - Nakit Alış Teklifi`
2. **Tahmini Net Kâr:** Brüt Rezervden Pazarlık Tamponu (~%1.5), Detaylı Hazırlık/Kuaför (15.000 TL), Ekspertiz & Muayene (5.000 TL) ve Bekleme/Finansman Maliyeti düşülerek hesaplanmıştır.
3. **P35 & P50 Düzeltme Eşitliği:** P35 ve P50 değerlerine aynı kilometre ve yıl katsayısı uygulanmıştır.
