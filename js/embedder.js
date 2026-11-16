import { MODEL_ID, TRANSFORMERS_URL } from './config.js';

const DIM = 384;
let extractor = null;
let loadPromise = null;

export function isReady() {
  return extractor !== null;
}

export function loadModel(onProgress) {
  if (loadPromise) return loadPromise;
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  loadPromise = (async () => {
    const lib = await import(TRANSFORMERS_URL);
    // Track every file; report the fraction of the largest one seen so far.
    const files = new Map();
    const progress_callback = (e) => {
      if (!e || !e.file || !(e.total > 0)) return;
      files.set(e.file, { loaded: e.loaded || 0, total: e.total });
      let big = null;
      for (const f of files.values()) if (!big || f.total > big.total) big = f;
      report(Math.min(1, big.loaded / big.total));
    };
    const ex = await lib.pipeline('feature-extraction', MODEL_ID, { dtype: 'q8', progress_callback });
    extractor = ex;
    report(1);
    return undefined;
  })();
  // A failed load must not stick: a later call tries again.
  loadPromise.catch(() => { loadPromise = null; });
  return loadPromise;
}

export async function embed(texts) {
  if (!extractor) throw new Error('Model not loaded: call loadModel first');
  if (!texts.length) return [];
  // One text per call: in a batch, padding shifts each vector slightly (cosine ~0.99 to the
  // unbatched one), so the same note could score differently depending on what it was sent with.
  const result = [];
  for (const text of texts) {
    const out = await extractor([text], { pooling: 'mean', normalize: true });
    result.push(Float32Array.from(out.data.subarray(0, DIM)));
  }
  return result;
}
