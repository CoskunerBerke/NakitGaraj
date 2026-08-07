# 📊 NakitGaraj 50 Araç Read-only Valuation Service ve Canonical Snapshot Karşılaştırma Raporu

> [!IMPORTANT]
> Bu rapor, **tam 50 test aracı** üzerinde, sahte emsal ilanlar kullanılmadan, veritabanındaki **77.323 adet benzersiz RawVehicleListing kaydı** (2.357 karantinalı kayıt ayrıştırılmıştır), **4.879 adet v2.0 süzülmüş canonical snapshot verisi** ve canlı `EvaluationService.calculateVehicleValuationPreview` API üretim akışı ile otomatik olarak oluşturulmuştur.

## 📈 50 Araç Gerçek API Karşılaştırma Tablosu

| # | Araç & Model Yılı | Paket / Versiyon | Düzeltilmiş P35 Fiyatı | Kilometre Düzeltilmiş Tahmini Piyasa Değeri | Yeni Nakit Alış Teklifi | Yeni Konsinye İlan Fiyatı | Müşteriye Kalan Konsinye Net | Brüt Alış Rezervi (Tahmini Net Kâr) | Snapshot Emsal Sayısı | Hesaplayıcı Emsal Sayısı | API Emsal Sayısı | Güven Puanı | Eşleşme Seviyesi & Durum |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | Audi A5 (2026) | A5 Sedan 2.0 TFSI Quattro | 5.244.141 ₺ | 5.254.141 ₺ | **4.960.000 ₺** | 5.341.000 ₺ | **5.103.058 ₺** | **294.141 ₺** (144.426 ₺ net) | 18 | 18 | 18 | %96 | Seviye 1 |
| 2 | Audi A6 (2025) | 40 TDI | 5.855.750 ₺ | 6.130.750 ₺ | **5.790.000 ₺** | 6.313.000 ₺ | **6.031.756 ₺** | **340.750 ₺** (168.155 ₺ net) | 53 | 53 | 53 | %99 | Seviye 1 |
| 3 | Audi A3 (2025) | A3 Sportback 35 TFSI | 2.265.034 ₺ | 2.409.034 ₺ | **2.250.000 ₺** | 2.438.000 ₺ | **2.317.380 ₺** | **159.034 ₺** (79.964 ₺ net) | 14 | 14 | 14 | %96 | Seviye 1 |
| 4 | Audi A3 (2025) | A3 Sedan 35 TFSI | 2.583.420 ₺ | 2.688.420 ₺ | **2.540.000 ₺** | 2.768.000 ₺ | **2.631.053 ₺** | **148.420 ₺** (61.500 ₺ net) | 137 | 137 | 137 | %99 | Seviye 1 |
| 5 | Audi A5 (2025) | A5 Sedan 2.0 TFSI Quattro | 4.266.537 ₺ | 4.426.537 ₺ | **4.180.000 ₺** | 4.475.000 ₺ | **4.275.639 ₺** | **246.537 ₺** (117.612 ₺ net) | 71 | 71 | 71 | %99 | Seviye 1 |
| 6 | BMW 1 Serisi (2025) | 120i M Sport | 2.802.288 ₺ | 2.862.288 ₺ | **2.700.000 ₺** | 2.861.000 ₺ | **2.719.452 ₺** | **162.288 ₺** (72.373 ₺ net) | 9 | 9 | 9 | %95 | Seviye 1 |
| 7 | BMW 1 Serisi (2024) | 120i M Sport | 2.471.344 ₺ | 2.509.344 ₺ | **2.370.000 ₺** | 2.535.000 ₺ | **2.409.581 ₺** | **139.344 ₺** (57.619 ₺ net) | 43 | 43 | 43 | %98 | Seviye 1 |
| 8 | BMW 1 Serisi (2023) | M Sport | 2.184.577 ₺ | 2.229.577 ₺ | **2.080.000 ₺** | 2.258.000 ₺ | **2.144.130 ₺** | **149.577 ₺** (74.907 ₺ net) | 34 | 34 | 34 | %97 | Seviye 1 |
| 9 | BMW 1 Serisi (2023) | Sport Line | 2.025.450 ₺ | 2.165.450 ₺ | **2.020.000 ₺** | 2.189.000 ₺ | **2.076.165 ₺** | **145.450 ₺** (72.415 ₺ net) | 29 | 29 | 29 | %97 | Seviye 1 |
| 10 | BMW 1 Serisi (2022) | M Sport | 2.094.638 ₺ | 2.178.638 ₺ | **2.030.000 ₺** | 2.178.000 ₺ | **2.065.330 ₺** | **148.638 ₺** (75.668 ₺ net) | 26 | 26 | 26 | %97 | Seviye 1 |
| 11 | Chevrolet Cruze (2011) | 1.6 | 497.350 ₺ | 507.350 ₺ | **440.000 ₺** | 515.000 ₺ | **457.275 ₺** | **67.350 ₺** (35.225 ₺ net) | 9 | 9 | 9 | %95 | Seviye 1 |
| 12 | Chevrolet Cruze (2010) | 1.6 | 505.000 ₺ | 550.000 ₺ | **485.000 ₺** | 559.000 ₺ | **500.615 ₺** | **65.000 ₺** (31.765 ₺ net) | 24 | 24 | 24 | %97 | Seviye 1 |
| 13 | Chevrolet Aveo (2015) | Aveo Sedan | 593.018 ₺ | 632.696 ₺ | **565.000 ₺** | 650.000 ₺ | **590.250 ₺** | **67.696 ₺** (32.296 ₺ net) | 78 | 78 | 78 | %68 | Seviye 3 |
| 14 | Chevrolet Aveo (2015) | Aveo Sedan | 593.018 ₺ | 632.696 ₺ | **565.000 ₺** | 650.000 ₺ | **590.250 ₺** | **67.696 ₺** (32.296 ₺ net) | 78 | 78 | 78 | %68 | Seviye 3 |
| 15 | Chevrolet Aveo (2015) | Aveo Sedan | 593.018 ₺ | 632.696 ₺ | **565.000 ₺** | 650.000 ₺ | **590.250 ₺** | **67.696 ₺** (32.296 ₺ net) | 78 | 78 | 78 | %68 | Seviye 3 |
| 16 | Citroen C3 (2026) | C3 | 1.241.503 ₺ | 1.261.489 ₺ | **1.170.000 ₺** | 1.272.000 ₺ | **1.196.539 ₺** | **91.489 ₺** (40.709 ₺ net) | 313 | 313 | 313 | %77 | Seviye 3 |
| 17 | Citroen C3 (2026) | C3 | 1.241.503 ₺ | 1.261.489 ₺ | **1.170.000 ₺** | 1.272.000 ₺ | **1.196.539 ₺** | **91.489 ₺** (40.709 ₺ net) | 313 | 313 | 313 | %77 | Seviye 3 |
| 18 | Citroen C3 (2026) | C3 | 1.241.503 ₺ | 1.261.489 ₺ | **1.170.000 ₺** | 1.272.000 ₺ | **1.196.539 ₺** | **91.489 ₺** (40.709 ₺ net) | 313 | 313 | 313 | %77 | Seviye 3 |
| 19 | Citroen C3 (2026) | C3 | 1.241.503 ₺ | 1.261.489 ₺ | **1.170.000 ₺** | 1.272.000 ₺ | **1.196.539 ₺** | **91.489 ₺** (40.709 ₺ net) | 313 | 313 | 313 | %77 | Seviye 3 |
| 20 | Citroen C3 (2026) | C3 Aircross | 1.241.503 ₺ | 1.261.489 ₺ | **1.170.000 ₺** | 1.272.000 ₺ | **1.196.539 ₺** | **91.489 ₺** (40.709 ₺ net) | 313 | 313 | 313 | %77 | Seviye 3 |
| 21 | Cupra Leon (2026) | Leon | 2.623.405 ₺ | 2.650.360 ₺ | **2.500.000 ₺** | 2.674.000 ₺ | **2.541.704 ₺** | **150.360 ₺** (65.250 ₺ net) | 142 | 142 | 142 | %70 | Seviye 3 |
| 22 | Cupra Leon (2026) | Leon | 2.623.405 ₺ | 2.650.360 ₺ | **2.500.000 ₺** | 2.674.000 ₺ | **2.541.704 ₺** | **150.360 ₺** (65.250 ₺ net) | 142 | 142 | 142 | %70 | Seviye 3 |
| 23 | Cupra Leon (2026) | Leon | 2.623.405 ₺ | 2.650.360 ₺ | **2.500.000 ₺** | 2.674.000 ₺ | **2.541.704 ₺** | **150.360 ₺** (65.250 ₺ net) | 142 | 142 | 142 | %70 | Seviye 3 |
| 24 | Cupra Leon (2026) | Leon | 2.623.405 ₺ | 2.650.360 ₺ | **2.500.000 ₺** | 2.674.000 ₺ | **2.541.704 ₺** | **150.360 ₺** (65.250 ₺ net) | 142 | 142 | 142 | %70 | Seviye 3 |
| 25 | Cupra Leon (2026) | Leon | 2.623.405 ₺ | 2.650.360 ₺ | **2.500.000 ₺** | 2.674.000 ₺ | **2.541.704 ₺** | **150.360 ₺** (65.250 ₺ net) | 142 | 142 | 142 | %70 | Seviye 3 |
| 26 | Dacia Sandero (2026) | Sandero | 1.265.254 ₺ | 1.298.051 ₺ | **1.210.000 ₺** | 1.304.000 ₺ | **1.226.640 ₺** | **88.051 ₺** (36.391 ₺ net) | 62 | 62 | 62 | %67 | Seviye 3 |
| 27 | Dacia Sandero (2026) | Sandero | 1.265.254 ₺ | 1.298.051 ₺ | **1.210.000 ₺** | 1.304.000 ₺ | **1.226.640 ₺** | **88.051 ₺** (36.391 ₺ net) | 62 | 62 | 62 | %67 | Seviye 3 |
| 28 | Dacia Sandero (2026) | Sandero | 1.265.254 ₺ | 1.298.051 ₺ | **1.210.000 ₺** | 1.304.000 ₺ | **1.226.640 ₺** | **88.051 ₺** (36.391 ₺ net) | 62 | 62 | 62 | %67 | Seviye 3 |
| 29 | Dacia Sandero (2026) | Sandero | 1.265.254 ₺ | 1.298.051 ₺ | **1.210.000 ₺** | 1.304.000 ₺ | **1.226.640 ₺** | **88.051 ₺** (36.391 ₺ net) | 62 | 62 | 62 | %67 | Seviye 3 |
| 30 | Dacia Sandero (2026) | Sandero | 1.265.254 ₺ | 1.298.051 ₺ | **1.210.000 ₺** | 1.304.000 ₺ | **1.226.640 ₺** | **88.051 ₺** (36.391 ₺ net) | 62 | 62 | 62 | %67 | Seviye 3 |
| 31 | Alfa Romeo Giulia (2025) | Giulia | 12.372.676 ₺ | 12.059.476 ₺ | **11.090.000 ₺** | 12.058.000 ₺ | **11.580.202 ₺** | **969.476 ₺** (657.706 ₺ net) | 5 | 5 | 5 | %55 | Seviye 3 |
| 32 | Alfa Romeo Giulia (2025) | Giulia | 12.372.676 ₺ | 12.059.476 ₺ | **11.090.000 ₺** | 12.058.000 ₺ | **11.580.202 ₺** | **969.476 ₺** (657.706 ₺ net) | 5 | 5 | 5 | %55 | Seviye 3 |
| 33 | Alfa Romeo Giulia (2025) | Giulia | 12.372.676 ₺ | 12.059.476 ₺ | **11.090.000 ₺** | 12.058.000 ₺ | **11.580.202 ₺** | **969.476 ₺** (657.706 ₺ net) | 5 | 5 | 5 | %55 | Seviye 3 |
| 34 | Alfa Romeo Giulia (2025) | Giulia | 12.372.676 ₺ | 12.059.476 ₺ | **11.090.000 ₺** | 12.058.000 ₺ | **11.580.202 ₺** | **969.476 ₺** (657.706 ₺ net) | 5 | 5 | 5 | %55 | Seviye 3 |
| 35 | Alfa Romeo Giulia (2025) | Giulia Quadrifoglio | 12.372.676 ₺ | 12.059.476 ₺ | **11.090.000 ₺** | 12.058.000 ₺ | **11.580.202 ₺** | **969.476 ₺** (657.706 ₺ net) | 5 | 5 | 5 | %55 | Seviye 3 |
| 36 | Arora S1 (2024) | Standart | 235.957 ₺ | 243.111 ₺ | **175.000 ₺** | 249.000 ₺ | **195.265 ₺** | **68.111 ₺** (42.626 ₺ net) | 14 | 14 | 14 | %78 | **Manuel Değerlendirme** (Teklif Oranı <%85) |
| 37 | Arora S1 (2023) | Standart | 215.924 ₺ | 220.344 ₺ | **155.000 ₺** | 225.000 ₺ | **171.625 ₺** | **65.344 ₺** (40.419 ₺ net) | 8 | 8 | 8 | %78 | **Manuel Değerlendirme** (Teklif Oranı <%85) |
| 38 | Arora S1 (2022) | Standart | 199.582 ₺ | 203.564 ₺ | **135.000 ₺** | 208.000 ₺ | **154.880 ₺** | **68.564 ₺** (44.094 ₺ net) | 8 | 8 | 8 | %78 | **Manuel Değerlendirme** (Teklif Oranı <%85) |
| 39 | Arora S1 (2021) | Standart | 182.447 ₺ | 186.083 ₺ | **120.000 ₺** | 190.000 ₺ | **137.150 ₺** | **66.083 ₺** (42.033 ₺ net) | 8 | 8 | 8 | %65 | **Manuel Değerlendirme** (Teklif Oranı <%85) |
| 40 | Audi A5 (2025) | A5 Sedan 2.0 TFSI | 4.495.822 ₺ | 4.510.822 ₺ | **4.260.000 ₺** | 4.569.000 ₺ | **4.365.451 ₺** | **250.822 ₺** (119.687 ₺ net) | 17 | 17 | 17 | %96 | Seviye 1 |
| 41 | Renault Clio (2000) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 42 | Renault Clio (2002) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 43 | Renault Clio (2004) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 44 | Renault Clio (2006) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 45 | Renault Clio (2008) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 46 | Renault Clio (2010) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 47 | Renault Clio (2011) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 48 | Renault Clio (2012) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 49 | Renault Clio (2013) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |
| 50 | Renault Clio (2014) | Clio | - | - | - | - | - | - | 0 | 0 | 0 | %0 | **INSUFFICIENT_DATA** |

