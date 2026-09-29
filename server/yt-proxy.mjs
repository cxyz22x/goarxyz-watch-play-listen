/**
 * Same-origin proxy for MarketJS game files, YouTube audio, and the daily Spotify chart.
 * Game assets must be same-origin or Impact's XHR loader paints a black canvas.
 * ANDROID_VR player URLs are the ones this network can actually download.
 * Charts come from open.spotify.com once per calendar day, then each hit is matched to YouTube.
 */

const GAME_ORIGIN = "https://cdn-factory.marketjs.com";

const YT_CLIENTS = [
  {
    name: "ANDROID_VR",
    version: "1.60.19",
    id: "28",
    ua: "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip",
    extra: { deviceMake: "Oculus", deviceModel: "Quest 3", androidSdkVersion: 32, osName: "Android", osVersion: "12" },
  },
  {
    name: "ANDROID",
    version: "20.10.38",
    id: "3",
    ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    extra: { androidSdkVersion: 30 },
  },
  {
    name: "IOS",
    version: "20.11.6",
    id: "5",
    ua: "com.google.ios.youtube/20.11.6 (iPhone14,5; U; CPU iOS 18_5 like Mac OS X;)",
    extra: { deviceMake: "Apple", deviceModel: "iPhone14,5", osName: "iPhone", osVersion: "18.5.0" },
  },
];

const audioCache = new Map();

function videoIdOk(id) {
  return /^[\w-]{11}$/.test(id || "");
}

async function playerJson(videoId, client) {
  const body = {
    context: { client: Object.assign({ clientName: client.name, clientVersion: client.version, hl: "en", gl: "US" }, client.extra) },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
  };
  const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": client.ua,
      "x-youtube-client-name": client.id,
      "x-youtube-client-version": client.version,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  return r.json();
}

function bestAudio(json) {
  const formats = (json && json.streamingData && json.streamingData.adaptiveFormats) || [];
  const audio = formats.filter((f) => f && f.url && /audio/i.test(f.mimeType || ""));
  audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  return audio[0] || null;
}

async function probe(url, ua) {
  const r = await fetch(url, { headers: { "user-agent": ua, range: "bytes=0-1" } });
  try { await r.body?.cancel(); } catch {}
  return r.ok || r.status === 206;
}

export async function resolveAudio(videoId) {
  const hit = audioCache.get(videoId);
  if (hit && hit.exp > Date.now()) return hit;
  for (const client of YT_CLIENTS) {
    try {
      const json = await playerJson(videoId, client);
      const fmt = bestAudio(json);
      if (!fmt) continue;
      if (!(await probe(fmt.url, client.ua))) continue;
      const details = (json && json.videoDetails) || {};
      const row = {
        url: fmt.url,
        ua: client.ua,
        mime: (fmt.mimeType || "audio/mp4").split(";")[0],
        title: details.title || "",
        artist: details.author || "",
        exp: Date.now() + 5 * 60 * 1000,
      };
      audioCache.set(videoId, row);
      return row;
    } catch {}
  }
  return null;
}

function walkVideos(node, out, seen) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => walkVideos(n, out, seen));
    return;
  }
  const vr = node.videoRenderer;
  if (vr && vr.videoId && !seen.has(vr.videoId)) {
    const title = (vr.title && vr.title.runs && vr.title.runs[0] && vr.title.runs[0].text) || (vr.title && vr.title.simpleText) || "";
    const artist = (vr.ownerText && vr.ownerText.runs && vr.ownerText.runs[0] && vr.ownerText.runs[0].text) || "";
    if (title && !/playlist|top hits|top songs|mix\b|compilation|trending songs|nonstop/i.test(title)) {
      seen.add(vr.videoId);
      out.push({ id: vr.videoId, title, artist });
    }
  }
  Object.values(node).forEach((n) => walkVideos(n, out, seen));
}

