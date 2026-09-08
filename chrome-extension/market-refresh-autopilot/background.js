/**
 * ARKA PLAN SERVIS CALISANI — OTOPILOT DONGUSU.
 *
 * Dongu tektir ve basittir:
 *   kopruden TEK yonerge al -> tek sekmede gezin -> sayfayi OKU/YAKALA -> gozlemi
 *   kopruye gonder -> koprunun soyledigi kadar bekle -> tekrar.
 *
 * BURADA TOPLAYICI MANTIGI YOKTUR. Bolumleme, sayfalama karari, tekillestirme,
 * checkpoint, kategori kimligi ve tamamlanma sozlesmesi koprude yasar. Servis
 * calisani oldurulse bile kayip yoktur: durum diskteki checkpoint'tedir, RESUME
 * kaldigi yerden devam eder.
 *
 * KOPRU ISTEKLERI TEK YERDEN: `bridge-client.js` (importScripts). Baslik
 * sozlesmesi orada durur; bu dosyada `fetch` cagrisi YOKTUR.
 *
 * IKI YONERGE AILESI, AYNI DONGU:
 *   DISCOVER / COLLECT_PAGE  piyasa modu — icerik betigi DOM'dan kart/sayim okur
 *   CAPTURE_PAGE             yapi modu  — sayfanin HAM HTML'i oldugu gibi kopruye
 *                            gider; uzanti HICBIR SEY ayristirmaz, korpusu okuyan
 *                            ayristirici koprude calisir
 *   WAIT                     kopru mesgul (yeniden kurma / korpus taramasi): bekle
 *
 * ERISIM KONTROLU ATLATILMAZ: engel gorulurse dongu DURUR ve kullanicidan
 * manuel mudahale istenir. Otomatik yeniden deneme, hesap degistirme, CAPTCHA
 * cozme ve gizleme YOKTUR.
 */

importScripts('bridge-client.js');

const STORAGE_KEY = 'autopilot';
const KEEPALIVE_ALARM = 'autopilot-keepalive';

const DEFAULTS = {
  bridgeUrl: 'http://127.0.0.1:8791',
  /**
   * Yedek tempo. Kopru her yonergeyle kendi (jitter'li) beklemesini gonderir;
   * bu deger yalnizca kopru sure vermezse kullanilir.
   */
  pacingMs: 1500,
  sourceOrigin: 'https://www.sahibinden.com',
  tabId: null,
  shouldRun: false,
  lastState: 'IDLE',
  lastError: null,
};

/** Durdurmayan koprulerdeki durumlar: dongu surer. */
const CONTINUE_STATES = new Set(['RUNNING', 'REBUILDING']);

const EXTENSION_VERSION = chrome.runtime.getManifest().version;

/**
 * Yuklenen kodun kimligi. chrome://extensions -> "Service worker" konsolunda
 * gorunur: eski (onbellekten kalmis) bir servis calisani bu satiri basmaz.
 */
console.log(
  `[autopilot] service worker loaded: extension v${EXTENSION_VERSION}, ` +
    `bridge client v${NgBridgeClient.CLIENT_VERSION}, marker header ${NgBridgeClient.EXTENSION_HEADER}`,
);

let loopRunning = false;

// ------------------------------------------------------------------ depolama

async function readConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(stored[STORAGE_KEY] || {}) };
}

async function writeConfig(patch) {
  const next = { ...(await readConfig()), ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

// -------------------------------------------------------------------- kopru

/** TEK cikis noktasi: paylasilan istemci. Baslik sozlesmesi burada KURULMAZ. */
function bridgeFetch(config, path, options) {
  return NgBridgeClient.bridgeFetch(config.bridgeUrl, path, options);
}

// --------------------------------------------------------------------- sekme

/** TEK adanmis kaynak sekmesi. Yuzlerce sekme acilmaz. */
async function ensureTab(config) {
  if (config.tabId !== null) {
    try {
      const tab = await chrome.tabs.get(config.tabId);
      if (tab) return tab.id;
    } catch {
      // sekme kapanmis: yenisi acilir
    }
  }
  const tab = await chrome.tabs.create({ url: `${config.sourceOrigin}/`, active: false });
  await writeConfig({ tabId: tab.id });
  return tab.id;
}

function waitForLoad(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Navigation timed out'));
    }, timeoutMs);

    function listener(id, info) {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Kararli DOM isaretini bekler (uzun sabit uyku YERINE). Sonuc listesi ya da
 * baslik gorununce devam edilir; gorunmezse yine de devam edilir ve icerik
 * betigi engel tespitini yapar.
 */
async function waitForLandmark(tabId, attempts = 20, intervalMs = 400) {
  for (let i = 0; i < attempts; i += 1) {
    const [entry] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () =>
        document.readyState !== 'loading' &&
        Boolean(document.querySelector('tr.searchResultsItem, h1, body')),
    });
    if (entry && entry.result) return true;
    await sleep(intervalMs);
  }
  return false;
}

