
/* ============================================================
   WISP TUNNEL CONFIGURATION
   ============================================================
   Point this at your own WISP server for reliability:

     expose it as wss://your-host/

   Public demo (rate-limited, may be down):
     wss://wisp.mercurywork.shop/

   WISP URLs are host + path only. No port number.
   ============================================================ */
const LIBCURL_SOURCES = [
  "https://cdn.jsdelivr.net/npm/libcurl.js@0.7.4/libcurl_full.js",
  "https://unpkg.com/libcurl.js@0.7.4/libcurl_full.js",
  "https://cdn.jsdelivr.net/npm/libcurl.js@latest/libcurl_full.js"
];
const DEFAULT_WISP_URLS = [
  "wss://wisp.mercurywork.shop/",
  "wss://wisp.mercurywork.shop/wisp/"
];
function normalizeWispUrl(url){
  if (!url) return "";
  let u = String(url).trim();
  if (u.startsWith("https://")) u = "wss://" + u.slice(8);
  if (u.startsWith("http://")) u = "ws://" + u.slice(7);
  try {
    const dummy = new URL(u.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:"));
    dummy.port = "";
    const scheme = dummy.protocol === "https:" ? "wss://" : "ws://";
    u = scheme + dummy.hostname + (dummy.pathname || "/") + dummy.search;
  } catch(e){
    u = u.replace(/^(wss?:\/\/[^\/]+):\d+/i, "$1");
  }
  if (u && !u.endsWith("/")) u += "/";
  return u;
}
function loadSavedWispList(){
  const extra = [];
  try {
    const custom = localStorage.getItem("goar_wisp_custom");
    if (custom) extra.push(normalizeWispUrl(custom));
    const last = localStorage.getItem("goar_wisp_url");
    if (last) extra.push(normalizeWispUrl(last));
  } catch(e){}
  const seen = new Set();
  return [...extra, ...DEFAULT_WISP_URLS].filter(u => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}
let WISP_URL = loadSavedWispList()[0] || "wss://wisp.mercurywork.shop/";
let tunnelState = { status: "boot", url: WISP_URL, error: "" };

const VIDROCK = "https://vidrock.to";
const API_KEY = "52b87ad6cb79d6149c0453cd52253b72";
const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
let REGION = "US";
try { const loc = (navigator.language || "en-US").split("-")[1]; if (loc) REGION = loc.toUpperCase(); } catch(e){}
const TODAY = new Date().toISOString().slice(0,10);
let activeTab = "home";
let providerMapCache = {};
let regionChangeHooked = false;

/* ================= libcurl.js bootstrap ================= */
let _libcurlReady = null;
let _httpSession = null;

function setTunnelChip(status, label){
  tunnelState.status = status;
  const chip = document.getElementById("tunnelChip");
  const lab = document.getElementById("tunnelLabel");
  if (lab) lab.textContent = label;
  if (!chip) return;
  chip.classList.remove("ok","bad","busy");
  chip.classList.add(status === "ok" ? "ok" : status === "bad" ? "bad" : "busy");
}

function getLibcurl(){
  if (typeof window.libcurl !== "undefined" && window.libcurl) return window.libcurl;
  try {
    const lc = (0, eval)("typeof libcurl !== 'undefined' ? libcurl : null");
    if (lc){ window.libcurl = lc; return lc; }
  } catch(e){}
  return null;
}

function injectLibcurlScript(src){
  if (getLibcurl()) return Promise.resolve(src);
  if (document.querySelector('script[src*="libcurl"]')) {
    return waitLibcurlObject(8000).then(() => src);
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error("script failed: " + src));
    document.head.appendChild(s);
  });
}

function waitLibcurlObject(ms){
  return new Promise((resolve, reject) => {
    const hit = getLibcurl();
    if (hit) return resolve(hit);
    const t0 = Date.now();
    const iv = setInterval(() => {
      const lc = getLibcurl();
      if (lc){
        clearInterval(iv);
        resolve(lc);
      } else if (Date.now() - t0 > ms){
        clearInterval(iv);
        reject(new Error("libcurl.js did not attach to window"));
      }
    }, 50);
  });
}

