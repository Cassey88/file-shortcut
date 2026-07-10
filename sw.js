const CACHE = 'file-shortcut-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

function idbGet(key) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('fileShortcut', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => {
      try {
        const q = r.result.transaction('kv').objectStore('kv').get(key);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      } catch (e) { rej(e); }
    };
    r.onerror = () => rej(r.error);
  });
}

async function customManifest(req) {
  const base = (await caches.match('./manifest.json')) || (await fetch(req));
  const json = await base.clone().json();
  try {
    const name = await idbGet('appName');
    if (name) { json.name = name; json.short_name = name; }
  } catch (e) { /* fall back to default name */ }
  return new Response(JSON.stringify(json), {
    headers: { 'Content-Type': 'application/manifest+json' }
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('manifest.json')) {
    e.respondWith(customManifest(e.request));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