/**
 * KIMLIK DOGRULAMA KESINTISI — ADRESTEN, ICERIGE DOKUNMADAN.
 *
 * Kaynak oturumu dogrulamak istediginde sekmeyi BASKA BIR HOSTA tasir:
 *   https://secure.sahibinden.com/giris/iki-asamali-dogrulama?type=CHLG
 *
 * Bu sayfaya betik ENJEKTE EDILMEZ. Iki sebeple:
 *   1) Bir dogrulama sayfasi ilan sayfasi DEGILDIR; icerik olarak ayristirmak
 *      sahte kart/sayim uretme riskidir.
 *   2) Enjeksiyon zaten "Cannot access contents of url ..." ile patlar ve
 *      kuresel bir oturum engeli, hedefe ozgu genel bir HATA gibi gorunurdu.
 *
 * Karar YALNIZCA sekmenin son adresinden verilir; icerik okunmaz. Kapsam
 * dar tutulur: bilinen giris/dogrulama yollari. Bilinmeyen bir adres burada
 * eslesmezse eski davranis aynen surer (icerik betigi metinden tespit eder).
 */
const AUTH_CHALLENGE_PATTERNS = [
  { pattern: /^\/giris\/iki-asamali-dogrulama/i, kind: 'TWO_FACTOR_REQUIRED' },
  { pattern: /^\/giris\/(sms|dogrulama|two-factor)/i, kind: 'TWO_FACTOR_REQUIRED' },
  { pattern: /^\/giris(\/|$|\?)/i, kind: 'LOGIN_REQUIRED' },
  { pattern: /^\/login(\/|$|\?)/i, kind: 'LOGIN_REQUIRED' },
];

/** Oturum akisinin yasadigi hostlar. `www` normal piyasa trafigidir. */
const AUTH_HOSTS = new Set(['secure.sahibinden.com']);

/**
 * Sekmenin son adresi bir kimlik dogrulama duvari mi?
 * Eslesme yoksa `null` doner ve akis DEGISMEZ.
 */
function detectAuthChallenge(finalUrl) {
  let url;
  try {
    url = new URL(String(finalUrl || ''));
  } catch (err) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  // Giris/dogrulama yollari `www` uzerinde de gorulebilir; host tek basina karar vermez.
  const authHost = AUTH_HOSTS.has(host);
  for (const marker of AUTH_CHALLENGE_PATTERNS) {
    if (marker.pattern.test(url.pathname)) {
      return { kind: marker.kind, evidence: `${host}${url.pathname}${url.search}`.slice(0, 200) };
    }
  }
  /**
   * Bilinen dogrulama hostuna savrulduk ama yol tanimli degil: yine de
   * ilan sayfasi DEGILDIR. Ayristirmak yerine oturum engeli olarak bildir.
   */
  if (authHost) {
    return { kind: 'LOGIN_REQUIRED', evidence: `${host}${url.pathname}${url.search}`.slice(0, 200) };
  }
  return null;
}

async function navigate(tabId, url) {
  const loaded = waitForLoad(tabId);
  await chrome.tabs.update(tabId, { url });
  await loaded;

  /**
   * ONCE ADRES, SONRA ICERIK. `waitForLandmark` da enjeksiyondur; dogrulama
   * sayfasinda once o patlardi. Adres kontrolu enjeksiyondan ONCE yapilir.
   */
  const tab = await chrome.tabs.get(tabId);
  const challenge = detectAuthChallenge(tab && tab.url);
  if (challenge) return { finalUrl: (tab && tab.url) || url, challenge };

  await waitForLandmark(tabId);
  return { finalUrl: (tab && tab.url) || url, challenge: null };
}

async function observe(tabId, directive) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
  const [entry] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (op) => window.__ngAutopilotObserve(op),
    args: [{
      type: directive.type,
      captureRawHtml: directive.captureRawHtml === true,
    }],
  });
  if (!entry || !entry.result) throw new Error('Content script returned no observation');
  return entry.result;
}

// -------------------------------------------------------------------- durum