async function waitLibcurlWasm(lc){
  if (lc.ready === true) return lc;
  if (typeof lc.load_wasm === "function"){
    try { await lc.load_wasm(); return lc; } catch(e){}
  }
  await new Promise((resolve, reject) => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; resolve(); };
    const fail = (e) => { if (settled) return; settled = true; reject(e || new Error("libcurl abort")); };
    if (typeof lc.onload === "undefined" || lc.onload === null){
      lc.onload = done;
    }
    document.addEventListener("libcurl_load", done, { once: true });
    document.addEventListener("libcurl_abort", (ev) => fail(ev && ev.error), { once: true });
    if (lc.events && typeof lc.events.addEventListener === "function"){
      lc.events.addEventListener("load", done, { once: true });
    }
    setTimeout(() => {
      if (lc.ready === true || (lc.version && lc.fetch)) done();
    }, 200);
    setTimeout(() => fail(new Error("libcurl WASM timed out")), 20000);
  });
  return lc;
}

function applyWispUrl(lc, url){
  const u = normalizeWispUrl(url);
  if (!u) throw new Error("WISP URL required and must end with /");
  if (typeof lc.transport === "string" || "transport" in lc){
    try { lc.transport = "wisp"; } catch(e){}
  }
  lc.set_websocket(u);
  WISP_URL = u;
  tunnelState.url = u;
  try { localStorage.setItem("goar_wisp_url", u); } catch(e){}
}

async function probeTunnel(lc){
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch(e){} }, 12000);
  try {
    const r = await lc.fetch("https://example.com/", ctrl ? { signal: ctrl.signal } : {});
    const body = await r.text();
    if (!r.ok && r.status >= 500) throw new Error("probe HTTP " + r.status);
    if (!body) throw new Error("empty probe response");
    return true;
  } finally {
    clearTimeout(timer);
  }
}

function getHttpSession(){
  if (_httpSession) return _httpSession;
  const lc = window.libcurl;
  if (lc && lc.HTTPSession){
    try {
      _httpSession = new lc.HTTPSession({ enable_cookies: true });
      if (_httpSession.set_connections) _httpSession.set_connections(30, 20, 6);
    } catch(e){
      _httpSession = null;
    }
  }
  return _httpSession;
}

function resetHttpSession(){
  if (_httpSession && typeof _httpSession.close === "function"){
    try { _httpSession.close(); } catch(e){}
  }
  _httpSession = null;
}

async function ensureLibcurl(force){
  if (_libcurlReady && !force) return _libcurlReady;
  _libcurlReady = (async () => {
    setTunnelChip("busy", "loading WASM…");
    let lc = null;
    try {
      lc = await waitLibcurlObject(1500);
    } catch(e){
      let last = e;
      for (const src of LIBCURL_SOURCES){
        try { await injectLibcurlScript(src); lc = await waitLibcurlObject(8000); break; }
        catch(err){ last = err; }
      }
      if (!lc) throw last;
    }
    await waitLibcurlWasm(lc);
    if (typeof lc.fetch !== "function" || typeof lc.set_websocket !== "function"){
      throw new Error("libcurl.js loaded without fetch/set_websocket");
    }

    const urls = loadSavedWispList();
    let lastErr = null;
    for (const url of urls){
      setTunnelChip("busy", "wisp…");
      try {
        applyWispUrl(lc, url);
        resetHttpSession();
        await probeTunnel(lc);
        setTunnelChip("ok", "wisp");
        tunnelState.error = "";
        window.libcurl = lc;
        return lc;
      } catch(e){
        lastErr = e;
        console.warn("[goarxyz] WISP probe failed:", url, e);
      }
    }
    // Keep last URL applied so a later retry / custom URL can still work
    applyWispUrl(lc, urls[0]);
    setTunnelChip("bad", "wisp down");
    tunnelState.error = lastErr && lastErr.message ? lastErr.message : String(lastErr || "all WISP endpoints failed");
    window.libcurl = lc;
    return lc;
  })();
  try {
    return await _libcurlReady;
  } catch(e){
    _libcurlReady = null;
    setTunnelChip("bad", "libcurl fail");
    tunnelState.error = e && e.message ? e.message : String(e);
    throw e;
  }
}

async function wispFetch(url, init){
  const lc = await ensureLibcurl();
  const sess = getHttpSession();
  const fn = (sess && sess.fetch) ? sess.fetch.bind(sess) : lc.fetch.bind(lc);
  return fn(url, init);
}
async function wispText(url, init){
  const r = await wispFetch(url, init);
  if (!r.ok) throw new Error("WISP HTTP " + r.status + " " + url);
  return r.text();
}
async function wispBytes(url, init){
  const r = await wispFetch(url, init);
  if (!r.ok) throw new Error("WISP HTTP " + r.status + " " + url);
  return r.arrayBuffer();
}

