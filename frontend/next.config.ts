import type { NextConfig } from "next";

/**
 * DEMO_ONLY=1 ile yapilan surum, BACKEND OLMADAN yayinlanir (Vercel).
 *
 * `/demo` kendi verisini `public/demo-market.json` icinden okur ve tek basina
 * calisir; diger tum sayfalar ise API'ye ihtiyac duyar ve backend'siz bir
 * dagitimda hata ekrani gosterir. Bu yuzden demo surumunde geri kalan her yol
 * `/demo`'ya yonlendirilir: alicilara verilen link ne olursa olsun calisan tek
 * bir ekran acilir. Bayrak kapaliyken (varsayilan) urun yonlendirmesi DEGISMEZ.
 */
const demoOnly = process.env.DEMO_ONLY === '1';

const demoRedirects = [
  '/',
  '/degerleme',
  '/konsinye',
  '/arac-secimi',
  '/admin',
  '/admin_panel/:path*',
].map((source) => ({ source, destination: '/demo', permanent: false }));

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  async redirects() {
    return demoOnly ? demoRedirects : [];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
