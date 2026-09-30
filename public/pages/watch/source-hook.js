/* Wraps the existing player after watch.js loads.
   Safe if watch.js already merged extras (detects collectExtraSources).
   No iframes. Same #playerVideo + hls.js failover. */
(function (w) {
  if (w.__goarExtraHooked) return;
  w.__goarExtraHooked = true;

  const origResolve = w.resolveSources;
  const origPlay = w.playSource;
  const origHeaders = w.playHeaders;
  if (typeof origResolve !== "function") return;
  if (String(origResolve).indexOf("collectExtraSources") >= 0) return;

  let active = null;

  function asSource(row) {
    if (!row || !row.url || !/^https?:/i.test(row.url)) return null;
    const kind = row.kind || row.format || (/\.mpd(\?|$)/i.test(row.url) ? "dash" : /\.mp4(\?|$)/i.test(row.url) ? "mp4" : "hls");
    if (kind === "dash") return null;
    return {
      name: String(row.name || row.server || row.family || "source"),
      url: String(row.url),
      format: kind === "mp4" ? "mp4" : "hls",
      referer: row.referer || row.refererUrl || "",
      origin: row.origin || "",
      pngWrap: row.pngWrap === true,
      family: row.family || "extra"
    };
  }

  async function extras(id, type, season, episode) {
    const fn = w.goarCollectExtraSources || w.GOAR_EXTRA_RESOLVE;
    if (typeof fn !== "function") return [];
    try {
      const rows = fn === w.goarCollectExtraSources
        ? await fn(type, id, season, episode)
        : await fn(id, type, season, episode);
      return (rows || []).map(asSource).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  if (typeof origHeaders === "function") {
    w.playHeaders = function (extra) {
      if (!active || !active.referer) return origHeaders(extra);
      let origin = active.origin || "";
      try { origin = origin ? new URL(origin).origin : new URL(active.referer).origin; } catch (e) {}
      return Object.assign({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: active.referer,
        Origin: origin || active.referer,
        Accept: "*/*"
      }, extra || {});
    };
  }

  if (typeof origPlay === "function") {
    w.playSource = async function (source) {
      active = source || null;
      if (source && source.format === "dash") throw new Error(source.name + " is DASH");
      return origPlay.apply(this, arguments);
    };
  }

  w.resolveSources = async function (id, type, season, episode) {
    let sources = [];
    let err = null;
    try { sources = await origResolve.apply(this, arguments); }
    catch (e) { err = e; sources = []; }
    if (!Array.isArray(sources)) sources = [];
    const more = await extras(id, type, season, episode);
    const seen = new Set(sources.map(function (s) { return s.name + "|" + s.url; }));
    more.forEach(function (row) {
      const key = row.name + "|" + row.url;
      if (seen.has(key)) return;
      seen.add(key);
      sources.push(row);
    });
    if (!sources.length && err) throw err;
    if (!sources.length) throw new Error("no playable sources");
    return sources;
  };
})(window);
