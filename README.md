<p align="center">
  <img src="frontend/public/logo.png" alt="NakitGaraj logo" width="240" />
</p>

# NakitGaraj — Used-Car Valuation & Consignment Platform

A full-stack web platform that estimates a used car's market value from comparable listings and turns it into an instant cash offer or a consignment price, with an admin panel for the dealer's team.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?logo=jest&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-2B037A?logo=pm2&logoColor=white)

> **Status:** work in progress. The core valuation flow, admin panel and data pipeline are implemented; the repository
> also contains many one-off data scripts from development.

## Overview

NakitGaraj ("cash garage") is built for a used-car dealer model with two offers: **buy the car for cash now**, or **sell it on consignment** for the owner. A customer picks make, model, year, variant and package, adds mileage, equipment and damage details, and gets an estimated market value plus both offers. Behind it, the backend keeps a catalogue of vehicle variants and a database of market listings, filters out unreliable data, and calculates prices from the closest comparable listings. The brand settings (name, colors, contact details) come from environment variables, so the same code can be white-labelled for another dealer.

## Features

**Customer site (Next.js)**
- Landing page with animated hero, service cards and testimonials section; Turkish / English language switch and light / dark theme.
- **Valuation wizard** (`/degerleme`) — make → model → year → variant → package, mileage, equipment list and an interactive car damage schematic (original / painted / replaced parts).
- **Consignment application** (`/konsinye`) and vehicle request forms, validated with React Hook Form + Zod.

**Admin panel** (`/admin_panel/dashboard`)
- Dashboard, valuations, consignment applications (with status updates), vehicle requests.
- User management with roles and permissions, audit logs, CSV/Excel data import.
- Settings for Telegram notifications and market-price synchronisation.

**Backend (NestJS REST API, prefix `/api`)**
- **Pricing engine** — comparable-listing matcher, canonical name normalisation, robust statistics, mileage adjustment, confidence score and match level; quarantine for suspicious listings.
- Scheduled market sync and listing scraper (Playwright, optional proxies) with cron jobs.
- JWT authentication, role/permission guards, rate limiting (Throttler), input validation (class-validator).
- Telegram notifications with an auto-generated image card (`@napi-rs/canvas`).
- Optional Redis cache.

**Chrome extension** (`chrome-extension/`) — Manifest V3 helper that imports a listing page's vehicle data into the platform in one click.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Framer Motion, TanStack Query, React Hook Form, Zod, Lucide icons |
| Backend | NestJS, Prisma ORM, JWT, bcrypt, @nestjs/schedule, @nestjs/throttler, Playwright, Cheerio, jsdom, xlsx, csv-parser |
| Data | SQLite (default, `prisma/schema.prisma`), PostgreSQL and Redis via `docker-compose.yml` |
| Tests | Jest (pricing engine and normaliser specs, e2e config) |
| Ops | PM2 (`ecosystem.config.js`), Nginx (see `DEPLOYMENT.md`) |

## Project structure

```text
nakitgaraj/
├── frontend/                 # Next.js customer site + admin panel
│   └── src/
│       ├── app/              # /, /degerleme, /konsinye, /admin_panel/...
│       ├── components/       # Navbar, Footer, damage schematic, animated UI
│       ├── context/          # language + theme providers
│       └── config/site-config.ts   # white-label brand settings
├── backend/                  # NestJS API
│   ├── prisma/               # schema, migrations, seed scripts
│   └── src/
│       ├── evaluation/       # pricing engine, comparable matcher, normaliser
│       ├── vehicle/          # catalogue + market sync cron
│       ├── consignment/, admin/, auth/, audit/, import/, telegram/, scraper/
│       └── scripts/          # data import / cleanup utilities
├── chrome-extension/         # listing import helper
├── docker-compose.yml        # PostgreSQL + Redis for development
├── ecosystem.config.js       # PM2 processes (backend :3001, frontend :3000)
└── DEPLOYMENT.md             # VPS deployment guide (Turkish)
```

## Getting started

Requires Node.js 20+.

