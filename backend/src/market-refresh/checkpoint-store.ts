/**
 * CHECKPOINT — DAYANIKLI VE ATOMIK.
 *
 * Yazim: gecici dosya + fsync + rename. Yarim yazilmis checkpoint dosyasi
 * gorunmez; rename ayni birim icinde atomiktir.
 *
 * Bozulma SESSIZCE TOLERE EDILMEZ. Checksum tutmuyorsa CheckpointCorruptError
 * firlar ve calisma durur — yanlis bir imleci "sifirla" diye kabul etmek,
 * tamamlanmis isleri yeniden toplamak veya atlamak demektir.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CheckpointCorruptError, CollectionJob, COLLECTOR_VERSION } from './contracts';

export interface CheckpointPayload {
  version: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  jobs: CollectionJob[];
  stagingFile: string;
  /** Kaynak snapshot yolu — diff'in neye karsi kosuldugu denetlenebilir olsun. */
  snapshotPath: string | null;
}

interface Envelope<T> {
  checksum: string;
  payload: T;
}

function checksumOf(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * ATOMIK + CHECKSUM'LU JSON DOSYASI — checkpoint disiplininin tasiyicisi.
 *
 * Hem klasik toplayici checkpoint'i hem Chrome autopilot kosu durumu ayni
 * dayaniklilik garantilerine ihtiyac duyar; garanti TEK yerde tutulur ki iki
 * kopya birbirinden ayrisip biri sessizce zayiflamasin.
 */
export class AtomicChecksummedFile<T> {
  constructor(private readonly filePath: string) {}

  get path(): string {
    return this.filePath;
  }

  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  save(payload: T): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    const envelope: Envelope<T> = { checksum: checksumOf(payload), payload };
    const tmpPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;

    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(envelope, null, 2), 'utf-8');
      // Rename'den ONCE diske indir: cokme aninda bos dosya kalmasin.
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, this.filePath);
  }

  load(): T {
    if (!this.exists()) {
      throw new CheckpointCorruptError(`Checkpoint not found at ${this.filePath}`);
    }

    let envelope: Envelope<T>;
    try {
      envelope = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch (err: any) {
      throw new CheckpointCorruptError(
        `Checkpoint at ${this.filePath} is not readable JSON: ${err.message}`,
      );
    }

    if (!envelope || typeof envelope !== 'object' || !envelope.payload || !envelope.checksum) {
      throw new CheckpointCorruptError(`Checkpoint at ${this.filePath} has an invalid envelope`);
    }
    if (checksumOf(envelope.payload) !== envelope.checksum) {
      throw new CheckpointCorruptError(
        `Checkpoint at ${this.filePath} failed integrity check (checksum mismatch)`,
      );
    }
    return envelope.payload;
  }

  /** Bozuk checkpoint'i silmez — denetim icin yanina tasir. */
  quarantine(): string {
    const target = `${this.filePath}.corrupt-${Date.now()}`;
    fs.renameSync(this.filePath, target);
    return target;
  }
}

export class CheckpointStore {
  private readonly file: AtomicChecksummedFile<CheckpointPayload>;

  constructor(filePath: string) {
    this.file = new AtomicChecksummedFile<CheckpointPayload>(filePath);
  }

  get path(): string {
    return this.file.path;
  }

  exists(): boolean {
    return this.file.exists();
  }

  save(payload: CheckpointPayload): void {
    this.file.save(payload);
  }

  load(): CheckpointPayload {
    const payload = this.file.load();
    if (payload.version !== COLLECTOR_VERSION) {
      throw new CheckpointCorruptError(
        `Checkpoint version "${payload.version}" does not match collector ` +
          `"${COLLECTOR_VERSION}"`,
      );
    }
    return payload;
  }

  quarantine(): string {
    return this.file.quarantine();
  }
}
