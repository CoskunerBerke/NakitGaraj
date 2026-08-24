/**
 * TARAYICI SOYUTLAMASI.
 *
 * Runner gercek tarayiciyi TANIMAZ; yalnizca bu arayuzu tanir. Fixture surucusu
 * ile gercek Playwright surucusu ayni sozlesmeyi uygular, boylece tum guvenlik
 * davranislari (checkpoint, deadline, erisim engeli) gercek siteye hic
 * dokunmadan test edilebilir.
 */
import { CollectionJob, PageResult } from './contracts';
import { ExtractionContext, HtmlListingExtractor, ListingExtractor } from './extraction';

export interface PageRequest {
  job: CollectionJob;
  page: number;
  runId: string;
}

export interface BrowserDriver {
  open(): Promise<void>;
  fetchPage(req: PageRequest): Promise<PageResult>;
  close(): Promise<void>;
  readonly closed: boolean;
}

/** jobId -> sayfa numarasina gore sentetik HTML. */
export type FixturePages = Record<string, string[]>;

/**
 * FIXTURE SURUCUSU — AG ERISIMI YOK.
 * Sentetik HTML'i gercek cikarim koduna verir; testler boylece ayristiriciyi de
 * dogrular, sahte bir kisayolu degil.
 */
export class FixtureBrowserDriver implements BrowserDriver {
  private _closed = false;
  private opened = false;
  public readonly visits: Array<{ jobId: string; page: number }> = [];

  constructor(
    private readonly pages: FixturePages,
    private readonly extractor: ListingExtractor = new HtmlListingExtractor(),
    private readonly opts: { baseUrl?: string; onFetch?: (req: PageRequest) => void } = {},
  ) {}

  get closed(): boolean {
    return this._closed;
  }

  async open(): Promise<void> {
    this.opened = true;
    this._closed = false;
  }

  async fetchPage(req: PageRequest): Promise<PageResult> {
    if (!this.opened || this._closed) {
      throw new Error('FixtureBrowserDriver: fetchPage called on a closed driver');
    }
    this.visits.push({ jobId: req.job.id, page: req.page });
    // Enjekte edilen davranis (erisim engeli, gecikme) testin kontrolunde.
    this.opts.onFetch?.(req);

    const jobPages = this.pages[req.job.id] || [];
    const html = jobPages[req.page - 1];
    if (html === undefined) {
      return { listings: [], hasNextPage: false, pageOk: true, parseFailures: 0 };
    }

    const ctx: ExtractionContext = {
      source: req.job.source,
      runId: req.runId,
      jobId: req.job.id,
      page: req.page,
      baseUrl: this.opts.baseUrl || 'https://fixture.invalid/',
    };
    return this.extractor.extract(html, ctx);
  }

  async close(): Promise<void> {
    this._closed = true;
  }
}
