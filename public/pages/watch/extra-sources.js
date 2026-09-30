/* Extra catalogs — same shape our player already plays.
   Vidrock stays first. These families append {name,url,referer,origin,pngWrap,kind}.
   No iframes. Unlock may come from /api/sources or a hosted resolver base. */
(function (w) {
  const VIDCORE_SERVERS = ["Orbit", "Supreme", "Prime", "Premiere 4K", "Horizon"];
  const FAMILY = {
    vidcore: { origin: "https://vidcore.io/", pngWrap: false },
    movies111: { origin: "https://111movies.net/", pngWrap: true },
    cinesrc: { origin: "https://cinesrc.st/", pngWrap: false },
    vidfast: { origin: "https://vidfast.pro/", pngWrap: true },
    vidup: { origin: "https://vidup.to/", pngWrap: true }
  };

  function storedBase(key) {
    try { return String(localStorage.getItem(key) || "").replace(/\/$/, ""); }
    catch (e) { return ""; }
  }

  function norm(row, family) {
    if (!row) return null;
    const url = row.url || row.streamUrl || row.browserUrl || "";
    if (!url || url.indexOf("http") !== 0) return null;
    const meta = FAMILY[family] || {};
    const name = String(row.name || row.server || row.provider || family);
    return {
      name: name,
      family: family,
      url: url,
      referer: row.referer || row.refererUrl || meta.origin || "",
      origin: row.origin || meta.origin || "",
      pngWrap: row.pngWrap === true || meta.pngWrap === true || /ngflix|nova/i.test(name),
      kind: row.kind || row.source || (/\.mpd(\?|$)/i.test(url) ? "dash" : /\.mp4(\?|$)/i.test(url) ? "mp4" : "hls")
    };
  }

  function parseNdjson(text) {
    const out = [];
    String(text || "").split(/\n+/).forEach(function (line) {
      line = line.trim();
      if (!line || line.indexOf("event:") === 0) return;
      if (line.indexOf("data:") === 0) line = line.slice(5).trim();
      if (!line || line[0] !== "{" && line[0] !== "[") return;
      try { out.push(JSON.parse(line)); } catch (e) {}
    });
    return out;
  }

  function fetchFn() {
    return typeof w.goarTunnelFetch === "function" ? w.goarTunnelFetch : fetch;
  }

  async function pullText(url, init) {
    const r = await fetchFn()(url, init || { headers: { Accept: "application/json, application/x-ndjson, text/event-stream, text/plain" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  }

  async function pullJson(url, init) {
    const text = await pullText(url, init);
    try {
      const j = JSON.parse(text);
      return Array.isArray(j) ? j : (j.sources || j.streams || j.servers || j.providers || [j]);
    } catch (e) {
      return parseNdjson(text);
    }
  }

  function rowsFromEvents(events, family) {
    const rows = [];
    (events || []).forEach(function (ev) {
      if (!ev) return;
      const server = ev.server || ev;
      if (ev.event === "server" && server && (server.ok || server.url || server.streamUrl)) {
        rows.push(norm({
          name: server.name,
          url: server.url || server.streamUrl || server.play,
          referer: server.referer || server.refererUrl,
          pngWrap: server.pngWrap,
          kind: server.kind
        }, family));
      } else if (ev.event === "found" && (ev.streamUrl || ev.url)) {
        rows.push(norm({ name: ev.name, url: ev.streamUrl || ev.url, referer: ev.referer }, family));
      } else if (ev.event === "ready" && (ev.url || ev.streamUrl)) {
        rows.push(norm({
          name: ev.name || ev.provider || ev.source || family,
          url: ev.url || ev.streamUrl,
          referer: ev.referer,
          kind: ev.source === "MP4" ? "mp4" : ev.source === "DASH" ? "dash" : "hls"
        }, family));
      } else if (ev.event === "done" && ev.streams && typeof ev.streams === "object") {
        Object.keys(ev.streams).forEach(function (name) {
          rows.push(norm(Object.assign({ name: name }, ev.streams[name]), family));
        });
      } else if (ev.event === "done" && Array.isArray(ev.servers)) {
        ev.servers.forEach(function (s) { rows.push(norm(s, family)); });
      } else if (server && (server.url || server.streamUrl)) {
        rows.push(norm(server, family));
      }
    });
    return rows.filter(Boolean);
  }

  async function fromSameOrigin(type, id, season, episode) {
    const q = new URLSearchParams({ type: type, id: String(id) });
    if (season) q.set("season", String(season));
    if (episode) q.set("episode", String(episode));
    const events = await pullJson("/api/sources?" + q.toString());
    const rows = [];
    (Array.isArray(events) ? events : []).forEach(function (item) {
      if (item && item.family) rows.push(norm(item, item.family));
      else if (item && item.event) rows.push.apply(rows, rowsFromEvents([item], item.family || "extra"));
      else rows.push(norm(item, (item && item.family) || "extra"));
    });
    return rows.filter(Boolean);
  }

  async function fromVidcoreResolver(type, id, season, episode) {
    const base = storedBase("goar_resolver_vidcore");
    if (!base) return [];
    const rows = [];
    for (let i = 0; i < VIDCORE_SERVERS.length; i++) {
      const server = VIDCORE_SERVERS[i];
      const q = new URLSearchParams({ type: type, id: String(id), server: server });
      if (season) q.set("season", String(season));
      if (episode) q.set("episode", String(episode));
      try {
        const events = await pullJson(base + "/api/resolve?" + q.toString());
        rows.push.apply(rows, rowsFromEvents(events, "vidcore"));
      } catch (e) {}
    }
    return rows;
  }

  async function fromPlayResolver(baseKey, family, type, id, season, episode) {
    const base = storedBase(baseKey);
    if (!base) return [];
    const contentPath = type === "tv"
      ? "/tv/" + id + "/" + (season || 1) + "/" + (episode || 1)
      : "/movie/" + id;
    try {
      const text = await pullText(base + "/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ contentPath: contentPath, type: type, id: String(id) })
      });
      return rowsFromEvents(parseNdjson(text), family);
    } catch (e) {
      return [];
    }
  }

  async function fromGetResolver(baseKey, family, path, type, id, season, episode) {
    const base = storedBase(baseKey);
    if (!base) return [];
    const q = new URLSearchParams({ type: type, id: String(id) });
    if (season) q.set("season", String(season));
    if (episode) q.set("episode", String(episode));
    try {
      const events = await pullJson(base + path + q.toString());
      return rowsFromEvents(events, family);
    } catch (e) {
      return [];
    }
  }

  async function fromCineSrc(type, id, season, episode) {
    const base = storedBase("goar_resolver_cinesrc");
    if (!base) return [];
    const q = new URLSearchParams({ type: type, id: String(id) });
    if (season) q.set("season", String(season));
    if (episode) q.set("episode", String(episode));
    try {
      const text = await pullText(base + "/api/stream/live?" + q.toString(), {
        headers: { Accept: "text/event-stream, application/x-ndjson, application/json" }
      });
      const rows = rowsFromEvents(parseNdjson(text), "cinesrc");
      if (rows.length) return rows;
      return rowsFromEvents(parseNdjson(text.replace(/\r/g, "")), "cinesrc");
    } catch (e) {
      return fromGetResolver("goar_resolver_cinesrc", "cinesrc", "/api/stream/provider?", type, id, season, episode);
    }
  }

  async function collect(type, id, season, episode) {
    const packs = await Promise.allSettled([
      fromSameOrigin(type, id, season, episode),
      fromVidcoreResolver(type, id, season, episode),
      fromPlayResolver("goar_resolver_111movies", "movies111", type, id, season, episode),
      fromGetResolver("goar_resolver_vidfast", "vidfast", "/api/resolve?", type, id, season, episode),
      fromGetResolver("goar_resolver_vidup", "vidup", "/api/resolve?", type, id, season, episode),
      fromCineSrc(type, id, season, episode)
    ]);
    const seen = new Set();
    const out = [];
    packs.forEach(function (p) {
      if (p.status !== "fulfilled" || !p.value) return;
      p.value.forEach(function (src) {
        if (!src || !src.url || seen.has(src.name + src.url)) return;
        seen.add(src.name + src.url);
        out.push(src);
      });
    });
    return out;
  }

  w.goarCollectExtraSources = collect;
  w.GOAR_VIDCORE_SERVERS = VIDCORE_SERVERS;
  w.GOAR_EXTRA_RESOLVE = function (id, type, season, episode) {
    return collect(type, id, season, episode);
  };
})(window);
