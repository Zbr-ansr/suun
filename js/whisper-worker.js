// Speech-to-text on the device, off the main thread so the page stays responsive.
// Messages in:  { id, type: 'load' } | { id, type: 'transcribe', audio: Float32Array (16 kHz mono) }
// Messages out: { type: 'progress', state, loaded, total } | { id, text } | { id, error }
//   state: 'downloading' | 'retrying' | 'preparing'
import { TRANSFORMERS_URL, WHISPER_MODEL } from './config.js';

// The two model files (77 MB) are fetched in 2 MB pieces. Each piece is saved as soon as it arrives,
// so a dropped or frozen connection only costs the piece in flight, and closing the app keeps what
// was already downloaded. A piece that receives no data for STALL_MS is abandoned and asked for again.
const PARTS = 'suun-model-parts';
const CHUNK = 2 * 1024 * 1024;
const STALL_MS = 20000;
const TRIES = 6;

const files = new Map();   // url -> { loaded, total }
let lastReport = 0;
let loading = null;

function report(state, force) {
  const now = Date.now();
  if (!force && now - lastReport < 250) return;
  lastReport = now;
  let loaded = 0;
  let total = 0;
  for (const f of files.values()) { loaded += f.loaded; total += f.total; }
  self.postMessage({ type: 'progress', state, loaded, total });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= TRIES) throw e;
      report('retrying', true);
      await sleep(Math.min(15000, 1000 * 2 ** i));
    }
  }
}

// GET bytes start..end (inclusive). Aborts when no data arrives for STALL_MS.
async function getRange(url, start, end, onBytes) {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), STALL_MS);
  let got = 0;
  try {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: ctrl.signal, cache: 'no-store' });
    if (res.status !== 206) throw new Error(`range ${res.status}`);
    const reader = res.body.getReader();
    const parts = [];
    for (;;) {
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(), STALL_MS);
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onBytes(value.length);
    }
    if (got !== end - start + 1) throw new Error('short piece');
    return new Blob(parts);
  } catch (e) {
    onBytes(-got);   // this piece will be fetched again from its start
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function getSize(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STALL_MS);
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: ctrl.signal, cache: 'no-store' });
    const m = /\/(\d+)\s*$/.exec(res.headers.get('Content-Range') || '');
    if (res.status !== 206 || !m) throw new Error('no size');
    return Number(m[1]);
  } finally {
    clearTimeout(timer);
  }
}

async function download(url) {
  const total = await withRetry(() => getSize(url));
  const f = { loaded: 0, total };
  files.set(url, f);
  const cache = await caches.open(PARTS);
  const blobs = [];
  for (let i = 0, start = 0; start < total; i++, start += CHUNK) {
    const end = Math.min(total, start + CHUNK) - 1;
    const key = `${url}?part=${i}&size=${total}`;
    const hit = await cache.match(key);
    let blob = hit ? await hit.blob() : null;
    if (blob && blob.size === end - start + 1) {
      f.loaded += blob.size;
      report('downloading');
    } else {
      blob = await withRetry(() => getRange(url, start, end, (n) => { f.loaded += n; report('downloading'); }));
      await cache.put(key, new Response(blob));
    }
    blobs.push(blob);
  }
  report([...files.values()].every((x) => x.loaded >= x.total) ? 'preparing' : 'downloading', true);
  return new Response(new Blob(blobs), {
    status: 200,
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(total) }
  });
}

function load() {
  if (loading) return loading;
  loading = (async () => {
    const lib = await import(TRANSFORMERS_URL);
    // Several threads only work when the page is cross-origin isolated (see sw.js); otherwise one.
    if (self.crossOriginIsolated) {
      lib.env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1);
    }
    // Large model files go through the resumable downloader; everything else (small JSON files,
    // and the library's own one-byte size checks, which carry a Range header) is fetched normally.
    const plainFetch = lib.env.fetch;
    lib.env.fetch = (url, init = {}) => {
      const u = String(url);
      const ranged = init.headers && new Headers(init.headers).has('Range');
      if (u.endsWith('.onnx') && !ranged && (init.method || 'GET') === 'GET') return download(u);
      return plainFetch(url, init);
    };
    const asr = await lib.pipeline('automatic-speech-recognition', WHISPER_MODEL, { dtype: 'q8' });
    // The library now keeps the whole files in its own cache, so the pieces are no longer needed.
    caches.delete(PARTS).catch(() => {});
    return asr;
  })();
  // A failed load must not stick: a later call tries again, resuming from the saved pieces.
  loading.catch(() => { loading = null; });
  return loading;
}

self.onmessage = async (e) => {
  const { id, type, audio } = e.data;
  let asr;
  try {
    asr = await load();
  } catch (err) {
    self.postMessage({ id, error: 'model' });
    return;
  }
  if (type === 'load') { self.postMessage({ id, text: '' }); return; }
  try {
    // Whisper reads 30 s windows; the 5 s overlap stops words being cut at a window edge.
    const out = await asr(audio, { chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ id, text: String(out.text || '') });
  } catch (err) {
    self.postMessage({ id, error: 'transcribe' });
  }
};
