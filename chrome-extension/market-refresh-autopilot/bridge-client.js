/**
 * KOPRU ISTEMCISI — UZANTININ KOPRUYE KONUSTUGU TEK YER.
 *
 * Her kopru istegi (status / start / next / page-capture / discovery /
 * page-batch / access-restricted / resume / pause / stop) BURADAN gecer.
 * Baslik sozlesmesi tek bir fonksiyonda durur (`buildRequest`); boylece bir
 * cagri digerinden sessizce ayrisamaz.
 *
 * SOZLESME (kopru: backend/src/market-refresh/autopilot/autopilot-bridge.ts):
 *   - adres    yalnizca http://127.0.0.1:<port> ya da http://localhost:<port>
 *   - baslik   x-nakitgaraj-extension: 1   (sabit, GIZLI DEGIL; her istekte)
 *   - govde    JSON ise content-type: application/json
 *   - Origin   tarayici ekler (chrome-extension://<id>); biz dokunmayiz
 *
 * Bu dosya duz (klasik) bir betiktir: servis calisani `importScripts` ile,
 * sozlesme testi ise Node `vm` ile AYNI dosyayi yukler. Icinde chrome.* API
 * yoktur; yalnizca `fetch` kullanir ve o da disaridan verilebilir.
 */
(function (root) {
  'use strict';

  const EXTENSION_HEADER = 'x-nakitgaraj-extension';
  const EXTENSION_MARKER = '1';
  /** Sozlesme surumu: panelde gorunur, kopru gunlugunde teshise yarar. */
  const CLIENT_VERSION = 2;

  /** Kopru adresi YALNIZCA geri donguye isaret edebilir. */
  function assertLoopbackBridge(bridgeUrl) {
    const url = new URL(String(bridgeUrl || ''));
    if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) {
      throw new Error('Bridge URL must be http://127.0.0.1:<port>');
    }
    return url.origin;
  }

  /**
   * Tek istek sekli. `fetch(url, init)` ile dogrudan kullanilabilir.
   * Isaret basligi HER istekte, GET dahil: kopru onu tum yollarda arar.
   */
  function buildRequest(bridgeUrl, path, options) {
    const opts = options || {};
    const method = opts.method || 'GET';
    const origin = assertLoopbackBridge(bridgeUrl);
    const headers = {};
    headers[EXTENSION_HEADER] = EXTENSION_MARKER;
    const init = { method: method, headers: headers };
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return { url: origin + path, init: init };
  }

  /**
   * Istegi gonderir, JSON'u dondurur. Basarisizlikta koprunun HATA KODU
   * (orn. MISSING_EXTENSION_MARKER) mesaja girer ki panelde sebep gorunsun.
   */
  async function bridgeFetch(bridgeUrl, path, options, fetchImpl) {
    const doFetch = fetchImpl || root.fetch;
    const request = buildRequest(bridgeUrl, path, options);
    const response = await doFetch(request.url, request.init);
    const payload = await response.json().catch(function () {
      return null;
    });
    if (!response.ok) {
      const code = payload && payload.error ? payload.error : response.statusText;
      const detail = payload && payload.message ? ': ' + payload.message : '';
      throw new Error('Bridge ' + request.init.method + ' ' + path + ' -> ' + response.status + ' ' + code + detail);
    }
    return payload;
  }

  root.NgBridgeClient = Object.freeze({
    EXTENSION_HEADER: EXTENSION_HEADER,
    EXTENSION_MARKER: EXTENSION_MARKER,
    CLIENT_VERSION: CLIENT_VERSION,
    assertLoopbackBridge: assertLoopbackBridge,
    buildRequest: buildRequest,
    bridgeFetch: bridgeFetch,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
