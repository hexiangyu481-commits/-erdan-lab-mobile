const CACHE = 'red-mobile-v03-alpha1';
const SHELL = ['./','./index.html','./app.js','./red-vault.js','./manifest.webmanifest','./icon.svg','https://esm.run/@mlc-ai/web-llm@0.2.85'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(async c => {
  for (const url of SHELL) { try { await c.add(url); } catch {} }
}).then(()=>self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c=>c.put(e.request, copy)).catch(()=>{}); return res;
  }).catch(()=>caches.match('./index.html'))));
});
