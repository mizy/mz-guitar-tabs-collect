/* 由 build-guitar-tabs-site.mjs 生成 —— 请勿手改 */
/*
 * 缓存策略（GitHub Pages 的响应头固定 max-age=600，服务端不可控，所以缓存策略放在 SW 里）：
 *   导航请求      network-first（带 no-cache 重新验证），失败回落到缓存的 index.html（离线可开）
 *   整页图/缩略图 cache-first（文件名按页 id 稳定；外壳脚本用内容哈希命名，改版即换文件名）
 *   catalog.json  stale-while-revalidate（先给缓存，后台拉新的，下次打开生效）
 *   其他外壳文件  cache-first
 * 预缓存一律用 { cache: "reload" } 抓，避免把浏览器 HTTP 缓存里的旧副本（最多 10 分钟）固化进来。
 */
const CACHE_VERSION = "ecafb21d";
const SHELL_CACHE = "guitar-shell-" + CACHE_VERSION;
const DATA_CACHE = "guitar-data-" + CACHE_VERSION;
const IMAGE_CACHE = "guitar-image-" + CACHE_VERSION;
const SHELL_ASSETS = ["./", "./index.html", "./prelude.ecafb21d.js", "./app.ecafb21d.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

function precache(cache, urls) {
  return Promise.all(urls.map(function(url) {
    return fetch(new Request(url, { cache: "reload" })).then(function(response) {
      if (!response.ok) throw new Error("预缓存失败 " + url + " HTTP " + response.status);
      return cache.put(url, response);
    });
  }));
}

self.addEventListener("install", function(event) {
  /* 元数据要单独进 DATA_CACHE：首次打开时 boot() 的 fetch 早于 SW 接管，若不在这里预缓存，
     第二次（离线）打开就会读不到目录。 */
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(function(cache) { return precache(cache, SHELL_ASSETS); }),
      caches.open(DATA_CACHE).then(function(cache) { return precache(cache, ["./data/catalog.json"]); })
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
  /* no-cache：拿网络最新的一份（但允许条件请求），否则改版后 HTML 也可能迟到 10 分钟 */
  return fetch(request, { cache: "no-cache" }).then(function(response) {
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
