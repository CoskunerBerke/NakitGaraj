/**
 * YETKILI KALICI PROFIL — ELLE HAZIRLANIR, OTOMASYON GIRIS YAPMAZ.
 *
 * Kullanici gorunur bir tarayicida BIR KEZ elle giris/SMS/dogrulama yapar;
 * Playwright kalici baglami (launchPersistentContext) cerez/oturumu dogal
 * olarak yerel bir dizinde saklar. Bu dizin GITIGNORE'ludur ve ASLA commit
 * edilmez / orijinal worktree'ye kopyalanmaz.
 *
 * BU DOSYADA OLMAYAN VE OLMAYACAK OLAN:
 *   - kaynak kodda kimlik/parola
 *   - config dosyasinda kullanici adi/sifre
 *   - SMS otomasyonu, otomatik giris, CAPTCHA cozme
 *   - hesap rotasyonu, proxy, parmak izi sahteciligi, stealth
 * Erisim engeli TESPIT edilir ve GUVENLE DURULUR.
 */
import * as fs from 'fs';
import * as path from 'path';
import { detectSahibindenChallenge } from './sahibinden-extraction';
import { realAccessEnabled, REAL_ACCESS_ENV_FLAG } from './playwright-driver';

/** Profil dizini: depo icinde .local (gitignore) ya da env ile verilebilir. */
export const PROFILE_ENV_VAR = 'MARKET_REFRESH_PROFILE_DIR';

export function resolveProfileDir(): string {
  const fromEnv = process.env[PROFILE_ENV_VAR];
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());
  // backend/src/market-refresh -> repo-koku/.local/browser-profile
  return path.resolve(__dirname, '../../../.local/browser-profile');
}

export type SessionStatus = 'SESSION_USABLE' | 'LOGIN_REQUIRED' | 'ACCESS_CHALLENGE';

/**
 * Yanit govdesinden oturum durumu SINIFLANDIRMASI (saf; test edilebilir).
 * Once erisim engeli (Cloudflare/CAPTCHA) — o varsa oturum sorusu anlamsizdir.
 */
export function classifySession(html: string, opts: { loggedInMarker?: RegExp; loginMarker?: RegExp } = {}): SessionStatus {
  const challenge = detectSahibindenChallenge(html);
  if (challenge) return 'ACCESS_CHALLENGE';

  const loginMarker = opts.loginMarker ?? /giriş yap|oturum aç|üye girişi/i;
  const loggedIn = opts.loggedInMarker ?? /çıkış yap|hesabım|oturumu kapat|my account|logout/i;

  if (loggedIn.test(html)) return 'SESSION_USABLE';
  if (loginMarker.test(html)) return 'LOGIN_REQUIRED';
  // Ne acik giris cagrisi ne de oturum izi: temkinli tarafta LOGIN_REQUIRED.
  return 'LOGIN_REQUIRED';
}

async function launchPersistent(headless: boolean): Promise<any> {
  if (!realAccessEnabled()) {
    throw new Error(
      `Persistent profile actions need ${REAL_ACCESS_ENV_FLAG}=1 (deliberate real-mode).`,
    );
  }
  const dir = resolveProfileDir();
  fs.mkdirSync(dir, { recursive: true });
  const { chromium } = await import('playwright');
  // launchPersistentContext = context + kalici userDataDir. Stealth/gizleme
  // EKLENMEZ; siradan gorunur bir tarayici penceresidir.
  return chromium.launchPersistentContext(dir, {
    headless,
    viewport: { width: 1280, height: 900 },
  });
}

/**
 * SETUP: gorunur tarayici acar, kaynak anasayfaya gider, KULLANICIYA birakir.
 * Scrape YAPMAZ. Kullanici elle giris yapip pencereyi kapatinca profil dogal
 * olarak diske yazilmis olur.
 */
export async function runProfileSetup(opts: { baseUrl: string; holdMs?: number } = { baseUrl: 'https://www.sahibinden.com' }): Promise<void> {
  const ctx = await launchPersistent(false);
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(opts.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
    // Elle giris/SMS/dogrulama TAMAMEN kullaniciya birakilir. Otomasyon yok.
    const holdMs = opts.holdMs ?? 30 * 60 * 1000; // varsayilan 30 dk pencere
    // eslint-disable-next-line no-console
    console.log(`[setup] Gorunur tarayici acildi. Elle giris yapin. Bittiginde pencereyi kapatin (en fazla ${Math.round(holdMs / 60000)} dk beklenir).`);
    await page.waitForEvent('close', { timeout: holdMs }).catch(() => undefined);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/**
 * CHECK: profili acar, BENIGN bir sayfaya gider, YALNIZCA durumu siniflar,
 * temiz kapanir. Scrape YOK, bypass YOK.
 */
export async function runProfileCheck(opts: { checkUrl: string; headed?: boolean } = { checkUrl: 'https://www.sahibinden.com/hesabim' }): Promise<SessionStatus> {
  const ctx = await launchPersistent(!opts.headed);
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    const resp = await page.goto(opts.checkUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    const status = resp ? resp.status() : 0;
    if (status === 403 || status === 429) return 'ACCESS_CHALLENGE';
    await page.waitForTimeout(2500);
    const html = await page.content();
    return classifySession(html);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