export async function searchVideos(q) {
  const body = {
    context: { client: { clientName: "WEB", clientVersion: "2.20260722.01.00", hl: "en", gl: "US" } },
    query: q,
  };
  const r = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return [];
  const json = await r.json();
  const out = [];
  walkVideos(json, out, new Set());
  return out.slice(0, 24);
}

const CHARTS = [
  { id: "37i9dQZEVXbMDoHDwVN2tF", name: "Top 50 Global" },
  { id: "37i9dQZF1DXcBWIGoYBM5M", name: "Today's Top Hits" },
];

const chartCache = new Map();

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function spotifyTrackId(uri) {
  const m = String(uri || "").match(/spotify:track:([A-Za-z0-9]{22})/);
  return m ? m[1] : "";
}

function cleanArtist(raw) {
  return String(raw || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function spotifyPlaylist(playlistId) {
  const r = await fetch("https://open.spotify.com/embed/playlist/" + playlistId, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      accept: "text/html",
    },
  });
  if (!r.ok) throw new Error("spotify " + r.status);
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("spotify chart missing");
  const data = JSON.parse(m[1]);
  const list = data?.props?.pageProps?.state?.data?.entity?.trackList;
  if (!Array.isArray(list)) throw new Error("spotify trackList missing");
  return list.map((t) => ({
    title: String(t.title || "").trim(),
    artist: cleanArtist(t.subtitle),
    uri: t.uri || "",
    sp: spotifyTrackId(t.uri),
    preview: (t.audioPreview && t.audioPreview.url) || "",
  })).filter((t) => t.title);
}

function scoreHit(video, title, artist) {
  const vt = String(video.title || "").toLowerCase();
  const va = String(video.artist || "").toLowerCase();
  const wantTitle = title.toLowerCase();
  const firstArtist = (artist.split(",")[0] || "").trim().toLowerCase();
  let score = 0;
  if (vt.includes(wantTitle)) score += 6;
  else if (wantTitle.split(/\s+/).filter((w) => w.length > 2).every((w) => vt.includes(w))) score += 3;
  if (firstArtist && (vt.includes(firstArtist) || va.includes(firstArtist))) score += 4;
  if (/official|music video|visualizer|lyric/i.test(vt)) score += 2;
  if (/audio only|lyrics?\)|topic -/i.test(vt)) score -= 1;
  if (/playlist|top hits|top songs|mix\b|compilation|nonstop|live at|sped up|slowed|nightcore|cover\b|karaoke/i.test(vt)) score -= 6;
  if (/\/shorts\//i.test(video.id || "")) score -= 8;
  return score;
}

async function matchYoutube(title, artist) {
  const q = (title + " " + (artist.split(",")[0] || "").trim() + " official").trim();
  const rows = await searchVideos(q);
  if (!rows.length) return null;
  let best = rows[0];
  let bestScore = -99;
  for (const row of rows.slice(0, 8)) {
    const s = scoreHit(row, title, artist);
    if (s > bestScore) {
      best = row;
      bestScore = s;
    }
  }
  return { id: best.id, ytTitle: best.title, ytArtist: best.artist };
}

export async function spotifyHits() {
  const key = dayKey() + ":p3";
  const hit = chartCache.get(key);
  if (hit) return hit;

  const topsRaw = await spotifyPlaylist(CHARTS[0].id);
  const newsRaw = await spotifyPlaylist(CHARTS[1].id);
  const seen = new Set();

  async function mapPool(rows, limit) {
    const slice = rows.slice(0, limit);
    const out = [];
    const step = 4;
    for (let i = 0; i < slice.length; i += step) {
      const batch = slice.slice(i, i + step);
      const matched = await Promise.all(batch.map(async (row) => {
        const yt = await matchYoutube(row.title, row.artist).catch(() => null);
        if (!yt || seen.has(yt.id)) return null;
        seen.add(yt.id);
        return { id: yt.id, title: row.title, artist: row.artist, preview: row.preview || "", sp: row.sp || "", source: "spotify" };
      }));
      matched.forEach((row) => { if (row) out.push(row); });
    }
    return out;
  }

  const tops = await mapPool(topsRaw, 24);
  const news = await mapPool(newsRaw.filter((r) => !tops.some((t) => t.title === r.title && t.artist === r.artist)), 16);
  if (!tops.length) throw new Error("no matched hits");
  const payload = { day: dayKey(), name: CHARTS[0].name, tops, news };
  chartCache.set(key, payload);
  payload.tops.slice(0, 4).forEach((row) => {
    if (row.sp) resolveSpotifyFile(row.sp).catch(() => null);
  });
  return payload;
}

