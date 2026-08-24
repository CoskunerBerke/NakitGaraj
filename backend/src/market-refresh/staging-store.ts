/**
 * STAGING — JSONL, EKLEMELI VE DEVAM ETTIRILEBILIR.
 *
 * Neden JSONL: ekleme atomik satir birimindedir, yarim satir tespit edilebilir,
 * dosya denetlenebilir ve hicbir sekilde snapshot DB'sine dokunmaz. V1'de
 * toplayici RawVehicleListing tablosuna YAZMAZ; snapshot yalnizca diff icin
 * SALT OKUNUR referanstir.
 *
 * Staging dizini Git tarafindan yok sayilir (bkz. .gitignore).
 */
import * as fs from 'fs';
import * as path from 'path';
import { RawObservedListing } from './contracts';

export type AppendResult = 'WRITTEN' | 'DUPLICATE';

function dedupeKey(record: Pick<RawObservedListing, 'source' | 'sourceListingId'>): string {
  return `${record.source}::${record.sourceListingId}`;
}

export class StagingStore {
  private readonly seen = new Set<string>();
  private opened = false;
  private writtenCount = 0;
  private duplicateCount = 0;
  /** Yeniden acilista atilan yarim/bozuk satir sayisi. */
  private skippedCorruptLines = 0;

  constructor(private readonly filePath: string) {}

  get path(): string {
    return this.filePath;
  }

  /**
   * Mevcut dosyayi okuyup tekillik kumesini kurar; resume'da ayni ilan
   * ikinci kez YAZILMAZ. Yarim yazilmis son satir sessizce atlanir ve sayilir.
   */
  open(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const lines = fs.readFileSync(this.filePath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as RawObservedListing;
          if (record && record.sourceListingId) {
            this.seen.add(dedupeKey(record));
          } else {
            this.skippedCorruptLines += 1;
          }
        } catch {
          this.skippedCorruptLines += 1;
        }
      }
    }
    this.opened = true;
  }

  append(record: RawObservedListing): AppendResult {
    this.assertOpen();
    const key = dedupeKey(record);
    if (this.seen.has(key)) {
      this.duplicateCount += 1;
      return 'DUPLICATE';
    }
    fs.appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf-8');
    this.seen.add(key);
    this.writtenCount += 1;
    return 'WRITTEN';
  }

  appendMany(records: RawObservedListing[]): { written: number; duplicates: number } {
    let written = 0;
    let duplicates = 0;
    for (const record of records) {
      if (this.append(record) === 'WRITTEN') written += 1;
      else duplicates += 1;
    }
    return { written, duplicates };
  }

  readAll(): RawObservedListing[] {
    if (!fs.existsSync(this.filePath)) return [];
    const out: RawObservedListing[] = [];
    for (const line of fs.readFileSync(this.filePath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        // Bozuk satir denetim sayaci disinda yok sayilir.
      }
    }
    return out;
  }

  stats() {
    return {
      written: this.writtenCount,
      duplicates: this.duplicateCount,
      knownKeys: this.seen.size,
      skippedCorruptLines: this.skippedCorruptLines,
    };
  }

  private assertOpen(): void {
    if (!this.opened) {
      throw new Error('StagingStore: open() must be called before writing');
    }
  }
}
