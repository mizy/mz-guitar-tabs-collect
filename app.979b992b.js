/* 由 build-guitar-tabs-site.mjs 从源单文件的应用逻辑修补而来（见 PATCHES） */
const CATALOG_URL = "data/catalog.json";

let LIBRARY = null;
let SONGS = [];
let SONGS_BY_ID = new Map();
let VIEWS_BY_ID = new Map();
let TOTAL_PAGE_COUNT = 0;
let IMAGE_SOURCE_ALIASES = {};

/* 首屏先画外壳，元数据到了再填充；失败时停在 loading 文案上，不白屏。 */
function applyCatalog(library) {
  LIBRARY = library;
  IMAGE_SOURCE_ALIASES = library.imageAliases || {};
  SONGS = library.songs;
  SONGS_BY_ID = new Map(SONGS.map(function(song) { return [song.id, song]; }));
  VIEWS_BY_ID = new Map(library.views.map(function(view) { return [view.id, view]; }));
  TOTAL_PAGE_COUNT = SONGS.reduce(function(total, song) { return total + song.pageImageIds.length; }, 0);
  for (const imageId of library.reservedImageIds || []) delete IMAGES[imageId];
}
const READING_PROGRESS_KEY = "personal-guitar-library.reading-progress.v1";
const READING_MODE_KEY = "personal-guitar-library.reading-mode.v1";

const DOM = {
  loading: document.getElementById("loading"),
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  sidebarNav: document.getElementById("sidebarNav"),
  menuBtn: document.getElementById("menuBtn"),
  libraryName: document.getElementById("libraryName"),
  libraryStats: document.getElementById("libraryStats"),
  libraryTitle: document.getElementById("libraryTitle"),
  librarySummary: document.getElementById("librarySummary"),
  searchInput: document.getElementById("searchInput"),
  filterSummary: document.getElementById("filterSummary"),
  songGrid: document.getElementById("songGrid"),
  homeView: document.getElementById("home-view"),
  songView: document.getElementById("song-view"),
  backBtn: document.getElementById("backBtn"),
  songTitle: document.getElementById("songTitle"),
  songMeta: document.getElementById("songMeta"),
  pageGrid: document.getElementById("pageGrid"),
  viewer: document.getElementById("viewer"),
  viewerClose: document.getElementById("viewerClose"),
  viewerTitle: document.getElementById("viewerTitle"),
  viewerHint: document.getElementById("viewerHint"),
  viewerImg: document.getElementById("viewerImg"),
  viewerPages: document.getElementById("viewerPages"),
  viewerPageStatus: document.getElementById("viewerPageStatus"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  viewerToolbar: document.getElementById("viewerToolbar"),
  viewerStage: document.getElementById("viewerStage"),
  viewerFooter: document.getElementById("viewerFooter"),
  navPrev: document.getElementById("navPrev"),
  navNext: document.getElementById("navNext"),
  nextSongBtn: document.getElementById("nextSongBtn"),
  fitPageBtn: document.getElementById("fitPageBtn"),
  zoomControl: document.getElementById("zoomControl"),
  zoomSlider: document.getElementById("zoomSlider"),
  zoomValue: document.getElementById("zoomValue"),
  fitWidthBtn: document.getElementById("fitWidthBtn"),
  horizontalBtn: document.getElementById("horizontalBtn"),
  verticalBtn: document.getElementById("verticalBtn")
};

const state = {
  viewId: "all",
  query: "",
  currentSongId: null,
  pageIndex: 0,
  viewerOpen: false,
  fitMode: readReadingMode()
};

const readingProgress = readReadingProgress();
const zoom = { scale: 1, x: 0, y: 0 };
let lastViewerFocus = null;
let viewerScrollFrame = 0;

function resolveImageId(imageId) {
  const alias = IMAGE_SOURCE_ALIASES[String(imageId)];
  return Number(alias == null ? imageId : alias);
}

function getImageSource(imageId) {
  return IMAGES[resolveImageId(imageId)] || "";
}

/* 网格与页卡只取缩略图；阅读器再取整页图。 */
function getThumbSource(imageId) {
  const resolved = resolveImageId(imageId);
  return THUMB_DIR && IMAGES[resolved] ? THUMB_DIR + resolved + ".webp" : getImageSource(imageId);
}

function getCurrentSong() {
  return state.currentSongId ? SONGS_BY_ID.get(state.currentSongId) : null;
}

function clampPageIndex(song, index) {
  const numericIndex = Number.isFinite(index) ? Math.floor(index) : 0;
  return Math.max(0, Math.min(song.pageImageIds.length - 1, numericIndex));
}

function getPlayStyleLabel(playStyle) {
  const view = VIEWS_BY_ID.get(playStyle);
  return view ? view.label : playStyle;
}

function validateLibrary() {
  const issues = [];
  const seenSongIds = new Set();
  const seenPageIds = new Set();

  for (const song of SONGS) {
    if (!song.id || seenSongIds.has(song.id)) {
      issues.push("歌曲 id 缺失或重复：" + (song.id || song.title));
    }
    seenSongIds.add(song.id);

    if (!song.title || !song.artist) {
      issues.push("歌曲元数据缺失：" + song.id);
    }
    if (!VIEWS_BY_ID.has(song.playStyle) || song.playStyle === "all") {
      issues.push("歌曲演奏方式无效：" + song.id);
    }
    if (!Array.isArray(song.tags)) {
      issues.push("歌曲 tags 必须为数组：" + song.id);
    }
    if (!Array.isArray(song.pageImageIds) || song.pageImageIds.length === 0) {
      issues.push("歌曲没有 pageImageIds：" + song.id);
      continue;
    }

    for (const imageId of song.pageImageIds) {
      if (seenPageIds.has(imageId)) {
        issues.push("逻辑页被多个位置引用：" + imageId);
      }
      seenPageIds.add(imageId);

      if (!getImageSource(imageId)) {
        issues.push("找不到内嵌图片：" + imageId + "（歌曲 " + song.id + "）");
      }
    }
  }

  if (issues.length) {
    console.error("[吉他谱库目录校验失败]\n" + issues.join("\n"));
  }
}

function readReadingProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(READING_PROGRESS_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch (error) {
    return {};
  }
}

function readReadingMode() {
  try {
    const mode = localStorage.getItem(READING_MODE_KEY);
    return ["page", "width", "horizontal", "vertical"].includes(mode) ? mode : "page";
  } catch (error) {
    return "page";
  }
}

function saveReadingMode(mode) {
  try {
    localStorage.setItem(READING_MODE_KEY, mode);
  } catch (error) {
    // Local file origins may deny storage. Mode switching still works.
  }
}

function saveReadingProgress(songId, pageIndex) {
  try {
    readingProgress[songId] = pageIndex;
    localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(readingProgress));
  } catch (error) {
    // Local file origins may deny storage. Reading still works without progress.
  }
}