function passthroughHeaders(upstream) {
  const headers = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(key);
    if (v) headers.set(key, v);
  }
  headers.set("cache-control", "public, max-age=3600");
  return headers;
}

const GAME_GUARD = `<script>(function(){
  if (window.navigation) {
    navigation.addEventListener("navigate", function (e) {
      var u = (e.destination && e.destination.url) || "";
      if (u === "about:blank" || u.indexOf("about:blank") === 0) e.preventDefault();
    });
  }
  function neuter() {
    var vis = window.ig && ig.visibilityHandler;
    if (!vis || vis.__goar) return;
    vis.__goar = true;
    vis.isFocused = true;
    vis.pauseHandler = function () {};
    vis.systemPaused = function () { return true; };
  }
  function arm() {
    if (!window.ig || !ig.system || ig.system.__armed) return false;
    if (!ig.game) return false;
    ig.system.__armed = true;
    var frames = 0;
    var orig = ig.system.run.bind(ig.system);
    ig.system.run = function () { frames++; return orig(); };
    ig.system.__frames = function () { return frames; };
    return true;
  }
  function kick() {
    try {
      if (!window.ig || !ig.system || !ig.game) return false;
      neuter();
      arm();
      if (ig.visibilityHandler) ig.visibilityHandler.isPaused = false;
      ig.game.paused = false;
      try { if (ig.sizeHandler && ig.sizeHandler.resize) ig.sizeHandler.resize(); } catch (e) {}
      if (!ig.system.__goar) {
        ig.system.__goar = true;
        if (ig.game.resumeGame) ig.game.resumeGame();
        else ig.system.startRunLoop();
      } else if (!ig.system.running) {
        ig.system.startRunLoop();
      }
      return !!ig.system.running;
    } catch (e) { return false; }
  }
  var n = 0, seen = -1, still = 0;
  var timer = setInterval(function () {
    n++;
    kick();
    var frames = window.ig && ig.system && ig.system.__frames ? ig.system.__frames() : 0;
    if (frames === seen) still++; else { seen = frames; still = 0; }
    if (still >= 3 && window.ig && ig.system && ig.game) {
      still = 0;
      ig.system.__goar = false;
      kick();
    }
    if (n > 80) clearInterval(timer);
  }, 250);
  addEventListener("resize", function () {
    try { if (window.ig && ig.sizeHandler && ig.sizeHandler.resize) ig.sizeHandler.resize(); } catch (e) {}
  });
  addEventListener("pointerdown", function () { kick(); }, true);
})();</script>`;

const spotifyFileCache = new Map();

function decodeSpotifyFile(originalVideoUrl) {
  const raw = String(originalVideoUrl || "");
  if (raw.includes("?url=")) {
    let b64 = raw.split("?url=")[1] || "";
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    return Buffer.from(b64, "base64").toString("utf8");
  }
  if (raw.startsWith("/")) return "https://gamepvz.com" + raw;
  return raw;
}

const SPOTIFY_CDN_HOSTS = ["cdn-spotify-247.zm.io.vn", "cdn-spotify.zm.io.vn", "cdn-spotify-inter.zm.io.vn"];

async function spotifyUrlPlays(url) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: { "user-agent": "Mozilla/5.0", range: "bytes=0-15", accept: "audio/mpeg,*/*" },
    });
    const type = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());
    const audio = (r.ok || r.status === 206) && (/audio\/mpeg/i.test(type) || buf.subarray(0, 3).toString() === "ID3");
    return audio && buf.length > 0;
  } catch {
    return false;
  }
}

