/* Extra catalogs for the site player.
   Same contract as Vidrock: { name, url, format, referer }.
   Played by the existing video element + hls.js + WispHlsLoader. */
(function (root) {
  const FAMILIES = [
    { id: "vidcore", origin: "https://vidcore.io", referer: "https://vidcore.io/", movie: (id) => "/movie/" + id, tv: (id, s, e) => "/tv/" + id + "/" + s + "/" + e },
    { id: "movies111", origin: "https://111movies.net", referer: "https://111movies.net/", movie: (id) => "/movie/" + id, tv: (id, s, e) => "/tv/" + id + "/" + s + "/" + e },
    { id: "cinesrc", origin: "https://cinesrc.st", referer: "https://cinesrc.st/", movie: (id) => "/embed/movie/" + id, tv: (id, s, e) => "/embed/tv/" + id + "/" + s + "/" + e },
    { id: "vidfast", origin: "https://vidfast.pro", referer: "https://vidfast.pro/", movie: (id) => "/movie/" + id, tv: (id, s, e) => "/tv/" + id + "/" + s + "/" + e },
    { id: "vidup", origin: "https://vidup.to", referer: "https://vidup.to/", movie: (id) => "/movie/" + id, tv: (id, s, e) => "/tv/" + id + "/" + s + "/" + e }
  ];

  function asSource(family, name, url, format) {
    if (!name || !url || !/^https?:/i.test(url)) return null;
    const kind = format || (/\.mp4(\?|$)/i.test(url) ? "mp4" : "hls");
    return {
      name: String(name),
      url: String(url),
      format: kind,
      referer: family.referer,
      origin: family.origin,
      family: family.id
    };
  }

  function pickUrl(value) {
    if (!value) return "";
    if (typeof value === "string" && /^https?:/i.test(value)) return value;
    if (typeof value === "object") {
      return pickUrl(value.url || value.streamUrl || value.file || value.src || value.stream);
    }
    return "";
  }

  function walkSources(family, payload) {
    const out = [];
    const seen = new Set();
    function add(name, url, format) {
      const src = asSource(family, name, url, format);
      if (!src || seen.has(src.name + src.url)) return;
      seen.add(src.name + src.url);
      out.push(src);
    }
    function walk(node, label) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach((row, i) => walk(row, label || row && (row.name || row.id) || family.id + " " + (i + 1)));
        return;
      }
      if (typeof node !== "object") return;
      const url = pickUrl(node);
      const name = node.name || node.title || node.id || label;
      if (url && name) add(name, url, node.type || node.format || node.source);
      Object.keys(node).forEach((key) => {
        if (key === "url" || key === "streamUrl") return;
        walk(node[key], name || key);
      });
    }
    walk(payload, family.id);
    return out;
  }

  async function readJson(fetchImpl, url, headers) {
    const res = await fetchImpl(url, { headers: headers || {} });
    if (!res || !res.ok) return null;
    const text = await res.text();
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;
    if (trimmed[0] === "{" || trimmed[0] === "[") {
      try { return JSON.parse(trimmed); } catch (e) { return null; }
    }
    const rows = [];
    trimmed.split("\n").forEach((line) => {
      line = line.trim();
      if (!line || line[0] !== "{") return;
      try { rows.push(JSON.parse(line)); } catch (e) {}
    });
    return rows.length ? rows : null;
  }

  async function fromSameOrigin(fetchImpl, id, type, season, episode) {
    const qs = new URLSearchParams({ type: type, id: String(id) });
    if (type === "tv") {
      qs.set("season", String(season || 1));
      qs.set("episode", String(episode || 1));
    }
    const payload = await readJson(fetchImpl, "/api/sources?" + qs.toString(), { Accept: "application/json" });
    if (!payload) return [];
    const list = Array.isArray(payload) ? payload : payload.sources || payload.servers || [];
    return list.map((row) => {
      if (!row || !row.url) return null;
      return {
        name: row.name,
        url: row.url,
        format: row.format || "hls",
        referer: row.referer || "",
        origin: row.origin || "",
        family: row.family || "extra"
      };
    }).filter(Boolean);
  }

  async function fromFamily(fetchImpl, family, id, type, season, episode) {
    const path = type === "tv" ? family.tv(id, season || 1, episode || 1) : family.movie(id);
    const headers = {
      Accept: "application/json, text/plain, */*",
      Referer: family.referer,
      Origin: family.origin,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    };
    const candidates = [
      family.origin + path,
      family.origin + "/api" + path,
      family.origin + "/api/movie/" + id,
      family.origin + "/api/tv/" + id + "/" + (season || 1) + "/" + (episode || 1)
    ];
    const found = [];
    for (const url of candidates) {
      try {
        const payload = await readJson(fetchImpl, url, headers);
        if (!payload) continue;
        found.push.apply(found, walkSources(family, payload));
        if (found.length) break;
      } catch (e) {}
    }
    return found;
  }

  root.GOAR_EXTRA_RESOLVE = async function (id, type, season, episode, fetchImpl) {
    const fn = fetchImpl || fetch;
    const bags = await Promise.allSettled(
      [fromSameOrigin(fn, id, type, season, episode)].concat(
        FAMILIES.map((family) => fromFamily(fn, family, id, type, season, episode))
      )
    );
    const out = [];
    const seen = new Set();
    bags.forEach((bag) => {
      if (bag.status !== "fulfilled" || !bag.value) return;
      bag.value.forEach((src) => {
        const key = src.name + "|" + src.url;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(src);
      });
    });
    return out;
  };
})(typeof window !== "undefined" ? window : globalThis);
