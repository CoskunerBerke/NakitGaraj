# NakitGaraj frontend

Next.js 16 (App Router) + React 19 + Tailwind CSS 4: the public valuation and
consignment site and the admin panel. See the [main README](../README.md) for
the full project documentation.

```bash
npm ci
npm run dev        # http://localhost:3000 (expects the backend on :3001)
npm run build && npm run start
```

`NEXT_PUBLIC_API_URL` (build time) sets the API base URL, e.g. `/api` behind the
Nginx proxy from [DEPLOYMENT.md](../DEPLOYMENT.md). Without it the browser calls
`http://<current host>:3001/api`, a cross-origin request that a production
backend only allows when its `CORS_ORIGIN` lists this site.

| Route | Page |
|---|---|
| `/` | landing page |
| `/degerleme` | valuation wizard |
| `/konsinye` | consignment application |
| `/admin_panel` | admin login; `/admin_panel/dashboard/...` admin panel |
