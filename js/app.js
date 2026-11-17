import { COLOURS } from './config.js';
import { openDb, seedIfEmpty, getNodes, addNode, updateNode, deleteNode, getItems, getAllItems, addItem,
  updateItem, deleteItem, addCapture, getCaptures, exportAll, importAll } from './db.js';
import { splitTranscript, toChecklistItems, proposeNodeName } from './splitter.js';
import { loadModel, isReady } from './embedder.js';
import { classifySplit, ensureVectors } from './sorter.js';
import { isSupported, createRecogniser, isModelCached } from './dictation.js';
import { glyph } from './icons.js';

const $ = (id) => document.getElementById(id);
const ICONS = ['🎓', '🌿', '💞', '🛒', '💡', '💼', '🏋️', '💰', '✈️', '🍳', '🚗', '🏠', '📚', '🎬', '🩺', '⭐'];
const SPEECH_ERRORS = {
  'not-allowed': 'Microphone access is blocked. Allow it in the site settings.',
  'audio-capture': 'No microphone found.',
  'model': 'The voice model download stopped. What arrived is kept; it resumes next time.',
  'transcribe': 'Could not turn that recording into text. Try again.'
};

let nodes = [];
let allItems = [];
let ready = false;
let busy = false;
let listening = false;

/* ---------- helpers ---------- */
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'value') e.value = v;
    else if (k === 'icon') e.prepend(glyph(v));   // list `icon` after `text`: setting text clears children
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid);
  return e;
}
const colourOf = (n) => COLOURS[n.colour] || COLOURS.blue;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmtDateTime = (t) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function refresh() {
  [nodes, allItems] = await Promise.all([getNodes(), getAllItems()]);
  renderHome();
}
async function tryEnsure() {
  if (!isReady()) return;
  try { await ensureVectors(); } catch (e) { console.warn('ensureVectors', e); }
}

/* ---------- toast ---------- */
let toastTimer = null;
function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
}
function showToast(msg, action) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.replaceChildren(h('span', { text: msg }));
  if (action) {
    t.append(h('button', { class: 'tbtn', text: action.label, onclick: async () => { hideToast(); await action.run(); } }));
  }
  t.hidden = false;
  toastTimer = setTimeout(hideToast, 6000);
}

/* ---------- sheets ---------- */
function openSheet({ title = '', tall = false, counter = '', onClose } = {}) {
  const wrap = h('div', { class: 'sheet-wrap' });
  const titleEl = h('h2', { text: title });
  const icoSlot = h('span', { hidden: true });
  const actions = h('span');
  const counterEl = h('span', { class: 'count', text: counter });
  let closed = false;
  const api = {
    body: h('div', { class: 'sheet-body' }),
    close() {
      if (closed) return;
      closed = true;
      wrap.remove();
      if (onClose) onClose();
    },
    setHeader({ icon, colour, title: t, actions: acts = [] }) {
      titleEl.textContent = t;
      icoSlot.replaceChildren();
      icoSlot.hidden = !icon;
      if (icon) icoSlot.append(h('span', { class: 'hico', icon, style: `--c:${colour}` }));
      actions.replaceChildren(...acts);
    }
  };
  const sheet = h('div', { class: 'sheet' + (tall ? ' tall' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'grab' }),
    h('div', { class: 'sheet-head' }, icoSlot, titleEl, counterEl, actions,
      h('button', { class: 'hbtn', text: 'Close', onclick: api.close })),
    api.body);
  wrap.append(h('div', { class: 'backdrop', onclick: api.close }), sheet);
  $('sheets').append(wrap);
  return api;
}

function confirmSheet({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let answer = false;
    const s = openSheet({ title, onClose: () => resolve(answer) });
    if (message) s.body.append(h('div', { class: 'quote glass', text: message }));
    s.body.append(
      h('button', { class: 'btn' + (danger ? ' danger' : ' primary'), text: confirmLabel, onclick: () => { answer = true; s.close(); } }),
      h('button', { class: 'btn text', text: 'Cancel', onclick: () => s.close() }));
  });
}