```bash
git clone https://github.com/CoskunerBerke/nakitgaraj.git
cd nakitgaraj

# Backend (http://localhost:3001/api)
cd backend
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npx prisma db seed
npm run start:dev

# Frontend (http://localhost:3000) — in a second terminal
cd frontend
npm install
npm run dev
```

On Windows, `run_project.bat` prepares the database and starts both apps. Tests: `cd backend && npm test`.

### Environment variables (names only)

- **Backend:** `PORT`, `NODE_ENV`, `JWT_SECRET`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`, `GALLERY_WHATSAPP_PHONE`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SCRAPER_PROXY`, `SCRAPER_PROXIES`
- **Frontend (branding):** `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_LEGAL_TITLE`, `NEXT_PUBLIC_TAGLINE`, `NEXT_PUBLIC_LOGO_TEXT`, `NEXT_PUBLIC_DOMAIN`, `NEXT_PUBLIC_SUPPORT_PHONE`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_ADDRESS`, `NEXT_PUBLIC_PRIMARY_COLOR`, `NEXT_PUBLIC_ACCENT_COLOR`

## Deployment

The repository includes a PM2 process file (`ecosystem.config.js`) that runs the built backend (`npm run start:prod`) and frontend (`npm run start`), and a step-by-step Linux VPS guide with PM2 and Nginx in [DEPLOYMENT.md](DEPLOYMENT.md). Set real secrets through environment variables on the server.

---

## Türkçe

**NakitGaraj**, ikinci el bir aracın piyasa değerini benzer ilanlardan (emsal) hesaplayan ve bunu **anında nakit alım teklifine** ya da **konsinye satış fiyatına** çeviren, galeri ekibi için yönetim paneli de içeren tam yığın (full-stack) bir web platformudur.

> **Durum:** geliştirme sürüyor. Temel değerleme akışı, yönetim paneli ve veri hattı hazır; depoda geliştirme sırasında yazılmış
> tek seferlik veri betikleri de bulunuyor.

### Özellikler

- **Müşteri sitesi:** animasyonlu ana sayfa, Türkçe / İngilizce dil seçimi, açık / koyu tema.
- **Değerleme sihirbazı** (`/degerleme`): marka → model → yıl → versiyon → paket, kilometre, donanım listesi ve etkileşimli hasar şeması (orijinal / boyalı / değişen parçalar).
- **Konsinye başvurusu** (`/konsinye`) ve araç talep formları.
- **Yönetim paneli:** değerlemeler, konsinye başvuruları, araç talepleri, kullanıcı / rol yönetimi, işlem kayıtları, veri içe aktarma, Telegram ve piyasa senkronizasyonu ayarları.
- **Fiyatlama motoru:** emsal ilan eşleştirme, isim normalleştirme, sağlam istatistik, kilometre düzeltmesi, güven puanı; şüpheli ilanlar karantinaya alınır.
- **Arka uç:** NestJS REST API, JWT kimlik doğrulama, rol/izin korumaları, istek sınırlama, zamanlanmış piyasa senkronizasyonu, görsel kartlı Telegram bildirimleri.
- **Chrome eklentisi:** ilan sayfasındaki araç verisini tek tıkla platforma aktarır.
- **Beyaz etiket:** marka adı, renkler ve iletişim bilgileri ortam değişkenlerinden gelir.

### Kurulum

Node.js 20+ gerekir.

```bash
git clone https://github.com/CoskunerBerke/nakitgaraj.git
cd nakitgaraj/backend
npm install && cp .env.example .env
npx prisma generate && npx prisma db push && npx prisma db seed
npm run start:dev             # http://localhost:3001/api

cd ../frontend
npm install && npm run dev    # http://localhost:3000
```

Windows'ta `run_project.bat` veritabanını hazırlayıp iki uygulamayı birlikte başlatır. Sunucuya kurulum (PM2 + Nginx) için [DEPLOYMENT.md](DEPLOYMENT.md) dosyasına bakın. Gizli anahtarları her zaman ortam değişkeniyle verin.

---

Built by [Berke Coşkuner](https://github.com/CoskunerBerke)