async function usableSpotifyUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return ""; }
  const hosts = [...new Set([parsed.hostname, ...SPOTIFY_CDN_HOSTS])];
  return new Promise((resolve) => {
    let pending = hosts.length;
    let settled = false;
    for (const host of hosts) {
      const next = new URL(url);
      next.hostname = host;
      const candidate = next.toString();
      spotifyUrlPlays(candidate).then((ok) => {
        if (ok && !settled) {
          settled = true;
          resolve(candidate);
        }
        pending -= 1;
        if (!pending && !settled) resolve("");
      });
    }
  });
}

async function requestSpotifyFile(trackId) {
  const r = await fetch("https://gamepvz.com/api/download/get-url", {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      origin: "https://gamepvz.com",
      referer: "https://gamepvz.com/",
    },
    body: JSON.stringify({ url: "https://open.spotify.com/track/" + trackId }),
  });
  if (!r.ok) throw new Error("spotify audio " + r.status);
  const data = await r.json();
  if (data.code !== 200 || !data.originalVideoUrl) throw new Error(data.msg || "no full track");
  const fileUrl = decodeSpotifyFile(data.originalVideoUrl);
  const parsed = new URL(fileUrl);
  if (parsed.protocol !== "https:") throw new Error("bad audio url");
  return { data, fileUrl: parsed.toString() };
}

export async function resolveSpotifyFile(trackId) {
  const hit = spotifyFileCache.get(trackId);
  if (hit && hit.exp > Date.now()) return hit;
  let last = "audio host down";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, fileUrl } = await requestSpotifyFile(trackId);
      const url = await usableSpotifyUrl(fileUrl);
      if (!url) { last = "audio host down"; continue; }
      const row = {
        url,
        title: data.title || "",
        artist: data.authorName || "",
        cover: data.coverUrl || "",
        exp: Date.now() + 6 * 60 * 60 * 1000,
      };
      spotifyFileCache.set(trackId, row);
      return row;
    } catch (err) {
      last = String((err && err.message) || err);
    }
  }
  throw new Error(last);
}

const previewCache = new Map();

const SEARCH_HASH = "eff59fa0a3d026b88b56fddbcf4bdfa16a186b8175a5c1a358c072e053c2e5b0";
const TRACK_HASH = "612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294";
let anonSession = null;

async function spotifyAnonToken() {
  if (anonSession && anonSession.exp > Date.now() + 60 * 1000) return anonSession.token;
  const r = await fetch("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC", {
    headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
  });
  if (!r.ok) throw new Error("spotify token " + r.status);
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  const session = m && JSON.parse(m[1])?.props?.pageProps?.state?.settings?.session;
  if (!session?.accessToken) throw new Error("spotify token missing");
  anonSession = {
    token: session.accessToken,
    exp: Number(session.accessTokenExpirationTimestampMs) || Date.now() + 20 * 60 * 1000,
  };
  return anonSession.token;
}