function buildWispSelect(){
  const sel = document.getElementById("wispSelect");
  if (!sel || sel._hooked) return;
  const urls = loadSavedWispList();
  sel.innerHTML = urls.map(u => '<option value="' + u + '"' + (u===WISP_URL?' selected':'') + '>' + u.replace(/^wss:\/\//,"") + '</option>').join("") +
    '<option value="__custom__">custom wss://…</option>';
  sel.onchange = async () => {
    let url = sel.value;
    if (url === "__custom__"){
      const typed = prompt("WISP WebSocket URL (must end with /)", WISP_URL);
      if (!typed){ sel.value = WISP_URL; return; }
      url = normalizeWispUrl(typed);
      try { localStorage.setItem("goar_wisp_custom", url); } catch(e){}
    }
    WISP_URL = url;
    try { localStorage.setItem("goar_wisp_url", url); } catch(e){}
    resetHttpSession();
    _libcurlReady = null;
    toast("Switching WISP…");
    try {
      const lc = await ensureLibcurl(true);
      applyWispUrl(lc, url);
      await probeTunnel(lc);
      setTunnelChip("ok", "wisp");
      toast("WISP connected");
    } catch(e){
      setTunnelChip("bad", "wisp down");
      toast("WISP failed: " + (e.message || e));
    }
    sel._hooked = false;
    buildWispSelect();
  };
  const retry = document.getElementById("wispRetry");
  if (retry && !retry._hooked){
    retry._hooked = true;
    retry.onclick = async () => {
      resetHttpSession();
      _libcurlReady = null;
      try { await ensureLibcurl(true); toast("Tunnel ready"); }
      catch(e){ toast("Tunnel failed: " + (e.message || e)); }
    };
  }
  sel._hooked = true;
}

window.goarTunnelFetch = function(url, init){
  return wispFetch(url, init);
};

/* ================= PWA ================= */
(function setupPWA(){
  function makeIcon(size){
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.fillStyle = "#0a0a0d";
    const r = size * 0.18;
    g.beginPath();
    g.moveTo(r,0); g.lineTo(size-r,0); g.quadraticCurveTo(size,0,size,r);
    g.lineTo(size,size-r); g.quadraticCurveTo(size,size,size-r,size);
    g.lineTo(r,size); g.quadraticCurveTo(0,size,0,size-r);
    g.lineTo(0,r); g.quadraticCurveTo(0,0,r,0); g.fill();
    g.fillStyle = "#e8b64c";
    g.font = "700 " + Math.round(size*0.42) + "px Space Grotesk, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("g", size/2, size/2 + size*0.04);
    return c.toDataURL("image/png");
  }
  const icon192 = makeIcon(192);
  const icon512 = makeIcon(512);
  const apple = document.getElementById("appleTouchIcon");
  if (apple) apple.href = icon192;
  let iconLink = document.querySelector('link[rel="icon"]');
  if (!iconLink){ iconLink = document.createElement("link"); iconLink.rel = "icon"; document.head.appendChild(iconLink); }
  iconLink.type = "image/png";
  iconLink.href = icon192;

  const start = "./";
  const manifest = {
    name: "goarxyz",
    short_name: "goarxyz",
    description: "Movies, TV, anime, kids and music",
    id: "/",
    start_url: start,
    scope: "./",
    display: "standalone",
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#0a0a0d",
    theme_color: "#0a0a0d",
    categories: ["entertainment", "video"],
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  };
  const man = document.getElementById("manifestLink");
  if (man) man.href = "data:application/manifest+json," + encodeURIComponent(JSON.stringify(manifest));

  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if ("serviceWorker" in navigator && secure){
    const swCode = [
      "const CACHE='goarxyz-v2';",
      "self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./']).catch(()=>{}))); });",
      "self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k))))); self.clients.claim(); });",
      "self.addEventListener('fetch', e => {",
      "  const u = e.request.url;",
      "  if (u.includes('api.themoviedb.org') || u.includes('image.tmdb.org') || u.startsWith('blob:') || u.includes('vidrock.') || u.includes('libcurl') || u.includes('hls.js')) return;",
      "  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).catch(() => caches.match('./'))); return; }",
      "});"
    ].join("");
    try {
      const blob = new Blob([swCode], {type:"application/javascript"});
      navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(()=>{});
    } catch(e){}
  }
})();

function isTvDevice(){
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("tv") === "1" || q.get("tv") === "true") return true;
  } catch(e){}
  const ua = navigator.userAgent || "";
  if (/SmartTV|SMART-TV|Smart-TV|Tizen|Web0S|WebOS|NetCast|BRAVIA|AFT[A-Z]|CrKey|TV Safari|HbbTV|Viera|Hisense|VIDAA|PlayStation|Xbox|AppleTV|GoogleTV|FireTV|Android TV/i.test(ua)) return true;
  try {
    if (window.matchMedia("(min-width: 1280px) and (pointer: coarse)").matches) return true;
    if (window.matchMedia("(min-width: 1920px) and (hover: none)").matches) return true;
  } catch(e){}
  return false;
}
function tvFocusables(){
  return [...document.querySelectorAll(".card, .top10-item, .provider-app, .btn, nav a, .cat-chip, .see-all, .p-close, .player-picker select")].filter(el => {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.offsetParent !== null;
  });
}
function setupTvMode(){
  if (!isTvDevice()) return;
  document.body.classList.add("tv");
  document.documentElement.style.cursor = "none";
  document.addEventListener("keydown", (e) => {
    const keys = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-2, ArrowDown:2 };
    if (!(e.key in keys) && e.key !== "Enter" && e.key !== "Go" && e.key !== "Select") return;
    const overlay = document.getElementById("playerOverlay");
    if (overlay && overlay.classList.contains("open") && (e.key === "Backspace" || e.key === "Escape")) return;
    if (e.key === "Enter" || e.key === "Go" || e.key === "Select"){
      const a = document.activeElement;
      if (a && a !== document.body){ a.click(); e.preventDefault(); }
      return;
    }
    e.preventDefault();
    const items = tvFocusables();
    if (!items.length) return;
    const cur = document.activeElement;
    let idx = items.indexOf(cur);
    if (idx < 0){ items[0].focus(); return; }
    const dir = keys[e.key];
    const cr = cur.getBoundingClientRect();
    const cx = cr.left + cr.width/2, cy = cr.top + cr.height/2;
    let best = null, bestScore = Infinity;
    items.forEach((el, i) => {
      if (i === idx) return;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width/2, y = r.top + r.height/2;
      const dx = x - cx, dy = y - cy;
      if (dir === 1 && dx <= 8) return;
      if (dir === -1 && dx >= -8) return;
      if (dir === 2 && dy <= 8) return;
      if (dir === -2 && dy >= -8) return;
      const primary = (dir === 1 || dir === -1) ? Math.abs(dx) : Math.abs(dy);
      const secondary = (dir === 1 || dir === -1) ? Math.abs(dy) : Math.abs(dx);
      const score = primary + secondary * 2.2;
      if (score < bestScore){ bestScore = score; best = el; }
    });
    if (best){
      best.focus();
      best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  });
  setTimeout(() => {
    const first = document.getElementById("heroPlay") || tvFocusables()[0];
    if (first) first.focus();
  }, 800);
}
document.addEventListener("DOMContentLoaded", setupTvMode);
if (document.readyState !== "loading") setupTvMode();

