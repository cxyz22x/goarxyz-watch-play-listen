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
const tmdbCache = new Map();
async function tmdb(path, params={}){
  const url = new URL(BASE+path);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language","en-US");
  for (const k in params){ if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]); }
  const key = url.toString();
  const hit = tmdbCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.body;
  let res;
  try { res = await fetch(url); }
  catch(e){ throw new Error("NETWORK: " + e.message); }
  let body; try { body = await res.json(); } catch(e){ body = null; }
  if (!res.ok){ const msg = body && body.status_message ? body.status_message : ("HTTP "+res.status); throw new Error("TMDB "+res.status+": "+msg); }
  tmdbCache.set(key, { at: Date.now(), body });
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
function backdropImg(item, size="w1280"){ return item.backdrop_path ? IMG + "/" + size + item.backdrop_path : posterImg(item,"w780"); }
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
    '<img loading="lazy" decoding="async" src="' + posterImg(item,"w342") + '" alt="' + titleOf(item) + '">' +
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

const EMBED_PROVIDERS = [
  { name: "Vidcore", origin: "https://vidcore.io", movie: (id) => "/movie/" + id, tv: (id, s, e) => "/tv/" + id + "/" + s + "/" + e },
  { name: "111movies", origin: "https://111movies.net", movie: (id) => "/movie/" + id, tv: (id, s, e) => "/tv/" + id + "/" + s + "/" + e },
  { name: "Vidfast", origin: "https://vidfast.pro", movie: (id) => "/movie/" + id, tv: (id, s, e) => "/tv/" + id + "/" + s + "/" + e },
  { name: "Vidup", origin: "https://vidup.to", movie: (id) => "/movie/" + id, tv: (id, s, e) => "/tv/" + id + "/" + s + "/" + e },
  { name: "CineSrc", origin: "https://cinesrc.st", movie: (id) => "/embed/movie/" + id, tv: (id, s, e) => "/embed/tv/" + id + "/" + s + "/" + e }
];
function embedSources(type, id, season, episode){
  return EMBED_PROVIDERS.map((p) => ({
    name: p.name,
    format: "embed",
    url: p.origin + (type === "tv" ? p.tv(id, season, episode) : p.movie(id))
  }));
}
function clearEmbed(){
  const frame = document.getElementById("playerEmbed");
  if (frame){ frame.src = "about:blank"; frame.remove(); }
  const video = document.getElementById("playerVideo");
  if (video) video.style.display = "";
}

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
  clearEmbed();
  playerState.sourceName = source.name;
  setPlayerStatus("Starting " + source.name + "…");
  if (source.format === "embed"){
    video.pause();
    video.removeAttribute("src");
    video.style.display = "none";
    const frame = document.createElement("iframe");
    frame.id = "playerEmbed";
    frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "origin";
    frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:#000";
    const stage = video.parentElement;
    if (stage) stage.style.position = "relative";
    stage.appendChild(frame);
    frame.src = source.url;
    setPlayerStatus("");
    return;
  }
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
  const myToken = ++playerToken;
  playerState.id = id;
  playerState.type = type;
  playerState.title = title || "";
  playerState.item = itemData || null;
  playerState.seasons = [];
  playerState.season = 1;
  playerState.episode = 1;
  playerState.sources = [];
  playerState.sourceName = null;

  const overlay = document.getElementById("playerOverlay");
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
  document.getElementById("playerTitle").textContent = title || "Now Playing";
  document.getElementById("playerTag").textContent = type === "movie" ? "MOVIE" : "TV";
  document.getElementById("playerPicker").innerHTML = "";
  destroyHls();
  setPlayerStatus("Resolving stream…");

  try { if (overlay.requestFullscreen) await overlay.requestFullscreen(); } catch(e){}
  ensureLibcurl().catch(()=>{});

  async function loadEpisode(seasonNum, episodeNum){
    if (myToken !== playerToken) return;
    if (seasonNum) playerState.season = seasonNum;
    if (episodeNum) playerState.episode = episodeNum;
    setPlayerStatus("Connecting player…");
    destroyHls();
    try {
      try { await ensureLibcurl(); } catch(e){}
      let sources = [];
      try { sources = await resolveSources(id, type, playerState.season, playerState.episode); }
      catch (err) { console.warn("[goarxyz] vidrock", err); }
      sources = sources.concat(embedSources(type, id, playerState.season, playerState.episode));
      if (!sources.length) throw new Error("no playable sources");
      if (myToken !== playerToken) return;
      playerState.sources = sources;
      const prefer = sources.find(s => s.name === playerState.sourceName) || sources[0];
      const picker = document.getElementById("playerPicker");
      const srcSel = '<select id="selServer">' + sources.map(s =>
        '<option value="' + s.name + '"' + (s.name === prefer.name ? ' selected' : '') + '>' + s.name + ' · ' + s.format.toUpperCase() + '</option>'
      ).join("") + '</select>';
      const seasonHtml = picker.querySelector("#selSeason") ? picker.querySelector("#selSeason").outerHTML : "";
      const epHtml = picker.querySelector("#selEpisode") ? picker.querySelector("#selEpisode").outerHTML : "";
      if (type === "tv" && playerState.seasons.length){
        /* keep season selects; rebuild server only */
      }
      const seasonBlock = (type === "tv" && playerState.seasons.length)
        ? '<select id="selSeason">' + playerState.seasons.map(s => '<option value="' + s.season_number + '"' + (s.season_number === playerState.season ? ' selected' : '') + '>Season ' + s.season_number + '</option>').join("") + '</select>' +
          '<select id="selEpisode"></select>'
        : "";
      picker.innerHTML = srcSel + seasonBlock;
      if (type === "tv" && playerState.seasons.length){
        const sObj = playerState.seasons.find(x => x.season_number === playerState.season);
        const count = sObj && sObj.episode_count ? sObj.episode_count : 1;
        document.getElementById("selEpisode").innerHTML =
          Array.from({ length: count }, (_, i) => '<option value="' + (i+1) + '"' + ((i+1) === playerState.episode ? ' selected' : '') + '>Episode ' + (i+1) + '</option>').join("");
        document.getElementById("selSeason").onchange = () => {
          playerState.season = Number(document.getElementById("selSeason").value);
          playerState.episode = 1;
          loadEpisode(playerState.season, 1);
        };
        document.getElementById("selEpisode").onchange = () => {
          playerState.episode = Number(document.getElementById("selEpisode").value);
          loadEpisode(playerState.season, playerState.episode);
        };
      }
      document.getElementById("selServer").onchange = () => {
        const next = playerState.sources.find(s => s.name === document.getElementById("selServer").value);
        if (next) playSource(next).catch(e => setPlayerStatus(e.message || String(e), true));
      };
      let lastErr = null;
      const order = [prefer].concat(sources.filter(s => s !== prefer));
      for (const src of order){
        try {
          const sel = document.getElementById("selServer");
          if (sel) sel.value = src.name;
          await playSource(src);
          lastErr = null;
          break;
        } catch(e){
          lastErr = e;
          console.warn("[goarxyz] source failed", src.name, e);
        }
      }
      if (lastErr) throw lastErr;
    } catch(e){
      console.error("[goarxyz] player", e);
      setPlayerStatus(String(e && e.message ? e.message : e), true);
    }
  }

  if (type === "tv"){
    try {
      const show = await tmdb("/tv/" + id);
      if (myToken !== playerToken) return;
      playerState.seasons = (show.seasons || []).filter(s => s.season_number > 0);
      if (playerState.seasons.length){
        playerState.season = playerState.seasons[0].season_number;
        playerState.episode = 1;
      }
    } catch(e){}
  }

  await loadEpisode(playerState.season, playerState.episode);
  if (itemData) pushContinue(itemData, type, playerState.season, playerState.episode);
}

function closePlayer(){
  playerToken++;
  destroyHls();
  clearEmbed();
  setPlayerStatus("");
  document.getElementById("playerOverlay").classList.remove("open");
  document.getElementById("playerPicker").innerHTML = "";
  document.body.style.overflow = "";
  if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
}
document.getElementById("playerClose").onclick = closePlayer;

/* ================= HERO ================= */
async function buildHero(fetcher, eyebrow){
  const heroEl = document.getElementById("hero");
  heroEl.innerHTML = '<div class="loader">Loading…</div>';
  heroEl.style.backgroundImage = "";
  try {
    const items = await fetcher();
    const pick = items.find(r => r.backdrop_path) || items[0];
    if (!pick){ heroEl.innerHTML = '<div class="loader">Nothing to show yet.</div>'; return; }
    const t = typeOf(pick);
    heroEl.style.backgroundImage = 'url(' + backdropImg(pick) + ')';
    heroEl.innerHTML =
      '<div class="hero-content">' +
      '<div class="hero-eyebrow">' + eyebrow + '</div>' +
      '<div class="hero-title">' + titleOf(pick) + '</div>' +
      '<div class="hero-meta"><span class="rating">★ ' + ratingOf(pick) + '</span><span>' + yearOf(pick) + '</span><span>' + (t==="movie"?"Movie":t==="anime"?"Anime":"TV Show") + '</span></div>' +
      '<div class="hero-overview">' + (pick.overview || "") + '</div>' +
      '<div class="hero-actions"><button class="btn btn-play" id="heroPlay">▶ Watch Now</button><button class="btn btn-primary" id="heroDetails">Details</button></div>' +
      '</div>';
    const realType = pick._realType || (t==="anime" ? pick._animeKind : t);
    document.getElementById("heroPlay").onclick = () => openPlayer(pick.id, realType, titleOf(pick), pick);
    document.getElementById("heroDetails").onclick = () => openModal(pick.id, realType);
  } catch(e){ heroEl.innerHTML = '<div class="loader err">Couldn\'t load — ' + e.message + '</div>'; }
}

/* ================= GENRES ================= */
let genresMovie = [], genresTV = [];
async function ensureGenres(){
  if (genresMovie.length && genresTV.length) return;
  try { const [mg,tg] = await Promise.all([tmdb("/genre/movie/list"), tmdb("/genre/tv/list")]); genresMovie = mg.genres; genresTV = tg.genres; } catch(e){}
}
function genreChipsBar(list, onPick){
  const div = document.createElement("div"); div.className = "chips";
  list.forEach(g => { const c = document.createElement("div"); c.className = "chip"; c.textContent = g.name; c.onclick = () => onPick(g); div.appendChild(c); });
  return div;
}
function dedupeGenres(list){ const seen = new Set(); return list.filter(g => { if (seen.has(g.name)) return false; seen.add(g.name); return true; }); }

