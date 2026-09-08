/**
 * OTURUM/DOGRULAMA DUVARI — UZANTI YUZEYI VE KOSU KAPSAMI.
 *
 * Canli 6205 kosusunda gorulen hata:
 *   Cannot access contents of url
 *   "https://secure.sahibinden.com/giris/iki-asamali-dogrulama?type=CHLG".
 *   Extension manifest must request permission to access this host.
 *
 * Kaynak, oturumu dogrulamak icin sekmeyi BASKA BIR HOSTA tasiyor. Uzantinin
 * o hosta izni olmadigi icin `chrome.scripting.executeScript` patliyor ve
 * KURESEL bir oturum engeli, hedefe ozgu genel bir ERROR gibi gorunuyordu.
 *
 * Burada kilitlenen sozlesme:
 *   1) `secure.sahibinden.com` icin TAM host izni vardir (joker YOK).
 *   2) Dogrulama adresi ICERIGE DOKUNMADAN, enjeksiyondan ONCE taninir.
 *   3) Taninirsa dongu durur; sayfa ilan icerigi gibi AYRISTIRILMAZ.
 *   4) Engel kodlari KOSU-fataldir, hedefe ozgu degildir.
 *   5) Normal www piyasa sayfalari ETKILENMEZ.
 */
import * as fs from 'fs';
import * as path from 'path';
import { classifyFailure } from '../weekly/failure-scope';

const EXTENSION_DIR = path.resolve(
  __dirname,
  '../../../../chrome-extension/market-refresh-autopilot',
);
const read = (file: string): string =>
  fs.readFileSync(path.join(EXTENSION_DIR, file), 'utf-8');

/**
 * `background.js` duz tarayici betigidir. Tespit fonksiyonunu METIN olarak
 * cikarip degerlendiririz: davranis test edilir, kopya tutulmaz.
 */
function loadDetector(): (
  url: unknown,
) => { kind: string; evidence: string } | null {
  const src = read('background.js');
  const start = src.indexOf('const AUTH_CHALLENGE_PATTERNS');
  const end = src.indexOf('async function navigate(');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const sandbox: Record<string, unknown> = {};
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    `${src.slice(start, end)}\nreturn detectAuthChallenge;`,
  );
  const detect = factory.call(sandbox) as (
    url: unknown,
  ) => { kind: string; evidence: string } | null;
  expect(typeof detect).toBe('function');
  return detect;
}

describe('manifest host izni', () => {
  const manifest = JSON.parse(read('manifest.json')) as {
    version: string;
    host_permissions: string[];
  };

  it('secure.sahibinden.com icin TAM host izni vardir', () => {
    expect(manifest.host_permissions).toContain(
      'https://secure.sahibinden.com/*',
    );
    expect(manifest.host_permissions).toContain('https://www.sahibinden.com/*');
  });

  it('izinler GEREKSIZ genisletilmez: joker/tum-site YOKTUR', () => {
    for (const permission of manifest.host_permissions) {
      expect(permission).not.toBe('<all_urls>');
      expect(permission).not.toMatch(/^https?:\/\/\*\/\*/);
      // Alt alan adi jokeri de yok: yalnizca bilinen tam hostlar.
      expect(permission).not.toMatch(/^https:\/\/\*\.sahibinden\.com/);
    }
    expect(manifest.host_permissions).toHaveLength(4);
  });

  it('surum yukseltilir ki yuklenen kodun tazeligi panelde gorunsun', () => {
    expect(manifest.version).toBe('1.5.0');
  });
});

describe('dogrulama adresi taninir', () => {
  const detect = loadDetector();

  it('2FA adresi TWO_FACTOR_REQUIRED olarak taninir', () => {
    const hit = detect(
      'https://secure.sahibinden.com/giris/iki-asamali-dogrulama?type=CHLG',
    );
    expect(hit).toMatchObject({ kind: 'TWO_FACTOR_REQUIRED' });
    expect(hit!.evidence).toContain('secure.sahibinden.com');
    expect(hit!.evidence).toContain('iki-asamali-dogrulama');
  });

  it('giris duvari LOGIN_REQUIRED olarak taninir', () => {
    expect(detect('https://secure.sahibinden.com/giris')).toMatchObject({
      kind: 'LOGIN_REQUIRED',
    });
    expect(
      detect('https://www.sahibinden.com/giris?return=/audi'),
    ).toMatchObject({ kind: 'LOGIN_REQUIRED' });
  });

  it('bilinen dogrulama hostundaki TANIMSIZ yol da ilan sayfasi sayilmaz', () => {
    expect(
      detect('https://secure.sahibinden.com/hesabim/ayarlar'),
    ).toMatchObject({ kind: 'LOGIN_REQUIRED' });
  });

  it('NORMAL www piyasa sayfalari etkilenmez', () => {
    expect(
      detect(
        'https://www.sahibinden.com/alfa-romeo-156-2.5?sorting=date_desc&pagingSize=50',
      ),
    ).toBeNull();
    expect(
      detect('https://www.sahibinden.com/audi-a3-a3-cabrio-1.4-tfsi-ambiente'),
    ).toBeNull();
    // Yonlendirme esdegerligiyle kabul edilen adres de normaldir.
    expect(
      detect('https://www.sahibinden.com/alfa-romeo-156-2.5-2.5'),
    ).toBeNull();
  });

  it('bozuk/eksik adres akisi degistirmez', () => {
    expect(detect('not a url')).toBeNull();
    expect(detect(null)).toBeNull();
    expect(detect(undefined)).toBeNull();
  });
});

