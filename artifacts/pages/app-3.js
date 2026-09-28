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
      const [m,t] = await Promise.all([provDiscoverSafe(p.id, REGION, "movie", { ...cfg, sortBy: "popularity.desc" }), provDiscoverSafe(p.id, REGION, "tv", { ...cfg, sortBy: "popularity.desc" })]);
      railInto(el, mergeTwo(m, t, cmpPop).slice(0, 16));
    } catch(e){ el.innerHTML = '<div class="loader err small">Couldn\'t load ' + p.name + '.</div>'; }
  }
}

/* ================= GRID VIEWS ================= */
function openGrid(title){
  document.getElementById("hero").style.display = "none";
  document.getElementById("mainContent").style.display = "none";
  document.getElementById("gridView").classList.add("open");
  document.getElementById("gridTitle").textContent = title;
  const grid = document.getElementById("gridGrid");
  grid.innerHTML = '<div class="loader">Loading…</div>';
  return grid;
}
document.getElementById("gridBack").onclick = () => {
  document.getElementById("gridView").classList.remove("open");
  document.getElementById("hero").style.display = "";
  document.getElementById("mainContent").style.display = "";
};
async function showGenreGrid(genre, scope){
  const grid = openGrid(genre.name);
  try {
    let merged = [];
    if (scope==="movie" || scope==="all"){ const m = await tmdb("/discover/movie",{with_genres:genre.id, sort_by:"popularity.desc", include_adult:false}); merged.push(...m.results.map(x=>({...x,media_type:"movie"}))); }
    if (scope==="tv" || scope==="all"){ const t = await tmdb("/discover/tv",{with_genres:genre.id, sort_by:"popularity.desc", include_adult:false}); merged.push(...t.results.map(x=>({...x,media_type:"tv"}))); }
    merged = mergeTwo(merged.filter(x=>x.media_type==="movie"), merged.filter(x=>x.media_type==="tv"), cmpPop);
    grid.innerHTML=""; merged.forEach((i,idx)=>grid.appendChild(card(i, {}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showAnimeGenreGrid(g){
  const grid = openGrid("Anime · " + g.name);
  try { const items = await animeDiscover({with_genres:"16," + g.id, sort_by:"popularity.desc"}); grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {}, idx))); }
  catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showAnime(kind){
  const titles = {new:"New Anime Releases", popular:"Popular Anime", top:"Top Rated Anime", movies:"Anime Movies", airing:"Airing Anime"};
  const grid = openGrid(titles[kind]);
  try {
    let items;
    if (kind==="new") items = await animeDiscover({sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":5});
    else if (kind==="top") items = await animeDiscover({sort_by:"vote_average.desc","vote_count.gte":100});
    else if (kind==="movies") items = await animeDiscover({sort_by:"popularity.desc"},"movie");
    else if (kind==="airing") items = await animeDiscover({sort_by:"popularity.desc","first_air_date.lte":TODAY,"vote_count.gte":10},"tv");
    else items = await animeDiscover({sort_by:"popularity.desc"});
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showSpecial(kind){
  const titles = {
    trending:"Trending Now", new:"New Releases", toprated:"Top Rated",
    new_movie:"New Movie Releases", trend_movie:"Trending Movies", top_movie:"Top Rated Movies",
    now_movie:"In Theaters", upcoming_movie:"Coming Soon", pop_movie:"Popular Movies",
    new_tv:"New TV Releases", trend_tv:"Trending TV Shows", top_tv:"Top Rated TV Shows",
    airing_tv:"Airing Today", onair_tv:"On The Air", pop_tv:"Popular TV Shows"
  };
  const grid = openGrid(titles[kind] || kind);
  try {
    let items = [];
    if (kind==="trending") items = (await tmdb("/trending/all/week")).results;
    else if (kind==="new"){
      const [m,t] = await Promise.all([
        tmdb("/discover/movie",{sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":30,include_adult:false}),
        tmdb("/discover/tv",{sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":15,include_adult:false})
      ]);
      items = mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})),cmpDate);
    } else if (kind==="toprated"){
      const [m,t] = await Promise.all([tmdb("/movie/top_rated"), tmdb("/tv/top_rated")]);
      items = mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})),cmpRating);
    }
    else if (kind==="new_movie") items = (await tmdb("/discover/movie",{sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":30,include_adult:false})).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="trend_movie") items = (await tmdb("/trending/movie/week")).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="top_movie") items = (await tmdb("/movie/top_rated")).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="now_movie") items = (await tmdb("/movie/now_playing",{region:REGION})).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="upcoming_movie") items = (await tmdb("/movie/upcoming",{region:REGION})).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="pop_movie") items = (await tmdb("/movie/popular")).results.map(x=>({...x,media_type:"movie"}));
    else if (kind==="new_tv") items = (await tmdb("/discover/tv",{sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":15,include_adult:false})).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="trend_tv") items = (await tmdb("/trending/tv/week")).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="top_tv") items = (await tmdb("/tv/top_rated")).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="airing_tv") items = (await tmdb("/tv/airing_today")).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="onair_tv") items = (await tmdb("/tv/on_the_air")).results.map(x=>({...x,media_type:"tv"}));
    else if (kind==="pop_tv") items = (await tmdb("/tv/popular")).results.map(x=>({...x,media_type:"tv"}));
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}

/* ================= CATEGORY BAR ================= */
const PREDEFINED = [
  {label:"Trending", fn:()=>showSpecial("trending")},
  {label:"New Releases", fn:()=>showSpecial("new")},
  {label:"Top Rated", fn:()=>showSpecial("toprated")},
  {label:"In Theaters", fn:()=>showSpecial("now_movie")},
  {label:"Coming Soon", fn:()=>showSpecial("upcoming_movie")},
  {label:"Anime", fn:()=>showAnime("popular")},
  {label:"Kids", fn:()=>showKids("popular")},
  {label:"Music", fn:()=>showMusic("trend")},
  {label:"Action", fn:()=>showGenreGrid({id:28,name:"Action"},"all")},
  {label:"Comedy", fn:()=>showGenreGrid({id:35,name:"Comedy"},"all")},
  {label:"Horror", fn:()=>showGenreGrid({id:27,name:"Horror"},"all")},
  {label:"Sci-Fi", fn:()=>showGenreGrid({id:878,name:"Science Fiction"},"all")},
  {label:"Romance", fn:()=>showGenreGrid({id:10749,name:"Romance"},"all")},
  {label:"Documentary", fn:()=>showGenreGrid({id:99,name:"Documentary"},"all")},
];
function buildCatBar(){
  const bar = document.getElementById("catBar"); bar.innerHTML = "";
  PREDEFINED.forEach(p => { const c = document.createElement("div"); c.className = "cat-chip"; c.textContent = p.label; c.onclick = () => p.fn(); bar.appendChild(c); });
}

/* ================= REGION ================= */
const REGIONS = [["US","United States"],["GB","United Kingdom"],["CA","Canada"],["AU","Australia"],["NZ","New Zealand"],["IE","Ireland"],["DE","Germany"],["FR","France"],["ES","Spain"],["IT","Italy"],["NL","Netherlands"],["SE","Sweden"],["NO","Norway"],["DK","Denmark"],["FI","Finland"],["PL","Poland"],["PT","Portugal"],["BR","Brazil"],["MX","Mexico"],["AR","Argentina"],["JP","Japan"],["KR","South Korea"],["IN","India"],["ID","Indonesia"],["PH","Philippines"],["TH","Thailand"],["SG","Singapore"],["MY","Malaysia"],["ZA","South Africa"],["AE","United Arab Emirates"],["TR","Türkiye"],["RU","Russia"]];
function buildRegionSelect(){
  const sel = document.getElementById("regionSelect");
  sel.innerHTML = REGIONS.map(([c]) => '<option value="' + c + '"' + (c===REGION?' selected':'') + '>' + c + '</option>').join("");
  if (!regionChangeHooked){
    sel.onchange = () => {
      REGION = sel.value;
      try { localStorage.setItem("goar_region", REGION); } catch(e){}
      providerMapCache = {};
      toast("Region: " + REGION);
      if (document.body.classList.contains("prov-mode")) routeTo("hubs");
      else if (activeTab === "hubs") buildHubsTab();
      else routeTo(activeTab);
    };
    regionChangeHooked = true;
  }
}

/* ================= NAV ================= */
function setActiveTab(tab){
  activeTab = tab;
  document.querySelectorAll("nav a[data-tab]").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  document.querySelectorAll(".pill-item[data-tab]").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  document.getElementById("gridView").classList.remove("open");
  document.getElementById("hero").style.display = "";
  document.getElementById("mainContent").style.display = "";
}
function routeTo(tab){
  const gridOpen = document.getElementById("gridView").classList.contains("open");
  if (activeTab === tab && !document.body.classList.contains("prov-mode") && !gridOpen) return;
  setActiveTab(tab);
  const main = document.getElementById("mainContent");
  main.style.transition = "opacity .15s";
  main.style.opacity = "0.3";
  setTimeout(() => {
    if (tab==="movie") buildMovieTab();
    else if (tab==="tv") buildTVTab();
    else if (tab==="anime") buildAnimeTab();
    else if (tab==="kids") buildKidsTab();
    else if (tab==="music") buildMusicTab();
    else if (tab==="hubs") buildHubsTab();
    else if (tab==="list") buildListTab();
    else buildHome();
    main.style.opacity = "1";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 60);
}
document.querySelectorAll("nav a[data-tab]").forEach(a => a.addEventListener("click", () => routeTo(a.dataset.tab)));

async function buildListTab(){
  const main = document.getElementById("mainContent"); exitProvMode();
  document.getElementById("hero").style.display = "none";
  main.innerHTML = "";
  const sec = document.createElement("div");
  sec.className = "section";
  sec.innerHTML = '<div class="section-head"><div><h2>My List</h2><p>' + watchlist.length + ' saved title' + (watchlist.length===1?'':'s') + '</p></div></div>';
  const gridWrap = document.createElement("div");
  gridWrap.className = "grid";
  gridWrap.style.padding = "0 5vw";
  gridWrap.style.display = "grid";
  gridWrap.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))";
  gridWrap.style.gap = "16px";
  sec.appendChild(gridWrap);
  main.appendChild(sec);
  if (!watchlist.length){
    gridWrap.outerHTML = '<div class="loader" style="padding:60px 5vw;">Nothing saved yet. Tap the ★ on any card or in a title\'s detail view.</div>';
    return;
  }
  watchlist.forEach((w,i) => {
    const item = { id:w.id, title:w.title, name:w.title, poster_path:w.poster, vote_average:w.rating, release_date:w.date, _forceType:w.type };
    gridWrap.appendChild(card(item, {}, i));
  });
}

const PILL_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  movie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 3l4 3 4-3"/></svg>',
  anime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>',
  kids: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>'
};
function buildPillNav(){
  const pn = document.getElementById("pillNav");
  const items = [
    {tab:"home", label:"Home"}, {tab:"movie", label:"Movies"}, {tab:"tv", label:"TV"},
    {tab:"anime", label:"Anime"}, {tab:"kids", label:"Kids"}, {tab:"music", label:"Music"},
    {tab:"list", label:"List"}
  ];
  pn.innerHTML = items.map(it =>
    '<div class="pill-item ' + (it.tab==="home"?"active":"") + ' ' + (it.tab==="music"?"music":"") + ' ' + (it.tab==="kids"?"kids":"") + ' ' + (it.tab==="list"?"list":"") + '" data-tab="' + it.tab + '">' +
    PILL_ICONS[it.tab] + '<span>' + it.label + '</span></div>'
  ).join("");
  pn.querySelectorAll(".pill-item[data-tab]").forEach(el => el.addEventListener("click", () => routeTo(el.dataset.tab)));
}

/* ================= SEARCH ================= */
let searchTimer;
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q){ searchResults.classList.remove("open"); return; }
  searchTimer = setTimeout(async () => {
    try {
      const data = await tmdb("/search/multi",{query:q, include_adult:false});
      const items = data.results.filter(r => (r.media_type==="movie"||r.media_type==="tv") && r.poster_path).slice(0,10);
      searchResults.innerHTML = items.map(item => {
        const isMusic = (item.genre_ids||[]).includes(MUSIC_GENRE_ID);
        const isKids = (item.genre_ids||[]).some(id => id===10751 || id===16) && !isMusic;
        const label = isMusic ? "Music" : (isKids ? "Kids" : (item.media_type==="movie"?"Movie":"TV"));
        return '<div class="sr-item" data-id="' + item.id + '" data-type="' + item.media_type + '">' +
          '<img src="' + posterImg(item,"w92") + '" alt="' + titleOf(item) + '">' +
          '<div><div class="sr-t">' + titleOf(item) + '</div>' +
          '<div class="sr-m">' + yearOf(item) + ' · ' + label + (item.vote_average ? " · ★ " + item.vote_average.toFixed(1) : "") + '</div></div></div>';
      }).join("") || '<div class="sr-item"><div class="sr-m">No results</div></div>';
      searchResults.classList.add("open");
      searchResults.querySelectorAll(".sr-item[data-id]").forEach(el => {
        el.onclick = () => { openModal(el.dataset.id, el.dataset.type); searchResults.classList.remove("open"); searchInput.value = ""; };
      });
    } catch(e){
      searchResults.innerHTML = '<div class="sr-item"><div class="sr-m">Search failed: ' + e.message + '</div></div>';
      searchResults.classList.add("open");
    }
  }, 300);
});
document.addEventListener("click", e => { if (!e.target.closest(".search-wrap")) searchResults.classList.remove("open"); });

/* ================= MODAL ================= */
const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");
function miniCard(item, idx, type){
  return '<div class="mini-card anim-up" style="animation-delay:' + (idx*35) + 'ms" data-id="' + item.id + '" data-type="' + type + '">' +
    '<div class="mc-img"><img loading="lazy" src="' + posterImg(item,"w342") + '" alt=""><div class="mc-rating">★ ' + ratingOf(item) + '</div></div>' +
    '<div class="mc-title">' + titleOf(item) + '</div></div>';
}
let modalToken = 0;
async function openModal(id, type, focusWatch=false){
  const myToken = ++modalToken;
  modalBackdrop.classList.add("open");
  modalContent.innerHTML = '<div class="loader">Loading details…</div>';
  try {
    const data = await tmdb("/" + type + "/" + id, {append_to_response:"credits,videos,external_ids,similar,recommendations"});
    if (myToken !== modalToken) return;
    const imdbId = data.external_ids && data.external_ids.imdb_id;
    const videos = (data.videos && data.videos.results || []).filter(v => v.site==="YouTube").slice(0,6);
    const trailer = videos.find(v => v.type==="Trailer");
    const runtime = data.runtime ? (data.runtime + " min") : (data.episode_run_time && data.episode_run_time[0] ? (data.episode_run_time[0] + " min/ep") : (data.number_of_seasons ? (data.number_of_seasons + " season" + (data.number_of_seasons>1?'s':'')) : ""));
    const cast = ((data.credits && data.credits.cast) || []).filter(c => c.profile_path).slice(0,14);
    const similar = ((data.similar && data.similar.results) || []).filter(r => r.poster_path).slice(0,10);
    const recs = ((data.recommendations && data.recommendations.results) || []).filter(r => r.poster_path).slice(0,10);
    const saved = isSaved(id, type);
    modalContent.innerHTML =
      '<div class="modal-hero" style="background-image:url(' + backdropImg(data) + ')"><button class="modal-close" id="modalCloseBtn">✕</button></div>' +
      '<div class="modal-body">' +
      '<h2>' + titleOf(data) + '</h2>' +
      (data.tagline ? '<div class="modal-tagline">' + data.tagline + '</div>' : '') +
      '<div class="modal-meta">' +
      '<span style="color:var(--accent); font-weight:700;">★ ' + ratingOf(data) + '</span>' +
      '<span>' + yearOf(data) + '</span>' +
      (runtime ? '<span>' + runtime + '</span>' : '') +
      '<span>' + (type==="movie" ? "Movie" : "TV Show") + '</span>' +
      '</div>' +
      '<div class="modal-genres">' + (data.genres||[]).map(g => '<span>' + g.name + '</span>').join("") + '</div>' +
      '<div class="modal-overview">' + (data.overview || "No overview available.") + '</div>' +
      '<div class="modal-watch">' +
      '<button class="btn btn-play" id="modalPlay">▶ Watch Now</button>' +
      '<button class="btn-icon ' + (saved?'saved':'') + '" id="modalSave">' + bookmarkSvg(saved) + '</button>' +
      (trailer ? '<button class="btn btn-ghost" id="modalTrailer">▶ Trailer</button>' : '') +
      '<span class="modal-watch-note">' + (type==="tv" ? "Starts at Season 1, Episode 1." : "Plays through encrypted WISP tunnel.") + '</span></div>' +
      (cast.length ? '<div class="modal-section"><div class="modal-section-title">Top Cast</div><div class="cast-rail">' +
        cast.map(c => '<div class="cast-card"><img class="cast-img" loading="lazy" src="' + profileImg(c.profile_path) + '" alt=""><div class="cast-name">' + c.name + '</div><div class="cast-role">' + (c.character||"") + '</div></div>').join("") +
        '</div></div>' : '') +
      (similar.length ? '<div class="modal-section"><div class="modal-section-title">Similar</div><div class="mini-rail">' + similar.map((r,i)=>miniCard(r,i,type)).join("") + '</div></div>' : '') +
      (recs.length ? '<div class="modal-section"><div class="modal-section-title">You Might Also Like</div><div class="mini-rail">' + recs.map((r,i)=>miniCard(r,i,type)).join("") + '</div></div>' : '') +
      '<div class="modal-links" style="margin-top:26px;">' +
      '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.themoviedb.org/' + type + '/' + id + '">TMDB</a>' +
      (imdbId ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.imdb.com/title/' + imdbId + '/">IMDb</a>' : '') +
      '</div></div>';

    document.getElementById("modalCloseBtn").onclick = closeModal;
    document.getElementById("modalPlay").onclick = () => openPlayer(id, type, titleOf(data), data);
    document.getElementById("modalSave").onclick = () => {
      toggleSave(data, type);
      const s = isSaved(id, type);
      const mb = document.getElementById("modalSave");
      mb.classList.toggle("saved", s); mb.innerHTML = bookmarkSvg(s);
    };
    const trBtn = document.getElementById("modalTrailer");
    if (trBtn && trailer) trBtn.onclick = () => window.open("https://www.youtube.com/watch?v=" + trailer.key, "_blank");
    modalContent.querySelectorAll(".mini-card").forEach(mc => {
      mc.onclick = () => { closeModal(); setTimeout(() => openModal(mc.dataset.id, mc.dataset.type), 100); };
    });
  } catch(e){
    if (myToken !== modalToken) return;
    modalContent.innerHTML = '<div class="loader err">Couldn\'t load details.<br><code>' + e.message + '</code><br><button class="btn btn-ghost" id="modalCloseBtn2" style="margin-top:10px;">Close</button></div>';
    document.getElementById("modalCloseBtn2").onclick = closeModal;
  }
}
function closeModal(){ modalBackdrop.classList.remove("open"); modalContent.innerHTML = ""; }
modalBackdrop.addEventListener("click", e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape"){
    if (document.getElementById("playerOverlay").classList.contains("open")) closePlayer();
    else closeModal();
  }
  if (e.key === "/" && !e.target.matches("input,select,textarea")){ e.preventDefault(); searchInput.focus(); }
});

/* ================= BOOT ================= */
try { const saved = localStorage.getItem("goar_region"); if (saved) REGION = saved; } catch(e){}
buildRegionSelect();
buildCatBar();
buildPillNav();
buildHome();

buildWispSelect();
setTimeout(() => {
  ensureLibcurl().then(() => buildWispSelect()).catch(e => {
    console.warn("WISP warm-up failed:", e && e.message ? e.message : e);
    buildWispSelect();
  });
}, 200);