function getSavedPageIndex(song) {
  const pageIndex = Number(readingProgress[song.id]);
  if (!Number.isInteger(pageIndex)) return 0;
  return clampPageIndex(song, pageIndex);
}

function setLibraryChrome() {
  document.title = LIBRARY.name;
  DOM.libraryName.textContent = LIBRARY.name;
  DOM.libraryTitle.textContent = LIBRARY.name;
  DOM.libraryStats.textContent = SONGS.length + " 首 · " + TOTAL_PAGE_COUNT + " 页";
  DOM.librarySummary.textContent = "离线个人谱库 · 按演奏方式、歌手和标签检索";
}

function viewSongCount(viewId) {
  if (viewId === "all") return SONGS.length;
  return SONGS.filter(function(song) { return song.playStyle === viewId; }).length;
}

function renderSidebar() {
  DOM.sidebarNav.replaceChildren();

  for (const view of LIBRARY.views) {
    const item = document.createElement("button");
    const icon = document.createElement("span");
    const label = document.createElement("span");
    const count = document.createElement("span");
    const active = state.viewId === view.id;

    item.type = "button";
    item.className = "sidebar-item" + (active ? " active" : "");
    item.setAttribute("aria-pressed", String(active));
    icon.textContent = view.icon;
    label.textContent = view.label;
    count.className = "count";
    count.textContent = String(viewSongCount(view.id));

    item.append(icon, label, count);
    item.addEventListener("click", function() { setActiveView(view.id); });
    DOM.sidebarNav.append(item);
  }
}

function getFilteredSongs() {
  const query = state.query.trim().toLocaleLowerCase();

  return SONGS.filter(function(song) {
    if (state.viewId !== "all" && song.playStyle !== state.viewId) {
      return false;
    }
    if (!query) return true;

    const searchableText = [song.artist, song.title, song.playStyle, getPlayStyleLabel(song.playStyle)]
      .concat(song.tags || [], song.aliases || [], [song.practiceStatus || "", song.arrangement || ""])
      .join("\n")
      .toLocaleLowerCase();

    return searchableText.includes(query);
  });
}

function getNextPracticeSong() {
  let practiceSongs = getFilteredSongs();
  let currentIndex = practiceSongs.findIndex(function(song) { return song.id === state.currentSongId; });

  if (currentIndex < 0) {
    practiceSongs = SONGS;
    currentIndex = practiceSongs.findIndex(function(song) { return song.id === state.currentSongId; });
  }

  return currentIndex >= 0 ? practiceSongs[currentIndex + 1] || null : null;
}

function renderHome() {
  const songs = getFilteredSongs();
  const view = VIEWS_BY_ID.get(state.viewId) || VIEWS_BY_ID.get("all");
  const suffix = state.query.trim() ? " · 搜索结果" : "";

  DOM.filterSummary.textContent = view.label + " · " + songs.length + " 首" + suffix;
  DOM.songGrid.replaceChildren();

  if (!songs.length) {
    const empty = document.createElement("div");
    const icon = document.createElement("div");
    const copy = document.createElement("div");

    empty.className = "empty";
    icon.className = "big";
    icon.textContent = "🎸";
    copy.textContent = "没有匹配的吉他谱";
    empty.append(icon, copy);
    DOM.songGrid.append(empty);
    return;
  }

  for (const song of songs) {
    DOM.songGrid.append(createSongCard(song));
  }
}