async function pathfinder(operationName, sha, variables) {
  const token = await spotifyAnonToken();
  const url = "https://api-partner.spotify.com/pathfinder/v1/query?operationName=" + encodeURIComponent(operationName)
    + "&variables=" + encodeURIComponent(JSON.stringify(variables))
    + "&extensions=" + encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: sha } }));
  const r = await fetch(url, {
    headers: {
      authorization: "Bearer " + token,
      accept: "application/json",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (r.status === 401) {
    anonSession = null;
    throw new Error("spotify token expired");
  }
  if (!r.ok) throw new Error("spotify " + r.status);
  return r.json();
}

function coverFrom(sources) {
  const list = Array.isArray(sources) ? sources.filter((s) => s && s.url) : [];
  list.sort((a, b) => (b.width || 0) - (a.width || 0));
  const pick = list.find((s) => (s.width || 0) >= 300 && (s.width || 0) <= 640) || list[0];
  return pick ? pick.url : "";
}

function trackRow(data) {
  if (!data || data.__typename !== "Track") return null;
  const sp = (String(data.uri || "").match(/spotify:track:([A-Za-z0-9]{22})/) || [])[1] || "";
  if (!sp || !data.name) return null;
  const people = []
    .concat((data.artists && data.artists.items) || [])
    .concat((data.firstArtist && data.firstArtist.items) || [])
    .concat((data.otherArtists && data.otherArtists.items) || []);
  const artist = [...new Set(people.map((a) => (a && a.profile && a.profile.name) || (a && a.name) || "").filter(Boolean))].join(", ");
  return {
    id: "sp_" + sp,
    sp,
    title: data.name,
    artist,
    cover: coverFrom(data.albumOfTrack && data.albumOfTrack.coverArt && data.albumOfTrack.coverArt.sources),
    source: "spotify",
  };
}

export async function spotifySearch(q) {
  const query = String(q || "").trim().slice(0, 120);
  if (!query) return [];
  const link = query.match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{22})/);
  if (link) {
    const json = await pathfinder("getTrack", TRACK_HASH, { uri: "spotify:track:" + link[1] });
    const row = trackRow(json?.data?.trackUnion || json?.data?.track || null);
    return row ? [row] : [];
  }
  const json = await pathfinder("searchDesktop", SEARCH_HASH, {
    searchTerm: query,
    offset: 0,
    limit: 12,
    numberOfTopResults: 5,
    includeAudiobooks: false,
    includePreReleases: true,
    includeAlbumPreReleases: false,
    includeAuthors: false,
    includeEpisodeContentRatingsV2: false,
  });
  const items = json?.data?.searchV2?.tracksV2?.items || [];
  const out = [];
  const seen = new Set();
  for (const wrap of items) {
    const row = trackRow(wrap?.item?.data || wrap?.data);
    if (!row || seen.has(row.sp)) continue;
    seen.add(row.sp);
    out.push(row);
  }
  return out;
}

async function loadPreview(target) {
  const hit = previewCache.get(target);
  if (hit) return hit;
  const r = await fetch(target, { headers: { "user-agent": "Mozilla/5.0", accept: "audio/mpeg,*/*" } });
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  const row = { buf, type: (r.headers.get("content-type") || "audio/mpeg").split(";")[0] };
  previewCache.set(target, row);
  return row;
}

function rangedAudio(buf, type, rangeHeader) {
  const total = buf.byteLength;
  const headers = {
    "content-type": type || "audio/mpeg",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400",
  };
  if (rangeHeader && /^bytes=/.test(rangeHeader)) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader) || [];
    let start = m[1] ? Number(m[1]) : 0;
    let end = m[2] ? Number(m[2]) : total - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
    if (start > end) start = 0;
    const slice = buf.slice(start, end + 1);
    return new Response(slice, {
      status: 206,
      headers: Object.assign(headers, {
        "content-range": "bytes " + start + "-" + end + "/" + total,
        "content-length": String(slice.byteLength),
      }),
    });
  }
  return new Response(buf, { status: 200, headers: Object.assign(headers, { "content-length": String(total) }) });
}