async function setState(state, error = null) {
  await writeConfig({ lastState: state, lastError: error });
  const badge = {
    RUNNING: { text: '▶', color: '#1a7f37' },
    REBUILDING: { text: '⟳', color: '#0969da' },
    PAUSED: { text: '❚❚', color: '#9a6700' },
    ACCESS_RESTRICTED: { text: '!', color: '#b42318' },
    DEADLINE_REACHED: { text: '⏱', color: '#9a6700' },
    COMPLETE: { text: '✓', color: '#1a7f37' },
    SMOKE_LIMIT_REACHED: { text: '◐', color: '#9a6700' },
    INCOMPLETE: { text: '◐', color: '#9a6700' },
    ERROR: { text: '!', color: '#b42318' },
    IDLE: { text: '', color: '#57606a' },
  }[state] || { text: '', color: '#57606a' };

  await chrome.action.setBadgeText({ text: badge.text });
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });
}

/**
 * GECICI TESHIS — "PARSE_ERROR page reported N row failure(s)".
 *
 * Kopru, kimliksiz satir sayaci sifirdan buyukse sayfayi REDDEDER (fail
 * closed; filigran ilerlemez). Hangi satirin neye benzedigi bugune kadar
 * gorunmuyordu: icerik betigi artik o satirlari `ignoredOrFailedRows`
 * icinde tasiyor ve burada SERVIS CALISANI KONSOLUNA basiliyor.
 *
 * Bu yalnizca gunluktur: hata BASTIRILMAZ, yeniden denenmez, sayac
 * semantigi degistirilmez. Kayit gorulup satirin ne oldugu kanitlanana
 * kadar kural aynen kalir.
 */
function logIgnoredOrFailedRows(directive, observation, err) {
  const failures = Number(observation && observation.parseFailures) || 0;
  if (failures <= 0) return;

  const rows =
    observation && Array.isArray(observation.ignoredOrFailedRows)
      ? observation.ignoredOrFailedRows
      : [];
  console.error(
    `[autopilot] DIAGNOSTIC page-batch rejected: parseFailures=${failures} ` +
      `target=${directive.targetId || directive.nodePath || '?'} page=${directive.page} ` +
      `url=${(observation && observation.url) || '?'} -> ${String((err && err.message) || err)}`,
  );
  if (rows.length === 0) {
    console.error(
      '[autopilot] DIAGNOSTIC no row records in the observation. ' +
        'content-script.js is the OLD build: reload the extension in chrome://extensions and rerun.',
    );
    return;
  }
  for (const row of rows) {
    console.error(`[autopilot] DIAGNOSTIC ignored row #${row.index}`, {
      className: row.className,
      classifiedTitleText: row.classifiedTitleText,
      classifiedTitleHref: row.classifiedTitleHref,
      priceText: row.priceText,
      listingDateText: row.listingDateText,
      innerTextSample: row.innerTextSample,
      /** Reklam imzasi ve ilan kaniti: satirin neden FAIL CLOSED oldugu. */
      nativeAdMarkers: row.nativeAdMarkers,
      listingEvidence: row.listingEvidence,
    });
  }
  // Kopya-yapistir icin tek satirlik JSON (panel/gunluk disina tasinabilir).
  console.error(`[autopilot] DIAGNOSTIC json ${JSON.stringify(rows)}`);
}

/**
 * Koprunun bir gonderim sonrasi bildirdigi durum kosuyu durdurdu mu.
 * Durdurduysa dongu biter; sebep panelde gorunur. Sessiz yeniden deneme YOK.
 */
async function stopIfHalted(payload) {
  const status = payload && payload.status;
  if (!status || !status.state || CONTINUE_STATES.has(status.state)) return false;
  await writeConfig({ shouldRun: false });
  await setState(status.state, status.pauseReason || status.lastError || null);
  return true;
}

// --------------------------------------------------------------------- dongu

