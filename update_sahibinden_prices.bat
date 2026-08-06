@echo off
title NakitGaraj - Sahibinden Araç Fiyat Güncelleme Motoru
chcp 65001 > nul
cls

echo ===============================================================
echo   NAKİTGARAJ - SAHİBİNDEN ARAÇ MODEL VE FİYAT GÜNCELLEME MOTORU
echo ===============================================================
echo.
echo [1/2] Veritabanı Bağlantısı Kuruluyor...
echo [2/2] Sahibinden Piyasa Araştırması ve Modellere Fiyat Basımı...
echo.

cd /d "%~dp0backend"
call npx ts-node src/scripts/run_sahibinden_recalibration.ts

echo.
echo ===============================================================
echo   GÜNCELLEME İŞLEMİ BAŞARIYLA TAMAMLANDI!
echo   Pencereyi kapatmak için bir tuşa basın.
echo ===============================================================
pause > nul
