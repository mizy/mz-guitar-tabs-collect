/* 由 build-guitar-tabs-site.mjs 生成 —— 请勿手改 */
/*
 * 缓存策略（GitHub Pages 的响应头固定 max-age=600，服务端不可控，所以缓存策略放在 SW 里）：
 *   导航请求      network-first，失败回落到缓存的 index.html（离线可开）
 *   整页图/缩略图 cache-first（文件名按 id 稳定，内容变了构建版本号就变，会整批换缓存）
 *   catalog.json  stale-while-revalidate（先给缓存，后台拉新的，下次打开生效）
 *   其他外壳文件  cache-first
 */
const CACHE_VERSION = "22824b55";
const SHELL_CACHE = "guitar-shell-" + CACHE_VERSION;
const DATA_CACHE = "guitar-data-" + CACHE_VERSION;
const IMAGE_CACHE = "guitar-image-" + CACHE_VERSION;
const SHELL_ASSETS = ["./", "./index.html", "./prelude.js", "./app.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", function(event) {
  /* 元数据要单独进 DATA_CACHE：首次打开时 boot() 的 fetch 早于 SW 接管，若不在这里预缓存，
     第二次（离线）打开就会读不到目录。 */
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(function(cache) { return cache.addAll(SHELL_ASSETS); }),
      caches.open(DATA_CACHE).then(function(cache) { return cache.addAll(["./data/catalog.json"]); })
    ]).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event) {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, IMAGE_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(function(keys) { return Promise.all(keys.filter(function(key) { return !keep.has(key); }).map(function(key) { return caches.delete(key); })); })
      .then(function() { return self.clients.claim(); })
  );
});

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function(cache) {
    return cache.match(request).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(response) {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
    });
  });
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(function(cache) {
    return cache.match(request).then(function(cached) {
      const network = fetch(request).then(function(response) {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(function() { return cached; });
      return cached || network;
    });
  });
}

function networkFirstShell(request) {
  return fetch(request).then(function(response) {
    if (response.ok) {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then(function(cache) { cache.put("./index.html", copy); });
    }
    return response;
  }).catch(function() {
    return caches.open(SHELL_CACHE).then(function(cache) {
      return cache.match("./index.html").then(function(cached) {
        return cached || Response.error();
      });
    });
  });
}

self.addEventListener("fetch", function(event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") { event.respondWith(networkFirstShell(request)); return; }
  if (/\/assets\/(pages|thumbs)\//.test(url.pathname)) { event.respondWith(cacheFirst(request, IMAGE_CACHE)); return; }
  if (url.pathname.endsWith("/data/catalog.json")) { event.respondWith(staleWhileRevalidate(request, DATA_CACHE)); return; }
  event.respondWith(cacheFirst(request, SHELL_CACHE));
});