export async function handleMediaRequest(url, requestHeaders) {
  const path = url.pathname;
  if (path.startsWith("/gcdn/")) {
    const target = GAME_ORIGIN + path.slice("/gcdn".length) + url.search;
    const upstream = await fetch(target, {
      headers: {
        "user-agent": "Mozilla/5.0",
        accept: requestHeaders.get("accept") || "*/*",
      },
    });
    const type = upstream.headers.get("content-type") || "";
    const html = /text\/html/i.test(type) || /\.html?$/i.test(path);
    if (html) {
      let text = await upstream.text();
      if (/<head[^>]*>/i.test(text)) text = text.replace(/<head[^>]*>/i, (m) => m + GAME_GUARD);
      else text = GAME_GUARD + text;
      const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      return new Response(text, { status: upstream.status, headers });
    }
    return new Response(upstream.body, { status: upstream.status, headers: passthroughHeaders(upstream) });
  }

  if (path === "/spotify/search") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
    if (!q) return Response.json([]);
    try {
      const rows = await spotifySearch(q);
      return Response.json(rows);
    } catch (err) {
      return Response.json({ error: String((err && err.message) || err) }, { status: 502 });
    }
  }

  if (path === "/spotify/hits") {
    try {
      const payload = await spotifyHits();
      return Response.json(payload, { headers: { "cache-control": "public, max-age=3600" } });
    } catch (err) {
      return Response.json({ error: String((err && err.message) || err) }, { status: 502 });
    }
  }

  if (path === "/spotify/file") {
    const id = url.searchParams.get("id") || "";
    if (!/^[A-Za-z0-9]{22}$/.test(id)) return new Response("bad id", { status: 400 });
    try {
      const row = await resolveSpotifyFile(id);
      return Response.json({ url: row.url, title: row.title, artist: row.artist, cover: row.cover });
    } catch (err) {
      return Response.json({ error: String((err && err.message) || err) }, { status: 502 });
    }
  }

  if (path === "/spotify/audio") {
    const id = url.searchParams.get("id") || "";
    if (!/^[A-Za-z0-9]{22}$/.test(id)) return new Response("bad id", { status: 400 });
    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) spotifyFileCache.delete(id);
      let row;
      try { row = await resolveSpotifyFile(id); }
      catch (err) { return new Response(String((err && err.message) || err), { status: 502 }); }
      let upstream;
      try {
        upstream = await fetch(row.url, {
          signal: AbortSignal.timeout(8000),
          headers: { "user-agent": "Mozilla/5.0", accept: "audio/mpeg,*/*" },
        });
      } catch {
        spotifyFileCache.delete(id);
        lastStatus = 504;
        continue;
      }
      const type = upstream.headers.get("content-type") || "";
      if ((upstream.ok || upstream.status === 206) && !/text|html|json/i.test(type)) {
        const out = passthroughHeaders(upstream);
        if (!out.get("content-type")) out.set("content-type", "audio/mpeg");
        out.set("cache-control", "private, max-age=600");
        return new Response(upstream.body, { status: upstream.status, headers: out });
      }
      lastStatus = upstream.status;
      try { await upstream.body?.cancel(); } catch {}
      spotifyFileCache.delete(id);
    }
    return new Response("audio " + (lastStatus || "missing"), { status: 502 });
  }

  if (path === "/spotify/preview") {
    const target = url.searchParams.get("u") || "";
    let parsed;
    try { parsed = new URL(target); } catch { return new Response("bad url", { status: 400 }); }
    if (parsed.protocol !== "https:" || parsed.hostname !== "p.scdn.co" || !parsed.pathname.startsWith("/mp3-preview/")) {
      return new Response("bad url", { status: 400 });
    }
    const row = await loadPreview(parsed.toString());
    if (!row) return new Response("preview missing", { status: 404 });
    return rangedAudio(row.buf, row.type, requestHeaders.get("range"));
  }

  if (path === "/yt/search") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
    if (!q) return Response.json([]);
    const rows = await searchVideos(q);
    return Response.json(rows);
  }

  if (path === "/yt/audio") {
    const id = url.searchParams.get("v") || "";
    if (!videoIdOk(id)) return new Response("bad id", { status: 400 });
    const row = await resolveAudio(id);
    if (!row) return new Response("no audio", { status: 404 });
    const headers = { "user-agent": row.ua };
    const range = requestHeaders.get("range");
    if (range) headers.range = range;
    const upstream = await fetch(row.url, { headers });
    const out = passthroughHeaders(upstream);
    if (!out.get("content-type")) out.set("content-type", row.mime || "audio/mp4");
    out.set("x-yt-title", encodeURIComponent(row.title || ""));
    out.set("x-yt-artist", encodeURIComponent(row.artist || ""));
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }

  return null;
}
