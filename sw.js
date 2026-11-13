// 화면(html·config)은 항상 새로 받고, 인터넷이 없을 때만 저장본을 쓴다.
// 아이콘·manifest 는 저장본을 먼저 쓴다. 지출 기록(구글 주소)은 건드리지 않는다.
const CACHE = 'budget-v3';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || /\/$|\.html$|config\.js$/.test(url.pathname);
  if (fresh) {
    e.respondWith(fetch(req, { cache: 'no-store' })
      .then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone())); return res; })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});