/* ================= TMDB API ================= */
async function tmdb(path, params={}){
  const url = new URL(BASE+path);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language","en-US");
  for (const k in params){ if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]); }
  let res;
  try { res = await fetch(url); }
  catch(e){ throw new Error("NETWORK: " + e.message); }
  let body; try { body = await res.json(); } catch(e){ body = null; }
  if (!res.ok){ const msg = body && body.status_message ? body.status_message : ("HTTP "+res.status); throw new Error("TMDB "+res.status+": "+msg); }
  return body;
}
function showKeyBanner(msg){ const b = document.getElementById("keyBanner"); b.textContent = "⚠ " + msg; b.classList.add("show"); }
function toast(msg){ const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove("show"), 2200); }

/* ================= HELPERS ================= */
function yearOf(item){ return (item.release_date||item.first_air_date||"").slice(0,4) || "—"; }
function titleOf(item){ return item.title || item.name || "Untitled"; }
function typeOf(item){ return item._forceType || item.media_type || (item.title ? "movie":"tv"); }
function ratingOf(item){ return item.vote_average ? item.vote_average.toFixed(1) : "—"; }
function posterImg(item, size="w342"){ return item.poster_path ? IMG + "/" + size + item.poster_path : "https://placehold.co/300x450/17171e/8b8c98?text=No+Image"; }
function backdropImg(item, size="original"){ return item.backdrop_path ? IMG + "/" + size + item.backdrop_path : posterImg(item,"w780"); }
function profileImg(p, size="w185"){ return p ? IMG + "/" + size + p : "https://placehold.co/185x185/1a1a22/5a5a68?text=%20"; }
function providerLogo(path, size="w92"){ return path ? IMG + "/" + size + path : ""; }
function daysAgoISO(days){ const d = new Date(); d.setDate(d.getDate()-days); return d.toISOString().slice(0,10); }
function mergeTwo(a, b, cmp){
  const out = []; let i = 0, j = 0;
  while (i < a.length || j < b.length){
    if (i >= a.length){ out.push(b[j++]); continue; }
    if (j >= b.length){ out.push(a[i++]); continue; }
    out.push(cmp(a[i], b[j]) >= 0 ? a[i++] : b[j++]);
  }
  return out;
}
const cmpPop = (a,b) => (a.popularity||0) - (b.popularity||0);
const cmpRating = (a,b) => (a.vote_average||0) - (b.vote_average||0);
const cmpDate = (a,b) => ((a.release_date||a.first_air_date||"")).localeCompare((b.release_date||b.first_air_date||""));

