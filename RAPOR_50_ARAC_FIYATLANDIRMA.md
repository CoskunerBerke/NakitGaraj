# 📊 NakitGaraj 50 Araç Read-only Valuation Service ve Canonical Snapshot Karşılaştırma Raporu

> [!IMPORTANT]
> Bu rapor, **tam 50 test aracı** üzerinde, sahte emsal ilanlar kullanılmadan, veritabanındaki **78.931 adet benzersiz RawVehicleListing kaydı** (8.725 karantinalı kayıt ayrıştırılmıştır), **4.964 adet v2.0 süzülmüş canonical snapshot verisi** ve canlı `EvaluationService.calculateVehicleValuationPreview` API üretim akışı ile otomatik olarak oluşturulmuştur.

## 📊 Özet İstatistikler ve Doğrulama
- **Seviye 1 (Tam Eşleşen) Sayısı:** 40
- **Seviye 2 (Yıl ±1) Sayısı:** 0
- **Seviye 3 (Geniş Model) Sayısı:** 0
- **Seviye 4 (Yetersiz Veri) Sayısı:** 10
- **Toplam Eşleşme Seviyesi Toplamı:** 50 (50 ile birebir eşit: **EVET**)
- **Başarılı Nakit Teklif Sayısı:** 28
- **Manuel Değerlendirme Gereken Sayısı:** 12
- **Yetersiz Veri Durum Sayısı:** 10
- **Değerleme Durum Toplamı:** 50 (50 ile birebir eşit: **EVET**)

## 📈 50 Araç Teknik Karşılaştırma Tablosu

