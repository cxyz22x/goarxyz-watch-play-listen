/* Same-origin extra source hook.
   Returns unlocked {name,url,referer,family,pngWrap,kind} rows for our player.
   If resolver bases are set as env, this worker calls them. It does not iframe. */

const VIDCORE_SERVERS = ["Orbit", "Supreme", "Prime", "Premiere 4K", "Horizon"];

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store"
    }
  });
}

function parseNdjson(text) {
  const out = [];
  String(text || "").split(/\n+/).forEach((line) => {
    line = line.trim();
    if (!line || line.indexOf("event:") === 0) return;
    if (line.indexOf("data:") === 0) line = line.slice(5).trim();
    if (!line || (line[0] !== "{" && line[0] !== "[")) return;
    try { out.push(JSON.parse(line)); } catch (e) {}
  });
  return out;
}

function norm(row, family, referer) {
  if (!row) return null;
  const url = row.url || row.streamUrl || row.play || "";
  if (!url || String(url).indexOf("http") !== 0) return null;
  const name = String(row.name || row.server || row.provider || family);
  return {
    name,
    family,
    url,
    referer: row.referer || row.refererUrl || referer || "",
    origin: row.origin || referer || "",
    pngWrap: row.pngWrap === true || /ngflix/i.test(name),
    kind: row.kind || row.source || (/\.mpd(\?|$)/i.test(url) ? "dash" : /\.mp4(\?|$)/i.test(url) ? "mp4" : "hls")
  };
}

function fromEvents(events, family, referer) {
  const rows = [];
  for (const ev of events) {
    const server = ev.server || ev;
    if (ev.event === "server" && server && (server.ok || server.url || server.streamUrl)) {
      rows.push(norm(server, family, referer));
    } else if (ev.event === "found" && (ev.streamUrl || ev.url)) {
      rows.push(norm({ name: ev.name, url: ev.streamUrl || ev.url, referer: ev.referer }, family, referer));
    } else if (ev.event === "ready" && (ev.url || ev.streamUrl)) {
      rows.push(norm({
        name: ev.name || ev.provider || ev.source || family,
        url: ev.url || ev.streamUrl,
        referer: ev.referer,
        kind: ev.source === "MP4" ? "mp4" : ev.source === "DASH" ? "dash" : "hls"
      }, family, referer));
    } else if (ev.event === "done" && ev.streams) {
      for (const name of Object.keys(ev.streams)) {
        rows.push(norm(Object.assign({ name }, ev.streams[name]), family, referer));
      }
    } else if (ev.event === "done" && Array.isArray(ev.servers)) {
      for (const s of ev.servers) rows.push(norm(s, family, referer));
    } else if (server && (server.url || server.streamUrl)) {
      rows.push(norm(server, family, referer));
    }
  }
  return rows.filter(Boolean);
}

async function readBody(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const type = url.searchParams.get("type") === "tv" ? "tv" : "movie";
  const id = url.searchParams.get("id") || "";
  const season = url.searchParams.get("season") || "";
  const episode = url.searchParams.get("episode") || "";
  if (!id) return json({ sources: [], error: "missing id" }, 400);

  const env = context.env || {};
  const sources = [];

  async function addVidcore() {
    const base = String(env.RESOLVER_VIDCORE || "").replace(/\/$/, "");
    if (!base) return;
    for (const server of VIDCORE_SERVERS) {
      const q = new URLSearchParams({ type, id, server });
      if (season) q.set("season", season);
      if (episode) q.set("episode", episode);
      try {
        const events = parseNdjson(await readBody(base + "/api/resolve?" + q));
        sources.push(...fromEvents(events, "vidcore", "https://vidcore.io/"));
      } catch (e) {}
    }
  }

  async function addPlay(envKey, family, origin) {
    const base = String(env[envKey] || "").replace(/\/$/, "");
    if (!base) return;
    const contentPath = type === "tv"
      ? "/tv/" + id + "/" + (season || "1") + "/" + (episode || "1")
      : "/movie/" + id;
    try {
      const text = await readBody(base + "/api/play", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ contentPath, type, id })
      });
      sources.push(...fromEvents(parseNdjson(text), family, origin));
    } catch (e) {}
  }

  async function addGet(envKey, family, path, origin) {
    const base = String(env[envKey] || "").replace(/\/$/, "");
    if (!base) return;
    const q = new URLSearchParams({ type, id });
    if (season) q.set("season", season);
    if (episode) q.set("episode", episode);
    try {
      const events = parseNdjson(await readBody(base + path + q));
      sources.push(...fromEvents(events, family, origin));
    } catch (e) {}
  }

  await Promise.allSettled([
    addVidcore(),
    addPlay("RESOLVER_111MOVIES", "movies111", "https://111movies.net/"),
    addGet("RESOLVER_VIDFAST", "vidfast", "/api/resolve?", "https://vidfast.pro/"),
    addGet("RESOLVER_VIDUP", "vidup", "/api/resolve?", "https://vidup.to/"),
    addGet("RESOLVER_CINESRC", "cinesrc", "/api/stream/live?", "https://cinesrc.st/")
  ]);

  const seen = new Set();
  const uniq = [];
  for (const src of sources) {
    if (!src || seen.has(src.name + src.url)) continue;
    seen.add(src.name + src.url);
    uniq.push(src);
  }
  return json({ sources: uniq });
}
