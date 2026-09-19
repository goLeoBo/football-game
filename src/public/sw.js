// 绿茵对决 · Service Worker
// 目标：可离线启动、更新能及时生效。
// 注意：站点部署在子路径（/football-game/），因此全部使用相对路径。
const VERSION = 'v1';
const CACHE = 'football-game-' + VERSION;

// 应用外壳（首页 + 图标）。视频等大文件走运行时缓存，避免首次安装就下载 14MB。
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async (u) => {
      try { await c.add(new Request(u, { cache: 'reload' })); } catch (err) { /* 单个失败不影响安装 */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) 页面导航：网络优先 + 强制校验，离线回退缓存
  //    （之前遇到的“改了页面手机还是旧的”，就是被 HTTP 缓存挡住了，
  //     这里用 no-cache 走 ETag 校验，既快又能及时拿到新版本）
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res && res.ok) c.put('./index.html', res.clone());
        return res;
      } catch (err) {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 2) 同源静态资源（含开场视频）：缓存优先，后台静默更新
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) {
        fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); }).catch(() => {});
        return hit;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }

  // 3) 跨域资源（队徽 / 国旗 CDN）：网络优先，失败用缓存兜底
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    } catch (err) {
      return (await c.match(req)) || Response.error();
    }
  })());
});
