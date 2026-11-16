import { SPEECH_LANG } from './config.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export function isSupported() {
  return !!SR;
}

const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network']);

export function createRecogniser({ onInterim, onFinalChunk, onError, onEnd }) {
  let rec = null;
  let wanted = false;
  let ended = false;

  function build() {
    const r = new SR();
    r.lang = SPEECH_LANG;
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const t = res[0].transcript;
        if (res.isFinal) {
          const clean = t.trim();
          if (clean) onFinalChunk(clean);
        } else {
          onInterim(t);
        }
      }
    };
    r.onerror = (event) => {
      const code = event.error;
      if (FATAL.has(code)) {
        wanted = false;
        onError(code);
      }
    };
    r.onend = () => {
      if (wanted) {
        try { r.start(); } catch (e) {
          wanted = false;
          onError('audio-capture');
        }
        return;
      }
      finish();
    };
    return r;
  }

  function finish() {
    if (ended) return;
    ended = true;
    onEnd();
  }

  return {
    start() {
      wanted = true;
      ended = false;
      rec = build();
      try { rec.start(); } catch (e) { wanted = false; onError('audio-capture'); }
    },
    stop() {
      wanted = false;
      if (!rec) { finish(); return; }
      try { rec.stop(); } catch (e) { finish(); }
      // onend of the recogniser calls finish(); guard in case it never fires
      setTimeout(finish, 1500);
    }
  };
}
