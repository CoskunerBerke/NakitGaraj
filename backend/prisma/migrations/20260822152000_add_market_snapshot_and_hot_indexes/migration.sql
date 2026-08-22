-- GERCEK PIYASA DEGERI ANLIK GORUNTUSU (EKLEMELI, NULLABLE)
--
-- Galeri paneli piyasa degerlerini nakit teklifden SABIT carpanlarla
-- (cash / 0.88 ; cash * 0.94 ; cash * 0.96-1.30) uretiyordu. Olculen gercek
-- nakit/piyasa orani bantlara gore 0.843-0.942 arasinda degisir; sabit carpan
-- yanlis bir "Sahibinden piyasa degeri" gosteriyordu. Fiyatlama V5 bu degerleri
-- zaten hesapliyor; artik degerleme aninda SAKLANIR.
--
-- ESKI KAYITLAR NULL KALIR ve bu DOGRU cevaptir: gecmis degerlemelerin gercek
-- piyasa referansi hicbir yerde saklanmadi; sentetik GERIYE DOLDURMA YAPILMAZ.
ALTER TABLE "VehicleEvaluation" ADD COLUMN "marketReferenceValue" REAL;
ALTER TABLE "VehicleEvaluation" ADD COLUMN "conditionAdjustedSaleValue" REAL;

-- SICAK SORGU INDEKSLERI (EKLEMELI)
--
-- Yalnizca GERCEK sorgu yuklemlerinden turetildi; sorgu metni/semantigi
-- DEGISMEDI. Olculen (tutarli DB kopyasi, EXPLAIN QUERY PLAN):
--   emsal havuzu   (rawMake|canonicalMake + year araligi)  SCAN 111.8ms -> 8.2ms
--   emsal gosterim (sourceListingId IN ...)                SCAN 109.2ms -> 0.1ms
--   gozlenen model (marka kirilimi + groupBy)              SCAN 127.5ms -> 1.0ms
--   spec arama     (manufacturerId+modelId+year)           SCAN  39.6ms -> 0.1ms
--
-- Mevcut UNIQUE(source, sourceListingId) yalniz sourceListingId sorgusu icin
-- KULLANILAMAZ: bilesik indeksin bas sutunu "source".
CREATE INDEX IF NOT EXISTS "RawVehicleListing_canonicalMake_year_idx" ON "RawVehicleListing"("canonicalMake", "year");
CREATE INDEX IF NOT EXISTS "RawVehicleListing_rawMake_year_idx" ON "RawVehicleListing"("rawMake", "year");
CREATE INDEX IF NOT EXISTS "RawVehicleListing_sourceListingId_idx" ON "RawVehicleListing"("sourceListingId");
CREATE INDEX IF NOT EXISTS "VehicleSpecification_manufacturerId_modelId_year_idx" ON "VehicleSpecification"("manufacturerId", "modelId", "year");
