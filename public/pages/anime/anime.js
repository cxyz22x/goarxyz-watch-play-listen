const ANILIST = "https://graphql.anilist.co";
const JIKAN = "https://api.jikan.moe/v4";
const FEATURED_IDS = [21,16498,5114,9253,38000,1535,11061,20,32281,30276];
const INITIAL_D_IDS = [185,186,187,18,15059,19613,20842,20990,21289];
const GENRES = ["Action","Adventure","Comedy","Drama","Fantasy","Horror","Mystery","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller","Mecha","Music"];
const PLAY_SVG = '<svg viewBox="0 0 24 24"><polygon points="8,5 19,12 8,19"></polygon></svg>';
const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21s-6.4-4.35-9.2-8.2C.8 10.2 1.1 6.6 4.2 5.1 6.3 4.1 8.6 4.7 12 8c3.4-3.3 5.7-3.9 7.8-2.9 3.1 1.5 3.4 5.1 1.4 7.7C18.4 16.65 12 21 12 21z"/></svg>';

const PROXIES = [
  u => u,
  u => "https://corsproxy.io/?" + encodeURIComponent(u),
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
];

async function fetchAny(url, opts = {}, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function proxyFetch(url, opts = {}) {
  let lastErr;
  for (const build of PROXIES) {
    try {
      const r = await fetchAny(build(url), opts);
      if (r.status === 429) {
        await sleep(1500);
        continue;
      }
      if (r.ok || (r.status >= 300 && r.status < 500)) return r;
      lastErr = new Error("HTTP " + r.status);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("fetch failed");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function poolMap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function gql(query, vars = {}, _retry = 0) {
  const body = JSON.stringify({ query, variables: vars });
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  const targets = [ANILIST, "https://corsproxy.io/?" + encodeURIComponent(ANILIST)];
  let lastErr;
  for (const url of targets) {
    try {
      const r = await fetchAny(url, { method: "POST", headers, body }, 16000);
      if (r.status === 429) {
        if (_retry < 3) {
          await sleep(1500 * (_retry + 1));
          return gql(query, vars, _retry + 1);
        }
        throw new Error("AniList rate limited");
      }
      if (!r.ok) { lastErr = new Error("AniList HTTP " + r.status); continue; }
      const j = await r.json();
      if (j.errors) throw new Error(j.errors[0].message);
      return j.data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("AniList GraphQL failed");
}

const MF = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  episodes
  duration
  status
  averageScore
  popularity
  genres
  season
  seasonYear
  format
  source
  countryOfOrigin
  description(asHtml: false)
`;

const Q = {
  trending: `{ Page(page:1,perPage:20){ media(type:ANIME,sort:TRENDING_DESC,status:RELEASING){ ${MF} } } }`,
  popular: `{ Page(page:1,perPage:20){ media(type:ANIME,sort:POPULARITY_DESC){ ${MF} } } }`,
  topRated: `{ Page(page:1,perPage:20){ media(type:ANIME,sort:SCORE_DESC,averageScore_greater:72){ ${MF} } } }`,
  newReleases: `{ Page(page:1,perPage:20){ media(type:ANIME,sort:START_DATE_DESC,status:RELEASING){ ${MF} } } }`,
  movies: `query($p:Int){ Page(page:$p,perPage:24){ pageInfo{ hasNextPage currentPage } media(type:ANIME,format:MOVIE,sort:POPULARITY_DESC){ ${MF} } } }`,
  seasonal: `query($season:MediaSeason,$year:Int){ Page(page:1,perPage:20){ media(type:ANIME,season:$season,seasonYear:$year,sort:POPULARITY_DESC,status_not:NOT_YET_RELEASED){ ${MF} } } }`,
  search: `query($s:String,$p:Int){ Page(page:$p,perPage:24){ pageInfo{ hasNextPage currentPage total } media(type:ANIME,search:$s,sort:SEARCH_MATCH){ ${MF} } } }`,
  genre: `query($g:String,$p:Int){ Page(page:$p,perPage:24){ pageInfo{ hasNextPage currentPage } media(type:ANIME,genre_in:[$g],sort:POPULARITY_DESC){ ${MF} } } }`,
  browse: `query($sort:[MediaSort],$p:Int){ Page(page:$p,perPage:24){ pageInfo{ hasNextPage currentPage } media(type:ANIME,sort:$sort){ ${MF} } } }`,
  byIds: `query($ids:[Int]){ Page(page:1,perPage:50){ media(id_in:$ids,type:ANIME){ ${MF} } } }`,
  byMalIds: `query($ids:[Int]){ Page(page:1,perPage:50){ media(type:ANIME,idMal_in:$ids,sort:SCORE_DESC){ ${MF} } } }`,
  detail: `query($id:Int){ Media(id:$id,type:ANIME){ ${MF} trailer{ id site thumbnail } studios(isMain:true){ nodes{ name } } nextAiringEpisode{ episode airingAt } characters(perPage:12,sort:ROLE){ nodes{ id name{ full } image{ large } } } relations{ edges{ relationType node{ id title{ romaji english } coverImage{ large } type format } } } recommendations(perPage:8){ nodes{ mediaRecommendation{ id title{ romaji english } coverImage{ large } } } } } }`
};

function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (m <= 3) return "WINTER";
  if (m <= 6) return "SPRING";
  if (m <= 9) return "SUMMER";
  return "FALL";
}

const S = {
  _get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  _set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  watchlist() { return this._get("goar_wl") || []; },
  inWatchlist(id) { return this.watchlist().some(x => x.id === id); },
  addToWatchlist(a) {
    const wl = this.watchlist().filter(x => x.id !== a.id);
    wl.unshift({ id: a.id, title: a.title.english || a.title.romaji, img: a.coverImage?.large, genres: a.genres, score: a.averageScore, ts: Date.now() });
    this._set("goar_wl", wl);
  },
  removeFromWatchlist(id) { this._set("goar_wl", this.watchlist().filter(x => x.id !== id)); },
  toggleWatchlist(a) { this.inWatchlist(a.id) ? this.removeFromWatchlist(a.id) : this.addToWatchlist(a); },
  progress(id) { return this._get("goar_p" + id) || { eps: [], last: null }; },
  saveProgress(id, ep) {
    const p = this.progress(id);
    p.last = ep;
    if (!p.eps.includes(ep)) p.eps.push(ep);
    this._set("goar_p" + id, p);
  },
  sites() {
    return this._get("goar_sites") || { sites: SEED_SITES, updated: null };
  },
  setSites(sites) { this._set("goar_sites", { sites, updated: new Date().toISOString() }); },
  ids() {
    const stored = this._get("goar_ids");
    return stored?.ids?.length ? stored : { ids: SEED_IDS, count: SEED_IDS.length, updated: null };
  },
  setIds(ids) { this._set("goar_ids", { ids, count: ids.length, updated: new Date().toISOString() }); },
  oaaBase() { return (this._get("goar_oaa") || "http://localhost:3000").replace(/\/$/, ""); },
  setOaaBase(u) { this._set("goar_oaa", String(u || "").trim().replace(/\/$/, "") || "http://localhost:3000"); },
  history() { return this._get("goar_hist") || []; },
  pushHistory(a, ep) {
    const h = this.history().filter(x => x.id !== a.id);
    h.unshift({
      id: a.id,
      ep,
      title: (a.title && (a.title.english || a.title.romaji)) || "Anime",
      img: a.coverImage && a.coverImage.large,
      ts: Date.now()
    });
    this._set("goar_hist", h.slice(0, 24));
  }
};

const CACHE_TTL = 5 * 60 * 1000;
function cacheGet(key) {
  try {
    const e = JSON.parse(sessionStorage.getItem(key));
    if (e && Date.now() - e.ts < CACHE_TTL) return e.data;
  } catch {}
  return null;
}
function cacheSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
async function cachedGql(key, query, vars) {
  const hit = cacheGet(key);
  if (hit) return hit;
  const data = await gql(query, vars);
  cacheSet(key, data);
  return data;
}

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const mk = (tag, cls = "", html = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const fmt = {
  status: s => ({ RELEASING: "Airing", FINISHED: "Finished", NOT_YET_RELEASED: "Upcoming", CANCELLED: "Cancelled", HIATUS: "On Hiatus" }[s] || s || "-"),
  season: (s, y) => s ? `${s[0]}${s.slice(1).toLowerCase()} ${y || ""}`.trim() : (y || "-"),
  score: s => s ? (s / 10).toFixed(1) : null,
  plain: h => h ? h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() : "",
  title: a => a?.title?.english || a?.title?.romaji || "Untitled"
};

function toast(msg, ms = 2800) {
  $$(".toast").forEach(t => t.remove());
  const t = mk("div", "toast", msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function skels(el, n = 10) {
  el.innerHTML = Array(n).fill('<div class="acard skel" style="aspect-ratio:3/4"></div>').join("");
}

function card(a, extraCls = "") {
  const title = fmt.title(a);
  const img = a.coverImage?.extraLarge || a.coverImage?.large || "";
  const score = a.averageScore ? `<span class="acard-score">${fmt.score(a.averageScore)}</span>` : "";
  const eps = a.episodes ? `<span>${a.episodes} ep</span>` : "";
  const sep = score && eps ? " · " : "";
  const saved = S.inWatchlist(a.id);
  const c = mk("div", `acard ${extraCls}`);
  c.innerHTML = `
    <img src="${img}" alt="" loading="lazy">
    <div class="acard-info">
      <div class="acard-title">${esc(title)}</div>
      <div class="acard-meta">${score}${sep}${eps}</div>
    </div>
    <div class="acard-play">${PLAY_SVG}</div>
    <button class="acard-heart${saved ? " saved" : ""}" title="${saved ? "Remove from list" : "Add to list"}">${HEART_SVG}</button>`;
  c.querySelector("img").onerror = function () {
    this.parentElement.style.background = "var(--card-hover)";
    this.style.display = "none";
  };
  c.querySelector(".acard-heart").addEventListener("click", e => {
    e.stopPropagation();
    S.toggleWatchlist(a);
    const btn = e.currentTarget;
    const now = S.inWatchlist(a.id);
    btn.classList.toggle("saved", now);
    btn.title = now ? "Remove from list" : "Add to list";
    toast(now ? "Added to My List" : "Removed from My List");
  });
  c.addEventListener("click", () => go(`/anime/${a.id}`));
  return c;
}

function showcaseCard(a) {
  const c = card(a);
  return c;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function parseHash() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  return { parts, params, path: "/" + parts.join("/") };
}

function go(path) {
  location.hash = path.startsWith("#") ? path : "#" + path;
}

function setActiveNav(name) {
  $$("#navLinks a").forEach(a => a.classList.toggle("active", a.dataset.nav === name));
}

function fillRow(el, items) {
  el.innerHTML = "";
  items.forEach(a => el.appendChild(showcaseCard(a)));
}

/* ── Views ── */
async function viewHome() {
  setActiveNav("home");
  setDocTitle("");
  const season = currentSeason();
  const year = new Date().getFullYear();
  $("#app").innerHTML = `
    <div class="hero" id="hero">
      <div class="hero-bg" id="heroBg"></div>
      <div class="hero-shade"></div>
      <div class="hero-content">
        <div class="hero-genres" id="heroGenres"></div>
        <div class="hero-title" id="heroTitle">Loading catalog</div>
        <div class="hero-desc" id="heroDesc"></div>
        <div class="hero-stats" id="heroStats"></div>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap">
          <button class="btn btn-primary" id="heroWatch">${PLAY_SVG} Start Watching</button>
          <a href="#/browse" class="btn btn-ghost" data-link>Browse Sites</a>
        </div>
      </div>
      <div class="hero-dots" id="heroDots"></div>
    </div>
    <div class="home-wrap">
      <div class="genre-bar" id="genreBar"></div>
      <div class="section-row" id="continueWrap" hidden>
        <div class="section-row-head">
          <span class="section-row-title">Continue watching</span>
          <a href="#/history" class="section-row-more" data-link>History</a>
        </div>
        <div class="card-row" id="continueRow"></div>
      </div>
      <div class="section-row">
        <div class="section-row-head">
          <span class="section-row-title">Featured</span>
          <a href="#/catalog" class="section-row-more" data-link>Catalog</a>
        </div>
        <div class="card-row" id="featRow"></div>
      </div>
      <div class="feat-box">
        <div class="section-row-head">
          <span class="section-row-title">Initial D — Complete Series</span>
          <a href="#/search?q=Initial%20D" class="section-row-more" data-link>Watch</a>
        </div>
        <div style="font-size:.78rem;color:var(--dim);margin-bottom:1rem">Street racing catalog. All stages from First to Final.</div>
        <div class="card-row" id="initialDRow"></div>
      </div>
      <div class="section-row">
        <div class="section-row-head">
          <span class="section-row-title" id="seasonLabel">${season[0] + season.slice(1).toLowerCase()} ${year}</span>
          <a href="#/search?sort=TRENDING_DESC" class="section-row-more" data-link>See all</a>
        </div>
        <div class="card-row" id="seasonRow"></div>
      </div>
      <div class="section-row">
        <div class="section-row-head"><span class="section-row-title">New Releases</span>
          <a href="#/search?sort=START_DATE_DESC" class="section-row-more" data-link>See all</a></div>
        <div class="card-row" id="newRow"></div>
      </div>
      <div class="section-row">
        <div class="section-row-head"><span class="section-row-title">Trending Now</span>
          <a href="#/search?sort=TRENDING_DESC" class="section-row-more" data-link>See all</a></div>
        <div class="card-row" id="trendingRow"></div>
      </div>
      <div class="section-row">
        <div class="section-row-head"><span class="section-row-title">Most Popular</span>
          <a href="#/search?sort=POPULARITY_DESC" class="section-row-more" data-link>See all</a></div>
        <div class="card-row" id="popularRow"></div>
      </div>
      <div class="section-row">
        <div class="section-row-head"><span class="section-row-title">Top Rated</span>
          <a href="#/search?sort=SCORE_DESC" class="section-row-more" data-link>See all</a></div>
        <div class="card-row" id="topRatedRow"></div>
      </div>
    </div>`;

  GENRES.forEach(g => {
    const a = mk("a", "genre-chip", g);
    a.href = `#/search?genre=${encodeURIComponent(g)}`;
    $("#genreBar").appendChild(a);
  });

  ["initialDRow","seasonRow","newRow","trendingRow","popularRow","topRatedRow"].forEach(id => skels($("#"+id), 9));

  let heroAnime = [], heroIdx = 0, heroTimer;

  function setHero(a) {
    $("#heroBg").style.backgroundImage = `url('${a.bannerImage || a.coverImage?.extraLarge || ""}')`;
    $("#heroTitle").textContent = fmt.title(a);
    $("#heroDesc").textContent = fmt.plain(a.description || "");
    $("#heroGenres").innerHTML = (a.genres || []).slice(0, 4).map(g => `<span class="hero-genre">${esc(g)}</span>`).join("");
    $("#heroStats").innerHTML = [
      a.averageScore ? { l: "Score", v: fmt.score(a.averageScore) } : null,
      a.episodes ? { l: "Episodes", v: a.episodes } : null,
      a.status ? { l: "Status", v: fmt.status(a.status) } : null,
      a.seasonYear ? { l: "Year", v: a.seasonYear } : null,
    ].filter(Boolean).map(s => `<div class="hero-stat"><div class="hero-stat-label">${s.l}</div><div class="hero-stat-val">${s.v}</div></div>`).join("");
    $("#heroWatch").onclick = () => go(`/watch/${a.id}/${S.progress(a.id).last || 1}`);
  }

  function cycleHero(i) {
    heroIdx = i;
    setHero(heroAnime[i]);
    $$(".hero-dot").forEach((d, j) => d.classList.toggle("on", j === i));
    clearInterval(heroTimer);
    heroTimer = setInterval(() => cycleHero((heroIdx + 1) % heroAnime.length), 6000);
  }

  try {
    const [trending, initialD] = await Promise.all([
      cachedGql("trending", Q.trending),
      cachedGql("initialD_v2", Q.byIds, { ids: INITIAL_D_IDS }),
    ]);
    heroAnime = trending.Page.media.filter(a => a.bannerImage || a.coverImage?.extraLarge).slice(0, 5);
    if (heroAnime.length) {
      setHero(heroAnime[0]);
      $("#heroDots").innerHTML = "";
      heroAnime.forEach((_, i) => {
        const d = mk("div", `hero-dot${i === 0 ? " on" : ""}`);
        d.addEventListener("click", () => cycleHero(i));
        $("#heroDots").appendChild(d);
      });
      heroTimer = setInterval(() => cycleHero((heroIdx + 1) % heroAnime.length), 6000);
    }
    const hist = S.history();
    if (hist.length) {
      const wrap = $("#continueWrap");
      const row = $("#continueRow");
      if (wrap && row) {
        wrap.hidden = false;
        row.innerHTML = "";
        hist.slice(0, 12).forEach(item => {
          const fake = { id: item.id, title: { english: item.title, romaji: item.title }, coverImage: { large: item.img, extraLarge: item.img } };
          const c = card(fake);
          c.classList.add("cont-card");
          const tag = document.createElement("div");
          tag.className = "cont-ep";
          tag.textContent = "Ep " + (item.ep || 1);
          c.appendChild(tag);
          c.onclick = () => go("/watch/" + item.id + "/" + (item.ep || 1));
          row.appendChild(c);
        });
      }
    }
    fillRow($("#trendingRow"), trending.Page.media);
    const idRow = $("#initialDRow");
    idRow.innerHTML = "";
    const mediaMap = {};
    initialD.Page.media.forEach(m => { mediaMap[m.id] = m; });
    INITIAL_D_IDS.forEach(id => { if (mediaMap[id]) idRow.appendChild(showcaseCard(mediaMap[id])); });

    const featIds = window.GOAR_FEATURED || FEATURED_IDS;
    const [seasonal, newRel, popular, topRated, featured] = await Promise.all([
      cachedGql(`seasonal-${season}-${year}`, Q.seasonal, { season, year }),
      cachedGql("newReleases", Q.newReleases),
      cachedGql("popular", Q.popular),
      cachedGql("topRated", Q.topRated),
      cachedGql("featured-mal", Q.byMalIds, { ids: featIds }).catch(() => ({ Page: { media: [] } })),
    ]);
    fillRow($("#seasonRow"), seasonal.Page.media);
    fillRow($("#newRow"), newRel.Page.media);
    fillRow($("#popularRow"), popular.Page.media);
    fillRow($("#topRatedRow"), topRated.Page.media);
    fillRow($("#featRow"), featured.Page.media);
  } catch (e) {
    $("#heroTitle").textContent = "Catalog unavailable";
    $("#heroDesc").textContent = String(e.message || e);
  }
}

async function viewMovies() {
  setActiveNav("movies");
  setDocTitle("Movies");
  $("#app").innerHTML = `<div class="page-wrap"><div class="page-title">Movies</div><div class="page-sub">AniList format MOVIE</div><div class="grid" id="grid"></div><div class="pager" id="pager"></div></div>`;
  await fillPagedGrid({ query: Q.movies, vars: {}, cacheKey: "movies" });
}

function viewList() {
  setActiveNav("list");
  setDocTitle("My List");
  const wl = S.watchlist();
  $("#app").innerHTML = `<div class="page-wrap"><div class="page-title">My List</div><div class="page-sub">${wl.length} saved title${wl.length === 1 ? "" : "s"}</div><div class="grid" id="grid"></div></div>`;
  if (!wl.length) {
    $("#grid").innerHTML = `<div class="empty"><div class="empty-title">List is empty</div><div class="empty-body">Save titles from any card or detail page.</div></div>`;
    return;
  }
  wl.forEach(item => {
    const fake = { id: item.id, title: { english: item.title, romaji: item.title }, coverImage: { large: item.img, extraLarge: item.img }, averageScore: item.score, genres: item.genres };
    $("#grid").appendChild(card(fake));
  });
}

function viewBrowse(params) {
  setActiveNav("browse");
  setDocTitle("Browse Free");
  const pack = S.sites();
  const q = (params.q || "").trim();
  $("#app").innerHTML = `
    <div class="page-wrap">
      <div class="page-title">Browse Free</div>
      <div class="page-sub">Verified site directory. ${pack.sites.length} live targets${pack.updated ? " · refreshed " + pack.updated.slice(0,10) : ""}.</div>
      <div class="tag-pills" id="tagPills"></div>
      <div class="site-grid" id="siteGrid"></div>
    </div>`;
  const tags = ["all","sub","both","dub","official","manga"];
  let cur = "all";
  const pills = $("#tagPills");
  tags.forEach(t => {
    const b = mk("button", "tag-pill" + (t === cur ? " on" : ""), t);
    b.addEventListener("click", () => { cur = t; $$(".tag-pill", pills).forEach(x => x.classList.toggle("on", x.textContent === cur)); render(); });
    pills.appendChild(b);
  });
  function render() {
    const list = pack.sites.filter(s => cur === "all" || s.tag === cur);
    $("#siteGrid").innerHTML = list.map(s => {
      const letter = s.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
      return `<a class="site-btn${s.top ? " top" : ""}" href="${esc(s.url)}" target="_blank" rel="noopener">
        <div class="site-ico">${letter}</div>
        <div style="min-width:0">
          <div class="site-name">${esc(s.name)}</div>
          <div class="site-desc">${s.tag}${s.top ? " · top pick" : ""}${q ? " · search " + esc(q) : ""}</div>
        </div>
      </a>`;
    }).join("");
  }
  render();
}

async function fillPagedGrid({ query, vars, cacheKey }) {
  const grid = $("#grid");
  const pager = $("#pager");
  const count = $("#count");
  let page = 1;
  async function load(reset) {
    if (reset) { grid.innerHTML = ""; skels(grid, 18); }
    try {
      const key = cacheKey ? cacheKey + "-p" + page : null;
      const d = key ? await cachedGql(key, query, { ...vars, p: page }) : await gql(query, { ...vars, p: page });
      if (reset) grid.innerHTML = "";
      d.Page.media.forEach(a => grid.appendChild(card(a)));
      if (!d.Page.media.length && page === 1) grid.innerHTML = `<div class="empty"><div class="empty-title">No results</div></div>`;
      if (count) count.textContent = d.Page.pageInfo?.total ? `${d.Page.pageInfo.total.toLocaleString()} titles on AniList` : `${grid.querySelectorAll(".acard").length} titles`;
      pager.innerHTML = "";
      if (d.Page.pageInfo?.hasNextPage) {
        const more = mk("button", "btn btn-ghost", "Load more");
        more.onclick = () => { page += 1; load(false); };
        pager.appendChild(more);
      }
    } catch (e) {
      if (page === 1) grid.innerHTML = `<div class="empty"><div class="empty-title">AniList request failed</div><div class="empty-body">${esc(e.message)}</div></div>`;
    }
  }
  await load(true);
}

async function viewSearch(params) {
  setActiveNav("home");
  const q = params.q || "";
  const genre = params.genre || "";
  const sort = params.sort || "";
  const title = q ? `Search · ${q}` : genre ? `Genre · ${genre}` : sort ? `Browse · ${sort.replace(/_DESC|_ASC/g, "")}` : "Search";
  $("#app").innerHTML = `<div class="page-wrap"><div class="page-title">${esc(title)}</div><div class="page-sub" id="count">AniList GraphQL</div><div class="grid" id="grid"></div><div class="pager" id="pager"></div></div>`;
  if (q) return fillPagedGrid({ query: Q.search, vars: { s: q } });
  if (genre) return fillPagedGrid({ query: Q.genre, vars: { g: genre } });
  return fillPagedGrid({ query: Q.browse, vars: { sort: sort || "TRENDING_DESC" } });
}

async function viewCatalog(params) {
  setActiveNav("catalog");
  const pack = S.ids();
  const all = pack.ids;
  const per = 50;
  let page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const pages = Math.max(1, Math.ceil(all.length / per));
  if (page > pages) page = pages;
  const slice = all.slice((page - 1) * per, page * per);
  $("#app").innerHTML = `<div class="page-wrap"><div class="page-title">Catalog</div><div class="page-sub" id="count">Resolving ${slice.length} MAL IDs through AniList · page ${page}/${pages} · ${all.length.toLocaleString()} indexed</div><div class="grid" id="grid"></div><div class="pager" id="pager"></div></div>`;
  skels($("#grid"), 18);
  try {
    const d = await cachedGql("mal-" + slice[0] + "-" + slice.length + "-" + page, Q.byMalIds, { ids: slice });
    $("#grid").innerHTML = "";
    d.Page.media.forEach(a => $("#grid").appendChild(card(a)));
    if (!d.Page.media.length) $("#grid").innerHTML = `<div class="empty"><div class="empty-title">No AniList matches for this page</div></div>`;
    const pager = $("#pager");
    if (page > 1) {
      const prev = mk("a", "btn btn-ghost", "Previous");
      prev.href = `#/catalog?page=${page - 1}`;
      prev.setAttribute("data-link", "");
      pager.appendChild(prev);
    }
    if (page < pages) {
      const next = mk("a", "btn btn-ghost", "Next");
      next.href = `#/catalog?page=${page + 1}`;
      next.setAttribute("data-link", "");
      pager.appendChild(next);
    }
  } catch (e) {
    $("#grid").innerHTML = `<div class="empty"><div class="empty-title">AniList catalog failed</div><div class="empty-body">${esc(e.message)}</div></div>`;
  }
}

async function viewAnime(id) {
  setActiveNav("home");
  $("#app").innerHTML = `<div class="banner"><div class="banner-shade"></div></div><div class="detail-wrap"><div class="page-sub">Loading title...</div></div>`;
  try {
    const d = await cachedGql("anime-"+id, Q.detail, { id: Number(id) });
    const a = d.Media;
    const saved = S.inWatchlist(a.id);
    const studios = (a.studios?.nodes || []).map(n => n.name).join(", ") || "-";
    const rel = (a.relations?.edges || []).filter(e => e.node?.type === "ANIME").slice(0, 10);
    const rec = (a.recommendations?.nodes || []).map(n => n.mediaRecommendation).filter(Boolean).slice(0, 10);
    $("#app").innerHTML = `
      <div class="banner">
        <img class="banner-img" src="${a.bannerImage || a.coverImage?.extraLarge || ""}" alt="">
        <div class="banner-shade"></div>
      </div>
      <div class="detail-wrap">
        <div class="detail-head">
          <img class="detail-poster" src="${a.coverImage?.extraLarge || a.coverImage?.large || ""}" alt="">
          <div class="detail-info">
            <div class="detail-title">${esc(fmt.title(a))}</div>
            <div class="detail-alt">${esc(a.title.romaji || "")}${a.title.native ? " · " + esc(a.title.native) : ""}</div>
            <div class="stats">
              ${a.averageScore ? `<div><div class="stat-val accent">${fmt.score(a.averageScore)}</div><div class="stat-key">Score</div></div>` : ""}
              ${a.episodes ? `<div><div class="stat-val">${a.episodes}</div><div class="stat-key">Episodes</div></div>` : ""}
              <div><div class="stat-val">${fmt.status(a.status)}</div><div class="stat-key">Status</div></div>
              <div><div class="stat-val">${fmt.season(a.season, a.seasonYear)}</div><div class="stat-key">Season</div></div>
            </div>
            <div class="gchips">${(a.genres||[]).map(g => `<a class="gchip" href="#/search?genre=${encodeURIComponent(g)}" data-link>${esc(g)}</a>`).join("")}</div>
            <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.6rem">
              <a class="btn btn-primary" href="#/watch/${a.id}/${S.progress(a.id).last || 1}" data-link>${PLAY_SVG} ${S.progress(a.id).last ? "Continue Ep " + S.progress(a.id).last : "Watch"}</a>
              <a class="btn btn-ghost" href="#/browse?q=${encodeURIComponent(fmt.title(a))}" data-link>Open Sites</a>
              <button class="btn btn-ghost" id="wlBtn">${saved ? "Remove from List" : "Add to List"}</button>
            </div>
          </div>
        </div>
        <div class="detail-body">
          <div>
            <div class="synopsis">${esc(fmt.plain(a.description || "No synopsis."))}</div>
            ${a.trailer?.id && a.trailer.site === "youtube" ? `<div class="section-row-title" style="margin:1.2rem 0 .7rem">Trailer</div><div class="trailer-wrap"><iframe src="https://www.youtube.com/embed/${esc(a.trailer.id)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div>` : ""}
            <div id="epsSection"></div>
            ${(a.characters?.nodes || []).length ? `<div class="section-row-title" style="margin:1.2rem 0 .7rem">Characters</div><div class="char-grid" id="charGrid"></div>` : ""}
            ${rel.length ? `<div class="section-row-title" style="margin:1.2rem 0 .7rem">Related</div><div class="rel-row" id="relRow"></div>` : ""}
            ${rec.length ? `<div class="section-row-title" style="margin:1.2rem 0 .7rem">Recommended</div><div class="rel-row" id="recRow"></div>` : ""}
          </div>
          <div>
            <div class="info-box">
              <div class="info-box-title">Info</div>
              <div class="info-row"><span class="info-k">Format</span><span class="info-v">${a.format || "-"}</span></div>
              <div class="info-row"><span class="info-k">Source</span><span class="info-v">${a.source ? a.source.replace(/_/g, " ") : "-"}</span></div>
              <div class="info-row"><span class="info-k">Duration</span><span class="info-v">${a.duration ? a.duration + " min" : "-"}</span></div>
              <div class="info-row"><span class="info-k">Studios</span><span class="info-v">${esc(studios)}</span></div>
              <div class="info-row"><span class="info-k">Popularity</span><span class="info-v">${a.popularity ? a.popularity.toLocaleString() : "-"}</span></div>
              <div class="info-row"><span class="info-k">AniList</span><span class="info-v">${a.id}</span></div>
              <div class="info-row"><span class="info-k">MAL</span><span class="info-v">${a.idMal || "-"}</span></div>
            </div>
          </div>
        </div>
      </div>`;
    $("#wlBtn").onclick = () => {
      S.toggleWatchlist(a);
      const now = S.inWatchlist(a.id);
      $("#wlBtn").textContent = now ? "Remove from List" : "Add to List";
      toast(now ? "Added to My List" : "Removed from My List");
    };
    function addRel(el, items) {
      if (!el) return;
      items.forEach(n => {
        const t = n.title?.english || n.title?.romaji || "";
        const c = mk("div", "rel-card");
        c.innerHTML = `<img src="${n.coverImage?.large || ""}" alt=""><span>${esc(t)}</span>`;
        c.onclick = () => go(`/anime/${n.id}`);
        el.appendChild(c);
      });
    }
    const charGrid = $("#charGrid");
    if (charGrid) {
      (a.characters.nodes || []).filter(c => c.image?.large).forEach(c => {
        const el = mk("div", "char-card");
        el.innerHTML = `<img src="${c.image.large}" alt=""><span>${esc(c.name?.full || "")}</span>`;
        charGrid.appendChild(el);
      });
    }
    addRel($("#relRow"), rel.map(e => e.node));
    addRel($("#recRow"), rec);
    const totalEps = a.episodes || (a.nextAiringEpisode ? a.nextAiringEpisode.episode - 1 : 0);
    const epsEl = $("#epsSection");
    if (epsEl && totalEps > 0) {
      const p2 = S.progress(a.id);
      const watched = p2.eps || [];
      epsEl.innerHTML = `<div class="section-row-title" style="margin:1.2rem 0 .7rem">Episodes (${totalEps})</div><div class="ep-grid" id="epGrid"></div>`;
      const grid = $("#epGrid");
      for (let i = 1; i <= totalEps; i++) {
        const btn = mk("a", `epb${watched.includes(i) ? " done" : ""}${p2.last === i ? " cur" : ""}`, String(i));
        btn.href = `#/watch/${a.id}/${i}`;
        btn.setAttribute("data-link", "");
        grid.appendChild(btn);
      }
    }
  } catch (e) {
    $("#app").innerHTML = `<div class="page-wrap"><div class="empty"><div class="empty-title">Title failed to load</div><div class="empty-body">${esc(e.message)}</div></div></div>`;
  }
}

const OAA = {
  streamUrl(title, ep) {
    return S.oaaBase() + "/api/stream?title=" + encodeURIComponent(title) + "&episode=" + ep;
  },
  async stream(title, ep) {
    const r = await fetchAny(this.streamUrl(title, ep), {}, 28000);
    let data;
    try { data = await r.json(); } catch { data = {}; }
    if (!r.ok) throw new Error(data.error || ("Open Anime HTTP " + r.status));
    return data;
  },
  async stats() {
    const r = await fetchAny(S.oaaBase() + "/api/stats", {}, 4000);
    return r.json();
  }
};

const VN_HOST = "https://new.vidnest.fun";
const VN_ALPH = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
const VN_PROXIES = [
  "https://vidproxy.alfa-3bd.workers.dev",
  "https://vidproxy.beta-fa8.workers.dev",
  "https://vidproxy.gama-f83.workers.dev",
  "https://vidproxy.lamda-5d0.workers.dev",
  "https://dark-sky-796e.flixer-d6b.workers.dev",
  "https://autumn-fire-7c7b.zeta-7cc.workers.dev"
];
const PROVIDERS = [
  { name: "Wave", url: (id, ep, lang) => `${VN_HOST}/aniwave_hls/${id}/${ep}/${lang}` },
  { name: "Hub", url: (id, ep, lang) => `${VN_HOST}/animehub/${id}/${ep}/${lang}` },
  { name: "Hawk", url: (id, ep, lang) => `${VN_HOST}/hianime/anime/${id}/${ep}/${lang}/hd-2` }
];
let hlsInst = null;

function vnDecode(input) {
  const index = Object.create(null);
  for (let i = 0; i < VN_ALPH.length; i++) index[VN_ALPH[i]] = i;
  const out = [];
  for (let t = 0; t < input.length; t += 4) {
    let chunk = input.slice(t, t + 4);
    while (chunk.length < 4) chunk += "=";
    const d = [0, 1, 2, 3].map(i => index[chunk[i]] === undefined ? 64 : index[chunk[i]]);
    out.push(((d[0] << 2) | (d[1] >> 4)) & 255);
    if (d[2] !== 64) out.push((((d[1] & 15) << 4) | (d[2] >> 2)) & 255);
    if (d[3] !== 64) out.push((((d[2] & 3) << 6) | d[3]) & 255);
  }
  return new TextDecoder().decode(new Uint8Array(out));
}

async function vnDecrypt(res) {
  const body = await res.json();
  if (!body || !body.encrypted) return body;
  if (!body.data || typeof body.data !== "string") throw new Error("encrypted payload missing");
  const text = vnDecode(body.data);
  try { return JSON.parse(text); } catch { throw new Error("stream payload was not JSON"); }
}

function qLabel(q) {
  const s = String(q || "").toLowerCase();
  if (s.includes("1080") || s === "hd") return "1080";
  if (s.includes("720") || s === "hq") return "720";
  if (s.includes("480") || s === "sd" || s.includes("360")) return "480";
  return "auto";
}

function proxyPlayUrl(url, referer) {
  const host = VN_PROXIES[Math.floor(Math.random() * VN_PROXIES.length)];
  const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };
  if (referer) headers.referer = referer;
  const q = new URLSearchParams();
  q.set("url", url);
  q.set("headers", JSON.stringify(headers));
  return host + "/proxy?" + q.toString();
}