function createSongCard(song) {
  const card = document.createElement("button");
  const image = document.createElement("img");
  const info = document.createElement("div");
  const title = document.createElement("div");
  const artist = document.createElement("div");

  card.type = "button";
  card.className = "song-card";
  card.setAttribute("aria-label", "打开 " + song.artist + "《" + song.title + "》");
  image.alt = song.artist + "《" + song.title + "》谱面预览";
  setLazyImage(image, getThumbSource(song.pageImageIds[0]));
  info.className = "song-info";
  title.className = "song-title";
  artist.className = "song-artist";
  title.textContent = song.title;
  artist.textContent = song.artist + " · " + getPlayStyleLabel(song.playStyle) + " · " + song.pageImageIds.length + " 页";

  info.append(title, artist);
  card.append(image, info);
  card.addEventListener("click", function() { openSong(song.id); });
  return card;
}

function renderSong(song) {
  const savedPageIndex = getSavedPageIndex(song);

  DOM.songTitle.textContent = song.artist + " · " + song.title;
  DOM.songMeta.textContent = getPlayStyleLabel(song.playStyle) + " · " + song.pageImageIds.length + " 页"
    + (savedPageIndex > 0 ? " · 上次读到第 " + (savedPageIndex + 1) + " 页" : "");
  DOM.pageGrid.replaceChildren();

  song.pageImageIds.forEach(function(imageId, pageIndex) {
    DOM.pageGrid.append(createPageCard(song, imageId, pageIndex, savedPageIndex));
  });
}

function createPageCard(song, imageId, pageIndex, savedPageIndex) {
  const card = document.createElement("button");
  const image = document.createElement("img");
  const badge = document.createElement("span");
  const isResumePage = savedPageIndex > 0 && pageIndex === savedPageIndex;

  card.type = "button";
  card.className = "page-card" + (isResumePage ? " resume" : "");
  card.setAttribute("aria-label", "阅读第 " + (pageIndex + 1) + " 页");
  image.alt = song.artist + "《" + song.title + "》第 " + (pageIndex + 1) + " 页";
  setLazyImage(image, getThumbSource(imageId));
  badge.className = "page-num";
  badge.textContent = isResumePage ? "继续 · " + (pageIndex + 1) : "第 " + (pageIndex + 1) + " 页";

  card.append(image, badge);
  card.addEventListener("click", function() { openViewer(pageIndex); });
  return card;
}

function showView(viewName, preserveScroll) {
  DOM.homeView.hidden = viewName !== "home";
  DOM.songView.hidden = viewName !== "song";
  if (!preserveScroll) window.scrollTo(0, 0);
}

function setActiveView(viewId) {
  if (!VIEWS_BY_ID.has(viewId)) return;
  state.viewId = viewId;
  renderSidebar();
  renderHome();
  setSidebarOpen(false);
}


function openSong(songId, options) {
  const settings = options || {};
  const song = SONGS_BY_ID.get(songId);

  if (!song) return;

  state.currentSongId = song.id;
  state.pageIndex = clampPageIndex(
    song,
    Number.isInteger(settings.pageIndex) ? settings.pageIndex : getSavedPageIndex(song)
  );

  renderSong(song);
  showView("song", settings.preserveScroll);

  if (settings.openViewer) {
    openViewer(state.pageIndex, { updateUrl: false, focus: settings.focusViewer });
  } else {
    closeViewer({ updateUrl: false, restoreFocus: false });
  }

  if (settings.updateUrl !== false) {
    writeLocation(Boolean(settings.replaceHistory));
  }
}

function goHome(options) {
  const settings = options || {};

  closeViewer({ updateUrl: false, restoreFocus: false });
  state.currentSongId = null;
  state.pageIndex = 0;
  showView("home", settings.preserveScroll);

  if (settings.updateUrl !== false) {
    writeLocation(Boolean(settings.replaceHistory));
  }
}

function openViewer(pageIndex, options) {
  const settings = options || {};
  const song = getCurrentSong();

  if (!song) return;

  state.pageIndex = clampPageIndex(song, pageIndex);
  if (!state.viewerOpen && settings.focus !== false) {
    lastViewerFocus = document.activeElement;
  }

  state.viewerOpen = true;
  DOM.viewer.hidden = false;
  document.body.classList.add("viewer-open");
  updateViewer();
  showViewerToolbar();

  if (settings.focus !== false) {
    window.requestAnimationFrame(function() { DOM.viewerClose.focus(); });
  }
  if (settings.updateUrl !== false) {
    writeLocation(Boolean(settings.replaceHistory));
  }
}

function closeViewer(options) {
  const settings = options || {};

  if (!state.viewerOpen) return;

  state.viewerOpen = false;
  DOM.viewer.hidden = true;
  document.body.classList.remove("viewer-open");
  DOM.viewerPages.replaceChildren();
  resetZoom();

  if (settings.restoreFocus !== false && lastViewerFocus && document.contains(lastViewerFocus)) {
    lastViewerFocus.focus();
  }
  lastViewerFocus = null;

  if (settings.updateUrl !== false) {
    writeLocation(false);
  }
}

