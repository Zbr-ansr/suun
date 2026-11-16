// Speech-to-text on the device, off the main thread so the page stays responsive.
// Messages in:  { id, type: 'load' } | { id, type: 'transcribe', audio: Float32Array (16 kHz mono) }
// Messages out: { type: 'progress', p } | { id, text } | { id, error }
import { TRANSFORMERS_URL, WHISPER_MODEL } from './config.js';

let loading = null;

function load() {
  if (loading) return loading;
  loading = (async () => {
    const lib = await import(TRANSFORMERS_URL);
    // Several threads only work when the page is cross-origin isolated (see sw.js); otherwise one.
    if (self.crossOriginIsolated) {
      lib.env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1);
    }
    // Two large files (encoder, decoder): report bytes loaded over bytes known so far.
    const files = new Map();
    const progress_callback = (e) => {
      if (!e || !e.file || !(e.total > 0) || !e.file.endsWith('.onnx')) return;
      files.set(e.file, { loaded: e.loaded || 0, total: e.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      self.postMessage({ type: 'progress', p: Math.min(1, loaded / total) });
    };
    return lib.pipeline('automatic-speech-recognition', WHISPER_MODEL, { dtype: 'q8', progress_callback });
  })();
  // A failed load must not stick: a later call tries again.
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