function destroyHls() {
  if (hlsInst) { try { hlsInst.destroy(); } catch {} hlsInst = null; }
  const v = $("#playerVideo");
  if (v) { try { v.pause(); } catch {} v.removeAttribute("src"); v.load(); }
}

async function playInPlayer(source, useProxy) {
  const video = $("#playerVideo");
  if (!video) return;
  destroyHls();
  video.querySelectorAll("track").forEach(t => t.remove());
  (source.subs || []).forEach((s, i) => {
    const tr = document.createElement("track");
    tr.kind = "subtitles";
    tr.label = s.label || "Subtitles";
    tr.srclang = "en";
    tr.src = s.url;
    if (i === 0) tr.default = true;
    video.appendChild(tr);
  });
  const raw = source.url;
  const url = useProxy ? proxyPlayUrl(raw, source.referer) : raw;
  const hls = /\.m3u8(\?|$)/i.test(raw) || source.hls;
  const msg = $("#playerBox .player-msg");
  if (msg) msg.remove();
  if (!hls) {
    video.src = url;
    try { await video.play(); } catch {}
    return;
  }
  if (video.canPlayType("application/vnd.apple.mpegurl") && !window.Hls) {
    video.src = url;
    try { await video.play(); } catch {}
    return;
  }
  if (!window.Hls || !Hls.isSupported()) throw new Error("This browser cannot play the HLS stream");
  const engine = new Hls({ enableWorker: true, maxBufferLength: 12 });
  hlsInst = engine;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("manifest timeout")), 18000);
    engine.on(Hls.Events.MANIFEST_PARSED, () => {
      clearTimeout(timer);
      const pref = $("#qSel") ? $("#qSel").value : "auto";
      if (pref === "auto") engine.currentLevel = -1;
      else {
        const want = Number(pref);
        let best = 0, diff = Infinity;
        (engine.levels || []).forEach((lv, i) => {
          const d = Math.abs((lv.height || 0) - want);
          if (d < diff) { diff = d; best = i; }
        });
        engine.currentLevel = best;
      }
      resolve();
    });
    engine.on(Hls.Events.ERROR, (_e, data) => {
      if (data && data.fatal) { clearTimeout(timer); reject(new Error(data.details || "hls failed")); }
    });
    engine.loadSource(url);
    engine.attachMedia(video);
  });
  try { await video.play(); } catch {}
}