| # | Marka | Model | Varyant | Paket/Trim | Yıl | Gövde | Yakıt | Şanzıman | Düzeltilmiş P35 | Tahmini Piyasa Değeri (FMV) | Nakit Alış Teklifi | Eşleşme Seviyesi | Durum |
| :---: | :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| 1 | Fiat | Fiat Egea 1.3 Multijet Easy | Easy | - | 2023 | - | - | - | 931.319 ₺ | 951.319 ₺ | **875.000 ₺** | Seviye 1 | Başarılı |
| 2 | Fiat | Fiat Linea 1.3 Multijet Pop | Pop | - | 2015 | - | - | - | 574.800 ₺ | 602.800 ₺ | **535.000 ₺** | Seviye 1 | Başarılı |
| 3 | BMW | 3 Serisi | 40th Year Edition | - | 2016 | - | - | - | 1.642.500 ₺ | 1.677.500 ₺ | **1.560.000 ₺** | Seviye 1 | Başarılı |
| 4 | Citroen | C4 | Max | - | 2025 | - | - | - | 1.710.259 ₺ | 1.726.209 ₺ | **1.610.000 ₺** | Seviye 1 | Başarılı |
| 5 | Fiat | Fiat Egea 1.6 Multijet Easy | Easy | - | 2022 | - | - | - | 1.053.319 ₺ | 1.088.069 ₺ | **1.000.000 ₺** | Seviye 1 | Başarılı |
| 6 | Fiat | Fiat Egea 1.4 Fire Easy Plus | Easy Plus | - | 2023 | - | - | - | 854.200 ₺ | 874.200 ₺ | **805.000 ₺** | Seviye 1 | Başarılı |
| 7 | Fiat | Fiat Linea 1.3 Multijet Active Plus | Active Plus | - | 2012 | - | - | - | 510.500 ₺ | 555.500 ₺ | **490.000 ₺** | Seviye 1 | Başarılı |
| 8 | Chevrolet | Cruze | LS | - | 2010 | - | - | - | 505.000 ₺ | 550.000 ₺ | **485.000 ₺** | Seviye 1 | Başarılı |
| 9 | BMW | 5 Serisi | M Sport | - | 2011 | - | - | - | 1.146.200 ₺ | 1.296.300 ₺ | **1.140.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 10 | BMW | 3 Serisi | Sport Line | - | 2015 | - | - | - | 1.542.000 ₺ | 1.617.000 ₺ | **1.510.000 ₺** | Seviye 1 | Başarılı |
| 11 | Audi | A6 | 2.0 TDI | - | 2012 | - | - | - | 1.564.500 ₺ | 1.644.500 ₺ | **1.530.000 ₺** | Seviye 1 | Başarılı |
| 12 | BMW | 5 Serisi | Premium | - | 2014 | - | - | - | 1.400.740 ₺ | 1.770.740 ₺ | **1.400.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 13 | Citroen | C4 | Shine | - | 2024 | - | - | - | 1.612.362 ₺ | 1.622.362 ₺ | **1.470.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 14 | BMW | 3 Serisi | M Sport | - | 2012 | - | - | - | 1.127.400 ₺ | 1.236.400 ₺ | **1.120.000 ₺** | Seviye 1 | Başarılı |
| 15 | Audi | A3 | A3 Sedan 35 TFSI | - | 2023 | - | - | - | 2.441.875 ₺ | 2.611.875 ₺ | **2.400.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 16 | Cupra | Leon | - | - | 2023 | - | - | - | 1.907.060 ₺ | 1.962.061 ₺ | **1.830.000 ₺** | Seviye 1 | Başarılı |
| 17 | Audi | A6 | 2.0 TDI | - | 2011 | - | - | - | 1.106.500 ₺ | 1.193.500 ₺ | **1.100.000 ₺** | Seviye 1 | Başarılı |
| 18 | Audi | A6 | 2.0 TDI Quattro | - | 2016 | - | - | - | 2.041.500 ₺ | 2.106.500 ₺ | **1.960.000 ₺** | Seviye 1 | Başarılı |
| 19 | Dacia | Sandero | Stepway | - | 2017 | - | - | - | 713.275 ₺ | 753.275 ₺ | **685.000 ₺** | Seviye 1 | Başarılı |
| 20 | Chevrolet | Cruze | LS | - | 2011 | - | - | - | 497.350 ₺ | 507.350 ₺ | **440.000 ₺** | Seviye 1 | Başarılı |
| 21 | Audi | A3 | Audi A3 A3 Sportback 1.6 TDI Attraction | - | 2012 | - | - | - | 900.500 ₺ | 995.500 ₺ | **900.000 ₺** | Seviye 1 | Başarılı |
| 22 | Citroen | C4 | Shine Bold | - | 2023 | - | - | - | 1.487.375 ₺ | 1.497.375 ₺ | **1.400.000 ₺** | Seviye 1 | Başarılı |
| 23 | Dacia | Sandero | Stepway | - | 2016 | - | - | - | 733.123 ₺ | 749.123 ₺ | **680.000 ₺** | Seviye 1 | Başarılı |
| 24 | Citroen | C-Elysée | Attraction | - | 2016 | - | - | - | 504.157 ₺ | 504.157 ₺ | **435.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 25 | Citroen | C4 | SX | - | 2008 | - | - | - | 542.000 ₺ | 572.000 ₺ | **505.000 ₺** | Seviye 1 | Başarılı |
| 26 | Dacia | Sandero | Stepway | - | 2015 | - | - | - | 692.919 ₺ | 692.919 ₺ | **620.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 27 | Dacia | Logan | Ambiance | - | 2006 | - | - | - | 283.000 ₺ | 286.000 ₺ | **220.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 28 | Chevrolet | Chevrolet Kalos 1.4 | 1.4 SX | - | 2005 | - | - | - | 265.017 ₺ | 265.017 ₺ | **200.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 29 | Cupra | Leon | - | - | 2024 | - | - | - | 2.008.094 ₺ | 2.033.094 ₺ | **1.900.000 ₺** | Seviye 1 | Başarılı |
| 30 | Chevrolet | Cruze | LT Plus | - | 2012 | - | - | - | 592.925 ₺ | 748.925 ₺ | **590.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 31 | Chevrolet | Aveo | 1.4 LT | - | 2012 | - | - | - | 469.995 ₺ | 494.945 ₺ | **425.000 ₺** | Seviye 1 | Başarılı |
| 32 | Dacia | Sandero | 0.9 TCe Turbo Stepway Easy R | - | 2020 | - | - | - | 890.352 ₺ | 915.352 ₺ | **845.000 ₺** | Seviye 1 | Başarılı |
| 33 | BYD | Seal | Seal Design | - | 2025 | - | - | - | 1.963.855 ₺ | 2.012.855 ₺ | **1.880.000 ₺** | Seviye 1 | Başarılı |
| 34 | Alfa Romeo | Giulietta | Giulietta 1.4 TB MultiAir Distinctive | - | 2012 | - | - | - | 870.500 ₺ | 940.500 ₺ | **865.000 ₺** | Seviye 1 | Başarılı |
| 35 | Alfa Romeo | 156 | 156 1.6 TS Distinctive | - | 2004 | - | - | - | 367.787 ₺ | 387.787 ₺ | **320.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 36 | DS Automobiles | DS 4 | DS 4 1.5 BlueHDi Performance Line | - | 2023 | - | - | - | 1.777.725 ₺ | 1.957.725 ₺ | **1.770.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 37 | Alfa Romeo | Giulietta | Giulietta 1.6 JTD Distinctive | - | 2011 | - | - | - | 715.600 ₺ | 750.600 ₺ | **675.000 ₺** | Seviye 1 | Manuel Değerlendirme |
| 38 | BYD | Han | Han Executive | - | 2025 | - | - | - | 3.231.312 ₺ | 3.431.312 ₺ | **3.230.000 ₺** | Seviye 1 | Başarılı |
| 39 | Alfa Romeo | Giulietta | Giulietta 1.6 JTD Distinctive | - | 2014 | - | - | - | 940.129 ₺ | 1.030.129 ₺ | **940.000 ₺** | Seviye 1 | Başarılı |
| 40 | Alfa Romeo | Giulietta | Giulietta 1.6 JTD Distinctive | - | 2013 | - | - | - | 964.000 ₺ | 1.034.000 ₺ | **945.000 ₺** | Seviye 1 | Başarılı |
| 41 | Mercedes-Benz | EQE | EQE 300 Sedan | Standart | 2021 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 42 | Mercedes-Benz | C Serisi | C 180 Coupe | Style | 2013 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 43 | MG | 4 | 4 Long Range | Comfort / Style | 2006 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 44 | Peugeot | 3008 | 3008 GT | Standart | 2022 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 45 | Renault | Talisman | Talisman Sport Tourer | Joy | 2018 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 46 | Renault | Clio | 1.5 dCi | Touch | 2024 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 47 | Volkswagen | Golf | Golf GTD | GTI | 2004 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 48 | Jaguar | F-Pace | F-Pace SVR | Standart | 2012 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 49 | Volkswagen | Polo | Polo GTI | GTI | 2013 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |
| 50 | Hyundai | i30 | i30 Fastback | Comfort / Style | 2017 | - | - | - | - | - | - | Seviye 4 | INSUFFICIENT_DATA |