/* ---------- home ---------- */
function countLine(n, items) {
  if (!items.length) return 'Empty';
  if (n.type === 'checklist') return `${items.filter((i) => !i.done).length} of ${items.length} left`;
  return plural(items.length, 'note');
}
function renderHome() {
  const grid = $('grid');
  grid.replaceChildren();
  nodes.forEach((n, i) => {
    const items = allItems.filter((x) => x.nodeId === n.id).sort((a, b) => b.createdAt - a.createdAt);
    grid.append(h('button', { class: 'card glass', style: `--i:${i};--c:${colourOf(n)}`, onclick: () => openNodeSheet(n.id) },
      h('span', { class: 'ico', icon: n.icon }),
      h('span', { class: 'name', text: n.name }),
      h('span', { class: 'count', text: countLine(n, items) }),
      items.slice(0, 2).map((x) => h('span', { class: 'peek', text: x.text }))));
  });
  grid.append(h('button', { class: 'card new', style: `--i:${nodes.length}`, text: '+ New node', onclick: () => openNodeEditor({ onSaved: refresh }) }));
}

/* ---------- node sheet ---------- */
function openNodeSheet(nodeId) {
  const sheet = openSheet({ tall: true, onClose: refresh });
  async function render() {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) { sheet.close(); return; }
    let items = await getItems(nodeId);
    if (node.type === 'checklist') items = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
    sheet.setHeader({
      icon: node.icon, colour: colourOf(node), title: node.name,
      actions: [h('button', { class: 'hbtn', text: 'Edit', onclick: () => openNodeEditor({
        node, onSaved: async () => { await refresh(); await render(); }, onDeleted: () => sheet.close() }) })]
    });
    sheet.body.replaceChildren();
    if (!items.length) { sheet.body.append(h('div', { class: 'empty', text: 'Nothing here yet' })); return; }
    for (const it of items) {
      const textBtn = h('button', { class: 'body', onclick: () => openItemActions(it, node, rerender) },
        h('span', { class: 'txt', text: it.text }),
        node.type === 'notes' ? h('span', { class: 'date', text: fmtDateTime(it.createdAt) }) : null);
      const row = h('div', { class: 'item glass' + (it.done ? ' done' : '') });
      if (node.type === 'checklist') {
        row.append(h('button', { class: 'tick', 'aria-label': 'Toggle done', 'aria-pressed': String(!!it.done), onclick: async () => {
          await updateItem(it.id, { done: !it.done });
          await rerender();
        } }, h('i', { text: it.done ? '✓' : '' })));
      }
      row.append(textBtn);
      sheet.body.append(row);
    }
  }
  async function rerender() { await refresh(); await render(); }
  render();
}

function openItemActions(item, node, rerender) {
  const s = openSheet({ title: node.type === 'checklist' ? 'Item' : 'Note' });
  s.body.append(
    h('div', { class: 'quote glass', text: item.text }),
    h('button', { class: 'btn left', text: 'Edit', onclick: () => openEditItem(item, s, rerender) }),
    h('button', { class: 'btn left', text: 'Move', onclick: () => openMoveItem(item, s, rerender) }),
    h('button', { class: 'btn left danger', text: 'Delete', onclick: async () => {
      s.close();
      await deleteItem(item.id);
      await rerender();
      showToast('Deleted', { label: 'Undo', run: async () => {
        const back = await addItem({ nodeId: item.nodeId, text: item.text, captureId: item.captureId, confirmed: item.confirmed, vec: item.vec });
        await updateItem(back.id, { done: item.done, createdAt: item.createdAt });
        await rerender();
      } });
    } }));
}
function openEditItem(item, parent, rerender) {
  const s = openSheet({ title: 'Edit' });
  const ta = h('textarea', { class: 'field', value: item.text });
  s.body.append(ta, h('button', { class: 'btn primary', text: 'Save', onclick: async () => {
    const text = ta.value.trim();
    if (!text) return;
    await updateItem(item.id, { text, vec: null });
    s.close(); parent.close();
    await tryEnsure();
    await rerender();
  } }));
  ta.focus();
}
function openMoveItem(item, parent, rerender) {
  const s = openSheet({ title: 'Move to' });
  const others = nodes.filter((n) => n.id !== item.nodeId);
  if (!others.length) s.body.append(h('div', { class: 'empty', text: 'No other nodes' }));
  for (const n of others) {
    s.body.append(h('button', { class: 'btn left', text: n.name, icon: n.icon, onclick: async () => {
      await updateItem(item.id, { nodeId: n.id, confirmed: true });
      s.close(); parent.close();
      await tryEnsure();
      await rerender();
    } }));
  }
}

