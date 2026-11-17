// Records the microphone, then turns the recording into text with Whisper in a worker.
// Nothing leaves the phone. The text arrives after recording stops, not while speaking.
import { WHISPER_MODEL } from './config.js';

const RATE = 16000;            // Whisper expects 16 kHz mono
const MAX_MS = 3 * 60 * 1000;  // stop by itself after three minutes

// True once the library holds both model files in its cache, so dictation needs no download.
export async function isModelCached() {
  try {
    const keys = await (await caches.open('transformers-cache')).keys();
    return keys.filter((r) => r.url.includes(WHISPER_MODEL) && r.url.endsWith('.onnx')).length >= 2;
  } catch (e) {
    return false;
  }
}

export function isSupported() {
  return typeof window !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
    window.MediaRecorder && window.Worker && (window.AudioContext || window.webkitAudioContext));
}

// Whisper writes sounds as [BLANK_AUDIO] or (music): drop those tags.
export function cleanTranscript(text) {
  return String(text ?? '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

export function createRecogniser({ onStatus, onFinalChunk, onError, onEnd }) {
  let worker = null;
  let seq = 0;
  const pending = new Map();
  let stream = null;
  let rec = null;
  let parts = [];
  let timer = null;

  function ask(type, audio) {
    if (!worker) {
      worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') { onStatus('loading', m); return; }
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error)); else p.resolve(m.text);
      };
      worker.onerror = () => {
        for (const p of pending.values()) p.reject(new Error('model'));
        pending.clear();
        worker = null;
      };
    }
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, audio }, audio ? [audio.buffer] : []);
    });
  }

  async function toPcm(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ sampleRate: RATE });   // decoding resamples to the context rate
    try {
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      const pcm = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < ch.length; i++) pcm[i] += ch[i] / buf.numberOfChannels;
      }
      return pcm;
    } finally {
      ctx.close();
    }
  }

  // pcm is kept until it has been turned into text, so a failed model download loses no speech.
  async function transcribe(pcm) {
    try {
      onStatus('working');
      if (pcm.length > RATE * 0.4) {
        const text = cleanTranscript(await ask('transcribe', pcm.slice()));
        if (text) onFinalChunk(text);
      }
    } catch (e) {
      if (e && e.message === 'model') onError('model', () => transcribe(pcm));
      else onError('transcribe');
    }
    onEnd();
  }

  async function finish() {
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    let pcm;
    try {
      pcm = await toPcm(new Blob(parts, { type: rec.mimeType }));
    } catch (e) {
      onError('transcribe');
      onEnd();
      return;
    }
    await transcribe(pcm);
  }

  return {
    async start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (e) {
        onError(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'not-allowed' : 'audio-capture');
        onEnd();
        return;
      }
      parts = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      rec.onstop = finish;
      rec.start();
      onStatus('listening');
      timer = setTimeout(() => this.stop(), MAX_MS);
      ask('load').catch(() => {});   // fetch or warm the model while the user is speaking
    },
    stop() {
      if (rec && rec.state !== 'inactive') rec.stop();
    },
    // Download (or resume downloading) the model without recording. Resolves when it is ready.
    prepare() {
      return ask('load');
    }
  };
}
