-- YETERSIZ VERI LEAD'I ICIN ALANLAR (EKLEMELI, NULLABLE)
--
-- INSUFFICIENT_DATA donen degerlemeler `VehicleEvaluation` kaydi ACMAZ ve bu
-- DOGRUDUR: ortada gercek bir degerleme yoktur, fiyat alanlari zorunlu Float'tir
-- ve 0 yazmak PARA UYDURMAK olurdu.
--
-- Ancak musterinin verdigi bilgiler de HICBIR YERDE saklanmiyordu: ad, telefon
-- ve arac kimligi tamamen kayboluyordu (olculen: 1.593 hedefin 180'i, %11,3).
-- Personelin bu denemeden haberi olmuyordu.
--
-- Bu alanlar mevcut VehicleRequest ("Arac Talepleri") akisini yeniden kullanir;
-- yeni bir mimari EKLENMEZ. Yalnizca MUSTERININ BEYAN ETTIGI veri saklanir;
-- motor/paket/piyasa/nakit/guven gibi hicbir deger URETILMEZ.
--
-- ESKI KAYITLAR NULL KALIR ve bu DOGRU cevaptir: gecmis taleplerin kaynagi ve
-- musteri adi hicbir zaman saklanmadi; GERIYE DOLDURMA YAPILMAZ.
ALTER TABLE "VehicleRequest" ADD COLUMN "firstName" TEXT;
ALTER TABLE "VehicleRequest" ADD COLUMN "lastName" TEXT;
ALTER TABLE "VehicleRequest" ADD COLUMN "mileage" INTEGER;
ALTER TABLE "VehicleRequest" ADD COLUMN "source" TEXT;
