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
