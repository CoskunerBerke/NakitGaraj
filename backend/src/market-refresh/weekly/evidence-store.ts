/** Durable raw evidence. Cross-target sightings are retained for leakage audit. */
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
}

function key(record: WeeklyRawObservation): string {
  return `${record.source}::${record.sourceListingId}::${record.requestedTargetId}`;
}

export class WeeklyEvidenceStore {
  private opened = false;
  private seen = new Set<string>();
  private duplicates = 0;

  constructor(private readonly filePath: string) {}

  get path(): string {
    return this.filePath;
  }

  open(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.seen.clear();
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
        this.seen.add(key(parsed));
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
      const k = key(record);
      if (this.seen.has(k)) {
        duplicates += 1;
        continue;
      }
      this.seen.add(k);
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

  readAll(): WeeklyRawObservation[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs
      .readFileSync(this.filePath, 'utf-8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as WeeklyRawObservation);
  }

  forTarget(targetId: string): WeeklyRawObservation[] {
    return this.readAll().filter(
      (record) => record.requestedTargetId === targetId,
    );
  }

  stats(): { known: number; duplicates: number } {
    return { known: this.seen.size, duplicates: this.duplicates };
  }
}