/* ================= LOCAL STORAGE ================= */
const LS = {
  get(k, fallback){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch(e){ return fallback; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
let watchlist = LS.get("goar_watchlist", []);
let continueList = LS.get("goar_continue", []);
function isSaved(id, type){ return watchlist.some(x => x.id == id && x.type === type); }
function toggleSave(item, type){
  const i = watchlist.findIndex(x => x.id == item.id && x.type === type);
  if (i >= 0){ watchlist.splice(i, 1); toast("Removed from My List"); }
  else { watchlist.unshift({ id:item.id, type, title:titleOf(item), poster:item.poster_path, rating:item.vote_average, date:yearOf(item), added:Date.now() }); toast("Added to My List"); }
  LS.set("goar_watchlist", watchlist);
  document.querySelectorAll(".card-save[data-id=\"" + item.id + "\"][data-type=\"" + type + "\"]").forEach(b => {
    const saved = isSaved(item.id, type); b.classList.toggle("saved", saved);
  });
}
function pushContinue(item, type, season, episode){
  continueList = continueList.filter(x => !(x.id == item.id && x.type === type));
  continueList.unshift({ id:item.id, type, title:titleOf(item), poster:item.poster_path, rating:item.vote_average, season:season||null, episode:episode||null, at:Date.now() });
  if (continueList.length > 20) continueList.length = 20;
  LS.set("goar_continue", continueList);
}

/* ================= CARD ================= */
function card(item, opts={}, idx=0){
  const t = typeOf(item);
  const div = document.createElement("div");
  div.className = "card anim-up";
  div.tabIndex = 0;
  div.style.animationDelay = Math.min(idx*35, 400)+"ms";
  let label = t==="anime" ? "ANIME" : (t==="movie" ? "MOVIE" : "TV");
  let badgeClass = t;
  if (opts.kids){ label = "KIDS"; badgeClass = "kids"; }
  else if (t==="music"){ label = "MUSIC"; badgeClass = "music"; }
  const saved = isSaved(item.id, t);
  div.innerHTML = '<div class="poster-wrap">' +
    '<img loading="lazy" src="' + posterImg(item) + '" alt="' + titleOf(item) + '">' +
    '<div class="badge-rating">★ ' + ratingOf(item) + '</div>' +
    '<div class="badge-type ' + badgeClass + '">' + label + '</div>' +
    '<button class="card-save ' + (saved?'saved':'') + '" data-id="' + item.id + '" data-type="' + t + '" aria-label="Save">' +
    '<svg viewBox="0 0 24 24" fill="' + (saved?'currentColor':'none') + '" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>' +
    '</button></div>' +
    '<div class="card-title">' + titleOf(item) + '</div>' +
    '<div class="card-sub">' + yearOf(item) + '</div>';
  div.onclick = (e) => {
    if (e.target.closest(".card-save")) return;
    openModal(item.id, item._realType || (t==="anime" ? item._animeKind : t));
  };
  const saveBtn = div.querySelector(".card-save");
  saveBtn.onclick = (e) => { e.stopPropagation(); toggleSave(item, t); };
  return div;
}
function top10Card(item, idx=0){
  const t = typeOf(item);
  const wrap = document.createElement("div");
  wrap.className = "top10-item anim-up";
  wrap.tabIndex = 0;
  wrap.style.animationDelay = Math.min(idx*35, 400)+"ms";
  wrap.innerHTML =
    '<div class="top10-row">' +
      '<div class="top10-rank' + (idx >= 9 ? ' t10-wide' : '') + '">' + (idx+1) + '</div>' +
      '<div class="poster-wrap">' +
        '<img loading="lazy" src="' + posterImg(item) + '" alt="' + titleOf(item) + '">' +
        '<div class="badge-rating">★ ' + ratingOf(item) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-title">' + titleOf(item) + '</div>' +
    '<div class="card-sub">' + yearOf(item) + '</div>';
  wrap.onclick = () => openModal(item.id, item._realType || (t==="anime" ? item._animeKind : t));
  return wrap;
}
function musicCard(item, idx=0){
  const div = document.createElement("div");
  div.className = "music-card anim-up";
  div.style.animationDelay = Math.min(idx*35, 400)+"ms";
  div.innerHTML = '<div class="music-art">' +
    '<img loading="lazy" src="' + posterImg(item,"w342") + '" alt="' + titleOf(item) + '">' +
    '<div class="badge-music">♪ MUSIC</div></div>' +
    '<div class="card-title">' + titleOf(item) + '</div>' +
    '<div class="card-sub">' + yearOf(item) + '</div>';
  div.onclick = () => openModal(item.id, item._mediaType || "movie");
  return div;
}
function railInto(container, items, opts={}){
  if (!container) return;
  container.innerHTML = "";
  container.className = "rail" + (opts.top10 ? " rail-top10" : "");
  if (!items.length){ container.innerHTML = '<div class="loader small">Nothing found here yet.</div>'; return; }
  items.forEach((item, i) => {
    if (opts.top10){
      container.appendChild(top10Card(item, i));
    } else if (opts.music) container.appendChild(musicCard(item, i));
    else container.appendChild(card(item, {kids: opts.kids}, i));
  });
}
async function loadRail(elId, fetcher, opts={}){
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = "";
  for (let i=0;i<6;i++){ const sk = document.createElement("div"); sk.className = "skel"; el.appendChild(sk); }
  try { railInto(el, await fetcher(), opts); }
  catch(e){ el.innerHTML = '<div class="loader err small">Couldn\'t load.<br><code>' + e.message + '</code></div>'; }
}
function sectionEl(id, title, sub, seeAllFn){
  const s = document.createElement("div");
  s.className = "section";
  s.innerHTML = '<div class="section-head"><div><h2>' + title + '</h2>' + (sub ? '<p>'+sub+'</p>' : '') + '</div>' +
    (seeAllFn ? '<span class="see-all" id="' + id + '_seeall">See all →</span>' : '') + '</div>' +
    '<div class="rail" id="' + id + '"></div>';
  if (seeAllFn) setTimeout(()=>{ const el = document.getElementById(id+"_seeall"); if (el) el.onclick = seeAllFn; }, 0);
  return s;
}

/* ============================================================
   PLAYER — WISP + libcurl.js + Blob iframe
   ============================================================
   Pipeline:
     1. Parent already holds a live libcurl.js WASM + WISP socket.
     2. Fetch the player HTML through that tunnel.
     3. Strip sandbox detector / ad libs / Histats / CSP.
     4. Inject a bootstrap that REUSES parent.libcurl (blob iframe
        is same-origin). fetch / XHR / WebSocket are queued until
        the tunnel is ready, then flushed. Page scripts do not race
        a second WASM download.
     5. Load the rewritten HTML as a blob URL.
   ============================================================ */
let playerToken = 0;
const playerState = { id:null, type:"movie", title:"", item:null, seasons:[], season:1, episode:1, sources:[], sourceName:null, hls:null };

const VR_ORIGINS = ["https://vidrock.net", "https://vidrock.to"];
let VR_ORIGIN = VR_ORIGINS[0];
const VR_AES_KEY_HEX = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
const PLAY_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SOURCES_CACHE_TTL = 60000;
const SERVER_ORDER = ["Nova","Atlas","Luna","Orion","Astra"];
const SERVER_PROFILES = {
  Nova:  { hosts:["cdn.ngcorp.dad"], needsProxy:true,  directPlayable:false },
  Atlas: { hosts:["cdn1.ngcorp.dad"], needsProxy:true,  directPlayable:false },
  Luna:  { hosts:["dreadnought.flamingo-e55.workers.dev"], needsProxy:true, directPlayable:true },
  Orion: { hosts:["dream.flamingo-e55.workers.dev","celestialdreamer.lol","goldenfirewanderer.lol"], needsProxy:true, directPlayable:true },
  Astra: { hosts:["streamrk.site","v1.streamrk.site"], needsProxy:false, directPlayable:true, normalize:true }
};
const sourceCache = new Map();
function playHeaders(extra){
  return Object.assign({
    "User-Agent": PLAY_UA,
    Referer: VR_ORIGIN + "/",
    Origin: VR_ORIGIN,
    Accept: "*/*"
  }, extra || {});
}
function profileByName(name){ return SERVER_PROFILES[name] || null; }
function profileByUrl(url){
  try {
    const host = new URL(url).hostname;
    for (const name of SERVER_ORDER){
      const p = SERVER_PROFILES[name];
      if (p.hosts.some(h => host === h || host.endsWith("." + h))) return Object.assign({ name }, p);
    }
  } catch(e){}
  return null;
}
function stripPngPrefix(buf){
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length >= 1 && u8[0] === 0x47) return u8;
  if (u8.length < 8 || u8[0] !== 0x89 || u8[1] !== 0x50 || u8[2] !== 0x4e || u8[3] !== 0x47) return u8;
  const n = [0x49,0x45,0x4e,0x44];
  for (let i = 0; i < u8.length - 8; i++){
    if (u8[i]===n[0] && u8[i+1]===n[1] && u8[i+2]===n[2] && u8[i+3]===n[3]) return u8.subarray(i + 8);
  }
  return u8;
}
let _vrKeyPromise = null;

function hexToBytes(hex){
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i*2, 2), 16);
  return out;
}
function b64urlToBytes(input){
  let b64 = String(input).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad === 1) throw new Error("bad b64url");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function vrAesKey(){
  if (_vrKeyPromise) return _vrKeyPromise;
  _vrKeyPromise = crypto.subtle.importKey("raw", hexToBytes(VR_AES_KEY_HEX), "AES-GCM", false, ["decrypt"]);
  return _vrKeyPromise;
}
async function decryptStreamUrl(ciphertext){
  const bytes = b64urlToBytes(ciphertext);
  if (bytes.length < 28) throw new Error("ciphertext too short");
  const iv = bytes.slice(0, 12);
  const dataAndTag = bytes.slice(12);
  const key = await vrAesKey();
  const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, dataAndTag);
  return new TextDecoder().decode(pt);
}
async function decryptSourcesPayload(payload){
  const sources = [];
  for (const name of Object.keys(payload || {})){
    const row = payload[name];
    if (!row || typeof row !== "object" || !row.url) continue;
    const format = row.type === "mp4" ? "mp4" : (row.type === "hls" ? "hls" : null);
    if (!format) continue;
    try {
      sources.push({ name, url: await decryptStreamUrl(row.url), format });
    } catch(e){
      console.warn("[goarxyz] skip source", name, e);
    }
  }
  return sources;
}

