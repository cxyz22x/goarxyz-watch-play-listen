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
      const sources = await resolveSources(id, type, playerState.season, playerState.episode);
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
