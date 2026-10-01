# NakitGaraj backend

NestJS 11 REST API (global prefix `/api`) with Prisma 5 on SQLite (`prisma/dev.db`).
See the [main README](../README.md) for the architecture, configuration and deployment.

## Commands

```bash
npm ci
cp .env.example .env            # set JWT_SECRET (openssl rand -hex 32)
npx prisma migrate deploy       # creates prisma/dev.db (or prisma db push, but do not mix the two)
ADMIN_PASSWORD='choose-one' npx prisma db seed   # catalogue, roles, admin user
npm run seed:demo               # optional: synthetic demo market data (not in production)
npm run start:dev               # http://localhost:3001/api

npm test                        # unit tests (use prisma/dev.db)
npm run test:e2e                # e2e tests (HTTP, auth, rate limit, import)
npm run build && npm run start:prod
```

`npm test` skips two pricing tests that need the scraped market database;
run them with `PRICING_REAL_DATA_TESTS=1 npm test` on a database that has it.

## Layout

| Path | Contents |
|---|---|
| `src/evaluation/` | valuation endpoint, comparable-listing matcher, pricing calculator, name normaliser |
| `src/vehicle/` | catalogue endpoints, monthly market sync cron |
| `src/consignment/`, `src/admin/`, `src/auth/`, `src/audit/`, `src/import/`, `src/telegram/`, `src/scraper/` | feature modules |
| `src/scripts/` | one-off data import / cleanup scripts (run with `npx ts-node`) |
| `prisma/` | schema, migrations, `seed.ts`, `seed-demo.ts` |
| `test/` | e2e tests |