async function runLoop() {
  if (loopRunning) return;
  loopRunning = true;
  try {
    for (;;) {
      const config = await readConfig();
      if (!config.shouldRun) return;

      const directive = await bridgeFetch(config, '/autopilot/next');

      if (directive.type === 'HALT') {
        await writeConfig({ shouldRun: false });
        await setState(directive.state, directive.reason || null);
        return;
      }

      if (directive.type === 'WAIT') {
        // Kopru mesgul (yeniden kurma / korpus taramasi). Gezinme YOK, sadece bekle.
        await setState('RUNNING');
        await sleep(Number(directive.delayMs) || config.pacingMs);
        continue;
      }

      const tabId = await ensureTab(config);
      const nav = await navigate(tabId, directive.url);

      /**
       * OTURUM DUVARI: sayfa OKUNMADAN once bildirilir ve dongu DURUR.
       * Icerik betigi enjekte EDILMEZ; dogrulama sayfasi ilan icerigi gibi
       * ayristirilmaz. Filigran ilerlemez, hedef IN_PROGRESS -> INCOMPLETE
       * olarak kopruye yazilir ve ayni run-id ile RESUME edilebilir.
       */
      if (nav.challenge) {
        await bridgeFetch(config, '/autopilot/access-restricted', {
          method: 'POST',
          body: {
            runId: directive.runId,
            nodePath: directive.nodePath || directive.targetKey || null,
            kind: nav.challenge.kind,
            evidence: `${nav.challenge.kind} at ${nav.challenge.evidence}`,
          },
        });
        await writeConfig({ shouldRun: false });
        await setState(
          'ACCESS_RESTRICTED',
          nav.challenge.kind === 'TWO_FACTOR_REQUIRED'
            ? '2 Asamali Dogrulama gerekiyor: Chrome uzerinde elle tamamlayin, sonra RESUME.'
            : 'Oturum gerekiyor: Chrome uzerinde elle giris yapin, sonra RESUME.',
        );
        return;
      }

      const observation = await observe(tabId, directive);

      if (observation.accessRestricted) {
        // ATLATMA YOK: kopruye bildir, dur, kullaniciyi cagir.
        await bridgeFetch(config, '/autopilot/access-restricted', {
          method: 'POST',
          body: {
            runId: directive.runId,
            nodePath: directive.nodePath || directive.targetKey || null,
            kind: observation.accessRestricted.kind,
            evidence: observation.accessRestricted.evidence,
          },
        });
        await writeConfig({ shouldRun: false });
        await setState('ACCESS_RESTRICTED', 'Manuel müdahale gerekiyor: oturumu/erişimi elle düzeltin, sonra RESUME.');
        return;
      }

      let payload;
      if (directive.type === 'CAPTURE_PAGE') {
        /**
         * YAPI MODU: ham HTML, dokunulmadan. Kimlik (breadcrumb), menu ve
         * satirlar koprude okunur; uzanti ne "cocuk", ne "yaprak" bilir.
         */
        payload = await bridgeFetch(config, '/autopilot/page-capture', {
          method: 'POST',
          body: {
            runId: directive.runId,
            targetKey: directive.targetKey,
            finalUrl: observation.url,
            title: observation.title,
            html: observation.html,
          },
        });
      } else if (directive.type === 'DISCOVER') {
        payload = await bridgeFetch(config, '/autopilot/discovery', {
          method: 'POST',
          body: {
            runId: directive.runId,
            nodePath: directive.nodePath,
            // Ham metin: sayiyi kopru cozer, uzanti ayristirmaz.
            countText: observation.countText,
            children: observation.children,
            childStructure: observation.childStructure,
          },
        });
      } else {
        /**
         * Kaynagin kendi reklam yuvasi: ilan degildir, ayristirma hatasi da
         * degildir. Gorunur kilinir ama sayfayi REDDETTIRMEZ; kart sayisi,
         * yeni-ilan sayaci ve sinir karari bundan etkilenmez.
         */
        const ignoredAds = Number(observation.ignoredNativeAds) || 0;
        if (ignoredAds > 0) {
          console.log(
            `[autopilot] ignored ${ignoredAds} non-listing native-ad row(s) on page ${directive.page}: ` +
              `cards=${observation.cards.length} parseFailures=${observation.parseFailures}`,
          );
        }
        try {
          payload = await bridgeFetch(config, '/autopilot/page-batch', {
            method: 'POST',
            body: {
              runId: directive.runId,
              nodePath: directive.nodePath,
              page: directive.page,
              categoryText: observation.categoryText,
              pageUrl: observation.url,
              cards: observation.cards,
              hasNextPage: observation.hasNextPage,
              parseFailures: observation.parseFailures,
              rawHtml: observation.rawHtml,
              pageTitle: observation.pageTitle,
            },
          });
        } catch (err) {
          // GECICI TESHIS: once kanit basilir, sonra hata AYNEN yukselir.
          logIgnoredOrFailedRows(directive, observation, err);
          throw err;
        }
      }

      if (await stopIfHalted(payload)) return;

      await setState('RUNNING');
      // Tempo KOPRUDEN gelir (muhafazakar, jitter'li); yoksa yedek sabit tempo.
      await sleep(Number(directive.delayMs) || config.pacingMs);
    }
  } catch (err) {
    // Sessiz yeniden deneme YOK: hata gorunur kilinir, durum diskte durur.
    await writeConfig({ shouldRun: false });
    await setState('ERROR', String((err && err.message) || err));
  } finally {
    loopRunning = false;
  }
}