function updateViewer() {
  const song = getCurrentSong();

  if (!song) return;

  const continuous = state.fitMode === "horizontal" || state.fitMode === "vertical";
  resetZoom();
  DOM.viewerStage.scrollTop = 0;
  DOM.viewerStage.scrollLeft = 0;
  DOM.viewerImg.hidden = continuous;
  DOM.viewerPages.hidden = !continuous;

  if (continuous) {
    renderContinuousPages(song);
  } else {
    const imageId = song.pageImageIds[state.pageIndex];
    DOM.viewerPages.replaceChildren();
    DOM.viewerImg.src = getImageSource(imageId);
    DOM.viewerImg.alt = song.artist + "《" + song.title + "》第 " + (state.pageIndex + 1) + " 页";
  }

  DOM.viewerTitle.textContent = song.artist + " · " + song.title;
  const nextSong = getNextPracticeSong();
  DOM.nextSongBtn.disabled = !nextSong;
  DOM.nextSongBtn.title = nextSong ? "下一首：" + nextSong.artist + "《" + nextSong.title + "》" : "已经是最后一首";
  DOM.nextSongBtn.setAttribute("aria-label", DOM.nextSongBtn.title);
  renderViewerPager(song);
  updateViewerPageStatus(song);

  if (continuous) {
    window.requestAnimationFrame(function() { scrollViewerToPage("auto"); });
  }
}

function renderContinuousPages(song) {
  DOM.viewerPages.replaceChildren();

  song.pageImageIds.forEach(function(imageId, pageIndex) {
    const sheet = document.createElement("div");
    const image = document.createElement("img");
    const badge = document.createElement("span");

    sheet.className = "viewer-sheet";
    sheet.dataset.pageIndex = String(pageIndex);
    image.alt = song.artist + "《" + song.title + "》第 " + (pageIndex + 1) + " 页";
    image.draggable = false;
    setLazyImage(image, getImageSource(imageId));
    badge.className = "viewer-sheet-number";
    badge.textContent = "第 " + (pageIndex + 1) + " 页";

    sheet.append(image, badge);
    DOM.viewerPages.append(sheet);
  });
}

