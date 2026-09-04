/**
 * UZANTI YUZEYI — YAPI MODU SOZLESMELERI.
 *
 * Uzanti dosyalari duz tarayici JS'idir; burada METIN olarak okunur ve su
 * yuzey kilitlenir:
 *   1) CAPTURE_PAGE yonergesinde uzanti sayfanin HAM outerHTML'ini gonderir ve
 *      HICBIR SEY ayristirmaz (breadcrumb/menu okuma o dalda YOKTUR).
 *   2) WAIT yonergesinde gezinmez, bekler.
 *   3) Tempo koprunun verdigi delayMs'ten gelir.
 *   4) Guvenlik: engel raporu ve "atlatma yok" davranisi korunur.
 */
import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_DIR = path.resolve(
  __dirname,
  '../../../../chrome-extension/market-refresh-autopilot',
);
const read = (file: string) =>
  fs.readFileSync(path.join(EXTENSION_DIR, file), 'utf-8');

describe('EXTENSION CAPTURES RAW HTML FOR STRUCTURE MODE', () => {
  it('handles CAPTURE_PAGE by posting the untouched page to /autopilot/page-capture', () => {
    const background = read('background.js');
    expect(background).toMatch(/directive\.type === 'CAPTURE_PAGE'/);
    expect(background).toContain("'/autopilot/page-capture'");
    expect(background).toMatch(/html:\s*observation\.html/);
    expect(background).toMatch(/targetKey:\s*directive\.targetKey/);
    expect(background).toMatch(/finalUrl:\s*observation\.url/);
  });

  it('serializes the live DOM in the content script without reading categories or cards', () => {
    const script = read('content-script.js');
    const captureAt = script.indexOf("op.type === 'CAPTURE_PAGE'");
    const discoverAt = script.indexOf("op.type === 'DISCOVER'");
    expect(captureAt).toBeGreaterThan(0);
    // Yakalama dali, piyasa modunun DOM okuyucularindan ONCE gelir ve doner.
    expect(captureAt).toBeLessThan(discoverAt);
    const branch = script.slice(captureAt, discoverAt);
    expect(branch).toContain('document.documentElement.outerHTML');
    expect(branch).toMatch(/return \{/);
    expect(branch).not.toMatch(
      /readChildCategories\(|readCards\(|readResultCountText\(/,
    );
  });

  it('waits on a WAIT directive instead of navigating', () => {
    const background = read('background.js');
    const waitAt = background.indexOf("directive.type === 'WAIT'");
    const navigateAt = background.indexOf(
      'await navigate(tabId, directive.url)',
    );
    expect(waitAt).toBeGreaterThan(0);
    expect(waitAt).toBeLessThan(navigateAt);
    expect(background).toMatch(
      /await sleep\(Number\(directive\.delayMs\) \|\| config\.pacingMs\)/,
    );
  });

  it('keeps the no-bypass access-restriction path for capture directives too', () => {
    const background = read('background.js');
    expect(background).toContain("'/autopilot/access-restricted'");
    expect(background).toMatch(
      /nodePath:\s*directive\.nodePath \|\| directive\.targetKey/,
    );
    expect(background).not.toMatch(
      /captcha.*solve|solveCaptcha|stealth|proxy/i,
    );
  });

  it('stops the loop when the bridge reports a non-running state after a capture', () => {
    const background = read('background.js');
    expect(background).toMatch(
      /CONTINUE_STATES = new Set\(\['RUNNING', 'REBUILDING'\]\)/,
    );
    expect(background).toMatch(/if \(await stopIfHalted\(payload\)\) return;/);
  });

  it('shows structure progress in the popup without a credential field', () => {
    const popup = read('popup.html');
    expect(popup).toMatch(/id="structureCard"/);
    for (const id of [
      'sPath',
      'sCompleted',
      'sQueued',
      'sSaved',
      'sPresent',
      'sNew',
      'sLast',
      'sRebuild',
      'sPause',
    ]) {
      expect(popup).toContain(`id="${id}"`);
    }
    expect(popup).not.toMatch(/type="password"/i);
    expect(read('popup.js')).toMatch(/status\.mode === 'STRUCTURE'/);
  });

  it('asks Chrome for no new permissions', () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect(manifest.permissions).toEqual([
      'storage',
      'scripting',
      'tabs',
      'alarms',
    ]);
    expect(manifest.host_permissions).toEqual([
      'https://www.sahibinden.com/*',
      'http://127.0.0.1/*',
      'http://localhost/*',
    ]);
  });
});