/* ---------- node editor ---------- */
function openNodeEditor({ node = null, prefillName = '', onSaved, onDeleted } = {}) {
  const s = openSheet({ title: node ? 'Edit node' : 'New node' });
  let icon = node ? node.icon : ICONS[0];
  let colour = node ? node.colour : 'blue';
  let type = node ? node.type : 'notes';
  const name = h('input', { class: 'field', type: 'text', placeholder: 'Name', value: node ? node.name : prefillName, maxlength: '40' });
  const desc = h('input', { class: 'field', type: 'text', placeholder: 'What goes here? Helps sorting', value: node ? node.description : '' });
  const iconBtns = ICONS.map((e) => h('button', { type: 'button', icon: e, 'aria-label': e, onclick: () => { icon = e; sync(); } }));
  const swBtns = Object.keys(COLOURS).map((c) => h('button', { type: 'button', style: `background:${COLOURS[c]}`, 'aria-label': c, onclick: () => { colour = c; sync(); } }));
  const typeBtns = [['notes', 'Notes'], ['checklist', 'Checklist']].map(([v, l]) => h('button', { type: 'button', text: l, onclick: () => { type = v; sync(); } }));
  function sync() {
    iconBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(ICONS[i] === icon)));
    swBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(Object.keys(COLOURS)[i] === colour)));
    typeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['notes', 'checklist'][i] === type)));
  }
  // Native append() prints arrays and null as text, so flatten and drop the empty slots first.
  s.body.append(...[
    h('div', { class: 'label', text: 'Name' }), name,
    h('div', { class: 'label', text: 'Icon' }), h('div', { class: 'icons' }, iconBtns),
    h('div', { class: 'label', text: 'Colour' }), h('div', { class: 'swatches' }, swBtns),
    h('div', { class: 'label', text: 'Description' }), desc,
    node ? null : [h('div', { class: 'label', text: 'Type' }), h('div', { class: 'seg' }, typeBtns)],
    h('button', { class: 'btn primary', text: 'Save', onclick: async () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      const data = { name: nm, description: desc.value.trim(), colour, icon };
      const saved = node ? await updateNode(node.id, data) : await addNode({ ...data, type });
      await tryEnsure();
      s.close();
      if (onSaved) await onSaved(saved);
    } }),
    node ? h('button', { class: 'btn danger', text: 'Delete node', onclick: async () => {
      const n = (await getItems(node.id)).length;
      const ok = await confirmSheet({ title: `Delete "${node.name}" and its ${n} items?`, confirmLabel: 'Delete' });
      if (!ok) return;
      await deleteNode(node.id);
      s.close();
      if (onDeleted) onDeleted();
      await refresh();
    } }) : null].flat().filter(Boolean));
  sync();
  if (!node) name.focus();
}

/* ---------- capture flow ---------- */
async function savePieceTo(node, piece, captureId) {
  const texts = node.type === 'checklist' ? toChecklistItems(piece.text) : [piece.text];
  for (let k = 0; k < texts.length; k++) {
    await addItem({ nodeId: node.id, text: texts[k], captureId, confirmed: true, vec: k === 0 ? piece.vec : null });
  }
  await tryEnsure();
  await refresh();
}

function askUnsure(piece, index, total, captureId) {
  return new Promise((resolve) => {
    const s = openSheet({ title: 'Where does this go?', counter: total > 1 ? `${index + 1} of ${total}` : '', onClose: resolve });
    s.body.append(h('div', { class: 'quote glass', text: piece.text }));
    const cands = piece.candidates.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
    for (const n of cands) {
      s.body.append(h('button', { class: 'btn left', text: n.name, icon: n.icon, onclick: async () => {
        await savePieceTo(n, piece, captureId);
        s.close();
      } }));
    }
    s.body.append(
      h('button', { class: 'btn', text: '＋  New node', onclick: () => openNodeEditor({
        prefillName: proposeNodeName(piece.text),
        onSaved: async (node) => { await savePieceTo(node, piece, captureId); s.close(); } }) }),
      h('button', { class: 'btn text', text: 'Discard', onclick: () => s.close() }));
  });
}

async function runCapture(raw, source) {
  const text = raw.trim();
  if (!text || busy || !ready) return;
  busy = true; updateInputs();
  try {
    const capture = await addCapture({ text, source });
    const pieces = splitTranscript(text);
    const results = await classifySplit(pieces);
    const saved = [];
    for (const r of results.filter((x) => x.status === 'confident')) {
      const node = nodes.find((n) => n.id === r.nodeId);
      if (!node) continue;
      const texts = node.type === 'checklist' ? toChecklistItems(r.text) : [r.text];
      for (const t of texts) saved.push(await addItem({ nodeId: node.id, text: t, captureId: capture.id, confirmed: false }));
    }
    await refresh();
    if (saved.length) {
      showToast(`Saved ${plural(saved.length, 'note')}`, { label: 'Undo', run: async () => {
        for (const it of saved) await deleteItem(it.id);
        await refresh();
      } });
    }
    const unsure = results.filter((x) => x.status === 'unsure');
    for (let i = 0; i < unsure.length; i++) await askUnsure(unsure[i], i, unsure.length, capture.id);
  } catch (e) {
    console.error(e);
    showToast('Something went wrong saving that note');
  } finally {
    busy = false; updateInputs();
  }
}