function updateViewerPageStatus(song) {
  let modeHint = "Ctrl/⌘+滚轮或双指捏合缩放 · 放大后滚轮平移 · ← → 翻页";
  if (state.fitMode === "width") modeHint = "上下滚轮滚动 · ← → 翻页";
  if (state.fitMode === "horizontal") modeHint = "横向滚动翻页（滚轮 / 触控板均可）· ← → 跳页";
  if (state.fitMode === "vertical") modeHint = "上下滚动逐页 · 触控板横向手势平移 · ↑↓ 逐行";

  DOM.viewerHint.textContent = modeHint;
  DOM.viewerPageStatus.textContent = (state.pageIndex + 1) + " / " + song.pageImageIds.length;
  DOM.navPrev.disabled = state.pageIndex === 0;
  DOM.navNext.disabled = state.pageIndex === song.pageImageIds.length - 1;

  Array.from(DOM.viewerFooter.children).forEach(function(button, pageIndex) {
    const active = pageIndex === state.pageIndex;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  saveReadingProgress(song.id, state.pageIndex);
}

function scrollViewerToPage(behavior) {
  const sheet = DOM.viewerPages.querySelector('[data-page-index="' + state.pageIndex + '"]');
  if (!sheet) return;

  if (state.fitMode === "horizontal") {
    const left = sheet.offsetLeft - (DOM.viewerStage.clientWidth - sheet.offsetWidth) / 2;
    DOM.viewerStage.scrollTo({ left: Math.max(0, left), top: 0, behavior: behavior });
  } else if (state.fitMode === "vertical") {
    const left = Math.max(0, (DOM.viewerStage.scrollWidth - DOM.viewerStage.clientWidth) / 2);
    DOM.viewerStage.scrollTo({ left: left, top: Math.max(0, sheet.offsetTop - 8), behavior: behavior });
  }
}

function selectViewerPage(pageIndex, behavior) {
  const song = getCurrentSong();
  if (!song) return;

  state.pageIndex = clampPageIndex(song, pageIndex);
  if (state.fitMode === "horizontal" || state.fitMode === "vertical") {
    updateViewerPageStatus(song);
    scrollViewerToPage(behavior || "smooth");
  } else {
    updateViewer();
  }
  writeLocation(false);
}

function syncContinuousPageFromScroll() {
  if (!state.viewerOpen || (state.fitMode !== "horizontal" && state.fitMode !== "vertical")) return;

  window.cancelAnimationFrame(viewerScrollFrame);
  viewerScrollFrame = window.requestAnimationFrame(function() {
    const song = getCurrentSong();
    const stageBox = DOM.viewerStage.getBoundingClientRect();
    const stageCenter = state.fitMode === "horizontal"
      ? stageBox.left + stageBox.width / 2
      : stageBox.top + stageBox.height / 2;
    let closestPageIndex = state.pageIndex;
    let closestDistance = Infinity;

    Array.from(DOM.viewerPages.children).forEach(function(sheet, pageIndex) {
      const box = sheet.getBoundingClientRect();
      const center = state.fitMode === "horizontal"
        ? box.left + box.width / 2
        : box.top + box.height / 2;
      const distance = Math.abs(center - stageCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPageIndex = pageIndex;
      }
    });

    if (closestPageIndex !== state.pageIndex) {
      state.pageIndex = closestPageIndex;
      updateViewerPageStatus(song);
      writeLocation(true);
    }
  });
}

function renderViewerPager(song) {
  DOM.viewerFooter.replaceChildren();

  song.pageImageIds.forEach(function(imageId, pageIndex) {
    const button = document.createElement("button");
    const active = pageIndex === state.pageIndex;

    button.type = "button";
    button.className = "page-btn" + (active ? " active" : "");
    button.textContent = String(pageIndex + 1);
    button.setAttribute("aria-label", "第 " + (pageIndex + 1) + " 页");
    if (active) button.setAttribute("aria-current", "page");
    button.addEventListener("click", function() {
      selectViewerPage(pageIndex, "smooth");
    });
    DOM.viewerFooter.append(button);
  });
}

function changePage(direction) {
  const song = getCurrentSong();

  if (!song) return;

  const nextPageIndex = clampPageIndex(song, state.pageIndex + direction);
  if (nextPageIndex === state.pageIndex) return;

  selectViewerPage(nextPageIndex, "smooth");
}

function setFitMode(fitMode) {
  if (!["page", "width", "horizontal", "vertical"].includes(fitMode)) return;

  state.fitMode = fitMode;
  DOM.viewerStage.dataset.fit = fitMode;
  DOM.fitPageBtn.classList.toggle("active", fitMode === "page");
  DOM.fitWidthBtn.classList.toggle("active", fitMode === "width");
  DOM.horizontalBtn.classList.toggle("active", fitMode === "horizontal");
  DOM.verticalBtn.classList.toggle("active", fitMode === "vertical");
  DOM.fitPageBtn.setAttribute("aria-pressed", String(fitMode === "page"));
  DOM.fitWidthBtn.setAttribute("aria-pressed", String(fitMode === "width"));
  DOM.horizontalBtn.setAttribute("aria-pressed", String(fitMode === "horizontal"));
  DOM.verticalBtn.setAttribute("aria-pressed", String(fitMode === "vertical"));
  /* 四种排布都支持缩放，默认 100% */
  const supportsZoom = true;
  DOM.zoomControl.hidden = !supportsZoom;
  DOM.zoomSlider.disabled = !supportsZoom;
  saveReadingMode(fitMode);
  resetZoom();
  if (state.viewerOpen) updateViewer();
}

function writeLocation(replaceHistory) {
  const hash = state.currentSongId
    ? "#song=" + encodeURIComponent(state.currentSongId)
      + (state.viewerOpen ? "&page=" + (state.pageIndex + 1) : "")
    : "";

  if (window.location.hash === hash) return;

  try {
    const url = new URL(window.location.href);
    url.hash = hash.slice(1);
    window.history[replaceHistory ? "replaceState" : "pushState"](null, "", url.href);
  } catch (error) {
    window.location.hash = hash;
  }
}

function restoreLocation() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const songId = params.get("song");
  const song = songId ? SONGS_BY_ID.get(songId) : null;

  if (!song) {
    goHome({ updateUrl: false, preserveScroll: true });
    return;
  }

  const pageValue = Number(params.get("page"));
  const hasPage = params.has("page");
  const pageIndex = Number.isInteger(pageValue) && pageValue > 0
    ? clampPageIndex(song, pageValue - 1)
    : getSavedPageIndex(song);

  openSong(song.id, {
    pageIndex: pageIndex,
    openViewer: hasPage,
    updateUrl: false,
    preserveScroll: true,
    focusViewer: false
  });
}

function setSidebarOpen(open) {
  DOM.sidebar.classList.toggle("open", open);
  DOM.sidebarOverlay.hidden = !open;
  DOM.menuBtn.setAttribute("aria-expanded", String(open));
}

function resetZoom() {
  zoom.scale = 1;
  zoom.x = 0;
  zoom.y = 0;
  DOM.viewerImg.style.transform = "translate(0px, 0px) scale(1)";
  DOM.viewerImg.style.width = "";
  DOM.viewerPages.style.width = "";
  DOM.viewerPages.style.height = "";
  DOM.viewerStage.style.overflowY = "";
  DOM.viewerStage.classList.remove("zoomed-out");
  DOM.zoomSlider.value = "100";
  DOM.zoomValue.value = "100%";
}

function setZoom(nextScale) {
  const previousScale = zoom.scale;
  zoom.scale = Math.min(Math.max(nextScale, MIN_ZOOM), MAX_ZOOM);
  if (zoom.scale <= 1) {
    /* 1 倍及以下不需要平移偏移：缩小后整页本来就看得全 */
    zoom.x = 0;
    zoom.y = 0;
  }
  DOM.zoomSlider.value = String(Math.round(zoom.scale * 100));
  DOM.zoomValue.value = Math.round(zoom.scale * 100) + "%";
  if (state.fitMode === "page") {
    applyPageZoom();
  } else {
    applyZoom(previousScale);
  }
}

function applyPageZoom() {
  DOM.viewerImg.style.transform = "translate(" + zoom.x + "px, " + zoom.y + "px) scale(" + zoom.scale + ")";
  if (zoom.scale <= 1) return;

  const stageBox = DOM.viewerStage.getBoundingClientRect();
  const imageBox = DOM.viewerImg.getBoundingClientRect();
  const maxX = Math.max(0, (imageBox.width - stageBox.width) / 2);
  const maxY = Math.max(0, (imageBox.height - stageBox.height) / 2);
  const nextX = Math.max(-maxX, Math.min(maxX, zoom.x));
  const nextY = Math.max(-maxY, Math.min(maxY, zoom.y));

  if (nextX !== zoom.x || nextY !== zoom.y) {
    zoom.x = nextX;
    zoom.y = nextY;
    DOM.viewerImg.style.transform = "translate(" + zoom.x + "px, " + zoom.y + "px) scale(" + zoom.scale + ")";
  }
}

/* 缩放范围：50% ~ 150%，默认 100%（用户要求：既要能放大，也要能缩小）。
   这里的上下限必须与滑块 min/max 一致（滑块在 VIEWER_MARKUP 里），改一处要改另一处。 */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

/* 滚轮 / 触控板：任何排布下都要能顺畅滚动或平移。
   - 有可滚动空间就滚那条轴（横排滚横向、纵滚两轴都行、宽度只滚竖向）
   - 整页模式放大后按滚动方向平移画面；Ctrl/⌘+滚轮（触控板捏合）缩放
   - 整页模式未放大时，滚动即翻页（带节流，避免一下翻好几页） */
let wheelPageCooldown = 0;
let toolbarIdleTimer = 0;
let toolbarHiddenAt = 0;
let lastPointerX = null;
let lastPointerY = null;
const TOOLBAR_IDLE_MS = 2800;
/* 浏览器在样式/布局变化后会补发 pointermove（坐标不变），触控板也会飘；
   所以只有指针真的移动超过这个距离才算「人在操作」，否则一隐藏就被唤醒。 */
const TOOLBAR_MIN_POINTER_MOVE = 8;

/* 工具条浮在画面上、不占高度：闲置一会儿自动收起，指针真的动了就回来 */
function showViewerToolbar() {
  if (!state.viewerOpen) return;
  DOM.viewerToolbar.classList.remove("idle");
  window.clearTimeout(toolbarIdleTimer);
  toolbarIdleTimer = window.setTimeout(function() {
    if (state.viewerOpen) hideViewerToolbar();
  }, TOOLBAR_IDLE_MS);
}

function hideViewerToolbar() {
  window.clearTimeout(toolbarIdleTimer);
  toolbarHiddenAt = Date.now();
  DOM.viewerToolbar.classList.add("idle");
}

/* 手动兜底：按 T 直接收起/唤出工具条（自动隐藏万一不合口味就用这个） */
function toggleViewerToolbar() {
  if (DOM.viewerToolbar.classList.contains("idle")) showViewerToolbar();
  else hideViewerToolbar();
}

function handleViewerPointerMove(event) {
  if (typeof event.clientX !== "number") return;
  const previousX = lastPointerX;
  const previousY = lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  if (previousX === null) return;
  if (Math.hypot(event.clientX - previousX, event.clientY - previousY) < TOOLBAR_MIN_POINTER_MOVE) return;
  /* 刚隐藏完的一瞬间不复活，避免「隐藏→补发事件→又出现」的抖动 */
  if (Date.now() - toolbarHiddenAt < 400) return;
  showViewerToolbar();
}

function handleViewerWheel(event) {
  if (!state.viewerOpen) return;

  /* 触控板双指捏合在浏览器里就是 ctrl+wheel：四种排布都拿它当缩放 */
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    setZoom(zoom.scale * (event.deltaY < 0 ? 1.12 : 0.89));
    return;
  }

  const stage = DOM.viewerStage;
  const shiftAsHorizontal = event.shiftKey && !event.deltaX;
  const horizontalDelta = shiftAsHorizontal ? event.deltaY : event.deltaX;
  const verticalDelta = shiftAsHorizontal ? 0 : event.deltaY;

  if (state.fitMode === "page") {
    if (zoom.scale > 1) {
      event.preventDefault();
      zoom.x -= horizontalDelta;
      zoom.y -= verticalDelta;
      applyPageZoom();
      return;
    }
    const step = Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta;
    if (Math.abs(step) < 8) return;
    event.preventDefault();
    if (wheelPageCooldown) return;
    wheelPageCooldown = window.setTimeout(function() { wheelPageCooldown = 0; }, 280);
    changePage(step > 0 ? 1 : -1);
    return;
  }

  const canScrollX = stage.scrollWidth - stage.clientWidth > 1;
  const canScrollY = stage.scrollHeight - stage.clientHeight > 1;
  let handled = false;

  if (canScrollX && Math.abs(horizontalDelta) > 0.5) { stage.scrollLeft += horizontalDelta; handled = true; }
  if (canScrollY && Math.abs(verticalDelta) > 0.5) { stage.scrollTop += verticalDelta; handled = true; }
  /* 横排模式没有纵向滚动空间，竖向滚轮也当作横向滚动 */
  if (!handled && canScrollX && Math.abs(verticalDelta) > 0.5) { stage.scrollLeft += verticalDelta; handled = true; }

  if (handled) event.preventDefault();
}

