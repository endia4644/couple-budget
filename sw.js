// 앱 화면 파일을 저장해 두었다가 빠르게 띄운다. 새 버전이 있으면 받아서 다음 실행 때 반영.
// 지출 기록(구글 쪽 주소)은 저장하지 않는다 — 항상 새로 받는다.
const CACHE = 'budget-v1';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // 구글 주소는 건드리지 않음
  e.respondWith(
    caches.open(CACHE).then(c => c.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;                                                      // 저장본을 먼저, 뒤에서 새로 받아 둠
    }))
  );
});
