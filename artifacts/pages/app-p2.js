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