async function viewWatch(id, ep) {
  setActiveNav("home");
  const animeId = parseInt(id, 10);
  let curEp = parseInt(ep, 10) || 1;
  let totalEps = 0;
  let animeData = null;
  let lang = "sub";
  let files = [];
  let fileIdx = 0;

  $("#app").innerHTML = `
    <div class="watch-layout">
      <div class="watch-main">
        <div class="player-box" id="playerBox">
          <video id="playerVideo" controls playsinline webkit-playsinline></video>
          <div class="player-msg" id="playerMsg">Resolving stream…</div>
        </div>
        <div class="ctrl-bar">
          <div class="ctrl-title" id="ctrlTitle">Loading</div>
          <div class="pill-row">
            <button class="pill" id="prevBtn" disabled>Prev</button>
            <button class="pill" id="nextBtn" disabled>Next</button>
            <button class="pill" id="refreshBtn">Retry</button>
            <button class="pill" id="fsBtn">Fullscreen</button>
          </div>
          <select class="qsel" id="qSel" aria-label="Quality">
            <option value="auto">Auto</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
            <option value="480">480p</option>
          </select>
        </div>
        <div class="src-bar"><span>Audio</span><div class="pill-row"><button class="pill on" id="subBtn" type="button">Sub</button><button class="pill" id="dubBtn" type="button">Dub</button></div></div>
        <div class="src-bar"><span>Source</span><div id="srcBtnRow" class="pill-row"></div></div>
        <div class="nav-hint" id="navHint">goarxyz player. The file is decoded and played here. No embed.</div>
      </div>
      <div class="ep-sidebar">
        <div class="ep-sidebar-head"><span>Episodes</span><span id="epCount">-</span></div>
        <div class="ep-list" id="epList"><div style="padding:2rem;text-align:center;color:var(--dim);font-size:.85rem">Loading</div></div>
      </div>
    </div>`;

  function showMsg(text) {
    const box = $("#playerBox");
    let msg = $("#playerMsg");
    if (!msg) {
      msg = mk("div", "player-msg");
      msg.id = "playerMsg";
      box.appendChild(msg);
    }
    msg.textContent = text;
  }

  function paintFiles() {
    const row = $("#srcBtnRow");
    row.innerHTML = "";
    files.forEach((f, i) => {
      const b = mk("button", "src-btn" + (i === fileIdx ? " on" : ""), f.label);
      b.onclick = () => { fileIdx = i; paintFiles(); startFile(f); };
      row.appendChild(b);
    });
  }

  function pickByQuality(list, pref) {
    if (!list.length) return null;
    if (!pref || pref === "auto") return list[0];
    return list.find(f => f.q === pref) || list[0];
  }

  async function startFile(file) {
    showMsg("Starting " + file.label + "…");
    try {
      await playInPlayer(file, false);
      const msg = $("#playerMsg");
      if (msg) msg.remove();
      const hint = $("#navHint");
      if (hint) hint.textContent = file.label + " · " + (file.q === "auto" ? "auto" : file.q + "p") + " · our player";
    } catch (e1) {
      try {
        await playInPlayer(file, true);
        const msg = $("#playerMsg");
        if (msg) msg.remove();
      } catch (e2) {
        showMsg("Couldn't play this source. " + (e2.message || e2));
      }
    }
  }

  async function loadSources() {
    files = [];
    fileIdx = 0;
    showMsg("Resolving episode " + curEp + "…");
    const row = $("#srcBtnRow");
    if (row) row.innerHTML = "";
    const found = [];
    await poolMap(PROVIDERS, 3, async (p) => {
      try {
        const r = await fetchAny(p.url(animeId, curEp, lang), {}, 18000);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const data = await vnDecrypt(r);
        const list = data.sources || data.multiSrc || [];
        list.forEach(s => {
          const url = s.url || s.file;
          if (!url) return;
          const subs = [];
          (data.subtitles || data.tracks || []).forEach(t => {
            const u = t.url || t.file;
            if (u) subs.push({ url: u, label: t.label || t.lang || "Subtitles" });
          });
          found.push({
            label: p.name + " · " + (s.quality || s.server || "file"),
            url,
            referer: s.referer || "",
            hls: /\.m3u8(\?|$)/i.test(url),
            q: qLabel(s.quality),
            subs,
            provider: p.name
          });
        });
      } catch {}
    });
    if (!found.length && animeData) {
      try {
        const data = await OAA.stream(fmt.title(animeData), curEp);
        (data.links || []).forEach(l => {
          const url = l && l.url;
          if (!url || l.type === "torrent" || String(url).startsWith("magnet:")) return;
          if (!/\.(m3u8|mp4)(\?|$)/i.test(url)) return;
          found.push({ label: "Open · " + (l.source || "file"), url, referer: "", hls: /\.m3u8/i.test(url), q: "auto", subs: [], provider: "Open" });
        });
      } catch {}
    }
    files = found;
    if (!files.length) {
      showMsg("No direct file for this episode. Try Dub, or the next episode.");
      const hint = $("#navHint");
      if (hint) hint.textContent = "The resolver returned no playable file.";
      return;
    }
    const pref = $("#qSel") ? $("#qSel").value : "auto";
    const pick = pickByQuality(files, pref) || files[0];
    fileIdx = Math.max(0, files.indexOf(pick));
    paintFiles();
    await startFile(files[fileIdx]);
  }

  function updateNav() {
    $("#prevBtn").disabled = curEp <= 1;
    $("#nextBtn").disabled = totalEps > 0 && curEp >= totalEps;
  }

  function updateTitle() {
    if (!animeData) return;
    const t = fmt.title(animeData);
    $("#ctrlTitle").textContent = `${t}  Ep ${curEp}`;
    document.title = `Ep ${curEp} — ${t} — goarxyz`;
  }

  function highlightSidebar() {
    $$(".ep-row").forEach(r => r.classList.toggle("on", parseInt(r.dataset.ep, 10) === curEp));
    const a = $(".ep-row.on");
    if (a) a.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function buildSidebar(total) {
    const done = S.progress(animeId).eps || [];
    const list = $("#epList");
    $("#epCount").textContent = total + " eps";
    list.innerHTML = "";
    for (let i = 1; i <= total; i++) {
      const row = mk("div", `ep-row${i === curEp ? " on" : ""}`);
      row.dataset.ep = i;
      row.innerHTML = `<div class="ep-num">Ep ${i}</div><div><div class="ep-name">Episode ${i}</div><div class="ep-sub">${done.includes(i) ? "Watched" : ""}</div></div>`;
      row.addEventListener("click", () => goEp(i));
      list.appendChild(row);
    }
    setTimeout(highlightSidebar, 80);
  }

  function goEp(next) {
    if (next < 1 || (totalEps > 0 && next > totalEps)) return;
    curEp = next;
    history.replaceState({}, "", `#/watch/${animeId}/${curEp}`);
    updateNav();
    updateTitle();
    highlightSidebar();
    loadSources();
    S.saveProgress(animeId, curEp);
    if (animeData) S.pushHistory(animeData, curEp);
  }

  $("#prevBtn").onclick = () => goEp(curEp - 1);
  $("#nextBtn").onclick = () => goEp(curEp + 1);
  $("#refreshBtn").onclick = () => loadSources();
  $("#subBtn").onclick = () => { lang = "sub"; $("#subBtn").classList.add("on"); $("#dubBtn").classList.remove("on"); loadSources(); };
  $("#dubBtn").onclick = () => { lang = "dub"; $("#dubBtn").classList.add("on"); $("#subBtn").classList.remove("on"); loadSources(); };
  $("#qSel").onchange = () => {
    if (!files.length) return;
    const pick = pickByQuality(files, $("#qSel").value) || files[0];
    fileIdx = Math.max(0, files.indexOf(pick));
    paintFiles();
    if (hlsInst && $("#qSel").value !== "auto") {
      const want = Number($("#qSel").value);
      let best = 0, diff = Infinity;
      (hlsInst.levels || []).forEach((lv, i) => {
        const d = Math.abs((lv.height || 0) - want);
        if (d < diff) { diff = d; best = i; }
      });
      hlsInst.currentLevel = best;
      if (files[fileIdx] && files[fileIdx].hls) return;
    }
    if (hlsInst && $("#qSel").value === "auto" && files[fileIdx] && files[fileIdx].hls) {
      hlsInst.currentLevel = -1;
      return;
    }
    startFile(files[fileIdx]);
  };
  $("#fsBtn").onclick = () => {
    const box = $("#playerBox");
    const req = box.requestFullscreen || box.webkitRequestFullscreen || box.mozRequestFullScreen;
    if (req) req.call(box);
  };

  try {
    const data = await gql(Q.detail, { id: animeId });
    animeData = data.Media;
    totalEps = animeData.episodes || (animeData.nextAiringEpisode ? animeData.nextAiringEpisode.episode - 1 : 50);
    if (curEp < 1) curEp = 1;
    if (totalEps && curEp > totalEps) curEp = totalEps;
    updateNav();
    updateTitle();
    buildSidebar(totalEps);
    loadSources();
    S.saveProgress(animeId, curEp);
    if (animeData) S.pushHistory(animeData, curEp);
  } catch (err) {
    $("#ctrlTitle").textContent = "Failed to load";
    $("#epList").innerHTML = `<div style="padding:1.2rem;color:var(--dim);font-size:.82rem">${esc(err.message)}</div>`;
  }
}

function viewAbout() {
  setActiveNav("about");
  setDocTitle("About");
  const ids = S.ids();
  const sites = S.sites();
  $("#app").innerHTML = `
    <div class="page-wrap" style="max-width:860px">
      <div class="page-title">goarxyz</div>
      <div class="page-sub">goar white · xyz○□△✕ anime purple · self-contained catalog</div>
      <div class="kpis">
        <div class="kpi"><b>${ids.count.toLocaleString()}</b><span>Indexed IDs</span></div>
        <div class="kpi"><b>${sites.sites.length}</b><span>Live sites</span></div>
        <div class="kpi"><b>Jikan + AniList</b><span>Data sources</span></div>
        <div class="kpi"><b>CORS proxy</b><span>Browser fetch path</span></div>
      </div>
      <div class="about-card">
        <div class="section-row-title" style="margin-bottom:.6rem">What this file is</div>
        <p style="color:var(--muted);line-height:1.75;font-size:.9rem">
          Single HTML application. Brand is goarxyz — goar in white, xyz○□△✕ in anime purple.
          Same stack as AnimeDb / AnimeWeb. Catalog media from AniList GraphQL
          (https://graphql.anilist.co). Indexed MAL IDs and live sites from
          https://ccguvycu.github.io/animedb-site/api/config.json,
          anime-ids.json, and sites.json. Jikan v4 fills gaps in the background.
        </p>
      </div>
      <div class="about-card">
        <div class="section-row-title" style="margin-bottom:.6rem">Open Anime API</div>
        <p style="color:var(--muted);line-height:1.75;font-size:.9rem;margin-bottom:.8rem">
          Player source Open Anime calls GET /api/stream?title=&amp;episode= on this base
          (Zcross091/Open-Anime-API). Default is local Command Center port 3000.
        </p>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <input id="oaaInput" value="${esc(S.oaaBase())}" style="flex:1;min-width:220px;background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:.5rem .8rem;color:var(--text);font-size:.84rem">
          <button class="btn btn-primary btn-sm" id="oaaSave">Save base</button>
          <button class="btn btn-ghost btn-sm" id="oaaPing">Ping</button>
        </div>
        <div id="oaaStatus" style="margin-top:.65rem;font-size:.78rem;color:var(--dim)">idle</div>
      </div>
      <div class="about-card">
        <div class="section-row-title" style="margin-bottom:.6rem">How fetch works</div>
        <p style="color:var(--muted);line-height:1.75;font-size:.9rem">
          Boot pulls config.json, anime-ids.json, and sites.json from GitHub Pages,
          then raw.githubusercontent.com if Pages is blocked. AniList is POST to
          graphql.anilist.co. Jikan and site probes use the same proxy chain. Results persist
          in localStorage.
        </p>
      </div>
    </div>`;
  $("#oaaSave").onclick = () => {
    S.setOaaBase($("#oaaInput").value);
    $("#oaaInput").value = S.oaaBase();
    toast("Open Anime base saved");
  };
  $("#oaaPing").onclick = async () => {
    $("#oaaStatus").textContent = "pinging " + S.oaaBase();
    try {
      const st = await OAA.stats();
      $("#oaaStatus").textContent = (st.status || "online") + " · " + (st.mode || "") + " · " + (st.totalLinks != null ? st.totalLinks + " cached links" : "");
    } catch (e) {
      $("#oaaStatus").textContent = "offline · " + (e.message || e);
    }
  };
}

const AUTO = {
  sitesMs: 12 * 60 * 60 * 1000,
  idsMs: 24 * 60 * 60 * 1000,
  lockMs: 40 * 60 * 1000
};

function isStale(ts, maxMs) {
  if (!ts) return true;
  const n = Date.parse(ts);
  if (!Number.isFinite(n)) return true;
  return Date.now() - n > maxMs;
}

function acquireLock(key) {
  const now = Date.now();
  const lock = S._get(key);
  if (lock && now - lock.ts < AUTO.lockMs) return false;
  S._set(key, { ts: now });
  return true;
}

function releaseLock(key) {
  try { localStorage.removeItem(key); } catch {}
}

async function hiddenScrapeIds() {
  if (!acquireLock("goar_lock_ids")) return;
  try {
    const pack = S.ids();
    if (!isStale(pack.updated, AUTO.idsMs)) return;
    const eps = buildEndpoints();
    const existing = new Set(pack.ids);
    const found = new Set(existing);
    await poolMap(eps, 3, async ([ep, params]) => {
      await sleep(350);
      const url = new URL(JIKAN + ep);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      try {
        const r = await proxyFetch(url.toString());
        if (r.status === 429) { await sleep(2500); return; }
        if (!r.ok) return;
        const data = (await r.json()).data || [];
        data.forEach(a => { if (a?.mal_id) found.add(a.mal_id); });
      } catch {}
    });
    const all = [...found].sort((a, b) => a - b);
    if (all.length >= existing.size) S.setIds(all);
  } finally {
    releaseLock("goar_lock_ids");
  }
}

async function hiddenScrapeSites() {
  if (!acquireLock("goar_lock_sites")) return;
  try {
    const pack = S.sites();
    if (!isStale(pack.updated, AUTO.sitesMs)) return;
    const results = [];
    await poolMap(MASTER_SITES, 8, async (entry) => {
      const [name, url, tag, top] = entry;
      let live = false;
      try {
        const r = await proxyFetch(url, { method: "GET", redirect: "follow" }, 8000);
        live = r.status > 0 && r.status < 500;
      } catch {
        live = false;
      }
      results.push({ name, url, tag, top, live });
    });
    const tagOrder = { sub: 0, both: 1, dub: 2, official: 3, manga: 4 };
    const seen = new Set();
    const liveSites = [];
    results.filter(s => s.live).forEach(s => {
      const key = s.url.replace(/\/$/, "");
      if (seen.has(key)) return;
      seen.add(key);
      const rec = { name: s.name, url: s.url, tag: s.tag };
      if (s.top) rec.top = true;
      liveSites.push(rec);
    });
    liveSites.sort((a, b) => (tagOrder[a.tag] ?? 9) - (tagOrder[b.tag] ?? 9) || Number(!a.top) - Number(!b.top) || a.name.localeCompare(b.name));
    if (liveSites.length >= 8) S.setSites(liveSites);
  } finally {
    releaseLock("goar_lock_sites");
  }
}

const ANIMEDB = {
  config: "https://ccguvycu.github.io/animedb-site/api/config.json",
  ids: "https://ccguvycu.github.io/animedb-site/api/anime-ids.json",
  sites: "https://ccguvycu.github.io/animedb-site/api/sites.json",
  rawConfig: "https://raw.githubusercontent.com/CCguvycu/animedb-site/main/api/config.json",
  rawIds: "https://raw.githubusercontent.com/CCguvycu/animedb-site/main/api/anime-ids.json",
  rawSites: "https://raw.githubusercontent.com/CCguvycu/animedb-site/main/api/sites.json"
};
const SITE_URL_FIX = { "https://animepahe.ru/": "https://animepahe.su/" };
const SITE_DROP = {
  "https://animixplay.to/": 1,
  "https://aniplay.tv/": 1,
  "https://animewave.net/": 1,
  "https://www.voiranime.art/": 1,
  "https://www.funimation.com/": 1,
  "https://kaguya.app/": 1
};

async function fetchJsonChain(urls) {
  let last;
  for (const u of urls) {
    try {
      const r = await proxyFetch(u);
      if (!r.ok) { last = new Error("HTTP " + r.status); continue; }
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last || new Error("JSON fetch failed");
}

function ingestSites(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach(s => {
    const url = SITE_URL_FIX[s.url] || s.url;
    if (SITE_DROP[url] || SITE_DROP[s.url]) return;
    const key = url.replace(/\/$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(Object.assign({}, s, { url }));
  });
  return out;
}

async function loadAnimeDb() {
  if (window.__goarDbLoad) return window.__goarDbLoad;
  window.__goarDbLoad = (async () => {
    const cfg = await fetchJsonChain([ANIMEDB.config, ANIMEDB.rawConfig]);
    if (Array.isArray(cfg.featured_ids) && cfg.featured_ids.length) {
      window.GOAR_FEATURED = cfg.featured_ids;
    }
    const idsUrl = cfg.anime_ids_url || ANIMEDB.ids;
    const sitesUrl = cfg.sites_url || ANIMEDB.sites;
    const [idsPack, sitesPack] = await Promise.all([
      fetchJsonChain([idsUrl, ANIMEDB.ids, ANIMEDB.rawIds]).catch(() => null),
      fetchJsonChain([sitesUrl, ANIMEDB.sites, ANIMEDB.rawSites]).catch(() => null)
    ]);
    if (idsPack?.ids?.length) {
      const merged = [...new Set([...(idsPack.ids || []), ...(S.ids().ids || [])])].sort((a, b) => a - b);
      S.setIds(merged);
    }
    if (sitesPack?.sites?.length) {
      const live = ingestSites(sitesPack.sites);
      if (live.length >= 8) S.setSites(live);
    }
    return cfg;
  })();
  return window.__goarDbLoad;
}

function startHiddenScrapers() {
  if (window.__goarAuto) return;
  window.__goarAuto = true;
  loadAnimeDb().catch(() => {});
  const boot = () => {
    hiddenScrapeSites().catch(() => {});
    hiddenScrapeIds().catch(() => {});
  };
  setTimeout(boot, 1800);
  setInterval(boot, AUTO.sitesMs);
}

function buildEndpoints() {
  const eps = [];
  for (let p = 1; p <= 31; p++) eps.push(["/top/anime", { page: p, limit: 25 }]);
  for (const f of ["airing", "upcoming", "bypopularity", "favorite"]) {
    for (let p = 1; p <= 3; p++) eps.push(["/top/anime", { filter: f, page: p, limit: 25 }]);
  }
  for (const t of ["tv", "movie", "ova", "special", "music", "ona"]) {
    for (let p = 1; p <= 4; p++) eps.push(["/top/anime", { type: t, page: p, limit: 25 }]);
  }
  eps.push(["/seasons/now", {}]);
  eps.push(["/seasons/upcoming", {}]);
  for (let year = 2015; year <= 2026; year++) {
    for (const season of ["winter", "spring", "summer", "fall"]) {
      if (year === 2025 && (season === "summer" || season === "fall")) continue;
      eps.push([`/seasons/${year}/${season}`, { page: 1 }]);
      if (year >= 2020) eps.push([`/seasons/${year}/${season}`, { page: 2 }]);
      if (year >= 2023) eps.push([`/seasons/${year}/${season}`, { page: 3 }]);
    }
  }
  const genreIds = [1,2,4,7,8,9,10,13,14,17,18,19,20,22,23,24,25,27,29,30,31,36,37,38,39,40,41,42,43,46,47,48,49,50,51,52];
  for (const gid of genreIds) {
    for (let p = 1; p <= 2; p++) eps.push(["/anime", { genres: gid, order_by: "score", sort: "desc", page: p, limit: 25 }]);
    eps.push(["/anime", { genres: gid, order_by: "members", sort: "desc", page: 1, limit: 25 }]);
  }
  for (const term of ["manga","novel","game","original","remake","idol","sports","school","magic","robot","slice","battle","fantasy","isekai","romance","horror","comedy","drama","mystery","history"]) {
    eps.push(["/anime", { q: term, order_by: "members", sort: "desc", limit: 25 }]);
  }
  return eps;
}

async function setDocTitle(s) {
  document.title = s ? s + " — goarxyz" : "goarxyz — Anime Catalog";
}

function viewHistory() {
  setActiveNav("list");
  setDocTitle("Continue watching");
  const hist = S.history();
  $("#app").innerHTML = `<div class="page-wrap"><div class="crumb"><a href="#/" data-link>Home</a> / History</div><div class="page-title">Continue watching</div><div class="page-sub">${hist.length} recent title${hist.length===1?"":"s"} on this device</div><div class="grid" id="grid"></div></div>`;
  if (!hist.length) {
    $("#grid").innerHTML = `<div class="empty"><div class="empty-title">No history yet</div><div class="empty-body">Start an episode and it will land here.</div></div>`;
    return;
  }
  hist.forEach(item => {
    const fake = { id: item.id, title: { english: item.title, romaji: item.title }, coverImage: { large: item.img, extraLarge: item.img } };
    const c = card(fake);
    c.addEventListener("click", ev => { ev.stopPropagation(); go("/watch/" + item.id + "/" + (item.ep || 1)); });
    $("#grid").appendChild(c);
  });
}

function viewLegal(kind) {
  setActiveNav("about");
  const pages = {
    privacy: {
      title: "Privacy",
      body: `<p>goarxyz runs entirely in your browser. There is no account, no server-side login, and no analytics pixel from this file.</p>
        <h2>What stays on your device</h2>
        <ul><li>My List and watch progress in localStorage</li><li>Continue-watching history</li><li>Cached AniList responses in sessionStorage</li><li>Site directory and MAL ID index after the first refresh</li></ul>
        <p>Privacy questions: <a href="mailto:admin@goarxyz.com">admin@goarxyz.com</a>. The same address is on the <a href="/legal/privacy.html">site privacy page</a>.</p>`
    },
    terms: {
      title: "Terms of use",
      body: `<p>This page is a catalog interface. It does not host video files. Embeds load from independent player services. Official platforms remain the correct place to watch licensed titles in your region.</p>
        <h2>Fair use of this file</h2>
        <ul><li>Use it as a personal catalog and discovery tool</li><li>Do not present it as an official distributor</li><li>Do not use it to attack, scrape abusively, or overload upstream APIs</li></ul>
        <p>Metadata and artwork belong to AniList, the studios, and the listed sites. goarxyz claims no ownership of that material.</p>`
    },
    dmca: {
      title: "Copyright",
      body: `<p>goarxyz does not store, transcode, or serve episode files. If you represent a rights holder, take down requests belong with the embed host or the directory site that is actually serving the stream.</p>
        <p>For this interface, write to <a href="mailto:admin@goarxyz.com">admin@goarxyz.com</a> with the page and the title. See the <a href="/legal/copyright.html">copyright page</a>.</p>`
    },
    contact: {
      title: "Contact",
      body: `<p>Email <a href="mailto:admin@goarxyz.com">admin@goarxyz.com</a>.</p>
        <p>Catalog data: AniList GraphQL and Jikan v4. Playback is the goarxyz player. Site-wide privacy, terms, and copyright notices are on the <a href="/legal/contact.html">contact page</a>.</p>`
    }
  };
  const page = pages[kind];
  if (!page) return viewHome();
  setDocTitle(page.title);
  $("#app").innerHTML = `<div class="page-wrap legal"><div class="crumb"><a href="#/" data-link>Home</a> / ${page.title}</div><div class="page-title">${page.title}</div>${page.body}</div>`;
}

function viewNotFound() {
  setActiveNav("home");
  setDocTitle("Not found");
  $("#app").innerHTML = `<div class="page-wrap"><div class="page-title">Page not found</div><div class="page-sub">That route is not part of goarxyz.</div><p style="margin-top:1rem"><a class="btn btn-primary" href="#/" data-link>Back to home</a></p></div>`;
}

function route() {
  const { parts, params } = parseHash();
  const root = parts[0] || "home";
  document.body.classList.toggle("cinema", root === "watch");
  window.scrollTo(0, 0);
  if (root === "catalog") return viewCatalog(params);
  if (root === "movies") return viewMovies();
  if (root === "list") return viewList();
  if (root === "browse") return viewBrowse(params);
  if (root === "about") return viewAbout();
  if (root === "history") return viewHistory();
  if (root === "privacy") return viewLegal("privacy");
  if (root === "terms") return viewLegal("terms");
  if (root === "dmca") return viewLegal("dmca");
  if (root === "contact") return viewLegal("contact");
  if (root === "search") return viewSearch(params);
  if (root === "anime" && parts[1]) return viewAnime(parts[1]);
  if (root === "watch" && parts[1]) return viewWatch(parts[1], parts[2] || params.ep || 1);
  if (root === "home" || root === "") return viewHome();
  return viewNotFound();
}

function initSearch() {
  const inp = $("#navSearch");
  const drop = $("#searchDrop");
  let debounce;
  inp.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = inp.value.trim();
    if (q.length < 2) { drop.classList.remove("open"); return; }
    debounce = setTimeout(async () => {
      try {
        const d = await gql(Q.search, { s: q, p: 1 });
        const items = d.Page.media.slice(0, 6);
        if (!items.length) {
          drop.innerHTML = '<div style="padding:1rem;color:var(--dim);font-size:.82rem">No results</div>';
        } else {
          drop.innerHTML = items.map(a => {
            const t = fmt.title(a);
            return `<div class="sdrop-item" data-id="${a.id}">
              <img src="${a.coverImage?.large || ""}" alt="" loading="lazy" onerror="this.style.display='none'">
              <div><div class="sdrop-title">${esc(t)}</div><div class="sdrop-meta">${fmt.status(a.status)} · ${a.episodes || "?"} ep</div></div>
            </div>`;
          }).join("");
          $$(".sdrop-item", drop).forEach(el => el.addEventListener("click", () => { drop.classList.remove("open"); go(`/anime/${el.dataset.id}`); }));
        }
        drop.classList.add("open");
      } catch (e) { console.error(e); }
    }, 280);
  });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter" && inp.value.trim()) {
      drop.classList.remove("open");
      go(`/search?q=${encodeURIComponent(inp.value.trim())}`);
    }
    if (e.key === "Escape") drop.classList.remove("open");
  });
  document.addEventListener("click", e => {
    if (!inp.contains(e.target) && !drop.contains(e.target)) drop.classList.remove("open");
  });
}

document.addEventListener("click", e => {
  const a = e.target.closest("a[data-link]");
  if (!a) return;
  const href = a.getAttribute("href") || "";
  if (href.startsWith("#")) {
    e.preventDefault();
    location.hash = href.slice(1);
    $("#navLinks").classList.remove("open");
  }
});
$("#navBurger").addEventListener("click", () => $("#navLinks").classList.toggle("open"));
window.addEventListener("hashchange", route);
initSearch();
(function applyOaaFromHash() {
  const { params } = parseHash();
  if (params.oaa) S.setOaaBase(params.oaa);
})();
const yn = document.getElementById("yearNow"); if (yn) yn.textContent = new Date().getFullYear();
route();
startHiddenScrapers();
