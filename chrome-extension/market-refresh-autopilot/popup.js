/**
 * PANEL — YALNIZCA KOMUT VE GOSTERIM.
 *
 * Panel kopruye DOGRUDAN konusmaz; her sey arka plan calisanindan gecer.
 * Jeton alani YOKTUR: kopru yerel, jetonsuz ve yalnizca uzanti kokenine
 * aciktir. Kullanicidan istenen tek sey kopru adresidir.
 */

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 2000;

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function setText(id, value) {
  $(id).textContent = value === null || value === undefined || value === '' ? '—' : String(value);
}

/**
 * DURUM ONCELIGI — "COMPLETE" YALNIZCA GERCEKTEN TAMSA.
 *
 * Ilk canli kosuda ust satir COMPLETE derken alt satir "Koşu tam mı: HAYIR"
 * diyordu. Tamamlanma tek bir gercekten turer: runComplete. Kopru artik
 * INCOMPLETE / SMOKE_LIMIT_REACHED durumlarini kendisi gonderiyor; bu kapi,
 * eski bir kopru ya da beklenmedik bir durum COMPLETE'i geri sizdiramasin
 * diye panelde de duruyor.
 */
function displayState(status, fallback) {
  const shown = status.state || fallback || 'IDLE';
  if (shown !== 'COMPLETE') return shown;
  if (status.runComplete === true) return 'COMPLETE';
  return status.scopeLimited ? 'SMOKE_LIMIT_REACHED' : 'INCOMPLETE';
}

function render(state) {
  const status = state.bridgeStatus || {};
  const shown = displayState(status, state.lastState);

  $('state').textContent = shown;
  $('state').dataset.state = shown;

  /**
   * YAPI MODU: kopru `mode: 'STRUCTURE'` gonderir. Panel yalnizca GOSTERIR;
   * hangi sayfanin cekilecegine, neyin cocuk oldugna kopru karar verir.
   */
  const structure = status.mode === 'STRUCTURE';
  $('structureCard').hidden = !structure;
  $('marketCard').hidden = structure;
  if (structure) {
    const currentPath = Array.isArray(status.currentPath) ? status.currentPath.join(' › ') : status.currentKey;
    setText('sRunId', status.runId);
    setText('sPath', currentPath);
    setText('sMake', status.currentMake);
    setText('sCompleted', status.completed);
    setText('sQueued', status.queued);
    setText('sFailed', `${status.failed ?? 0} / ${status.blocked ?? 0}`);
    setText('sSaved', status.pagesSaved);
    setText('sPresent', status.alreadyPresent);
    setText('sNew', status.newNodesDiscovered);
    setText('sLast', status.lastSuccessKey);
    setText(
      'sRebuild',
      status.rebuildEvery > 0
        ? `${status.rebuilds} yapıldı · ${status.sinceRebuild}/${status.rebuildEvery} sayfa · kapı ${status.lastGate || '—'}`
        : 'kapalı',
    );
    setText('sComplete', status.runComplete === undefined ? null : status.runComplete ? 'EVET' : 'HAYIR');
    setText('sPause', status.pauseReason);
  }

  const trail = Array.isArray(status.currentTrail) ? status.currentTrail : [];
  setText('runId', status.runId);
  setText('make', trail[0]);
  setText('series', trail[1]);
  setText('subcategory', trail.length > 2 ? trail.slice(2).join(' › ') : null);
  setText('page', status.currentPage);
  setText('done', status.doneJobs);
  setText('pending', status.pendingJobs);
  setText('blocked', status.blockedJobs);
  setText('observed', status.listingsObserved);
  setText('new', status.newCount);
  setText('changed', status.changedCount);
  setText('unchanged', status.unchangedCount);
  setText('unsplittable', Array.isArray(status.unsplittable) ? status.unsplittable.length : null);
  setText('complete', status.runComplete === undefined ? null : status.runComplete ? 'EVET' : 'HAYIR');
  setText('deadline', status.deadlineAt ? new Date(status.deadlineAt).toLocaleString() : 'sınırsız');

  $('bridgeUrl').placeholder = state.config.bridgeUrl;

  const connected = state.bridgeConnected === true;
  const connection = $('bridgeConnection');
  connection.textContent = connected ? 'BAĞLI' : 'BAĞLI DEĞİL';
  connection.dataset.connected = String(connected);

  const message = state.lastError || state.bridgeError || status.lastError || '';
  $('message').textContent = message;
}

async function refresh() {
  try {
    const state = await send({ op: 'GET_STATE' });
    if (state && state.ok) render(state);
  } catch (err) {
    $('message').textContent = String((err && err.message) || err);
  }
}

async function command(op, extra = {}) {
  $('message').textContent = '';
  const result = await send({ op, ...extra });
  if (result && !result.ok) $('message').textContent = result.error || 'Bilinmeyen hata';
  await refresh();
}

$('save').addEventListener('click', () => command('SAVE_CONFIG', { bridgeUrl: $('bridgeUrl').value }));

$('start').addEventListener('click', () => command('START'));
$('pause').addEventListener('click', () => command('PAUSE'));
$('resume').addEventListener('click', () => command('RESUME'));
$('stop').addEventListener('click', () => command('STOP'));

refresh();
setInterval(refresh, REFRESH_MS);
