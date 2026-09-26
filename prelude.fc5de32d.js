
/* 由 build-guitar-tabs-site.mjs 生成 —— 请勿手改，改构建脚本后重新生成 */
/* 单文件版把 209 张谱面以 base64 塞在 HTML 里，首屏必须整包下完；这里换成外部资源 + 按需加载。 */

const PAGE_DIR = "assets/pages/";
const THUMB_DIR = "assets/thumbs/";
const IMAGE_IDS = new Set([2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271,272]);

const IMAGES = {};
for (const id of IMAGE_IDS) IMAGES[id] = PAGE_DIR + id + ".webp";

const LAZY_ROOT_MARGIN = "600px 0px";
const lazyObserver = typeof IntersectionObserver === "function"
  ? new IntersectionObserver(function(entries) {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const image = entry.target;
        lazyObserver.unobserve(image);
        if (image.dataset.lazySrc) image.src = image.dataset.lazySrc;
      }
    }, { rootMargin: LAZY_ROOT_MARGIN })
  : null;

/* 网格里的图片只登记，不赋值 src：滚进视口前不产生任何图片请求。 */
function setLazyImage(image, url) {
  if (!url) return;
  image.decoding = "async";
  image.loading = "lazy";
  if (!lazyObserver) { image.src = url; return; }
  image.dataset.lazySrc = url;
  lazyObserver.observe(image);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  function register() {
    navigator.serviceWorker.register("sw.js").then(function() {
      /* 部署新版后，旧 Service Worker 仍会按旧缓存供外壳文件；新 SW 一旦接管就自动刷新一次，
         否则用户看到的是「改了但没生效」。首次安装时 clients.claim() 也会触发 controllerchange，
         所以只在本页加载时就已经有 controller 的情况下才刷新，并用 sessionStorage 保证一次会话只刷一次。 */
      if (!navigator.serviceWorker.controller) return;
      navigator.serviceWorker.addEventListener("controllerchange", function() {
        if (sessionStorage.getItem("guitar-shell-refreshed")) return;
        try { sessionStorage.setItem("guitar-shell-refreshed", "1"); } catch (error) { /* 隐私模式忽略 */ }
        window.location.reload();
      });
    }).catch(function(error) {
      console.warn("[离线缓存注册失败，功能不受影响]", error);
    });
  }

  /* boot() 会先 await 元数据，等它跑完 load 可能已经触发过了，所以两种情形都要覆盖 */
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