/* ================= PROVIDER PROFILES ================= */
const PROVIDER_CONTENT = {
  netflix:{monetization:"flatrate", recencyDays:365, minVotes:10},
  disney:{monetization:"flatrate", recencyDays:1095, minVotes:15},
  crunchyroll:{monetization:"flatrate", recencyDays:365, minVotes:5, genres:"16", originCountry:"JP"},
  prime:{monetization:"flatrate", recencyDays:365, minVotes:10},
  hulu:{monetization:"flatrate", recencyDays:365, minVotes:10},
  max:{monetization:"flatrate", recencyDays:730, minVotes:15},
  apple:{monetization:"flatrate", recencyDays:1095, minVotes:10},
  paramount:{monetization:"flatrate", recencyDays:365, minVotes:10},
  peacock:{monetization:"flatrate", recencyDays:365, minVotes:10},
  stan:{monetization:"flatrate", recencyDays:365, minVotes:10},
  binge:{monetization:"flatrate", recencyDays:365, minVotes:10},
  shudder:{monetization:"flatrate", recencyDays:730, minVotes:5, genres:"27"},
  mubi:{monetization:"flatrate", recencyDays:1095, minVotes:20},
  tubi:{monetization:"free,ads", recencyDays:1095, minVotes:5},
  pluto:{monetization:"free,ads", recencyDays:1095, minVotes:5},
  roku:{monetization:"free,ads", recencyDays:1095, minVotes:5}
};
const DEFAULT_PROVIDER_CONTENT = { monetization:"flatrate", recencyDays:365, minVotes:5 };

async function provDiscover(pid, region, kind, opts = {}){
  const isMovie = kind === "movie";
  const path = isMovie ? "/discover/movie" : "/discover/tv";
  const params = { with_watch_providers: pid, watch_region: region, include_adult: false, ...(opts.extra || {}) };
  if (opts.monetization) params.with_watch_monetization_types = opts.monetization;
  if (opts.sortBy) params.sort_by = opts.sortBy;
  if (opts.minVotes) params["vote_count.gte"] = opts.minVotes;
  if (opts.genres) params.with_genres = opts.genres;
  if (opts.originCountry) params.with_origin_country = opts.originCountry;
  if (opts.recencyDays){
    const key = isMovie ? "primary_release_date.gte" : "first_air_date.gte";
    params[key] = daysAgoISO(opts.recencyDays);
  }
  const res = await tmdb(path, params);
  return (res.results || []).map(x => ({ ...x, media_type: isMovie ? "movie" : "tv", _mediaType: isMovie ? "movie" : "tv" }));
}
async function provDiscoverSafe(pid, region, kind, opts){
  let results = await provDiscover(pid, region, kind, opts);
  if (!results.length && opts.monetization) results = await provDiscover(pid, region, kind, { ...opts, monetization: null });
  return results;
}

const PROVIDER_DESIGNS = {
  "netflix":{key:"netflix", style:"netflix", color:"#E50914", bg:"#000000", bg2:"#0a0a0a", accent:"#ff4d4d"},
  "disney plus":{key:"disney", style:"disney", color:"#1490E8", bg:"#040714", bg2:"#0a1128", accent:"#4da6ff"},
  "disney+":{key:"disney", style:"disney", color:"#1490E8", bg:"#040714", bg2:"#0a1128", accent:"#4da6ff"},
  "crunchyroll":{key:"crunchyroll", style:"crunchyroll", color:"#F47521", bg:"#000000", bg2:"#1a0d02", accent:"#ff9f5a"},
  "amazon prime video":{key:"prime", style:"prime", color:"#00A8E1", bg:"#0f171e", bg2:"#0a1216", accent:"#4dd0f0"},
  "prime video":{key:"prime", style:"prime", color:"#00A8E1", bg:"#0f171e", bg2:"#0a1216", accent:"#4dd0f0"},
  "hulu":{key:"hulu", style:"hulu", color:"#1CE783", bg:"#0b0b0b", bg2:"#0a1810", accent:"#5cf0a8"},
  "max":{key:"max", style:"max", color:"#4169E1", bg:"#000000", bg2:"#0a0f1f", accent:"#7b9dff"},
  "hbo max":{key:"max", style:"max", color:"#4169E1", bg:"#000000", bg2:"#0a0f1f", accent:"#7b9dff"},
  "apple tv plus":{key:"apple", style:"apple", color:"#F5F5F7", bg:"#000000", bg2:"#0a0a0a", accent:"#ffffff"},
  "apple tv+":{key:"apple", style:"apple", color:"#F5F5F7", bg:"#000000", bg2:"#0a0a0a", accent:"#ffffff"},
  "apple tv":{key:"apple", style:"apple", color:"#F5F5F7", bg:"#000000", bg2:"#0a0a0a", accent:"#ffffff"},
  "paramount plus":{key:"paramount", style:"paramount", color:"#0064FF", bg:"#000814", bg2:"#001033", accent:"#4d94ff"},
  "peacock":{key:"peacock", style:"peacock", color:"#FFCC00", bg:"#000000", bg2:"#1a1400", accent:"#ffdd4d"},
  "stan":{key:"stan", style:"stan", color:"#4FC3F7", bg:"#0a0a0a", bg2:"#041720", accent:"#7dd8ff"},
  "binge":{key:"binge", style:"binge", color:"#FF2D78", bg:"#000000", bg2:"#21050f", accent:"#ff6ba3"},
  "shudder":{key:"shudder", style:"shudder", color:"#E22020", bg:"#000000", bg2:"#1a0202", accent:"#ff5555"},
  "mubi":{key:"mubi", style:"mubi", color:"#FFD600", bg:"#000000", bg2:"#1a1600", accent:"#ffe666"},
  "tubi":{key:"tubi", style:"tubi", color:"#FA8147", bg:"#0a0a0a", bg2:"#201005", accent:"#ffab7a"},
  "pluto tv":{key:"pluto", style:"pluto", color:"#FFE01A", bg:"#000000", bg2:"#1a1800", accent:"#fff266"},
  "roku":{key:"roku", style:"roku", color:"#6C3FC5", bg:"#000000", bg2:"#0f0820", accent:"#a380ff"}
};
function getProviderDesign(name){
  const key = name.toLowerCase().trim();
  return PROVIDER_DESIGNS[key] || { key:"generic", style:"generic", color:"#5b8def", bg:"#0a0d18", bg2:"#0a0f1c", accent:"#8bb0ff" };
}

const DISNEY_BRANDS = [
  {label:"Disney", color:"#1a4fa0", bg:"linear-gradient(135deg,#0b2a5e,#041e4a)", cid:2},
  {label:"PIXAR", color:"#00a2e1", bg:"linear-gradient(135deg,#0a3a52,#041e2c)", cid:3},
  {label:"MARVEL", color:"#ec1d24", bg:"linear-gradient(135deg,#4a0205,#1c0202)", cid:420},
  {label:"STAR WARS", color:"#ffb400", bg:"linear-gradient(135deg,#4a3a00,#1c1400)", cid:1},
  {label:"Nat Geo", color:"#ffcc00", bg:"linear-gradient(135deg,#4a3d00,#1c1600)", cid:7521},
  {label:"20th Century", color:"#c8a35a", bg:"linear-gradient(135deg,#3a2d10,#1c1508)", cid:25}
];