/* ---------- dock ---------- */
const input = $('noteInput');
function updateInputs() {
  input.disabled = !ready || busy || listening;
  $('micBtn').disabled = !ready || busy;
  $('sendBtn').hidden = !(ready && input.value.trim());
}
function sendTyped() {
  const v = input.value;
  if (!v.trim() || !ready || busy) return;
  input.value = '';
  updateInputs();
  runCapture(v, 'typed');
}
input.addEventListener('input', updateInputs);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendTyped(); } });
$('sendBtn').addEventListener('click', sendTyped);
new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', $('dock').offsetHeight + 'px')).observe($('dock'));

/* ---------- voice ---------- */
let heard = '';
let recogniser = null;
let clock = null;
function setListening(on) {
  listening = on;
  $('micBtn').classList.toggle('on', on);
  $('micBtn').setAttribute('aria-label', on ? 'Stop dictation' : 'Start dictation');
  updateInputs();
}
// Voice model state, shared by the recording panel and the Settings row.
const voice = { state: 'unknown', text: '' };
const voiceViews = new Set();
const mb = (n) => (n / 1048576).toFixed(0);
function setVoice(state, text) {
  voice.state = state;
  voice.text = text;
  voiceViews.forEach((f) => f());
}
function progressText(m) {
  const pct = m.total ? Math.floor((m.loaded / m.total) * 100) : 0;
  if (m.state === 'preparing') return 'Preparing the voice model…';
  if (m.state === 'retrying') return `Connection dropped, retrying… ${pct}%`;
  return `Downloading the voice model… ${pct}% (${mb(m.loaded)} of ${mb(m.total)} MB)`;
}
function showLive(text, hint) {
  $('live').hidden = false;
  $('liveText').textContent = text;
  $('liveHint').textContent = hint || '';
  $('liveHint').hidden = !hint;
}
if (isSupported()) {
  let working = false;
  isModelCached().then((yes) => { if (voice.state === 'unknown') setVoice(yes ? 'ready' : 'missing', ''); });
  voiceViews.add(() => {
    if (!working) return;
    const loadingNow = voice.state === 'downloading' || voice.state === 'preparing';
    showLive(loadingNow ? voice.text : 'Turning speech into text…');
  });
  recogniser = createRecogniser({
    onStatus: (state, p) => {
      if (state === 'listening') {
        const t0 = Date.now();
        const tick = () => {
          const sec = Math.floor((Date.now() - t0) / 1000);
          showLive(`Listening… ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, 'Tap the mic to finish');
        };
        tick();
        clock = setInterval(tick, 500);
      } else if (state === 'working') {
        clearInterval(clock);
        working = true;
        setListening(false);
        $('micBtn').disabled = true;
        const loadingNow = voice.state === 'downloading' || voice.state === 'preparing';
        showLive(loadingNow ? voice.text : 'Turning speech into text…');
      } else if (state === 'loading') {
        setVoice(p.state === 'preparing' ? 'preparing' : 'downloading', progressText(p));
      }
    },
    onFinalChunk: (t) => { heard = t; },
    onError: (code, retry) => {
      if (code === 'model') setVoice('missing', '');
      showToast(SPEECH_ERRORS[code] || 'Voice input failed', retry ? { label: 'Retry', run: () => {
        if (busy) return;
        busy = true;
        updateInputs();
        retry();
      } } : undefined);
    },
    onEnd: () => {
      clearInterval(clock);
      const text = heard;
      heard = '';
      working = false;
      busy = false;
      if (voice.state === 'downloading' || voice.state === 'preparing') setVoice('ready', '');
      $('live').hidden = true;
      setListening(false);
      if (text.trim()) runCapture(text, 'voice');
    }
  });
  $('micBtn').addEventListener('click', () => {
    if (!listening) {
      if (!ready || busy) return;
      heard = '';
      busy = true;          // blocks typed notes until the recording has been handled
      setListening(true);
      $('micBtn').disabled = false;
      recogniser.start();
    } else {
      recogniser.stop();
    }
  });
} else {
  $('micBtn').hidden = true;
}

/* ---------- settings ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; });

function installRow() {
  if (matchMedia('(display-mode: standalone)').matches) return null;
  if (installEvt) {
    return h('button', { class: 'btn left', text: 'Install app', onclick: async (ev) => {
      const e = installEvt;
      installEvt = null;
      ev.currentTarget.remove();
      if (e) await e.prompt();
    } });
  }
  const note = h('div', { class: 'foot', text: 'To install: open this page in Chrome, then menu (⋮) → Add to Home screen → Install.' });
  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then((apps) => {
      if (apps.length) note.textContent = 'Suun is already installed on this phone. Open it from your app list.';
    }).catch(() => {});
  }
  return note;
}

function voiceRow() {
  if (!recogniser) return null;
  const btn = h('button', { class: 'btn left' });
  const paint = () => {
    // The sheet was closed: stop updating a button nobody can see.
    if (btn.dataset.shown && !btn.isConnected) { voiceViews.delete(paint); return; }
    btn.dataset.shown = '1';
    const loadingNow = voice.state === 'downloading' || voice.state === 'preparing';
    btn.disabled = loadingNow || voice.state === 'ready';
    btn.textContent = voice.state === 'ready' ? 'Voice model ready (works offline)'
      : loadingNow ? voice.text
      : 'Download voice model (77 MB, use Wi-Fi)';
  };
  btn.addEventListener('click', () => {
    setVoice('downloading', 'Starting download…');
    recogniser.prepare()
      .then(() => setVoice('ready', ''))
      .catch(() => { setVoice('missing', ''); showToast(SPEECH_ERRORS.model); });
  });
  voiceViews.add(paint);
  paint();
  return btn;
}

function openSettings() {
  const s = openSheet({ title: 'Settings' });
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    let obj;
    try { obj = JSON.parse(await f.text()); } catch (e) { obj = null; }
    if (!obj || obj.app !== 'suun' || obj.version !== 1 || !Array.isArray(obj.nodes) || !Array.isArray(obj.items) || !Array.isArray(obj.captures)) {
      showToast('That file is not a Suun backup');
      return;
    }
    const ok = await confirmSheet({ title: 'Import backup', message: 'This replaces everything on this phone.', confirmLabel: 'Replace', danger: true });
    if (!ok) return;
    try {
      await importAll(obj);
    } catch (e) { showToast('That file is not a Suun backup'); return; }
    await tryEnsure();
    await refresh();
    s.close();
  });
  s.body.append(
    h('button', { class: 'btn left', text: 'Export backup', onclick: async () => {
      const data = await exportAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const a = h('a', { href: url, download: `suun-backup-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } }),
    h('button', { class: 'btn left', text: 'Import backup', onclick: () => file.click() }),
    h('button', { class: 'btn left', text: 'History', onclick: openHistory }),
    ...[voiceRow()].filter(Boolean),
    ...[installRow()].filter(Boolean),
    file,
    h('div', { class: 'foot', text: 'Suun · your notes stay on this device' }));
}
async function openHistory() {
  const s = openSheet({ title: 'History' });
  const caps = await getCaptures();
  if (!caps.length) s.body.append(h('div', { class: 'empty', text: 'Nothing here yet' }));
  for (const c of caps) {
    s.body.append(h('div', { class: 'hist glass' },
      h('div', { class: 'meta' }, h('span', { text: fmtDateTime(c.createdAt) }), h('span', { class: 'tag', text: c.source })),
      h('div', { class: 'raw', text: c.text })));
  }
}
$('settingsBtn').addEventListener('click', openSettings);

/* ---------- startup ---------- */
function startModel() {
  $('loading').hidden = false;
  $('retryBtn').hidden = true;
  $('loadingText').textContent = 'Preparing the sorter… 0%';
  $('barFill').style.transform = 'scaleX(0)';
  loadModel((p) => {
    const pct = Math.max(0, Math.min(1, p || 0));
    $('loadingText').textContent = `Preparing the sorter… ${Math.round(pct * 100)}%`;
    $('barFill').style.transform = `scaleX(${pct})`;
  }).then(async () => {
    ready = true;
    $('loading').hidden = true;
    updateInputs();
    tryEnsure();
  }).catch((e) => {
    console.warn('loadModel', e);
    $('loadingText').textContent = 'Connect to the internet once to download the sorter';
    $('retryBtn').hidden = false;
  });
}
$('retryBtn').addEventListener('click', startModel);

async function init() {
  await openDb();
  await seedIfEmpty();
  await refresh();
  startModel();
}
init().catch((e) => {
  console.error(e);
  showToast('Could not open storage');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
