const VERSION = 'v6';
const SHELL = `suun-shell-${VERSION}`;
const VENDOR = `suun-vendor-${VERSION}`;
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/config.js', './js/db.js', './js/splitter.js', './js/embedder.js',
  './js/sorter.js', './js/dictation.js', './js/whisper-worker.js', './js/app.js', './js/background.js', './js/icons.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

// GitHub Pages cannot send these two headers, so the service worker adds them. They make the page
// "cross-origin isolated", which lets the speech and sorting models use several CPU threads
// instead of one. Takes effect from the second launch, once this worker controls the page.
function isolate(res) {
  if (!res || res.status === 0) return res;
  const headers = new Headers(res.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('suun-') && k !== SHELL && k !== VENDOR).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const cached = await cache.match(req);
      const refresh = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
      if (cached) {
        refresh.catch(() => {});
        return isolate(cached);
      }
      try {
        return isolate(await refresh);
      } catch (err) {
        if (req.mode === 'navigate') {
          const fallback = await cache.match('./index.html');
          if (fallback) return isolate(fallback);
        }
        throw err;
      }
    })());
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith((async () => {
      const cache = await caches.open(VENDOR);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
  }
  // Every other host (Hugging Face model files): not intercepted.
});