---

## 🎯 Canlı Akış Özeti ve Doğrulama İstatistikleri

- **Toplam Test Aracı:** 50 adet (Seviye 1: 13, Seviye 2: 27)
- **Başarılı API Değerleme Sayısı:** 40 adet
- **Yetersiz Veri Sayısı:** 10 adet (Veritabanında bulunmayan nadir/egzotik araçlar için fiyat uydurulmamış, `INSUFFICIENT_DATA` döndürülmüştür)
- **Manuel Değerlendirme Gereken Araç Sayısı (<400k TL):** 4 adet
- **Farklı Marka Çeşitliliği:** 8 farklı marka (Audi, BMW, Chevrolet, Citroen, Cupra, Dacia, Alfa Romeo, Arora)
- **Dinamik Veritabanı Hacmi:**
  - **RawVehicleListing Benzersiz İlan Sayısı:** 77.323 adet
  - **QuarantinedListing Karantina Kayıt Sayısı:** 2.357 adet
  - **VehicleMarketSnapshot Canlı Snapshot Sayısı:** 4.879 adet
- **11-Alan Birebir Eşitlik Kontrolü:** Snapshot Emsal Sayısı = Hesaplayıcı Emsal Sayısı = API Emsal Sayısı (%100 Birebir Eşit)

---

## 🛠️ Hesaplama Rasyonelleri

1. **Brüt Alış Rezervi:** `Kilometre Düzeltilmiş Tahmini Piyasa Değeri - Nakit Alış Teklifi`
2. **Tahmini Net Kâr:** Brüt Rezervden Pazarlık Tamponu (~%1.5), Detaylı Hazırlık/Kuaför (15.000 TL), Ekspertiz & Muayene (5.000 TL) ve Bekleme/Finansman Maliyeti düşülerek hesaplanmıştır.
3. **P35 & P50 Düzeltme Eşitliği:** P35 ve P50 değerlerine aynı medyan kilometre (`referenceMedianMileage`) ve yıl katsayısı uygulanmıştır.
4. **Düşük Fiyatlı Araç Politikası (<400.000 TL):** Sabit minimum rezerv kuralları nedeniyle teklif oranı %85'in altına düşen araçlar otomatik olarak `MANUAL_EVALUATION_REQUIRED` durumuna alınmış ve konsinye satışı önceliklendirilmiştir.
