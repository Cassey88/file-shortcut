const CACHE = 'file-shortcut-v4';
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

// Per-slot manifest: unique id + start_url per shortcut so Android
// installs each one as a separate home screen app, with its own name.
async function customManifest(req) {
  const url = new URL(req.url);
  const slot = (url.searchParams.get('slot') || '1').replace(/[^0-9]/g, '') || '1';
  const nameKey = slot === '1' ? 'appName' : 's' + slot + ':appName';
  const base = (await caches.match('./manifest.json')) || (await fetch('./manifest.json'));
  const json = await base.clone().json();
  json.start_url = './index.html?slot=' + slot;
  json.id = './index.html?slot=' + slot;
  try {
    const name = await idbGet(nameKey);
    if (name) { json.name = name; json.short_name = name; }
    else if (slot !== '1') { json.name = 'File Shortcut ' + slot; json.short_name = 'Shortcut ' + slot; }
  } catch (e) { /* default names */ }
  return new Response(JSON.stringify(json), {
    headers: { 'Content-Type': 'application/manifest+json' }
  });
}

// Serve the staged file at a permanent URL: ./file?slot=N
// Back/forward, reload, and even direct shortcuts to it always work.
async function serveFile(url) {
  const slot = (url.searchParams.get('slot') || '1').replace(/[^0-9]/g, '') || '1';
  const f = await idbGet('fileserve:' + slot);
  if (!f) {
    return Response.redirect(new URL('./index.html?slot=' + slot, self.registration.scope).href, 302);
  }
  return new Response(f, {
    headers: {
      'Content-Type': f.type || 'application/octet-stream',
      'Content-Disposition': 'inline; filename="' + (f.name || 'file') + '"'
    }
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('/file')) {
    e.respondWith(serveFile(url));
    return;
  }
  if (url.pathname.endsWith('manifest.json')) {
    e.respondWith(customManifest(e.request));
    return;
  }
  // ignoreSearch so index.html?slot=N serves from the cached index.html offline
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request))
  );
});