async function mediaFetch(url, init){
  const merged = Object.assign({}, init || {});
  merged.headers = playHeaders(init && init.headers);
  if (tunnelState.status === "ok"){
    try { return await wispFetch(url, merged); } catch(e){}
  }
  return fetch(url, merged);
}

async function normalizeAstraUrl(url){
  const res = await mediaFetch(url, { headers: playHeaders({ Accept: "application/json, */*" }) });
  if (!res.ok) throw new Error("astra playlist " + res.status);
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch(e){ return url; }
  if (!Array.isArray(data) || !data.length) return url;
  const qualities = data.filter(row => row && typeof row.resolution === "number" && typeof row.url === "string");
  if (!qualities.length) return url;
  qualities.sort((a, b) => b.resolution - a.resolution);
  return qualities[0].url;
}

async function resolveSources(id, type, season, episode){
  const path = type === "movie" ? ("/api/movie/" + id) : ("/api/tv/" + id + "/" + season + "/" + episode);
  const cacheKey = path;
  const hit = sourceCache.get(cacheKey);
  if (hit && Date.now() - hit.at < SOURCES_CACHE_TTL) return hit.sources.map(s => Object.assign({}, s));

  let payload = null, lastErr = null;
  for (const origin of VR_ORIGINS){
    VR_ORIGIN = origin;
    const url = origin + path;
    const init = { headers: playHeaders({ Accept: "application/json" }) };
    try {
      let res;
      try { res = await mediaFetch(url, init); }
      catch(e){ res = await fetch(url, init); }
      if (!res.ok) throw new Error("source catalog HTTP " + res.status);
      const json = await res.json();
      if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("api json invalid");
      payload = json;
      break;
    } catch(e){ lastErr = e; }
  }
  if (!payload) throw lastErr || new Error("source catalog failed");

  let sources = await decryptSourcesPayload(payload);
  sources = sources.filter(s => profileByName(s.name));
  sources.sort((a, b) => SERVER_ORDER.indexOf(a.name) - SERVER_ORDER.indexOf(b.name));
  for (const src of sources){
    const prof = profileByName(src.name);
    if (prof && prof.normalize){
      try { src.url = await normalizeAstraUrl(src.url); src.format = "mp4"; } catch(e){ src._dead = true; }
    }
  }
  sources = sources.filter(s => !s._dead);
  if (!sources.length) throw new Error("no playable sources");
  sourceCache.set(cacheKey, { at: Date.now(), sources });
  return sources.map(s => Object.assign({}, s));
}

