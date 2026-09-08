/**
 * DAYANIKLI HAM KANIT — HEDEF BAZLI BELLEK ICI DIZINLE.
 *
 * Her gozlem satiri JSONL'e eklenir ve fsync'lenir; ayni kaynak ilaninin
 * FARKLI hedeflerden gorulmesi (ebeveyn/cocuk/kardes sayfalari) ayri
 * kayitlardir ve sizinti denetimi icin korunur. Ayni hedefte ayni ilanin
 * tekrar gorulmesi (sayfalama ortusmesi, tekrar kosu) yazilmaz, sayilir.
 *
 * Onceki hal `forTarget` icin dosyanin TAMAMINI her hedef bitisinde yeniden
 * okuyordu: genis bir kosuda (binlerce hedef, yuz binlerce satir) bu
 * hedef basina yuz MB'lik okumaya donusuyordu. Kayitlar artik acilista bir
 * kez okunur ve hedef bazinda bellekte tutulur; dosya yine tek dogruluk
 * kaynagidir (devam ederken yeniden okunur).
 */
import * as fs from 'fs';
import * as path from 'path';

export interface WeeklyRawObservation {
  source: string;
  sourceListingId: string;
  sourceUrl: string;
  title: string;
  modelCells: string[];
  listingDate: string;
  listingDateText: string;
  year: number | null;
  mileage: number | null;
  price: number | null;
  currency: string | null;
  location: string | null;
  capturedAt: string;
  runId: string;
  requestedTargetId: string;
  requestedTargetPath: string[];
  page: number;
  /**
   * Kaynagin VITRIN yerlesimi. Ilan GERCEKTIR ve normal dogrulamayi gecerse
   * havuza girer; yalnizca KRONOLOJI/SINIR kararlarindan disarida tutulur.
   * Eski kanit dosyalarinda alan yoktur -> `undefined` = organik (guvenli varsayilan).
   */
  isPromoted?: boolean;
}

function key(record: WeeklyRawObservation): string {
  return `${record.source}::${record.sourceListingId}::${record.requestedTargetId}`;
}

export class WeeklyEvidenceStore {
  private opened = false;
  private seen = new Set<string>();
  private byTarget = new Map<string, WeeklyRawObservation[]>();
  private total = 0;
  private duplicates = 0;

  constructor(private readonly filePath: string) {}

  get path(): string {
    return this.filePath;
  }

  open(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.seen.clear();
    this.byTarget.clear();
    this.total = 0;
    if (fs.existsSync(this.filePath)) {
      const lines = fs.readFileSync(this.filePath, 'utf-8').split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;
        let parsed: WeeklyRawObservation;
        try {
          parsed = JSON.parse(line);
        } catch {
          throw new Error(
            `Corrupt weekly evidence line ${index + 1} at ${this.filePath}`,
          );
        }
        if (!parsed.sourceListingId || !parsed.requestedTargetId) {
          throw new Error(
            `Invalid weekly evidence line ${index + 1} at ${this.filePath}`,
          );
        }
        this.index(parsed);
      }
    }
    this.opened = true;
  }

  appendMany(records: WeeklyRawObservation[]): {
    written: number;
    duplicates: number;
  } {
    if (!this.opened)
      throw new Error('WeeklyEvidenceStore.open() must be called first');
    const fresh: WeeklyRawObservation[] = [];
    let duplicates = 0;
    for (const record of records) {
      if (this.seen.has(key(record))) {
        duplicates += 1;
        continue;
      }
      this.index(record);
      fresh.push(record);
    }
    if (fresh.length > 0) {
      const fd = fs.openSync(this.filePath, 'a');
      try {
        fs.writeFileSync(
          fd,
          fresh.map((record) => JSON.stringify(record)).join('\n') + '\n',
          'utf-8',
        );
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    }
    this.duplicates += duplicates;
    return { written: fresh.length, duplicates };
  }

  /** Tum kayitlar (dosya sirasiyla). Buyuk kosularda yalnizca denetim icin. */
  readAll(): WeeklyRawObservation[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs
      .readFileSync(this.filePath, 'utf-8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as WeeklyRawObservation);
  }

  /** Bu hedeften gorulen kayitlar (ekleme sirasiyla) — bellek ici dizinden. */
  forTarget(targetId: string): WeeklyRawObservation[] {
    if (!this.opened) this.open();
    return [...(this.byTarget.get(targetId) ?? [])];
  }

  stats(): { known: number; duplicates: number; targets: number } {
    return { known: this.total, duplicates: this.duplicates, targets: this.byTarget.size };
  }

  private index(record: WeeklyRawObservation): void {
    this.seen.add(key(record));
    this.total += 1;
    const list = this.byTarget.get(record.requestedTargetId);
    if (list) list.push(record);
    else this.byTarget.set(record.requestedTargetId, [record]);
  }
}
