// Offline support: keeps a copy of the app files on the phone so it opens without internet.
// Strategy: serve from the phone copy right away, and refresh it in the background when online.
// Change VERSION when you deploy, so phones pick up the new files.
const VERSION = 'v3';
const CACHE = `gym-tracker-${VERSION}`;
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest', './firebase-config.js',
  './js/app.js', './js/store.js', './js/calc.js', './js/seed.js', './js/ui.js',
  './js/log.js', './js/dash.js', './js/program.js', './js/settings.js',
  './vendor/firebase/firebase-app.js', './vendor/firebase/firebase-auth.js', './vendor/firebase/firebase-firestore.js',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('gym-tracker-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only handle this site's own files. Firebase and Google sign-in go straight to the network.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const key = url.pathname.endsWith('/') ? './' : e.request;
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