function setPlayerStatus(html, isErr){
  const el = document.getElementById("playerStatus");
  if (!el) return;
  if (!html){ el.classList.add("hide"); el.innerHTML = ""; return; }
  el.classList.remove("hide");
  el.innerHTML = isErr ? ('<b>Couldn\'t play</b><span>' + html + '</span>') : ('<span>' + html + '</span>');
}

function destroyHls(){
  if (playerState.hls){
    try { playerState.hls.destroy(); } catch(e){}
    playerState.hls = null;
  }
  const v = document.getElementById("playerVideo");
  if (v){ try { v.pause(); } catch(e){} v.removeAttribute("src"); v.load(); }
}

class WispHlsLoader {
  constructor(config){
    this.config = config;
    this.stats = { aborted:false, loaded:0, retry:0, total:0, chunkCount:0, bwEstimate:0, loading:{start:0,first:0,end:0}, buffering:{start:0,first:0,end:0}, parsing:{start:0,end:0} };
    this._abort = false;
  }
  abort(){ this._abort = true; this.stats.aborted = true; }
  destroy(){ this.abort(); }
  load(context, config, callbacks){
    this.stats.loading.start = performance.now();
    const wantText = context.responseType === "text" || (context.type && String(context.type).indexOf("manifest") >= 0);
    mediaFetch(context.url, { headers: playHeaders() }).then(async (r) => {
      if (this._abort) return;
      if (!r.ok) throw new Error("HTTP " + r.status);
      let data;
      if (wantText){
        data = await r.text();
      } else {
        const raw = new Uint8Array(await r.arrayBuffer());
        const stripped = stripPngPrefix(raw);
        data = stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength);
      }
      this.stats.loaded = typeof data === "string" ? data.length : data.byteLength;
      this.stats.total = this.stats.loaded;
      this.stats.loading.first = this.stats.loading.end = performance.now();
      callbacks.onSuccess({ url: context.url, data }, this.stats, context, null);
    }).catch((err) => {
      if (this._abort) return;
      callbacks.onError({ code: 0, text: String(err && err.message ? err.message : err) }, context, null);
    });
  }
}