/* 缩放：四种排布都要能放大缩小，默认 100%（zoom.scale = 1）
   - 整页：transform 缩放 + 滚轮平移（applyPageZoom 管）
   - 宽度：图片按百分比加宽，放大后靠横向滚动看
   - 横排：按舞台高度放大整排页面（页宽按比例跟着长），放大后允许纵向滚动
   - 纵滚：按舞台宽度放大页面宽度（沿用原实现） */
function applyZoom(previousScale) {
  const stage = DOM.viewerStage;
  /* 缩到 100% 以下时，宽度/横排模式的内容会窄于舞台，加类让样式把它居中（见 viewer-overrides.css） */
  stage.classList.toggle("zoomed-out", zoom.scale < 1);

  if (state.fitMode === "width") {
    DOM.viewerImg.style.width = zoom.scale === 1 ? "" : (zoom.scale * 100) + "%";
    return;
  }

  const scrollRatio = zoom.scale / (previousScale || 1);

  if (state.fitMode === "horizontal") {
    if (zoom.scale === 1) {
      DOM.viewerPages.style.height = "";
      stage.style.overflowY = "";
    } else {
      DOM.viewerPages.style.height = Math.round(stage.clientHeight * zoom.scale) + "px";
      stage.style.overflowY = "auto";
    }
    stage.scrollLeft *= scrollRatio;
    return;
  }

  const stageStyle = getComputedStyle(stage);
  const horizontalPadding = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
  const baseWidth = Math.min(stage.clientWidth - horizontalPadding, 1040);
  DOM.viewerPages.style.width = Math.round(baseWidth * zoom.scale) + "px";
  stage.scrollTop *= scrollRatio;
  stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
}

