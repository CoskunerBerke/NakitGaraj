/**
 * PANEL — YALNIZCA KOMUT VE GOSTERIM.
 *
 * Panel kopruye DOGRUDAN konusmaz; her sey arka plan calisanindan gecer.
 * Jeton DEGERI panele geri okunmaz (yalnizca "ayarli mi" bilgisi doner).
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
  $('tokenHint').textContent = state.config.tokenSet
    ? 'Jeton ayarlı. Yalnızca 127.0.0.1 köprüsüne gönderilir.'
    : 'Jeton ayarlı değil: bridge-token.txt içeriğini yapıştırın.';

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

$('save').addEventListener('click', async () => {
  await command('SAVE_CONFIG', {
    bridgeUrl: $('bridgeUrl').value,
    token: $('token').value,
  });
  $('token').value = '';
});

$('start').addEventListener('click', () => command('START'));
$('pause').addEventListener('click', () => command('PAUSE'));
$('resume').addEventListener('click', () => command('RESUME'));
$('stop').addEventListener('click', () => command('STOP'));

refresh();
setInterval(refresh, REFRESH_MS);
