@echo off
title NakitGaraj Platform Runner
echo ==========================================
echo NakitGaraj Premium Platform Baslatiliyor...
echo ==========================================
echo.

echo [1/3] Veritabani Guncelleniyor ve Seed Ediliyor...
cd backend
call npx prisma db push
call npx prisma db seed
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Veritabani islemleri sirasinda bir sorun olustu!
    pause
    exit /b %errorlevel%
)
echo Veritabani basariyla hazirlandi.
echo.

echo [2/3] NestJS Backend Servisi Yeni Pencerede Baslatiliyor...
start "NakitGaraj Backend API" cmd /k "npm run start:dev"

echo.
echo [3/3] Next.js Frontend Sunucusu Yeni Pencerede Baslatiliyor...
cd ..\frontend
start "NakitGaraj Frontend App" cmd /k "npm run dev"

echo.
echo ==========================================
echo Baslatma Islemleri Tamamlandi!
echo.
echo Backend API:   http://localhost:3001/api
echo Frontend Uygulamasi: http://localhost:3000
echo Yonetim Paneli: http://localhost:3000/admin
echo.
echo Giris Bilgileri:
echo E-posta: admin@nakitgaraj.com
echo Sifre:   Admin123!
echo ==========================================
echo.
pause