/* 全屏：只把阅读器元素放全屏（不动整页），退出时同步按钮状态 */
function isViewerFullscreen() {
  return document.fullscreenElement === DOM.viewer;
}

function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  const request = DOM.viewer.requestFullscreen || DOM.viewer.webkitRequestFullscreen;
  if (!request) return;
  Promise.resolve(request.call(DOM.viewer)).catch(function(error) {
    console.warn("[进入全屏失败]", error);
  });
}

function syncFullscreenButton() {
  const active = isViewerFullscreen();
  DOM.fullscreenBtn.classList.toggle("active", active);
  DOM.fullscreenBtn.setAttribute("aria-pressed", String(active));
  DOM.fullscreenBtn.textContent = active ? "退出全屏" : "全屏";
}

function bindViewerGestures() {
  const touch = {
    startX: null,
    startY: null,
    originX: 0,
    originY: 0,
    lastDistance: 0,
    panning: false,
    pinching: false
  };
  let mousePan = null;

  function touchDistance(touches) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  }

  DOM.viewerStage.addEventListener("touchstart", function(event) {
    if (!state.viewerOpen) return;

    /* 双指捏合：四种排布都能缩放 */
    if (event.touches.length === 2) {
      event.preventDefault();
      touch.pinching = true;
      touch.panning = false;
      touch.lastDistance = touchDistance(event.touches);
      return;
    }

    /* 单指拖动只在整页模式用来平移放大后的画面，其他排布交给原生滚动 */
    if (event.touches.length === 1 && state.fitMode === "page") {
      touch.startX = event.touches[0].clientX;
      touch.startY = event.touches[0].clientY;
      touch.originX = zoom.x;
      touch.originY = zoom.y;
      touch.panning = zoom.scale > 1;
      if (touch.panning) event.preventDefault();
    }
  }, { passive: false });

  DOM.viewerStage.addEventListener("touchmove", function(event) {
    if (!state.viewerOpen) return;

    if (event.touches.length === 2 && touch.pinching) {
      event.preventDefault();
      const distance = touchDistance(event.touches);
      if (touch.lastDistance > 0) setZoom(zoom.scale * (distance / touch.lastDistance));
      touch.lastDistance = distance;
      return;
    }

    if (event.touches.length === 1 && touch.panning && state.fitMode === "page") {
      event.preventDefault();
      zoom.x = touch.originX + event.touches[0].clientX - touch.startX;
      zoom.y = touch.originY + event.touches[0].clientY - touch.startY;
      applyPageZoom();
    }
  }, { passive: false });

  DOM.viewerStage.addEventListener("touchend", function(event) {
    if (event.touches.length) return;

    const wasGesture = touch.panning || touch.pinching;
    const endTouch = event.changedTouches[0];
    const deltaX = touch.startX == null ? 0 : endTouch.clientX - touch.startX;
    const deltaY = touch.startY == null ? 0 : endTouch.clientY - touch.startY;

    touch.startX = null;
    touch.startY = null;
    touch.lastDistance = 0;
    touch.panning = false;
    touch.pinching = false;

    if (!wasGesture && state.fitMode === "page" && zoom.scale <= 1
      && Math.abs(deltaX) > 64 && Math.abs(deltaX) > Math.abs(deltaY)) {
      changePage(deltaX > 0 ? -1 : 1);
    }
  }, { passive: false });

  DOM.viewerStage.addEventListener("touchcancel", function() {
    touch.startX = null;
    touch.startY = null;
    touch.lastDistance = 0;
    touch.panning = false;
    touch.pinching = false;
  });

  DOM.viewerStage.addEventListener("wheel", handleViewerWheel, { passive: false });

  DOM.viewerStage.addEventListener("mousedown", function(event) {
    if (!state.viewerOpen || zoom.scale <= 1 || state.fitMode !== "page") return;
    event.preventDefault();
    mousePan = { x: event.clientX, y: event.clientY, originX: zoom.x, originY: zoom.y };
  });

  window.addEventListener("mousemove", function(event) {
    if (!mousePan) return;
    zoom.x = mousePan.originX + event.clientX - mousePan.x;
    zoom.y = mousePan.originY + event.clientY - mousePan.y;
    applyPageZoom();
  });

  window.addEventListener("mouseup", function() {
    mousePan = null;
  });

  DOM.viewerImg.addEventListener("dragstart", function(event) {
    event.preventDefault();
  });
}