// --------------------------------------------------------------------- komut

/**
 * Kok kategori: kullanicinin ACIK oldugu kaynak sayfasindan alinir (piyasa
 * modu). Yapi modunda kopru bunu YOK SAYAR — kokler CLI'dan gelir — ama
 * adanmis sekme yine burada secilir/acilir.
 */
async function resolveRootFromTabs(config) {
  const tabs = await chrome.tabs.query({ url: `${config.sourceOrigin}/*` });
  const tab = tabs.find((t) => t.id === config.tabId) || tabs[0];
  if (!tab || !tab.url) {
    const created = await ensureTab(config);
    return { tabId: created, roots: [] };
  }
  const url = new URL(tab.url);
  const path = `${url.pathname.replace(/\/+$/, '')}${url.search}` || '/';
  return {
    tabId: tab.id,
    roots: [{ path, label: (tab.title || path).replace(/\s+/g, ' ').trim() }],
  };
}

async function handleCommand(message) {
  const config = await readConfig();

  switch (message.op) {
    case 'GET_STATE': {
      let bridgeStatus = null;
      let bridgeError = null;
      try {
        bridgeStatus = await bridgeFetch(config, '/autopilot/status');
      } catch (err) {
        bridgeError = String((err && err.message) || err);
      }
      return {
        ok: true,
        config: {
          bridgeUrl: config.bridgeUrl,
          pacingMs: config.pacingMs,
          sourceOrigin: config.sourceOrigin,
        },
        /** Panelde gorunur: yuklenen kodun surumu — eski servis calisani teshisi. */
        extensionVersion: EXTENSION_VERSION,
        clientVersion: NgBridgeClient.CLIENT_VERSION,
        /** Kopru ulasilabilir mi — panelde BAGLI / BAGLI DEGIL olarak gosterilir. */
        bridgeConnected: bridgeStatus !== null,
        shouldRun: config.shouldRun,
        lastState: config.lastState,
        lastError: config.lastError,
        bridgeStatus,
        bridgeError,
      };
    }

    case 'SAVE_CONFIG': {
      const patch = {};
      if (typeof message.bridgeUrl === 'string' && message.bridgeUrl.trim()) {
        NgBridgeClient.assertLoopbackBridge(message.bridgeUrl.trim());
        patch.bridgeUrl = message.bridgeUrl.trim();
      }
      if (Number.isFinite(message.pacingMs) && message.pacingMs >= 500) {
        patch.pacingMs = Math.floor(message.pacingMs);
      }
      await writeConfig(patch);
      return { ok: true };
    }

    case 'START': {
      const { tabId, roots } = await resolveRootFromTabs(config);
      await writeConfig({ tabId });
      await bridgeFetch(config, '/autopilot/start', {
        method: 'POST',
        body: {
          roots,
          ...(Number.isFinite(message.deadlineMs) ? { deadlineMs: message.deadlineMs } : {}),
        },
      });
      await writeConfig({ shouldRun: true });
      await setState('RUNNING');
      runLoop();
      return { ok: true, roots };
    }

    case 'RESUME': {
      await bridgeFetch(config, '/autopilot/resume', { method: 'POST' });
      await writeConfig({ shouldRun: true });
      await setState('RUNNING');
      runLoop();
      return { ok: true };
    }

    case 'PAUSE': {
      await writeConfig({ shouldRun: false });
      await bridgeFetch(config, '/autopilot/pause', { method: 'POST' });
      await setState('PAUSED');
      return { ok: true };
    }

    case 'STOP': {
      await writeConfig({ shouldRun: false });
      await bridgeFetch(config, '/autopilot/stop', { method: 'POST' });
      await setState('IDLE');
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown op "${message.op}"` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleCommand(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
  return true; // asenkron yanit
});

/**
 * Servis calisani MV3'te oldurulebilir. Alarm, kosu devam etmesi gerekiyorken
 * donguyu yeniden ayaga kaldirir; ilerleme zaten koprudeki checkpoint'tedir.
 */
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  const config = await readConfig();
  if (config.shouldRun && !loopRunning) runLoop();
});

chrome.runtime.onStartup.addListener(async () => {
  const config = await readConfig();
  if (config.shouldRun) runLoop();
});
