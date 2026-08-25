/**
 * UZANTI YUZEYI SOZLESMELERI.
 *
 * Uzanti dosyalari duz tarayici JS/HTML oldugu icin jest tarafindan
 * calistirilmaz; ama iki sozlesmeleri makineyle dogrulanabilir ve ikisi de
 * kolayca sessizce geri gelebilecek turden:
 *
 *   1) Panelde JETON ALANI YOK. Donen jeton, tamamen yerel bu is akisinda
 *      yalnizca surtunme ve tekrarlanan 401 uretiyordu.
 *   2) Kopruye giden her istek sabit (gizli olmayan) uzanti isaretini tasir.
 *      Isaret, tarayiciyi on-kontrole zorlayarak web sayfasi isteklerini keser.
 *
 * Bu testler dosyalari METIN olarak okur; amaclari davranisi degil YUZEYI
 * kilitlemektir.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AUTOPILOT_EXTENSION_HEADER, AUTOPILOT_EXTENSION_MARKER } from './autopilot-bridge';

const EXTENSION_DIR = path.resolve(
  __dirname,
  '../../../../chrome-extension/market-refresh-autopilot',
);

const read = (file: string) => fs.readFileSync(path.join(EXTENSION_DIR, file), 'utf-8');

describe('EXTENSION IS TOKENLESS', () => {
  it('ships a popup with no credential field of any kind', () => {
    const popup = read('popup.html');
    expect(popup).not.toMatch(/type="password"/i);
    expect(popup).not.toMatch(/id="token"/i);
    expect(popup).not.toMatch(/jeton/i);
    expect(popup).not.toMatch(/bridge-token/i);
  });

  it('asks only for the bridge address', () => {
    const popup = read('popup.html');
    expect(popup).toMatch(/id="bridgeUrl"/);
    expect(popup).toMatch(/127\.0\.0\.1:8791/);
  });

  it('shows whether the bridge is reachable instead of whether a token is set', () => {
    expect(read('popup.html')).toMatch(/id="bridgeConnection"/);
    const popupJs = read('popup.js');
    expect(popupJs).toMatch(/BAĞLI DEĞİL/);
    expect(popupJs).not.toMatch(/token/i);
  });

  it('keeps no token in the service worker or in chrome.storage', () => {
    const background = read('background.js');
    expect(background).not.toMatch(/token/i);
    expect(background).not.toMatch(/x-autopilot-token/i);
  });

  it('never references a bridge token file anywhere in the extension', () => {
    for (const file of ['popup.html', 'popup.js', 'background.js', 'content-script.js']) {
      expect(read(file)).not.toMatch(/bridge-token/i);
    }
  });
});

describe('EXTENSION SENDS THE MARKER', () => {
  it('puts the fixed extension marker on every bridge request', () => {
    const background = read('background.js');
    expect(background).toContain(AUTOPILOT_EXTENSION_HEADER);
    expect(background).toContain(`'${AUTOPILOT_EXTENSION_MARKER}'`);
    // Tek cikis noktasi: bridgeFetch. Baslik orada set edilir.
    expect(background).toMatch(/\[EXTENSION_HEADER\]:\s*EXTENSION_MARKER/);
  });

  it('refuses to talk to anything but a loopback bridge', () => {
    const background = read('background.js');
    expect(background).toMatch(/127\.0\.0\.1/);
    expect(background).toMatch(/Bridge URL must be http:\/\/127\.0\.0\.1/);
  });
});

describe('BRIDGE SOURCE CARRIES NO TOKEN MACHINERY', () => {
  const bridgeSrc = fs.readFileSync(path.join(__dirname, 'autopilot-bridge.ts'), 'utf-8');
  const cliSrc = fs.readFileSync(path.join(__dirname, 'autopilot-cli.ts'), 'utf-8');

  it('no longer generates, stores or writes a capability token', () => {
    expect(bridgeSrc).not.toMatch(/generateCapabilityToken/);
    expect(bridgeSrc).not.toMatch(/timingSafeEqual/);
    expect(cliSrc).not.toMatch(/bridge-token\.txt/);
    expect(cliSrc).not.toMatch(/randomBytes/);
  });

  /**
   * Yorumlari CIKARARAK bak: dosyanin bas yorumu zaten "uretim JWT/admin
   * kimligi KULLANILMAZ" diyor ve ham metin taramasi o cumleyi ihlal sanardi.
   */
  it('reads no production auth header in code', () => {
    const code = bridgeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/jwt|bearer|authorization/i);
    expect(code).toContain('AUTOPILOT_EXTENSION_HEADER');
  });
});
