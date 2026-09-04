/**
 * YAPISAL DALGALAR ARASINDA YENIDEN KURMA — MEVCUT BETIKLERIN AYNISI.
 *
 * Toplayici, N sayfa kaydettikten sonra durur ve su zinciri kosar:
 *
 *   hierarchy:build   -> agac (breadcrumb + menu + satir kaniti)
 *   listings:build    -> satir-seviyesi ilan atamalari (tekillestirilmis)
 *   coverage:manifest -> hangi kategori sayfalari hala eksik
 *   corpus:validate   -> KAPI: bilinmeyen bicim 0, eksik kenar 0, yanlis
 *                        ebeveyn 0, sizinti 0, yok sayilan dosya 0
 *
 * Burada ikinci bir ayristirma/kurma mantigi YOKTUR: `npm run` ile TAM OLARAK
 * kullanicinin elle kostugu betikler cagrilir. Kapi duserse toplayici DURUR
 * (yeni bir kayit bicimi binlerce sayfaya yayilmadan once ayristirici duzeltilir).
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface RebuildStepResult {
  name: string;
  exitCode: number | null;
  seconds: number;
  logFile: string;
}

export interface RebuildResult {
  ok: boolean;
  gate: 'PASS' | 'FAIL';
  steps: RebuildStepResult[];
  startedAt: string;
  finishedAt: string;
  /** Kapi dustuyse insan-okur ozet (dogrulama gunlugunun son satirlari). */
  detail: string | null;
}

export interface RebuildRunner {
  run(): Promise<RebuildResult>;
}

/** Sira onemli: agac -> atama -> kapsama -> kapi. */
export const DEFAULT_REBUILD_STEPS = [
  'hierarchy:build',
  'listings:build',
  'coverage:manifest',
  'corpus:validate',
];

export interface NpmRebuildRunnerOptions {
  /** backend paket koku (package.json'in bulundugu dizin). */
  cwd: string;
  /** Adim gunlukleri buraya yazilir. */
  logDir: string;
  steps?: string[];
  log?: (line: string) => void;
  /** Hangi adimin KAPI oldugu (varsayilan: corpus:validate). */
  gateStep?: string;
}

export class NpmRebuildRunner implements RebuildRunner {
  private readonly steps: string[];
  private readonly gateStep: string;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: NpmRebuildRunnerOptions) {
    this.steps = opts.steps ?? DEFAULT_REBUILD_STEPS;
    this.gateStep = opts.gateStep ?? 'corpus:validate';
    this.log = opts.log || (() => undefined);
  }

  async run(): Promise<RebuildResult> {
    const startedAt = new Date().toISOString();
    fs.mkdirSync(this.opts.logDir, { recursive: true });
    const stamp = startedAt.replace(/[:.]/g, '-');
    const results: RebuildStepResult[] = [];
    let ok = true;
    let gate: 'PASS' | 'FAIL' = 'PASS';
    let detail: string | null = null;

    for (const step of this.steps) {
      const logFile = path.join(
        this.opts.logDir,
        `${stamp}.${step.replace(/[^a-z0-9]+/gi, '-')}.log`,
      );
      this.log(`rebuild: ${step} ...`);
      const t0 = Date.now();
      const exitCode = await runNpmScript(step, this.opts.cwd, logFile);
      const seconds = Math.round((Date.now() - t0) / 1000);
      results.push({ name: step, exitCode, seconds, logFile });
      this.log(`rebuild: ${step} -> exit ${exitCode} (${seconds}s)`);
      if (exitCode !== 0) {
        ok = false;
        if (step === this.gateStep) gate = 'FAIL';
        detail = `${step} exited with ${exitCode}. ${tailOf(logFile)}`;
        break; // sonraki adimlar bozuk girdiyle kosmasin
      }
    }
    if (!results.some((r) => r.name === this.gateStep && r.exitCode === 0)) {
      // Kapi HIC kosmadiysa (onceki adim dustu) yine FAIL'dir: sessiz gecis yok.
      gate = 'FAIL';
      ok = false;
    }
    return {
      ok,
      gate,
      steps: results,
      startedAt,
      finishedAt: new Date().toISOString(),
      detail,
    };
  }
}

function runNpmScript(
  script: string,
  cwd: string,
  logFile: string,
): Promise<number | null> {
  return new Promise((resolve) => {
    const out = fs.openSync(logFile, 'w');
    // Windows'ta npm bir .cmd dosyasidir; kabuk uzerinden cagrilir.
    const child = spawn('npm', ['run', '-s', script], {
      cwd,
      shell: true,
      stdio: ['ignore', out, out],
      env: process.env,
    });
    child.on('error', () => {
      fs.closeSync(out);
      resolve(null);
    });
    child.on('close', (code) => {
      fs.closeSync(out);
      resolve(code);
    });
  });
}

function tailOf(file: string, lines = 6): string {
  try {
    const text = fs.readFileSync(file, 'utf-8').trim().split('\n');
    return text.slice(-lines).join(' | ');
  } catch {
    return '';
  }
}