/* ================= KIDS & MUSIC ================= */
const KIDS_GENRES = "10751|16";
async function kidsDiscover(extra={}, kind="both"){
  const calls = [];
  if (kind==="both" || kind==="movie") calls.push(tmdb("/discover/movie",{with_genres:KIDS_GENRES, certification_country:"US","certification.lte":"PG", include_adult:false, ...extra}).then(r=>r.results.map(x=>({...x,_forceType:"kids",_realType:"movie"}))));
  if (kind==="both" || kind==="tv") calls.push(tmdb("/discover/tv",{with_genres:KIDS_GENRES, include_adult:false, ...extra}).then(r=>r.results.map(x=>({...x,_forceType:"kids",_realType:"tv"}))));
  const res = await Promise.all(calls);
  return extra.sort_by && extra.sort_by.includes("date") ? mergeTwo(res[0]||[], res[1]||[], cmpDate) : mergeTwo(res[0]||[], res[1]||[], cmpRating);
}
async function buildKidsTab(){
  const main = document.getElementById("mainContent"); exitProvMode(); main.innerHTML = "";
  main.appendChild(sectionEl("k_new","New for Kids","Fresh family titles", ()=>showKids("new")));
  main.appendChild(sectionEl("k_pop","Popular with Kids","Most watched family titles", ()=>showKids("popular")));
  main.appendChild(sectionEl("k_movies","Kids Movies","Animated & family films", ()=>showKids("movies")));
  main.appendChild(sectionEl("k_tv","Kids TV Shows","Family series", ()=>showKids("tv")));
  main.appendChild(sectionEl("k_top","Top Rated Family","Highest rated kids content", ()=>showKids("top")));
  const gs = document.createElement("div"); gs.className="section";
  gs.innerHTML = '<div class="section-head"><h2>Browse Kids by Genre</h2></div>';
  gs.appendChild(genreChipsBar([{id:16,name:"Animation"},{id:10751,name:"Family"},{id:12,name:"Adventure"},{id:35,name:"Comedy"},{id:14,name:"Fantasy"},{id:10402,name:"Music"}], g=>showKidsGenreGrid(g)));
  main.appendChild(gs);
  buildHero(async ()=> kidsDiscover({sort_by:"popularity.desc"}), "FOR THE WHOLE FAMILY");
  loadRail("k_new", async ()=> (await kidsDiscover({sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":5})).slice(0,14), {kids:true});
  loadRail("k_pop", async ()=> (await kidsDiscover({sort_by:"popularity.desc"})).slice(0,14), {kids:true});
  loadRail("k_movies", async ()=> (await kidsDiscover({sort_by:"popularity.desc"},"movie")).slice(0,14), {kids:true});
  loadRail("k_tv", async ()=> (await kidsDiscover({sort_by:"popularity.desc"},"tv")).slice(0,14), {kids:true});
  loadRail("k_top", async ()=> (await kidsDiscover({sort_by:"vote_average.desc","vote_count.gte":50})).slice(0,14), {kids:true});
}
async function showKids(kind){
  const titles = {new:"New for Kids", popular:"Popular with Kids", movies:"Kids Movies", tv:"Kids TV Shows", top:"Top Rated Family"};
  const grid = openGrid(titles[kind]);
  try {
    let items;
    if (kind==="new") items = await kidsDiscover({sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":5});
    else if (kind==="top") items = await kidsDiscover({sort_by:"vote_average.desc","vote_count.gte":50});
    else if (kind==="movies") items = await kidsDiscover({sort_by:"popularity.desc"},"movie");
    else if (kind==="tv") items = await kidsDiscover({sort_by:"popularity.desc"},"tv");
    else items = await kidsDiscover({sort_by:"popularity.desc"});
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {kids:true}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showKidsGenreGrid(g){
  const grid = openGrid("Kids · "+g.name);
  try { const items = await kidsDiscover({with_genres:"" + g.id, sort_by:"popularity.desc"}); grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {kids:true}, idx))); }
  catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}

const MUSIC_GENRE_ID = 10402;
async function musicDiscover(extra={}, kind="both"){
  const calls = [];
  if (kind==="both" || kind==="movie") calls.push(tmdb("/discover/movie",{with_genres:MUSIC_GENRE_ID, include_adult:false, ...extra}).then(r=>r.results.map(x=>({...x,_forceType:"music",_mediaType:"movie"}))));
  if (kind==="both" || kind==="tv") calls.push(tmdb("/discover/tv",{with_genres:MUSIC_GENRE_ID, include_adult:false, ...extra}).then(r=>r.results.map(x=>({...x,_forceType:"music",_mediaType:"tv"}))));
  const res = await Promise.all(calls);
  return extra.sort_by && extra.sort_by.includes("date") ? mergeTwo(res[0]||[], res[1]||[], cmpDate) : mergeTwo(res[0]||[], res[1]||[], cmpRating);
}
async function buildMusicTab(){
  const main = document.getElementById("mainContent"); exitProvMode(); main.innerHTML = "";
  main.appendChild(sectionEl("mu_new","New Music Releases","Fresh music films & docs", ()=>showMusic("new")));
  main.appendChild(sectionEl("mu_trend","Trending Music","Popular right now", ()=>showMusic("trend")));
  main.appendChild(sectionEl("mu_top","Top Rated Music","Highest rated", ()=>showMusic("top")));
  main.appendChild(sectionEl("mu_docs","Music Documentaries","Behind the scenes", ()=>showMusic("docs")));
  const gs = document.createElement("div"); gs.className="section";
  gs.innerHTML = '<div class="section-head"><h2>Browse Music by Genre</h2></div>';
  gs.appendChild(genreChipsBar([{id:28,name:"Action"},{id:18,name:"Drama"},{id:36,name:"History"},{id:99,name:"Documentary"},{id:35,name:"Comedy"},{id:10749,name:"Romance"}], g=>showMusicGenreGrid(g)));
  main.appendChild(gs);
  buildHero(async ()=> musicDiscover({sort_by:"popularity.desc"}), "TRENDING MUSIC");
  loadRail("mu_new", async ()=> (await musicDiscover({sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":5})).slice(0,14), {music:true});
  loadRail("mu_trend", async ()=> (await musicDiscover({sort_by:"popularity.desc"})).slice(0,14), {music:true});
  loadRail("mu_top", async ()=> (await musicDiscover({sort_by:"vote_average.desc","vote_count.gte":50})).slice(0,14), {music:true});
  loadRail("mu_docs", async ()=> (await musicDiscover({sort_by:"popularity.desc", with_genres:"99,10402"})).slice(0,14), {music:true});
}
async function showMusic(kind){
  const titles = {new:"New Music Releases", trend:"Trending Music", top:"Top Rated Music", docs:"Music Documentaries"};
  const grid = openGrid(titles[kind]);
  try {
    let items;
    if (kind==="new") items = await musicDiscover({sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":5});
    else if (kind==="top") items = await musicDiscover({sort_by:"vote_average.desc","vote_count.gte":50});
    else if (kind==="docs") items = await musicDiscover({sort_by:"popularity.desc", with_genres:"99,10402"});
    else items = await musicDiscover({sort_by:"popularity.desc"});
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(musicCard(i, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showMusicGenreGrid(g){
  const grid = openGrid("Music · "+g.name);
  try { const items = await musicDiscover({with_genres:MUSIC_GENRE_ID + "," + g.id, sort_by:"popularity.desc"}); grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(musicCard(i, idx))); }
  catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}

/* ================= HOME ================= */
async function buildHome(){
  await ensureGenres();
  const main = document.getElementById("mainContent");
  exitProvMode();
  main.innerHTML = "";

  if (continueList.length){
    const cw = sectionEl("h_continue","Continue Watching","Pick up where you left off", null);
    main.appendChild(cw);
    setTimeout(() => {
      const el = document.getElementById("h_continue");
      if (!el) return;
      el.innerHTML = "";
      continueList.forEach((c,i) => {
        const item = { id:c.id, title:c.title, name:c.title, poster_path:c.poster, vote_average:c.rating, release_date:c.date, _forceType:c.type };
        const d = card(item, {}, i);
        d.onclick = () => openPlayer(c.id, c.type, c.title, item);
        el.appendChild(d);
      });
    }, 0);
  }

  const launcherSec = document.createElement("div");
  launcherSec.className = "section provider-launcher-section";
  launcherSec.innerHTML =
    '<div class="section-head"><div><h2>Your Apps</h2><p>Tap a service to open its own home screen</p></div><span class="see-all" id="seeAllProviders">See all →</span></div>' +
    '<div class="provider-launcher" id="homeProviderLauncher"></div>';
  main.appendChild(launcherSec);
  setTimeout(()=>{ const el = document.getElementById("seeAllProviders"); if (el) el.onclick = () => routeTo("hubs"); }, 0);

  main.appendChild(sectionEl("h_top10","Top 10 This Week","Most popular across movies & TV", ()=>showSpecial("trending")));
  main.appendChild(sectionEl("h_new","New Releases","Freshly out", ()=>showSpecial("new")));
  main.appendChild(sectionEl("h_top","Top Rated","Highest rated of all time", ()=>showSpecial("toprated")));
  main.appendChild(sectionEl("h_upcoming","Coming Soon","Landing soon in theaters", ()=>showSpecial("upcoming_movie")));
  main.appendChild(sectionEl("h_anime","Anime Spotlight","Popular anime right now", ()=>showAnime("popular")));
  main.appendChild(sectionEl("h_kids","Kids & Family","Safe picks for the little ones", ()=>showKids("popular")));
  main.appendChild(sectionEl("h_music","Music Spotlight","Trending music films & docs", ()=>showMusic("trend")));

  const gs = document.createElement("div"); gs.className = "section";
  gs.innerHTML = '<div class="section-head"><h2>Browse by Genre</h2><p>Find something by mood</p></div>';
  gs.appendChild(genreChipsBar(dedupeGenres([...genresMovie, ...genresTV]), g => showGenreGrid(g,"all")));
  main.appendChild(gs);

  buildHero(async ()=> (await tmdb("/trending/all/week")).results, "TRENDING THIS WEEK");
  loadRail("h_top10", async ()=> (await tmdb("/trending/all/week")).results.slice(0,10), {top10:true});
  loadRail("h_new", async () => {
    const [m,t] = await Promise.all([
      tmdb("/discover/movie",{sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":30, include_adult:false}),
      tmdb("/discover/tv",{sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":15, include_adult:false})
    ]);
    return mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})), cmpDate).slice(0,14);
  });
  loadRail("h_top", async () => {
    const [m,t] = await Promise.all([tmdb("/movie/top_rated"), tmdb("/tv/top_rated")]);
    return mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})), cmpRating).slice(0,14);
  });
  loadRail("h_upcoming", async ()=> (await tmdb("/movie/upcoming", {region:REGION})).results.map(x=>({...x,media_type:"movie"})).slice(0,14));
  loadRail("h_anime", async ()=> (await animeDiscover({sort_by:"popularity.desc"})).slice(0,14));
  loadRail("h_kids", async ()=> (await kidsDiscover({sort_by:"popularity.desc"})).slice(0,14), {kids:true});
  loadRail("h_music", async ()=> (await musicDiscover({sort_by:"popularity.desc"})).slice(0,14), {music:true});

  buildProviderLauncher("homeProviderLauncher", 12);
}

/* ================= PROVIDER LAUNCHER ================= */
const FEATURED_PROVIDERS = ["Netflix","Disney Plus","Disney+","Crunchyroll","Amazon Prime Video","Prime Video","Max","Hulu","Apple TV","Apple TV+","Paramount Plus","Peacock","Stan","Binge"];
async function fetchAllProviders(){
  const key = "providers_" + REGION;
  const cached = providerMapCache[key];
  if (cached && cached._at && Date.now() - cached._at < 60*60*1000) return cached.list;
  try {
    const [m,t] = await Promise.all([tmdb("/watch/providers/movie",{watch_region:REGION}), tmdb("/watch/providers/tv",{watch_region:REGION})]);
    const map = {};
    [...m.results, ...t.results].forEach(p => { map[p.provider_id] = {id:p.provider_id, name:p.provider_name, logo:p.logo_path}; });
    const list = Object.values(map).sort((a,b) => {
      const aF = FEATURED_PROVIDERS.indexOf(a.name), bF = FEATURED_PROVIDERS.indexOf(b.name);
      if (aF>=0 && bF<0) return -1;
      if (bF>=0 && aF<0) return 1;
      if (aF>=0 && bF>=0) return aF-bF;
      return a.name.localeCompare(b.name);
    });
    providerMapCache[key] = { list, _at: Date.now() };
    return list;
  } catch(e){ return []; }
}
async function buildProviderLauncher(containerId, limit=12){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  for (let i=0;i<limit;i++){ const sk = document.createElement("div"); sk.className = "skel"; sk.style.cssText = "width:72px;height:72px;border-radius:20px;"; el.appendChild(sk); }
  const providers = await fetchAllProviders();
  if (!providers.length){ el.innerHTML = '<div class="loader small" style="grid-column:1/-1;padding:14px 0;">Couldn\'t load providers.</div>'; return; }
  el.innerHTML = "";
  providers.slice(0, limit).forEach((p, i) => {
    const design = getProviderDesign(p.name);
    const btn = document.createElement("button");
    btn.className = "provider-app anim-pop";
    btn.style.animationDelay = Math.min(i*35, 400) + "ms";
    btn.style.setProperty("--pa-color", design.color);
    btn.setAttribute("aria-label", p.name);
    const initials = p.name.split(/\s+/).map(w => w[0]).join("").replace(/'/g,"").slice(0,2).toUpperCase();
    btn.innerHTML = '<div class="provider-app-icon">' +
      (p.logo ? '<img src="' + providerLogo(p.logo,"w92") + '" alt="' + p.name + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'pa-fallback\',textContent:\'' + initials + '\'}))">' : '<span class="pa-fallback">' + initials + '</span>') +
      '</div><div class="provider-app-name">' + p.name + '</div>';
    btn.onclick = () => { btn.style.transform = "translateY(-2px) scale(.94)"; setTimeout(() => renderProviderHome({id:p.id, name:p.name}), 90); };
    el.appendChild(btn);
  });
}

/* ================= PROVIDER HOME ================= */
function contrastText(hex){
  const raw = String(hex || "#ffffff").replace("#","").trim();
  const full = raw.length === 3 ? raw.split("").map(c => c+c).join("") : raw;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return "#0a0a0d";
  const r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  return (0.2126*r + 0.7152*g + 0.0722*b) > 186 ? "#0a0a0d" : "#ffffff";
}
function applyBrandTheme(design){
  const color = (design && design.color) ? design.color : "#ffffff";
  document.body.style.setProperty("--cta", color);
  document.body.style.setProperty("--cta-text", contrastText(color));
  document.body.style.setProperty("--rank", color);
  document.body.style.setProperty("--p-color", color);
  if (design){
    if (design.bg) document.body.style.setProperty("--p-bg", design.bg);
    if (design.bg2) document.body.style.setProperty("--p-bg2", design.bg2);
    if (design.accent) document.body.style.setProperty("--p-accent", design.accent);
  }
}
function clearBrandTheme(){
  ["--cta","--cta-text","--rank","--p-color","--p-bg","--p-bg2","--p-accent"].forEach(k => document.body.style.removeProperty(k));
}
function enterProvMode(design){
  document.body.classList.add("prov-mode");
  document.body.style.background = design.bg;
  applyBrandTheme(design);
  const mc = document.getElementById("mainContent");
  mc.className = "prov-home theme-" + design.style;
  mc.style.cssText = "--p-color:" + design.color + ";--p-bg:" + design.bg + ";--p-bg2:" + design.bg2 + ";--p-accent:" + design.accent + ";--cta:" + design.color + ";--cta-text:" + contrastText(design.color) + ";--rank:" + design.color + ";";
}
function exitProvMode(){
  document.body.classList.remove("prov-mode");
  document.body.style.background = "";
  clearBrandTheme();
  const mc = document.getElementById("mainContent");
  mc.className = ""; mc.style.cssText = "";
  const hero = document.getElementById("hero");
  hero.classList.remove("prov-hero");
  hero.style.background = ""; hero.style.backgroundColor = ""; hero.style.backgroundImage = "";
}

let provToken = 0;
async function renderProviderHome(prov){
  const myToken = ++provToken;
  await ensureGenres();
  if (myToken !== provToken) return;
  const main = document.getElementById("mainContent");
  const hero = document.getElementById("hero");
  const design = getProviderDesign(prov.name);
  const cfg = { ...DEFAULT_PROVIDER_CONTENT, ...(PROVIDER_CONTENT[design.key] || {}) };
  enterProvMode(design);
  main.innerHTML = "";
  hero.classList.add("prov-hero");
  hero.innerHTML = '<div class="loader">Loading ' + prov.name + '…</div>';
  hero.style.backgroundImage = "none";

  let pid = prov.id, logoPath = null, provName = prov.name;
  try {
    const list = await fetchAllProviders();
    const found = list.find(p => p.id == pid) || list.find(p => p.name.toLowerCase() === prov.name.toLowerCase());
    if (found){ pid = found.id; logoPath = found.logo; provName = found.name; }
  } catch(e){}
  if (myToken !== provToken) return;

  const topBar = document.createElement("div");
  topBar.className = "prov-home-bar";
  topBar.innerHTML = '<span class="back-link" id="provHomeBack" style="color:' + design.color + ';">← All Apps</span>' +
    '<div class="prov-badge" style="background:' + design.bg2 + ';border-color:' + design.color + ';">' +
    (logoPath ? '<img src="' + providerLogo(logoPath,"w92") + '" alt="' + provName + '">' : '') +
    '<span style="color:' + design.color + ';">' + provName + '</span></div>';
  main.appendChild(topBar);

  if (!pid){
    const err = document.createElement("div"); err.className = "loader err";
    err.textContent = "Not available in " + REGION + "."; main.appendChild(err);
    const back = document.getElementById("provHomeBack"); if (back) back.onclick = () => routeTo("hubs");
    return;
  }

  const anime = cfg.genres === "16";

  let featured = [];
  try {
    const [m, t] = await Promise.all([
      provDiscoverSafe(pid, REGION, "movie", { ...cfg, sortBy: "popularity.desc" }),
      provDiscoverSafe(pid, REGION, "tv", { ...cfg, sortBy: "popularity.desc" })
    ]);
    featured = mergeTwo(m, t, cmpPop);
  } catch(e){}
  if (myToken !== provToken) return;
  const pick = featured.find(r => r.backdrop_path) || featured[0];

  let heroHtml = '<div class="hero-content">';
  if (logoPath) heroHtml += '<img class="hero-logo" src="' + providerLogo(logoPath,"w300") + '" alt="' + provName + '">';
  else heroHtml += '<div class="hero-eyebrow">' + provName + '</div>';
  heroHtml += '<div class="hero-title">' + (pick ? titleOf(pick) : "On " + provName) + '</div>' +
    '<div class="prov-hero-tagline">' + (pick && pick.overview ? pick.overview : getProviderTagline(design.key, provName)) + '</div>' +
    '<div class="hero-actions">' +
    (pick ? '<button class="btn btn-prov" id="provPlayFeatured">▶ ' + (design.style==="netflix"?"Play":"Watch Now") + '</button>' : '') +
    (pick ? '<button class="btn btn-ghost" id="provInfoFeatured">ⓘ More Info</button>' : '') +
    (pick ? '<button class="btn-icon" id="provSaveFeatured">' + bookmarkSvg(false) + '</button>' : '') +
    '</div></div>';
  hero.innerHTML = heroHtml;

  if (pick && pick.backdrop_path){
    hero.style.backgroundImage = "linear-gradient(to top, " + design.bg + " 6%, rgba(0,0,0,.4) 55%, rgba(0,0,0,.08) 85%), linear-gradient(to right, rgba(0,0,0,.7) 0%, rgba(0,0,0,.05) 60%), url(" + backdropImg(pick) + ")";
    hero.style.backgroundSize = "cover";
    hero.style.backgroundPosition = "center top";
  } else {
    hero.style.backgroundImage = "linear-gradient(135deg, " + design.bg + ", " + design.bg2 + ")";
  }

  const hp = document.getElementById("provPlayFeatured");
  if (hp && pick) hp.onclick = () => openPlayer(pick.id, pick.media_type, titleOf(pick), pick);
  const hi = document.getElementById("provInfoFeatured");
  if (hi && pick) hi.onclick = () => openModal(pick.id, pick.media_type);
  const hs = document.getElementById("provSaveFeatured");
  if (hs && pick){
    hs.classList.toggle("saved", isSaved(pick.id, pick.media_type));
    hs.onclick = () => { toggleSave(pick, pick.media_type); hs.classList.toggle("saved", isSaved(pick.id, pick.media_type)); hs.innerHTML = bookmarkSvg(isSaved(pick.id, pick.media_type)); };
  }

  const style = design.style;
  if (style === "netflix") main.appendChild(sectionEl("ph_top10", "Top 10 in " + REGION + " Today", "Most watched on Netflix", () => showProviderGrid(prov, pid, "trending")));
  else if (style === "disney"){ main.appendChild(buildDisneyBrandRow(pid)); main.appendChild(sectionEl("ph_featured","Featured","Handpicked for you", () => showProviderGrid(prov, pid, "trending"))); }
  else if (style === "crunchyroll") main.appendChild(sectionEl("ph_simul","Simulcast Season","Currently airing on Crunchyroll", () => showProviderGrid(prov, pid, "trending")));
  else if (style === "apple") main.appendChild(sectionEl("ph_featured","Apple Originals","Award-winning stories", () => showProviderGrid(prov, pid, "trending")));
  else if (style === "prime") main.appendChild(sectionEl("ph_featured","Featured on Prime","Movies, TV & Originals", () => showProviderGrid(prov, pid, "trending")));
  else if (style === "hulu") main.appendChild(sectionEl("ph_originals","Hulu Originals","Critically-acclaimed shows & films", () => showProviderGrid(prov, pid, "trending")));
  else if (style === "max") main.appendChild(sectionEl("ph_featured","HBO & Max Originals","Prestige storytelling", () => showProviderGrid(prov, pid, "trending")));
  else main.appendChild(sectionEl("ph_featured", "Featured on " + provName, "Top picks for you", () => showProviderGrid(prov, pid, "trending")));

  main.appendChild(sectionEl("ph_new","New & Recently Added","Fresh on " + provName, () => showProviderGrid(prov, pid, "new")));
  main.appendChild(sectionEl("ph_trend","Trending on " + provName,"What everyone's watching", () => showProviderGrid(prov, pid, "trending")));
  main.appendChild(sectionEl("ph_movies","Movies", "Feature films on " + provName, () => showProviderGrid(prov, pid, "movie")));
  main.appendChild(sectionEl("ph_tv","TV Shows", "Series on " + provName, () => showProviderGrid(prov, pid, "tv")));
  if (!anime) main.appendChild(sectionEl("ph_kids","Kids & Family", "Safe picks on " + provName, () => showProviderGrid(prov, pid, "kids")));
  main.appendChild(sectionEl("ph_top","Top Rated", "Highest rated on " + provName, () => showProviderGrid(prov, pid, "top")));

  if (style === "netflix"){
    loadRail("ph_top10", async () => {
      if (myToken !== provToken) return [];
      const tightCfg = { ...cfg, recencyDays: 120, minVotes: Math.max(cfg.minVotes, 20) };
      const [m,t] = await Promise.all([provDiscoverSafe(pid, REGION, "movie", { ...tightCfg, sortBy: "popularity.desc" }), provDiscoverSafe(pid, REGION, "tv", { ...tightCfg, sortBy: "popularity.desc" })]);
      return mergeTwo(m, t, cmpPop).slice(0, 10);
    }, {top10:true});
  } else {
    loadRail("ph_featured", async () => {
      if (myToken !== provToken) return [];
      const [m,t] = await Promise.all([provDiscoverSafe(pid, REGION, "movie", { ...cfg, sortBy: "popularity.desc" }), provDiscoverSafe(pid, REGION, "tv", { ...cfg, sortBy: "popularity.desc" })]);
      return mergeTwo(m, t, cmpPop).slice(0, 20);
    });
    if (style === "crunchyroll"){
      loadRail("ph_simul", async () => {
        if (myToken !== provToken) return [];
        const simulCfg = { ...cfg, recencyDays: 180 };
        const [m,t] = await Promise.all([provDiscoverSafe(pid, REGION, "movie", { ...simulCfg, sortBy: "popularity.desc" }), provDiscoverSafe(pid, REGION, "tv", { ...simulCfg, sortBy: "popularity.desc" })]);
        return mergeTwo(m, t, cmpPop).slice(0, 20);
      });
    }
  }
  loadRail("ph_new", async () => {
    if (myToken !== provToken) return [];
    const [m,t] = await Promise.all([
      provDiscoverSafe(pid, REGION, "movie", { ...cfg, sortBy: "primary_release_date.desc", recencyDays: Math.min(cfg.recencyDays, 180), extra: { "primary_release_date.lte": TODAY } }),
      provDiscoverSafe(pid, REGION, "tv", { ...cfg, sortBy: "first_air_date.desc", recencyDays: Math.min(cfg.recencyDays, 180), extra: { "first_air_date.lte": TODAY } })
    ]);
    return mergeTwo(m, t, cmpDate).slice(0, 20);
  });
  loadRail("ph_trend", async () => {
    if (myToken !== provToken) return [];
    const trendCfg = { ...cfg, recencyDays: Math.min(cfg.recencyDays, 90) };
    const [m,t] = await Promise.all([provDiscoverSafe(pid, REGION, "movie", { ...trendCfg, sortBy: "popularity.desc" }), provDiscoverSafe(pid, REGION, "tv", { ...trendCfg, sortBy: "popularity.desc" })]);
    return mergeTwo(m, t, cmpPop).slice(0, 20);
  });
  loadRail("ph_movies", async () => { if (myToken !== provToken) return []; return (await provDiscoverSafe(pid, REGION, "movie", { ...cfg, sortBy: "popularity.desc" })).slice(0, 20); });
  loadRail("ph_tv", async () => { if (myToken !== provToken) return []; return (await provDiscoverSafe(pid, REGION, "tv", { ...cfg, sortBy: "popularity.desc" })).slice(0, 20); });
  if (!anime){
    loadRail("ph_kids", async () => {
      if (myToken !== provToken) return [];
      const kidCfg = { ...cfg, genres: "10751|16", minVotes: 5, recencyDays: Math.min(cfg.recencyDays, 1095) };
      const [m,t] = await Promise.all([
        provDiscoverSafe(pid, REGION, "movie", { ...kidCfg, sortBy: "popularity.desc", extra: { certification_country: "US", "certification.lte": "PG" } }),
        provDiscoverSafe(pid, REGION, "tv", { ...kidCfg, sortBy: "popularity.desc" })
      ]);
      return mergeTwo(m, t, cmpPop).slice(0, 20);
    }, {kids:true});
  }
  loadRail("ph_top", async () => {
    if (myToken !== provToken) return [];
    const topCfg = { ...cfg, minVotes: Math.max(cfg.minVotes, 100) };
    const [m,t] = await Promise.all([provDiscoverSafe(pid, REGION, "movie", { ...topCfg, sortBy: "vote_average.desc" }), provDiscoverSafe(pid, REGION, "tv", { ...topCfg, sortBy: "vote_average.desc" })]);
    return mergeTwo(m, t, cmpRating).slice(0, 20);
  });

  const back = document.getElementById("provHomeBack");
  if (back) back.onclick = () => routeTo("hubs");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function bookmarkSvg(filled){
  return '<svg viewBox="0 0 24 24" fill="' + (filled?'currentColor':'none') + '" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>';
}
function getProviderTagline(key, name){
  const lines = {
    netflix:"Watch TV shows and movies anytime, anywhere.",
    disney:"The best of Disney, Pixar, Marvel, Star Wars & National Geographic.",
    crunchyroll:"The world's largest anime library.",
    prime:"Movies, TV, and Amazon Originals.",
    hulu:"TV shows, movies, and originals.",
    max:"The best of HBO, Warner Bros., DC, and more.",
    apple:"Apple Originals. Award-winning stories.",
    paramount:"A mountain of entertainment.",
    peacock:"Streaming what you love.",
    stan:"Australia's home of TV and movies.",
    binge:"Endless entertainment.",
    shudder:"Fear is in the house.",
    mubi:"Hand-picked cinema.",
    tubi:"Free movies and TV.",
    pluto:"Drop in. It's free.",
    roku:"Stream what you love."
  };
  return lines[key] || ("Streaming on " + name + " in " + REGION + ".");
}
function buildDisneyBrandRow(pid){
  const sec = document.createElement("div");
  sec.className = "section";
  sec.innerHTML = '<div class="section-head"><div><h2>Explore</h2><p>Brands and collections</p></div></div><div class="brand-hubs" id="disneyBrandHubs"></div>';
  setTimeout(() => {
    const el = document.getElementById("disneyBrandHubs");
    if (!el) return;
    el.innerHTML = DISNEY_BRANDS.map((b,i) => '<div class="brand-tile anim-pop" style="animation-delay:' + (i*40) + 'ms; background:' + b.bg + ';" data-cid="' + b.cid + '" data-label="' + b.label + '"><span style="color:' + b.color + ';letter-spacing:.05em;">' + b.label.toUpperCase() + '</span></div>').join("");
    el.querySelectorAll(".brand-tile").forEach(t => { t.onclick = () => showDisneyBrandGrid(t.dataset.label, t.dataset.cid, pid); });
  }, 0);
  return sec;
}
async function showDisneyBrandGrid(brand, cid, pid){
  const grid = openGrid("Disney+ · " + brand);
  try {
    const base = { with_watch_providers: pid, watch_region: REGION, with_watch_monetization_types: "flatrate", with_companies: cid, sort_by: "popularity.desc", include_adult: false };
    const [m,t] = await Promise.all([tmdb("/discover/movie", base), tmdb("/discover/tv", base)]);
    const items = mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})), cmpPop).slice(0, 60);
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}

async function showProviderGrid(prov, pid, kind){
  const titles = {trending:prov.name+" · Trending", movie:"Movies on "+prov.name, tv:"TV on "+prov.name, kids:"Kids on "+prov.name, top:"Top Rated on "+prov.name, new:"New on "+prov.name};
  const grid = openGrid(titles[kind]);
  try {
    const design = getProviderDesign(prov.name);
    const cfg = { ...DEFAULT_PROVIDER_CONTENT, ...(PROVIDER_CONTENT[design.key] || {}) };
    let items = [];
    if (kind==="movie") items = await provDiscoverSafe(pid, REGION, "movie", { ...cfg, sortBy: "popularity.desc" });
    else if (kind==="tv") items = await provDiscoverSafe(pid, REGION, "tv", { ...cfg, sortBy: "popularity.desc" });
    else if (kind==="kids"){
      const kidCfg = { ...cfg, genres: "10751|16", minVotes: 5, recencyDays: Math.min(cfg.recencyDays, 1095) };
      const [m,t] = await Promise.all([
        provDiscoverSafe(pid, REGION, "movie", { ...kidCfg, sortBy: "popularity.desc", extra: { certification_country: "US", "certification.lte": "PG" } }),
        provDiscoverSafe(pid, REGION, "tv", { ...kidCfg, sortBy: "popularity.desc" })
      ]);
      items = mergeTwo(m, t, cmpPop);
    } else if (kind==="top"){
      const topCfg = { ...cfg, minVotes: Math.max(cfg.minVotes, 100) };
      const [m,t] = await Promise.all([provDiscoverSafe(pid, REGION, "movie", { ...topCfg, sortBy: "vote_average.desc" }), provDiscoverSafe(pid, REGION, "tv", { ...topCfg, sortBy: "vote_average.desc" })]);
      items = mergeTwo(m, t, cmpRating);
    } else if (kind==="new"){
      const [m,t] = await Promise.all([
        provDiscoverSafe(pid, REGION, "movie", { ...cfg, sortBy: "primary_release_date.desc", recencyDays: Math.min(cfg.recencyDays, 180), extra: { "primary_release_date.lte": TODAY } }),
        provDiscoverSafe(pid, REGION, "tv", { ...cfg, sortBy: "first_air_date.desc", recencyDays: Math.min(cfg.recencyDays, 180), extra: { "first_air_date.lte": TODAY } })
      ]);
      items = mergeTwo(m, t, cmpDate);
    } else {
      const trendCfg = { ...cfg, recencyDays: Math.min(cfg.recencyDays, 90) };
      const [m,t] = await Promise.all([provDiscoverSafe(pid, REGION, "movie", { ...trendCfg, sortBy: "popularity.desc" }), provDiscoverSafe(pid, REGION, "tv", { ...trendCfg, sortBy: "popularity.desc" })]);
      items = mergeTwo(m, t, cmpPop);
    }
    grid.innerHTML=""; items.slice(0,60).forEach((i,idx)=>grid.appendChild(card(i, {kids:kind==="kids"}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}

const MOVIE_SPOTLIGHTS = [
  {id:"m_g_action", title:"Hot Action", sub:"Current hits people are actually watching", genre:28},
  {id:"m_g_comedy", title:"Hot Comedy", sub:"The funny ones with a crowd", genre:35},
  {id:"m_g_horror", title:"Hot Horror", sub:"Recent scares with real ratings", genre:27},
  {id:"m_g_scifi", title:"Hot Sci-Fi", sub:"Big science fiction right now", genre:878},
  {id:"m_g_thriller", title:"Hot Thriller", sub:"Tense, popular, recent", genre:53},
  {id:"m_g_romance", title:"Hot Romance", sub:"The ones people keep opening", genre:10749},
  {id:"m_g_anim", title:"Hot Animation", sub:"Animated features with an audience", genre:16},
  {id:"m_g_crime", title:"Hot Crime", sub:"Heists, cases, and underworld hits", genre:80}
];
const TV_SPOTLIGHTS = [
  {id:"t_g_drama", title:"Hot Drama", sub:"The shows people finish", genre:18},
  {id:"t_g_comedy", title:"Hot Comedy", sub:"Current comedies with a crowd", genre:35},
  {id:"t_g_crime", title:"Hot Crime", sub:"Cases and underworld series", genre:80},
  {id:"t_g_scifi", title:"Sci-Fi & Fantasy", sub:"The big genre shows", genre:10765},
  {id:"t_g_action", title:"Action & Adventure", sub:"Set pieces and season hits", genre:10759},
  {id:"t_g_mystery", title:"Hot Mystery", sub:"The puzzles people are in", genre:9648},
  {id:"t_g_anim", title:"Animated Series", sub:"Animation that isn't only for kids", genre:16},
  {id:"t_g_reality", title:"Reality", sub:"What's on in unscripted", genre:10764}
];
const NETWORKS = [
  {key:"netflix", name:"Netflix", pid:8},
  {key:"disney", name:"Disney+", pid:337},
  {key:"prime", name:"Prime Video", pid:9},
  {key:"max", name:"Max", pid:1899},
  {key:"apple", name:"Apple TV+", pid:350},
  {key:"hulu", name:"Hulu", pid:15}
];
function hotDiscover(kind, genre){
  const movie = kind === "movie";
  const params = {
    with_genres: genre,
    sort_by: "popularity.desc",
    "vote_count.gte": movie ? 120 : 40,
    include_adult: false
  };
  params[movie ? "primary_release_date.gte" : "first_air_date.gte"] = daysAgoISO(1460);
  return tmdb(movie ? "/discover/movie" : "/discover/tv", params).then(r => (r.results||[]).map(x => ({...x, media_type: kind})));
}
function networkDiscover(kind, pid){
  const movie = kind === "movie";
  return tmdb(movie ? "/discover/movie" : "/discover/tv", {
    with_watch_providers: pid,
    watch_region: REGION,
    with_watch_monetization_types: "flatrate",
    sort_by: "popularity.desc",
    "vote_count.gte": movie ? 40 : 20,
    include_adult: false
  }).then(r => (r.results||[]).map(x => ({...x, media_type: kind})));
}
async function showNetworkGrid(net, kind){
  const grid = openGrid(net.name + (kind==="movie" ? " Movies" : " Shows"));
  try {
    const items = await networkDiscover(kind, net.pid);
    grid.innerHTML = "";
    if (!items.length){ grid.innerHTML = '<div class="loader">Nothing on ' + net.name + ' in ' + REGION + ' right now.</div>'; return; }
    items.forEach((i, idx) => grid.appendChild(card(i, {}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
function mountSpotlights(main, list, kind){
  list.forEach(g => {
    main.appendChild(sectionEl(g.id, g.title, g.sub, () => showGenreGrid({id:g.genre, name:g.title}, kind)));
    loadRail(g.id, () => hotDiscover(kind, g.genre).then(rows => rows.slice(0, 16)));
  });
  NETWORKS.forEach(net => {
    const id = (kind==="movie" ? "m_" : "t_") + "net_" + net.key;
    const label = "On " + net.name;
    main.appendChild(sectionEl(id, label, kind==="movie" ? "Popular movies on " + net.name : "Popular shows on " + net.name, () => showNetworkGrid(net, kind)));
    loadRail(id, () => networkDiscover(kind, net.pid).then(rows => rows.slice(0, 16)));
  });
}

/* ================= MOVIE / TV / ANIME TABS ================= */
async function buildMovieTab(){
  await ensureGenres();
  const main = document.getElementById("mainContent"); exitProvMode(); main.innerHTML = "";
  main.appendChild(sectionEl("m_theaters","In Theaters","Currently playing", ()=>showSpecial("now_movie")));
  main.appendChild(sectionEl("m_new","New Releases","Latest releases", ()=>showSpecial("new_movie")));
  main.appendChild(sectionEl("m_upcoming","Coming Soon","Landing soon", ()=>showSpecial("upcoming_movie")));
  main.appendChild(sectionEl("m_trend","Trending Movies","Hits right now", ()=>showSpecial("trend_movie")));
  main.appendChild(sectionEl("m_pop","Popular Movies","Most popular", ()=>showSpecial("pop_movie")));
  main.appendChild(sectionEl("m_top","Top Rated Movies","Highest rated", ()=>showSpecial("top_movie")));
  const gs = document.createElement("div"); gs.className = "section";
  gs.innerHTML = '<div class="section-head"><h2>Browse Movies by Genre</h2></div>';
  gs.appendChild(genreChipsBar(genresMovie, g => showGenreGrid(g,"movie")));
  main.appendChild(gs);
  buildHero(async ()=> (await tmdb("/trending/movie/week")).results, "TRENDING MOVIES");
  loadRail("m_theaters", async ()=> (await tmdb("/movie/now_playing",{region:REGION})).results.map(x=>({...x,media_type:"movie"})));
  loadRail("m_new", async ()=> (await tmdb("/discover/movie",{sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":30,include_adult:false})).results.map(x=>({...x,media_type:"movie"})));
  loadRail("m_upcoming", async ()=> (await tmdb("/movie/upcoming",{region:REGION})).results.map(x=>({...x,media_type:"movie"})));
  loadRail("m_trend", async ()=> (await tmdb("/trending/movie/day")).results.map(x=>({...x,media_type:"movie"})));
  loadRail("m_pop", async ()=> (await tmdb("/movie/popular")).results.map(x=>({...x,media_type:"movie"})));
  loadRail("m_top", async ()=> (await tmdb("/movie/top_rated")).results.map(x=>({...x,media_type:"movie"})));
  mountSpotlights(main, MOVIE_SPOTLIGHTS, "movie");
}
async function buildTVTab(){
  await ensureGenres();
  const main = document.getElementById("mainContent"); exitProvMode(); main.innerHTML = "";
  main.appendChild(sectionEl("t_airing","Airing Today","Episodes dropping today", ()=>showSpecial("airing_tv")));
  main.appendChild(sectionEl("t_onair","On The Air","Currently airing", ()=>showSpecial("onair_tv")));
  main.appendChild(sectionEl("t_new","New TV Releases","Just premiered", ()=>showSpecial("new_tv")));
  main.appendChild(sectionEl("t_trend","Trending TV","Hits right now", ()=>showSpecial("trend_tv")));
  main.appendChild(sectionEl("t_pop","Popular TV","Most popular", ()=>showSpecial("pop_tv")));
  main.appendChild(sectionEl("t_top","Top Rated TV","Highest rated", ()=>showSpecial("top_tv")));
  const gs = document.createElement("div"); gs.className = "section";
  gs.innerHTML = '<div class="section-head"><h2>Browse TV by Genre</h2></div>';
  gs.appendChild(genreChipsBar(genresTV, g => showGenreGrid(g,"tv")));
  main.appendChild(gs);
  buildHero(async ()=> (await tmdb("/trending/tv/week")).results, "TRENDING TV SHOWS");
  loadRail("t_airing", async ()=> (await tmdb("/tv/airing_today")).results.map(x=>({...x,media_type:"tv"})));
  loadRail("t_onair", async ()=> (await tmdb("/tv/on_the_air")).results.map(x=>({...x,media_type:"tv"})));
  loadRail("t_new", async ()=> (await tmdb("/discover/tv",{sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":15,include_adult:false})).results.map(x=>({...x,media_type:"tv"})));
  loadRail("t_trend", async ()=> (await tmdb("/trending/tv/day")).results.map(x=>({...x,media_type:"tv"})));
  loadRail("t_pop", async ()=> (await tmdb("/tv/popular")).results.map(x=>({...x,media_type:"tv"})));
  loadRail("t_top", async ()=> (await tmdb("/tv/top_rated")).results.map(x=>({...x,media_type:"tv"})));
  mountSpotlights(main, TV_SPOTLIGHTS, "tv");
}
const ANIME_SUBGENRES = [
  {id:28,name:"Action"},{id:12,name:"Adventure"},{id:35,name:"Comedy"},
  {id:18,name:"Drama"},{id:14,name:"Fantasy"},{id:10749,name:"Romance"},{id:9648,name:"Mystery"}
];
async function animeDiscover(extra={}, kind="both"){
  const calls = [];
  if (kind==="both" || kind==="tv") calls.push(tmdb("/discover/tv",{with_genres:16,with_origin_country:"JP",include_adult:false,...extra}).then(r=>r.results.map(x=>({...x,_forceType:"anime",_animeKind:"tv"}))));
  if (kind==="both" || kind==="movie") calls.push(tmdb("/discover/movie",{with_genres:16,with_origin_country:"JP",include_adult:false,...extra}).then(r=>r.results.map(x=>({...x,_forceType:"anime",_animeKind:"movie"}))));
  const res = await Promise.all(calls);
  return extra.sort_by && extra.sort_by.includes("date") ? mergeTwo(res[0]||[], res[1]||[], cmpDate) : mergeTwo(res[0]||[], res[1]||[], cmpRating);
}
async function buildAnimeTab(){
  const main = document.getElementById("mainContent"); exitProvMode(); main.innerHTML = "";
  main.appendChild(sectionEl("a_new","New Anime Releases","Freshly released", ()=>showAnime("new")));
  main.appendChild(sectionEl("a_hits","Popular Anime","Biggest hits", ()=>showAnime("popular")));
  main.appendChild(sectionEl("a_airing","Airing Anime","Currently airing", ()=>showAnime("airing")));
  main.appendChild(sectionEl("a_top","Top Rated Anime","Highest rated", ()=>showAnime("top")));
  main.appendChild(sectionEl("a_movies","Anime Movies","Feature films", ()=>showAnime("movies")));
  const gs = document.createElement("div"); gs.className = "section";
  gs.innerHTML = '<div class="section-head"><h2>Browse Anime by Genre</h2></div>';
  gs.appendChild(genreChipsBar(ANIME_SUBGENRES, g => showAnimeGenreGrid(g)));
  main.appendChild(gs);
  buildHero(async ()=> animeDiscover({sort_by:"popularity.desc"}), "TRENDING ANIME");
  loadRail("a_new", async ()=> (await animeDiscover({sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":5})).slice(0,14));
  loadRail("a_hits", async ()=> (await animeDiscover({sort_by:"popularity.desc"})).slice(0,14));
  loadRail("a_airing", async ()=> (await animeDiscover({sort_by:"popularity.desc","first_air_date.lte":TODAY,"vote_count.gte":10},"tv")).slice(0,14));
  loadRail("a_top", async ()=> (await animeDiscover({sort_by:"vote_average.desc","vote_count.gte":100})).slice(0,14));
  loadRail("a_movies", async ()=> (await animeDiscover({sort_by:"popularity.desc"},"movie")).slice(0,14));
}

/* ================= APPS TAB ================= */
async 
function buildHubsTab(){
  const main = document.getElementById("mainContent");
  exitProvMode();
  document.getElementById("hero").innerHTML =
    '<div class="hero-content"><div class="hero-eyebrow">STREAMING APPS</div>' +
    '<div class="hero-title">Every Service, One Grid</div>' +
    '<div class="hero-overview">Tap any app icon to open its own themed home screen — with its real brand identity, colors, and a feed of only what\'s on that service in ' + REGION + '.</div></div>';
  document.getElementById("hero").style.backgroundImage = "linear-gradient(120deg,#151520,#0a0a0d)";
  main.innerHTML = "";
  const launcherSec = document.createElement("div");
  launcherSec.className = "section provider-launcher-section";
  launcherSec.innerHTML = '<div class="section-head"><div><h2>All Apps</h2><p>Tap to launch a service</p></div></div><div class="provider-launcher" id="hubsLauncher"></div>';
  main.appendChild(launcherSec);
  const hubContainer = document.createElement("div");
  hubContainer.id = "hubContainer";
  main.appendChild(hubContainer);
  buildProviderLauncher("hubsLauncher", 24);
  const providers = (await fetchAllProviders()).slice(0, 12);
  for (const p of providers){
    const design = getProviderDesign(p.name);
    const sec = document.createElement("div");
    sec.className = "hub-section";
    sec.style.cssText = "--p-color:" + design.color + ";--p-bg:" + design.bg2 + ";--p-accent:" + design.accent + ";";
    sec.innerHTML = '<div class="hub-banner" style="background:linear-gradient(135deg, ' + design.bg2 + ', #0a0a0d); border-bottom:2px solid ' + design.color + ';">' +
      '<img class="hub-logo" src="' + providerLogo(p.logo,"w154") + '" alt="' + p.name + '" onerror="this.style.display=\'none\'">' +
      '<span class="hub-name" style="color:' + design.color + ';">' + p.name + '</span>' +
      '<span class="hub-arrow">→</span></div>' +
      '<div class="hub-body"><div class="rail" id="hub_' + p.id + '"></div></div>';
    sec.querySelector(".hub-banner").onclick = () => renderProviderHome({id:p.id, name:p.name});
    hubContainer.appendChild(sec);
  }
  for (const p of providers){
    const el = document.getElementById("hub_" + p.id);
    if (!el) continue;
    el.innerHTML = "";
    for (let i=0;i<4;i++){ const sk = document.createElement("div"); sk.className = "skel"; el.appendChild(sk); }
    try {
      const design = getProviderDesign(p.name);
      const cfg = { ...DEFAULT_PROVIDER_CONTENT, ...(PROVIDER_CONTENT[design.key] || {}) };
      const [m,t] = await Promise.all([provDiscoverSafe(p.id, REGION, "movie", { ...cfg, sortBy: "popularity.desc" }), provDiscoverSafe(p.id, REGION, "tv", { ...cfg, sortBy: "popularity.desc" })]);
      railInto(el, mergeTwo(m, t, cmpPop).slice(0, 16));
    } catch(e){ el.innerHTML = '<div class="loader err small">Couldn\'t load ' + p.name + '.</div>'; }
  }
}

/* ================= GRID VIEWS ================= */
function openGrid(title){
  document.getElementById("hero").style.display = "none";
  document.getElementById("mainContent").style.display = "none";
  document.getElementById("gridView").classList.add("open");
  document.getElementById("gridTitle").textContent = title;
  const grid = document.getElementById("gridGrid");
  grid.innerHTML = '<div class="loader">Loading…</div>';
  return grid;
}
document.getElementById("gridBack").onclick = () => {
  document.getElementById("gridView").classList.remove("open");
  document.getElementById("hero").style.display = "";
  document.getElementById("mainContent").style.display = "";
};
async function showGenreGrid(genre, scope){
  const grid = openGrid(genre.name);
  try {
    let merged = [];
    if (scope==="movie" || scope==="all"){ const m = await tmdb("/discover/movie",{with_genres:genre.id, sort_by:"popularity.desc", include_adult:false}); merged.push(...m.results.map(x=>({...x,media_type:"movie"}))); }
    if (scope==="tv" || scope==="all"){ const t = await tmdb("/discover/tv",{with_genres:genre.id, sort_by:"popularity.desc", include_adult:false}); merged.push(...t.results.map(x=>({...x,media_type:"tv"}))); }
    merged = mergeTwo(merged.filter(x=>x.media_type==="movie"), merged.filter(x=>x.media_type==="tv"), cmpPop);
    grid.innerHTML=""; merged.forEach((i,idx)=>grid.appendChild(card(i, {}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showAnimeGenreGrid(g){
  const grid = openGrid("Anime · " + g.name);
  try { const items = await animeDiscover({with_genres:"16," + g.id, sort_by:"popularity.desc"}); grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {}, idx))); }
  catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showAnime(kind){
  const titles = {new:"New Anime Releases", popular:"Popular Anime", top:"Top Rated Anime", movies:"Anime Movies", airing:"Airing Anime"};
  const grid = openGrid(titles[kind]);
  try {
    let items;
    if (kind==="new") items = await animeDiscover({sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":5});
    else if (kind==="top") items = await animeDiscover({sort_by:"vote_average.desc","vote_count.gte":100});
    else if (kind==="movies") items = await animeDiscover({sort_by:"popularity.desc"},"movie");
    else if (kind==="airing") items = await animeDiscover({sort_by:"popularity.desc","first_air_date.lte":TODAY,"vote_count.gte":10},"tv");
    else items = await animeDiscover({sort_by:"popularity.desc"});
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showSpecial(kind){
  const titles = {
    trending:"Trending Now", new:"New Releases", toprated:"Top Rated",
    new_movie:"New Movie Releases", trend_movie:"Trending Movies", top_movie:"Top Rated Movies",
    now_movie:"In Theaters", upcoming_movie:"Coming Soon", pop_movie:"Popular Movies",
    new_tv:"New TV Releases", trend_tv:"Trending TV Shows", top_tv:"Top Rated TV Shows",
    airing_tv:"Airing Today", onair_tv:"On The Air", pop_tv:"Popular TV Shows"
  };
  const grid = openGrid(titles[kind] || kind);
  try {
    let items = [];
    if (kind==="trending") items = (await tmdb("/trending/all/week")).results;
    else if (kind==="new"){
      const [m,t] = await Promise.all([
        tmdb("/discover/movie",{sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":30,include_adult:false}),
        tmdb("/discover/tv",{sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":15,include_adult:false})
      ]);
      items = mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})),cmpDate);
    } else if (kind==="toprated"){
      const [m,t] = await Promise.all([tmdb("/movie/top_rated"), tmdb("/tv/top_rated")]);
      items = mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})),cmpRating);
    }
    else if (kind==="new_movie") items = (await tmdb("/discover/movie",{sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":30,include_adult:false})).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="trend_movie") items = (await tmdb("/trending/movie/week")).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="top_movie") items = (await tmdb("/movie/top_rated")).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="now_movie") items = (await tmdb("/movie/now_playing",{region:REGION})).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="upcoming_movie") items = (await tmdb("/movie/upcoming",{region:REGION})).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="pop_movie") items = (await tmdb("/movie/popular")).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="new_tv") items = (await tmdb("/discover/tv",{sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":15,include_adult:false})).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="trend_tv") items = (await tmdb("/trending/tv/week")).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="top_tv") items = (await tmdb("/tv/top_rated")).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="airing_tv") items = (await tmdb("/tv/airing_today")).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="onair_tv") items = (await tmdb("/tv/on_the_air")).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="pop_tv") items = (await tmdb("/tv/popular")).results.map(x=>({...x,media_type:"tv"}));
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}

/* ================= CATEGORY BAR ================= */
const PREDEFINED = [
  {label:"Trending", fn:()=>showSpecial("trending")},
  {label:"New Releases", fn:()=>showSpecial("new")},
  {label:"Top Rated", fn:()=>showSpecial("toprated")},
  {label:"In Theaters", fn:()=>showSpecial("now_movie")},
  {label:"Coming Soon", fn:()=>showSpecial("upcoming_movie")},
  {label:"Anime", fn:()=>showAnime("popular")},
  {label:"Kids", fn:()=>showKids("popular")},
  {label:"Music", fn:()=>showMusic("trend")},
  {label:"Action", fn:()=>showGenreGrid({id:28,name:"Action"},"all")},
  {label:"Comedy", fn:()=>showGenreGrid({id:35,name:"Comedy"},"all")},
  {label:"Horror", fn:()=>showGenreGrid({id:27,name:"Horror"},"all")},
  {label:"Sci-Fi", fn:()=>showGenreGrid({id:878,name:"Science Fiction"},"all")},
  {label:"Romance", fn:()=>showGenreGrid({id:10749,name:"Romance"},"all")},
  {label:"Documentary", fn:()=>showGenreGrid({id:99,name:"Documentary"},"all")},
];
function buildCatBar(){
  const bar = document.getElementById("catBar"); bar.innerHTML = "";
  PREDEFINED.forEach(p => { const c = document.createElement("div"); c.className = "cat-chip"; c.textContent = p.label; c.onclick = () => p.fn(); bar.appendChild(c); });
}

/* ================= REGION ================= */
const REGIONS = [["US","United States"],["GB","United Kingdom"],["CA","Canada"],["AU","Australia"],["NZ","New Zealand"],["IE","Ireland"],["DE","Germany"],["FR","France"],["ES","Spain"],["IT","Italy"],["NL","Netherlands"],["SE","Sweden"],["NO","Norway"],["DK","Denmark"],["FI","Finland"],["PL","Poland"],["PT","Portugal"],["BR","Brazil"],["MX","Mexico"],["AR","Argentina"],["JP","Japan"],["KR","South Korea"],["IN","India"],["ID","Indonesia"],["PH","Philippines"],["TH","Thailand"],["SG","Singapore"],["MY","Malaysia"],["ZA","South Africa"],["AE","United Arab Emirates"],["TR","Türkiye"],["RU","Russia"]];
function buildRegionSelect(){
  const sel = document.getElementById("regionSelect");
  sel.innerHTML = REGIONS.map(([c]) => '<option value="' + c + '"' + (c===REGION?' selected':'') + '>' + c + '</option>').join("");
  if (!regionChangeHooked){
    sel.onchange = () => {
      REGION = sel.value;
      try { localStorage.setItem("goar_region", REGION); } catch(e){}
      providerMapCache = {};
      toast("Region: " + REGION);
      if (document.body.classList.contains("prov-mode")) routeTo("hubs");
      else if (activeTab === "hubs") buildHubsTab();
      else routeTo(activeTab);
    };
    regionChangeHooked = true;
  }
}

/* ================= NAV ================= */
function setActiveTab(tab){
  activeTab = tab;
  document.querySelectorAll("nav a[data-tab]").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  document.getElementById("gridView").classList.remove("open");
  document.getElementById("hero").style.display = "";
  document.getElementById("mainContent").style.display = "";
}
function routeTo(tab){
  const gridOpen = document.getElementById("gridView").classList.contains("open");
  if (activeTab === tab && !document.body.classList.contains("prov-mode") && !gridOpen) return;
  setActiveTab(tab);
  const main = document.getElementById("mainContent");
  main.style.transition = "opacity .15s";
  main.style.opacity = "0.3";
  setTimeout(() => {
    if (tab==="movie") buildMovieTab();
    else if (tab==="tv") buildTVTab();
    else if (tab==="anime") buildAnimeTab();
    else if (tab==="kids") buildKidsTab();
    else if (tab==="music") buildMusicTab();
    else if (tab==="hubs") buildHubsTab();
    else if (tab==="list") buildListTab();
    else buildHome();
    main.style.opacity = "1";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 60);
}
document.querySelectorAll("nav a[data-tab]").forEach(a => a.addEventListener("click", () => routeTo(a.dataset.tab)));

async function buildListTab(){
  const main = document.getElementById("mainContent"); exitProvMode();
  document.getElementById("hero").style.display = "none";
  main.innerHTML = "";
  const sec = document.createElement("div");
  sec.className = "section";
  sec.innerHTML = '<div class="section-head"><div><h2>My List</h2><p>' + watchlist.length + ' saved title' + (watchlist.length===1?'':'s') + '</p></div></div>';
  const gridWrap = document.createElement("div");
  gridWrap.className = "grid";
  gridWrap.style.padding = "0 5vw";
  gridWrap.style.display = "grid";
  gridWrap.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))";
  gridWrap.style.gap = "16px";
  sec.appendChild(gridWrap);
  main.appendChild(sec);
  if (!watchlist.length){
    gridWrap.outerHTML = '<div class="loader" style="padding:60px 5vw;">Nothing saved yet. Tap the ★ on any card or in a title\'s detail view.</div>';
    return;
  }
  watchlist.forEach((w,i) => {
    const item = { id:w.id, title:w.title, name:w.title, poster_path:w.poster, vote_average:w.rating, release_date:w.date, _forceType:w.type };
    gridWrap.appendChild(card(item, {}, i));
  });
}

/* ================= SEARCH ================= */
let searchTimer;
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q){ searchResults.classList.remove("open"); return; }
  searchTimer = setTimeout(async () => {
    try {
      const data = await tmdb("/search/multi",{query:q, include_adult:false});
      const items = data.results.filter(r => (r.media_type==="movie"||r.media_type==="tv") && r.poster_path).slice(0,10);
      searchResults.innerHTML = items.map(item => {
        const isMusic = (item.genre_ids||[]).includes(MUSIC_GENRE_ID);
        const isKids = (item.genre_ids||[]).some(id => id===10751 || id===16) && !isMusic;
        const label = isMusic ? "Music" : (isKids ? "Kids" : (item.media_type==="movie"?"Movie":"TV"));
        return '<div class="sr-item" data-id="' + item.id + '" data-type="' + item.media_type + '">' +
          '<img src="' + posterImg(item,"w92") + '" alt="' + titleOf(item) + '">' +
          '<div><div class="sr-t">' + titleOf(item) + '</div>' +
          '<div class="sr-m">' + yearOf(item) + ' · ' + label + (item.vote_average ? " · ★ " + item.vote_average.toFixed(1) : "") + '</div></div></div>';
      }).join("") || '<div class="sr-item"><div class="sr-m">No results</div></div>';
      searchResults.classList.add("open");
      searchResults.querySelectorAll(".sr-item[data-id]").forEach(el => {
        el.onclick = () => { openModal(el.dataset.id, el.dataset.type); searchResults.classList.remove("open"); searchInput.value = ""; };
      });
    } catch(e){
      searchResults.innerHTML = '<div class="sr-item"><div class="sr-m">Search failed: ' + e.message + '</div></div>';
      searchResults.classList.add("open");
    }
  }, 300);
});
document.addEventListener("click", e => { if (!e.target.closest(".search-wrap")) searchResults.classList.remove("open"); });

/* ================= MODAL ================= */
const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");
function miniCard(item, idx, type){
  return '<div class="mini-card anim-up" style="animation-delay:' + (idx*35) + 'ms" data-id="' + item.id + '" data-type="' + type + '">' +
    '<div class="mc-img"><img loading="lazy" src="' + posterImg(item,"w342") + '" alt=""><div class="mc-rating">★ ' + ratingOf(item) + '</div></div>' +
    '<div class="mc-title">' + titleOf(item) + '</div></div>';
}
let modalToken = 0;
async function openModal(id, type, focusWatch=false){
  const myToken = ++modalToken;
  modalBackdrop.classList.add("open");
  modalContent.innerHTML = '<div class="loader">Loading details…</div>';
  try {
    const data = await tmdb("/" + type + "/" + id, {append_to_response:"credits,videos,external_ids,similar,recommendations"});
    if (myToken !== modalToken) return;
    const imdbId = data.external_ids && data.external_ids.imdb_id;
    const videos = (data.videos && data.videos.results || []).filter(v => v.site==="YouTube").slice(0,6);
    const trailer = videos.find(v => v.type==="Trailer");
    const runtime = data.runtime ? (data.runtime + " min") : (data.episode_run_time && data.episode_run_time[0] ? (data.episode_run_time[0] + " min/ep") : (data.number_of_seasons ? (data.number_of_seasons + " season" + (data.number_of_seasons>1?'s':'')) : ""));
    const cast = ((data.credits && data.credits.cast) || []).filter(c => c.profile_path).slice(0,14);
    const similar = ((data.similar && data.similar.results) || []).filter(r => r.poster_path).slice(0,10);
    const recs = ((data.recommendations && data.recommendations.results) || []).filter(r => r.poster_path).slice(0,10);
    const saved = isSaved(id, type);
    modalContent.innerHTML =
      '<div class="modal-hero" style="background-image:url(' + backdropImg(data) + ')"><button class="modal-close" id="modalCloseBtn">✕</button></div>' +
      '<div class="modal-body">' +
      '<h2>' + titleOf(data) + '</h2>' +
      (data.tagline ? '<div class="modal-tagline">' + data.tagline + '</div>' : '') +
      '<div class="modal-meta">' +
      '<span style="color:var(--accent); font-weight:700;">★ ' + ratingOf(data) + '</span>' +
      '<span>' + yearOf(data) + '</span>' +
      (runtime ? '<span>' + runtime + '</span>' : '') +
      '<span>' + (type==="movie" ? "Movie" : "TV Show") + '</span>' +
      '</div>' +
      '<div class="modal-genres">' + (data.genres||[]).map(g => '<span>' + g.name + '</span>').join("") + '</div>' +
      '<div class="modal-overview">' + (data.overview || "No overview available.") + '</div>' +
      '<div class="modal-watch">' +
      '<button class="btn btn-play" id="modalPlay">▶ Watch Now</button>' +
      '<button class="btn-icon ' + (saved?'saved':'') + '" id="modalSave">' + bookmarkSvg(saved) + '</button>' +
      (trailer ? '<button class="btn btn-ghost" id="modalTrailer">▶ Trailer</button>' : '') +
      '<span class="modal-watch-note">' + (type==="tv" ? "Starts at Season 1, Episode 1." : "Plays through encrypted WISP tunnel.") + '</span></div>' +
      (cast.length ? '<div class="modal-section"><div class="modal-section-title">Top Cast</div><div class="cast-rail">' +
        cast.map(c => '<div class="cast-card"><img class="cast-img" loading="lazy" src="' + profileImg(c.profile_path) + '" alt=""><div class="cast-name">' + c.name + '</div><div class="cast-role">' + (c.character||"") + '</div></div>').join("") +
        '</div></div>' : '') +
      (similar.length ? '<div class="modal-section"><div class="modal-section-title">Similar</div><div class="mini-rail">' + similar.map((r,i)=>miniCard(r,i,type)).join("") + '</div></div>' : '') +
      (recs.length ? '<div class="modal-section"><div class="modal-section-title">You Might Also Like</div><div class="mini-rail">' + recs.map((r,i)=>miniCard(r,i,type)).join("") + '</div></div>' : '') +
      '<div class="modal-links" style="margin-top:26px;">' +
      '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.themoviedb.org/' + type + '/' + id + '">TMDB</a>' +
      (imdbId ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.imdb.com/title/' + imdbId + '/">IMDb</a>' : '') +
      '</div></div>';

    document.getElementById("modalCloseBtn").onclick = closeModal;
    document.getElementById("modalPlay").onclick = () => openPlayer(id, type, titleOf(data), data);
    document.getElementById("modalSave").onclick = () => {
      toggleSave(data, type);
      const s = isSaved(id, type);
      const mb = document.getElementById("modalSave");
      mb.classList.toggle("saved", s); mb.innerHTML = bookmarkSvg(s);
    };
    const trBtn = document.getElementById("modalTrailer");
    if (trBtn && trailer) trBtn.onclick = () => window.open("https://www.youtube.com/watch?v=" + trailer.key, "_blank");
    modalContent.querySelectorAll(".mini-card").forEach(mc => {
      mc.onclick = () => { closeModal(); setTimeout(() => openModal(mc.dataset.id, mc.dataset.type), 100); };
    });
  } catch(e){
    if (myToken !== modalToken) return;
    modalContent.innerHTML = '<div class="loader err">Couldn\'t load details.<br><code>' + e.message + '</code><br><button class="btn btn-ghost" id="modalCloseBtn2" style="margin-top:10px;">Close</button></div>';
    document.getElementById("modalCloseBtn2").onclick = closeModal;
  }
}
function closeModal(){ modalBackdrop.classList.remove("open"); modalContent.innerHTML = ""; }
modalBackdrop.addEventListener("click", e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape"){
    if (document.getElementById("playerOverlay").classList.contains("open")) closePlayer();
    else closeModal();
  }
  if (e.key === "/" && !e.target.matches("input,select,textarea")){ e.preventDefault(); searchInput.focus(); }
});

/* ================= BOOT ================= */
try { const saved = localStorage.getItem("goar_region"); if (saved) REGION = saved; } catch(e){}
buildRegionSelect();
buildCatBar();
buildHome();

buildWispSelect();
setTimeout(() => {
  ensureLibcurl().then(() => buildWispSelect()).catch(e => {
    console.warn("WISP warm-up failed:", e && e.message ? e.message : e);
    buildWispSelect();
  });
}, 200);
try {
  const tab = new URLSearchParams(location.search).get("tab");
  const map = { movies:"movie", movie:"movie", tv:"tv", anime:"anime", kids:"kids", list:"list", hubs:"hubs" };
  if (tab && map[tab]) routeTo(map[tab]);
} catch (e) {}