---

## 🎯 Canlı Akış Özeti ve Doğrulama İstatistikleri

- **Toplam Test Aracı:** 50 adet
- **Başarılı API Değerleme Sayısı:** 40 adet
- **Yetersiz Veri Sayısı:** 10 adet (Veritabanında bulunmayan nadir/egzotik araçlar için fiyat uydurulmamış, `INSUFFICIENT_DATA` döndürülmüştür)
- **Manuel Değerlendirme Gereken Araç Sayısı:** 12 adet
- **Farklı Marka Çeşitliliği:** 10 farklı marka (Fiat, BMW, Citroen, Chevrolet, Audi, Cupra, Dacia, BYD, Alfa Romeo, DS Automobiles)
- **Dinamik Veritabanı Hacmi:**
  - **RawVehicleListing Benzersiz İlan Sayısı:** 78.931 adet
  - **QuarantinedListing Karantina Kayıt Sayısı:** 8.725 adet
  - **VehicleMarketSnapshot Canlı Snapshot Sayısı:** 4.964 adet
  - **11-Alan Birebir Eşitlik Kontrolü:** Tam bağımsız doğrulama aggregatörü ile %100 Uyumlu!

---

## 🛠️ Hesaplama Rasyonelleri

1. **Brüt Alış Rezervi:** `Kilometre Düzeltilmiş Tahmini Piyasa Değeri - Nakit Alış Teklifi`
2. **P35 & P50 Düzeltme Eşitliği:** P35 ve P50 değerlerine aynı medyan kilometre (`referenceMedianMileage`) ve yıl katsayısı uygulanmıştır.
3. **Manuel Teklif Guardrail Limitleri:** Risk değerlendirmesine göre güven skoru < 70, Seviye 3 eşleşme, emsal ilan < 8 olan veya FMV >= 5M TL olup emsal ilan < 10 olan tüm araçlar otomatik olarak `MANUAL_EVALUATION_REQUIRED` durumuna çekilmiştir.
