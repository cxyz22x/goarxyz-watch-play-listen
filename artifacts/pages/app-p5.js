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
async function buildHubsTab(){
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