async function playSource(source){
  const video = document.getElementById("playerVideo");
  destroyHls();
  playerState.sourceName = source.name;
  setPlayerStatus("Starting " + source.name + "…");
  if (source.format === "mp4"){
    video.src = source.url;
    setPlayerStatus("");
    try { await video.play(); } catch(e){}
    return;
  }
  const canNative = video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl");
  if (canNative && !window.Hls){
    video.src = source.url;
    setPlayerStatus("");
    try { await video.play(); } catch(e){}
    return;
  }
  if (typeof Hls === "undefined") throw new Error("hls.js missing");
  async function attach(loader){
    const opts = { enableWorker: true, lowLatencyMode: false, maxBufferLength: 8, maxMaxBufferLength: 16 };
    if (loader) opts.loader = loader;
    const hls = new Hls(opts);
    playerState.hls = hls;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("manifest timeout")), 18000);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { clearTimeout(t); resolve(); });
      hls.on(Hls.Events.ERROR, (evt, data) => {
        if (data && data.fatal){ clearTimeout(t); reject(new Error(data.details || data.type || "hls fatal")); }
      });
      hls.loadSource(source.url);
      hls.attachMedia(video);
    });
  }
  try {
    if (tunnelState.status === "ok") await attach(WispHlsLoader);
    else await attach(null);
  } catch(e1){
    destroyHls();
    await attach(tunnelState.status === "ok" ? null : WispHlsLoader);
  }
  setPlayerStatus("");
  try { await video.play(); } catch(e){}
}

async function openPlayer(id, type, title, itemData){
  type = (type === "movie") ? "movie" : "tv";
  const myToken = ++playerTok