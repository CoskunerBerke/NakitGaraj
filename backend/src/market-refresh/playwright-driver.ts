/**
 * GERCEK TARAYICI SURUCUSU (Playwright).
 *
 * V1'DE VARSAYILAN OLARAK KAPALIDIR. Gercek site erisimi yalnizca
 * MARKET_REFRESH_ALLOW_REAL=1 ile ve acikca yapilandirilmis bir hedefle acilir.
 *
 * BU DOSYADA OLMAYAN VE OLMAYACAK OLAN SEYLER:
 *   - stealth / parmak izi sahteciligi
 *   - proxy veya IP rotasyonu
 *   - hesap veya cerez rotasyonu, kayitli oturum kullanimi
 *   - CAPTCHA cozme veya atlatma
 * Erisim engeli TESPIT edilir ve calisma GUVENLI SEKILDE DURUR.
 *
 * Tarayici binary'leri OneDrive DISINDA tutulmalidir; PLAYWRIGHT_BROWSERS_PATH
 * ayarlanmazsa Playwright zaten %LOCALAPPDATA%\ms-playwright kullanir (OneDrive
 * disi). Depo icine binary indirilmez.
 */
import { AccessChallengeError, PageResult } from './contracts';
import { BrowserDriver, PageRequest } from './browser-driver';
import { ExtractionContext, HtmlListingExtractor, ListingExtractor } from './extraction';

export interface RealTargetConfig {
  /** Ornek: 'https://ornek-kaynak.example' — depoda gercek hedef sabitlenmez. */
  baseUrl: string;
  /** job + sayfa -> mutlak liste URL'i. */
  buildPageUrl: (req: PageRequest) => string;
  source: string;
  navigationTimeoutMs?: number;
  /** Ardisik istekler arasi asgari bekleme; kaynak sunucuya saygili davranis. */
  minDelayMs?: number;
}

export const REAL_ACCESS_ENV_FLAG = 'MARKET_REFRESH_ALLOW_REAL';

export function realAccessEnabled(): boolean {
  return process.env[REAL_ACCESS_ENV_FLAG] === '1';
}

export class RealAccessDisabledError extends Error {
  constructor() {
    super(
      `Real site access is disabled. Set ${REAL_ACCESS_ENV_FLAG}=1 to enable it deliberately.`,
    );
    this.name = 'RealAccessDisabledError';
  }
}

export class PlaywrightBrowserDriver implements BrowserDriver {
  private browser: any = null;
  private context: any = null;
  private _closed = false;
  private lastRequestAt = 0;

  constructor(
    private readonly target: RealTargetConfig,
    private readonly extractor: ListingExtractor = new HtmlListingExtractor(),
  ) {}

  get closed(): boolean {
    return this._closed;
  }

  async open(): Promise<void> {
    if (!realAccessEnabled()) {
      throw new RealAccessDisabledError();
    }
    // Lazy import: fixture testleri Playwright'i hic yuklemez.
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({ headless: true });
    // Temiz baglam: kayitli profil, cerez veya kimlik ENJEKTE EDILMEZ.
    this.context = await this.browser.newContext();
    this._closed = false;
  }

  async fetchPage(req: PageRequest): Promise<PageResult> {
    if (!realAccessEnabled()) {
      throw new RealAccessDisabledError();
    }
    if (!this.context) {
      throw new Error('PlaywrightBrowserDriver: open() must be called before fetchPage()');
    }

    await this.respectMinDelay();

    const url = this.target.buildPageUrl(req);
    const page = await this.context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.target.navigationTimeoutMs ?? 30000,
      });

      const status = response ? response.status() : 0;
      if (status === 403) {
        throw new AccessChallengeError('HTTP_403', req.job.id, req.page);
      }
      if (status === 429) {
        throw new AccessChallengeError('HTTP_429', req.job.id, req.page);
      }
      if (status >= 400) {
        return { listings: [], hasNextPage: false, pageOk: false, parseFailures: 0 };
      }

      const html = await page.content();
      const ctx: ExtractionContext = {
        source: this.target.source,
        runId: req.runId,
        jobId: req.job.id,
        page: req.page,
        baseUrl: this.target.baseUrl,
      };
      // Govdedeki CAPTCHA/oturum izleri de extractor icinde engel olarak firlar.
      return this.extractor.extract(html, ctx);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async respectMinDelay(): Promise<void> {
    const minDelay = this.target.minDelayMs ?? 0;
    if (minDelay <= 0) return;
    const elapsed = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < minDelay) {
      await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  async close(): Promise<void> {
    this._closed = true;
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.context = null;
    this.browser = null;
  }
}