function bindEvents() {
  DOM.menuBtn.addEventListener("click", function() {
    setSidebarOpen(!DOM.sidebar.classList.contains("open"));
  });
  DOM.sidebarOverlay.addEventListener("click", function() { setSidebarOpen(false); });
  DOM.searchInput.addEventListener("input", function(event) {
    state.query = event.target.value;
    renderHome();
  });
  DOM.backBtn.addEventListener("click", function() { goHome(); });
  DOM.viewerClose.addEventListener("click", function() { closeViewer(); });
  DOM.navPrev.addEventListener("click", function() { changePage(-1); });
  DOM.navNext.addEventListener("click", function() { changePage(1); });
  DOM.nextSongBtn.addEventListener("click", function() {
    const nextSong = getNextPracticeSong();
    if (nextSong) openSong(nextSong.id, { pageIndex: 0, openViewer: true });
  });
  DOM.fitPageBtn.addEventListener("click", function() { setFitMode("page"); });
  DOM.fullscreenBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreenButton);
  DOM.viewer.addEventListener("pointermove", handleViewerPointerMove);
  DOM.viewer.addEventListener("pointerdown", showViewerToolbar);
  DOM.viewer.addEventListener("wheel", showViewerToolbar, { passive: true });
  DOM.viewer.addEventListener("touchstart", showViewerToolbar, { passive: true });
  /* 注意：T 是手动切换键，Esc 要留给「退全屏/关阅读器」，这两个键不能算「活动」，
     否则按 T 时先被活跃监听唤出、再被切换逻辑收起，表现为怎么按都是隐藏 */
  document.addEventListener("keydown", function(event) {
    const pressed = event.key.toLowerCase();
    if (pressed === "t" || pressed === "escape") return;
    showViewerToolbar();
  });
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) hideViewerToolbar();
  });
  DOM.zoomSlider.addEventListener("input", function(event) {
    setZoom(Number(event.target.value) / 100);
  });
  DOM.fitWidthBtn.addEventListener("click", function() { setFitMode("width"); });
  DOM.horizontalBtn.addEventListener("click", function() { setFitMode("horizontal"); });
  DOM.verticalBtn.addEventListener("click", function() { setFitMode("vertical"); });
  DOM.viewerStage.addEventListener("scroll", syncContinuousPageFromScroll, { passive: true });

  document.addEventListener("keydown", function(event) {
    if (state.viewerOpen) {
      if (event.key === "Escape") {
        /* 全屏时第一下 Esc 交给浏览器退全屏，第二下才关阅读器 */
        if (document.fullscreenElement) return;
        event.preventDefault();
        closeViewer();
      } else if (state.fitMode === "vertical" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const lineStep = Math.min(DOM.viewerStage.clientHeight * 0.45, 140 * zoom.scale);
        DOM.viewerStage.scrollBy({ top: direction * lineStep, behavior: "smooth" });
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        changePage(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        changePage(1);
      } else if (event.key.toLowerCase() === "f") {
        setFitMode("page");
      } else if (event.key.toLowerCase() === "w") {
        setFitMode("width");
      } else if (event.key.toLowerCase() === "h") {
        setFitMode("horizontal");
      } else if (event.key.toLowerCase() === "v") {
        setFitMode("vertical");
      } else if (event.key.toLowerCase() === "t") {
        toggleViewerToolbar();
      }
      return;
    }

    if (event.key === "/" && document.activeElement !== DOM.searchInput) {
      event.preventDefault();
      DOM.searchInput.focus();
    }
  });

  window.addEventListener("popstate", restoreLocation);
  window.addEventListener("hashchange", restoreLocation);
  window.addEventListener("resize", function() {
    if (!state.viewerOpen) return;
    resetZoom();
    if (state.fitMode === "horizontal" || state.fitMode === "vertical") {
      scrollViewerToPage("auto");
    }
  });

  bindViewerGestures();
}

async function boot() {
  try {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) throw new Error("catalog HTTP " + response.status);
    applyCatalog(await response.json());
  } catch (error) {
    console.error("[谱库元数据加载失败]", error);
    DOM.loading.textContent = "谱库元数据加载失败，检查网络后刷新即可";
    return;
  }

  validateLibrary();
  setLibraryChrome();
  renderSidebar();
  renderHome();
  setFitMode(state.fitMode);
  bindEvents();
  restoreLocation();
  DOM.loading.hidden = true;
  registerServiceWorker();
}

boot();