describe('dongu: engel ONCE bildirilir, sayfa ayristirilmaz', () => {
  const background = read('background.js');

  it('adres kontrolu ENJEKSIYONDAN once yapilir', () => {
    const navigateAt = background.indexOf('async function navigate(');
    const body = background.slice(navigateAt, navigateAt + 900);
    const challengeAt = body.indexOf('detectAuthChallenge(');
    const landmarkAt = body.indexOf('await waitForLandmark(');
    expect(challengeAt).toBeGreaterThan(0);
    expect(landmarkAt).toBeGreaterThan(0);
    // Dogrulama sayfasinda `waitForLandmark` (enjeksiyon) hic calismamalidir.
    expect(challengeAt).toBeLessThan(landmarkAt);
    expect(body).toMatch(/if \(challenge\) return \{/);
  });

  it('engel gorulunce icerik betigi CAGRILMAZ ve dongu durur', () => {
    const guardAt = background.indexOf('if (nav.challenge) {');
    const observeAt = background.indexOf('const observation = await observe(');
    expect(guardAt).toBeGreaterThan(0);
    expect(observeAt).toBeGreaterThan(guardAt);
    const guard = background.slice(guardAt, observeAt);
    expect(guard).toContain("'/autopilot/access-restricted'");
    expect(guard).toMatch(/shouldRun: false/);
    expect(guard).toMatch(/setState\(\s*'ACCESS_RESTRICTED'/);
    expect(guard).toMatch(/\breturn;/);
    // Sayfa okunmaz: bu dalda ayristirma/gonderim yoktur.
    expect(guard).not.toContain('page-batch');
    expect(guard).not.toContain('page-capture');
    expect(guard).not.toContain('observe(');
  });

  it('atlatma YOKTUR', () => {
    expect(background).not.toMatch(/solveCaptcha|bypass|stealth|autoLogin/i);
  });
});

describe('icerik betigi ikinci savunma', () => {
  const script = read('content-script.js');

  it('adres kontrolu ilan-satiri kontrolunden ONCE gelir', () => {
    const detectAt = script.indexOf('function detectAccessRestriction()');
    const body = script.slice(detectAt, detectAt + 400);
    const urlAt = body.indexOf('detectAuthUrlRestriction()');
    const rowAt = body.indexOf(
      "document.querySelector('tr.searchResultsItem')",
    );
    expect(urlAt).toBeGreaterThan(0);
    expect(rowAt).toBeGreaterThan(urlAt);
  });
});

describe('kosu kapsami: oturum duvarlari KOSU-fataldir', () => {
  it('TWO_FACTOR_REQUIRED ve LOGIN_REQUIRED RUN kapsamindadir', () => {
    for (const code of ['TWO_FACTOR_REQUIRED', 'LOGIN_REQUIRED']) {
      const verdict = classifyFailure(`${code} secure.sahibinden.com/giris`);
      expect(verdict).toMatchObject({ code, scope: 'RUN' });
    }
  });

  it('iki nokta eklenmis bicim kodu GIZLERDI (regresyon kilidi)', () => {
    // Eski bicim: "TWO_FACTOR_REQUIRED: ..." -> ilk sozcuk desene uymaz.
    expect(classifyFailure('TWO_FACTOR_REQUIRED: detail')).toMatchObject({
      code: 'UNKNOWN_ERROR',
      scope: 'TARGET',
    });
  });

  it('hedefe ozgu hatalar TARGET kapsaminda kalir', () => {
    expect(
      classifyFailure('VALIDATION_FAIL page is not newest-first'),
    ).toMatchObject({ scope: 'TARGET' });
    expect(classifyFailure('REDIRECT_MISMATCH final URL x')).toMatchObject({
      scope: 'TARGET',
      retryable: false,
    });
  });
});
