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
function genreChipsBar(list, onPick){
  const div = document.createElement("div"); div.className = "chips";
  list.forEach(g => { const c = document.createElement("div"); c.className = "chip"; c.textContent = g.name; c.onclick = () => onPick(g); div.appendChild(c); });
  return div;
}
function dedupeGenres(list){ const seen = new Set(); return list.filter(g => { if (seen.has(g.name)) return false; seen.add(g.name); return true; }); }

/* ================= PROVIDER PROFILES ================= */
const PROVIDER_CONTENT = {
  netflix:{monetization:"flatrate", recencyDays:365, minVotes:10},
  disney:{monetization:"flatrate", recencyDays:1095, minVotes:15},
  crunchyroll:{monetization:"flatrate", recencyDays:365, minVotes:5, genres:"16", originCountry:"JP"},
  prime:{monetization:"flatrate", recencyDays:365, minVotes:10},
  hulu:{monetization:"flatrate", recencyDays:365, minVotes:10},
  max:{monetization:"flatrate", recencyDays:730, minVotes:15},
  apple:{monetization:"flatrate", recencyDays:1095, minVotes:10},
  paramount:{monetization:"flatrate", recencyDays:365, minVotes:10},
  peacock:{monetization:"flatrate", recencyDays:365, minVotes:10},
  stan:{monetization:"flatrate", recencyDays:365, minVotes:10},
  binge:{monetization:"flatrate", recencyDays:365, minVotes:10},
  shudder:{monetization:"flatrate", recencyDays:730, minVotes:5, genres:"27"},
  mubi:{monetization:"flatrate", recencyDays:1095, minVotes:20},
  tubi:{monetization:"free,ads", recencyDays:1095, minVotes:5},
  pluto:{monetization:"free,ads", recencyDays:1095, minVotes:5},
  roku:{monetization:"free,ads", recencyDays:1095, minVotes:5}
};
const DEFAULT_PROVIDER_CONTENT = { monetization:"flatrate", recencyDays:365, minVotes:5 };

async function provDiscover(pid, region, kind, opts = {}){
  const isMovie = kind === "movie";
  const path = isMovie ? "/discover/movie" : "/discover/tv";
  const params = { with_watch_providers: pid, watch_region: region, include_adult: false, ...(opts.extra || {}) };
  if (opts.monetization) params.with_watch_monetization_types = opts.monetization;
  if (opts.sortBy) params.sort_by = opts.sortBy;
  if (opts.minVotes) params["vote_count.gte"] = opts.minVotes;
  if (opts.genres) params.with_genres = opts.genres;
  if (opts.originCountry) params.with_origin_country = opts.originCountry;
  if (opts.recencyDays){
    const key = isMovie ? "primary_release_date.gte" : "first_air_date.gte";
    params[key] = daysAgoISO(opts.recencyDays);
  }
  const res = await tmdb(path, params);
  return (res.results || []).map(x => ({ ...x, media_type: isMovie ? "movie" : "tv", _mediaType: isMovie ? "movie" : "tv" }));
}
async function provDiscoverSafe(pid, region, kind, opts){
  let results = await provDiscover(pid, region, kind, opts);
  if (!results.length && opts.monetization) results = await provDiscover(pid, region, kind, { ...opts, monetization: null });
  return results;
}

const PROVIDER_DESIGNS = {
  "netflix":{key:"netflix", style:"netflix", color:"#E50914", bg:"#000000", bg2:"#0a0a0a", accent:"#ff4d4d"},
  "disney plus":{key:"disney", style:"disney", color:"#1490E8", bg:"#040714", bg2:"#0a1128", accent:"#4da6ff"},
  "disney+":{key:"disney", style:"disney", color:"#1490E8", bg:"#040714", bg2:"#0a1128", accent:"#4da6ff"},
  "crunchyroll":{key:"crunchyroll", style:"crunchyroll", color:"#F47521", bg:"#000000", bg2:"#1a0d02", accent:"#ff9f5a"},
  "amazon prime video":{key:"prime", style:"prime", color:"#00A8E1", bg:"#0f171e", bg2:"#0a1216", accent:"#4dd0f0"},
  "prime video":{key:"prime", style:"prime", color:"#00A8E1", bg:"#0f171e", bg2:"#0a1216", accent:"#4dd0f0"},
  "hulu":{key:"hulu", style:"hulu", color:"#1CE783", bg:"#0b0b0b", bg2:"#0a1810", accent:"#5cf0a8"},
  "max":{key:"max", style:"max", color:"#4169E1", bg:"#000000", bg2:"#0a0f1f", accent:"#7b9dff"},
  "hbo max":{key:"max", style:"max", color:"#4169E1", bg:"#000000", bg2:"#0a0f1f", accent:"#7b9dff"},
  "apple tv plus":{key:"apple", style:"apple", color:"#F5F5F7", bg:"#000000", bg2:"#0a0a0a", accent:"#ffffff"},
  "apple tv+":{key:"apple", style:"apple", color:"#F5F5F7", bg:"#000000", bg2:"#0a0a0a", accent:"#ffffff"},
  "apple tv":{key:"apple", style:"apple", color:"#F5F5F7", bg:"#000000", bg2:"#0a0a0a", accent:"#ffffff"},
  "paramount plus":{key:"paramount", style:"paramount", color:"#0064FF", bg:"#000814", bg2:"#001033", accent:"#4d94ff"},
  "peacock":{key:"peacock", style:"peacock", color:"#FFCC00", bg:"#000000", bg2:"#1a1400", accent:"#ffdd4d"},
  "stan":{key:"stan", style:"stan", color:"#4FC3F7", bg:"#0a0a0a", bg2:"#041720", accent:"#7dd8ff"},
  "binge":{key:"binge", style:"binge", color:"#FF2D78", bg:"#000000", bg2:"#21050f", accent:"#ff6ba3"},
  "shudder":{key:"shudder", style:"shudder", color:"#E22020", bg:"#000000", bg2:"#1a0202", accent:"#ff5555"},
  "mubi":{key:"mubi", style:"mubi", color:"#FFD600", bg:"#000000", bg2:"#1a1600", accent:"#ffe666"},
  "tubi":{key:"tubi", style:"tubi", color:"#FA8147", bg:"#0a0a0a", bg2:"#201005", accent:"#ffab7a"},
  "pluto tv":{key:"pluto", style:"pluto", color:"#FFE01A", bg:"#000000", bg2:"#1a1800", accent:"#fff266"},
  "roku":{key:"roku", style:"roku", color:"#6C3FC5", bg:"#000000", bg2:"#0f0820", accent:"#a380ff"}
};
function getProviderDesign(name){
  const key = name.toLowerCase().trim();
  return PROVIDER_DESIGNS[key] || { key:"generic", style:"generic", color:"#5b8def", bg:"#0a0d18", bg2:"#0a0f1c", accent:"#8bb0ff" };
}

const DISNEY_BRANDS = [
  {label:"Disney", color:"#1a4fa0", bg:"linear-gradient(135deg,#0b2a5e,#041e4a)", cid:2},
  {label:"PIXAR", color:"#00a2e1", bg:"linear-gradient(135deg,#0a3a52,#041e2c)", cid:3},
  {label:"MARVEL", color:"#ec1d24", bg:"linear-gradient(135deg,#4a0205,#1c0202)", cid:420},
  {label:"STAR WARS", color:"#ffb400", bg:"linear-gradient(135deg,#4a3a00,#1c1400)", cid:1},
  {label:"Nat Geo", color:"#ffcc00", bg:"linear-gradient(135deg,#4a3d00,#1c1600)", cid:7521},
  {label:"20th Century", color:"#c8a35a", bg:"linear-gradient(135deg,#3a2d10,#1c1508)", cid:25}
];

/* ================= KIDS & MUSIC ================= */
const KIDS_GENRES = "10751|16";
async function kidsDiscover(extra={}, kind="both"){
  const calls = [];
  if (kind==="both" || kind==="movie") calls.push(tmdb("/discover/movie",{with_genres:KIDS_GENRES, certification_country:"US","certification.lte":"PG", include_adult:false, ...extra}).then(r=>r.results.map(x=>({...x,_forceType:"kids",_realType:"movie"}))));
  if (kind==="both" || kind==="tv") calls.push(tmdb("/discover/tv",{with_genres:KIDS_GENRES, include_adult:false, ...extra}).then(r=>r.results.map(x=>({...x,_forceType:"kids",_realType:"tv"}))));
  const res = await Promise.all(calls);
  return extra.sort_by && extra.sort_by.includes("date") ? mergeTwo(res[0]||[], res[1]||[], cmpDate) : mergeTwo(res[0]||[], res[1]||[], cmpRating);
}
async function buildKidsTab(){
  const main = document.getElementById("mainContent"); exitProvMode(); main.innerHTML = "";
  main.appendChild(sectionEl("k_new","New for Kids","Fresh family titles", ()=>showKids("new")));
  main.appendChild(sectionEl("k_pop","Popular with Kids","Most watched family titles", ()=>showKids("popular")));
  main.appendChild(sectionEl("k_movies","Kids Movies","Animated & family films", ()=>showKids("movies")));
  main.appendChild(sectionEl("k_tv","Kids TV Shows","Family series", ()=>showKids("tv")));
  main.appendChild(sectionEl("k_top","Top Rated Family","Highest rated kids content", ()=>showKids("top")));
  const gs = document.createElement("div"); gs.className="section";
  gs.innerHTML = '<div class="section-head"><h2>Browse Kids by Genre</h2></div>';
  gs.appendChild(genreChipsBar([{id:16,name:"Animation"},{id:10751,name:"Family"},{id:12,name:"Adventure"},{id:35,name:"Comedy"},{id:14,name:"Fantasy"},{id:10402,name:"Music"}], g=>showKidsGenreGrid(g)));
  main.appendChild(gs);
  buildHero(async ()=> kidsDiscover({sort_by:"popularity.desc"}), "FOR THE WHOLE FAMILY");
  loadRail("k_new", async ()=> (await kidsDiscover({sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":5})).slice(0,14), {kids:true});
  loadRail("k_pop", async ()=> (await kidsDiscover({sort_by:"popularity.desc"})).slice(0,14), {kids:true});
  loadRail("k_movies", async ()=> (await kidsDiscover({sort_by:"popularity.desc"},"movie")).slice(0,14), {kids:true});
  loadRail("k_tv", async ()=> (await kidsDiscover({sort_by:"popularity.desc"},"tv")).slice(0,14), {kids:true});
  loadRail("k_top", async ()=> (await kidsDiscover({sort_by:"vote_average.desc","vote_count.gte":50})).slice(0,14), {kids:true});
}
async function showKids(kind){
  const titles = {new:"New for Kids", popular:"Popular with Kids", movies:"Kids Movies", tv:"Kids TV Shows", top:"Top Rated Family"};
  const grid = openGrid(titles[kind]);
  try {
    let items;
    if (kind==="new") items = await kidsDiscover({sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":5});
    else if (kind==="top") items = await kidsDiscover({sort_by:"vote_average.desc","vote_count.gte":50});
    else if (kind==="movies") items = await kidsDiscover({sort_by:"popularity.desc"},"movie");
    else if (kind==="tv") items = await kidsDiscover({sort_by:"popularity.desc"},"tv");
    else items = await kidsDiscover({sort_by:"popularity.desc"});
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {kids:true}, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showKidsGenreGrid(g){
  const grid = openGrid("Kids · "+g.name);
  try { const items = await kidsDiscover({with_genres:"" + g.id, sort_by:"popularity.desc"}); grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(card(i, {kids:true}, idx))); }
  catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}

const MUSIC_GENRE_ID = 10402;
async function musicDiscover(extra={}, kind="both"){
  const calls = [];
  if (kind==="both" || kind==="movie") calls.push(tmdb("/discover/movie",{with_genres:MUSIC_GENRE_ID, include_adult:false, ...extra}).then(r=>r.results.map(x=>({...x,_forceType:"music",_mediaType:"movie"}))));
  if (kind==="both" || kind==="tv") calls.push(tmdb("/discover/tv",{with_genres:MUSIC_GENRE_ID, include_adult:false, ...extra}).then(r=>r.results.map(x=>({...x,_forceType:"music",_mediaType:"tv"}))));
  const res = await Promise.all(calls);
  return extra.sort_by && extra.sort_by.includes("date") ? mergeTwo(res[0]||[], res[1]||[], cmpDate) : mergeTwo(res[0]||[], res[1]||[], cmpRating);
}
async function buildMusicTab(){
  const main = document.getElementById("mainContent"); exitProvMode(); main.innerHTML = "";
  main.appendChild(sectionEl("mu_new","New Music Releases","Fresh music films & docs", ()=>showMusic("new")));
  main.appendChild(sectionEl("mu_trend","Trending Music","Popular right now", ()=>showMusic("trend")));
  main.appendChild(sectionEl("mu_top","Top Rated Music","Highest rated", ()=>showMusic("top")));
  main.appendChild(sectionEl("mu_docs","Music Documentaries","Behind the scenes", ()=>showMusic("docs")));
  const gs = document.createElement("div"); gs.className="section";
  gs.innerHTML = '<div class="section-head"><h2>Browse Music by Genre</h2></div>';
  gs.appendChild(genreChipsBar([{id:28,name:"Action"},{id:18,name:"Drama"},{id:36,name:"History"},{id:99,name:"Documentary"},{id:35,name:"Comedy"},{id:10749,name:"Romance"}], g=>showMusicGenreGrid(g)));
  main.appendChild(gs);
  buildHero(async ()=> musicDiscover({sort_by:"popularity.desc"}), "TRENDING MUSIC");
  loadRail("mu_new", async ()=> (await musicDiscover({sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":5})).slice(0,14), {music:true});
  loadRail("mu_trend", async ()=> (await musicDiscover({sort_by:"popularity.desc"})).slice(0,14), {music:true});
  loadRail("mu_top", async ()=> (await musicDiscover({sort_by:"vote_average.desc","vote_count.gte":50})).slice(0,14), {music:true});
  loadRail("mu_docs", async ()=> (await musicDiscover({sort_by:"popularity.desc", with_genres:"99,10402"})).slice(0,14), {music:true});
}
async function showMusic(kind){
  const titles = {new:"New Music Releases", trend:"Trending Music", top:"Top Rated Music", docs:"Music Documentaries"};
  const grid = openGrid(titles[kind]);
  try {
    let items;
    if (kind==="new") items = await musicDiscover({sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":5});
    else if (kind==="top") items = await musicDiscover({sort_by:"vote_average.desc","vote_count.gte":50});
    else if (kind==="docs") items = await musicDiscover({sort_by:"popularity.desc", with_genres:"99,10402"});
    else items = await musicDiscover({sort_by:"popularity.desc"});
    grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(musicCard(i, idx)));
  } catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}
async function showMusicGenreGrid(g){
  const grid = openGrid("Music · "+g.name);
  try { const items = await musicDiscover({with_genres:MUSIC_GENRE_ID + "," + g.id, sort_by:"popularity.desc"}); grid.innerHTML=""; items.forEach((i,idx)=>grid.appendChild(musicCard(i, idx))); }
  catch(e){ grid.innerHTML = '<div class="loader err">Couldn\'t load.</div>'; }
}

/* ================= HOME ================= */
async function buildHome(){
  await ensureGenres();
  const main = document.getElementById("mainContent");
  exitProvMode();
  main.innerHTML = "";

  if (continueList.length){
    const cw = sectionEl("h_continue","Continue Watching","Pick up where you left off", null);
    main.appendChild(cw);
    setTimeout(() => {
      const el = document.getElementById("h_continue");
      if (!el) return;
      el.innerHTML = "";
      continueList.forEach((c,i) => {
        const item = { id:c.id, title:c.title, name:c.title, poster_path:c.poster, vote_average:c.rating, release_date:c.date, _forceType:c.type };
        const d = card(item, {}, i);
        d.onclick = () => openPlayer(c.id, c.type, c.title, item);
        el.appendChild(d);
      });
    }, 0);
  }

  const launcherSec = document.createElement("div");
  launcherSec.className = "section provider-launcher-section";
  launcherSec.innerHTML =
    '<div class="section-head"><div><h2>Your Apps</h2><p>Tap a service to open its own home screen</p></div><span class="see-all" id="seeAllProviders">See all →</span></div>' +
    '<div class="provider-launcher" id="homeProviderLauncher"></div>';
  main.appendChild(launcherSec);
  setTimeout(()=>{ const el = document.getElementById("seeAllProviders"); if (el) el.onclick = () => routeTo("hubs"); }, 0);

  main.appendChild(sectionEl("h_top10","Top 10 This Week","Most popular across movies & TV", ()=>showSpecial("trending")));
  main.appendChild(sectionEl("h_new","New Releases","Freshly out", ()=>showSpecial("new")));
  main.appendChild(sectionEl("h_top","Top Rated","Highest rated of all time", ()=>showSpecial("toprated")));
  main.appendChild(sectionEl("h_upcoming","Coming Soon","Landing soon in theaters", ()=>showSpecial("upcoming_movie")));
  main.appendChild(sectionEl("h_anime","Anime Spotlight","Popular anime right now", ()=>showAnime("popular")));
  main.appendChild(sectionEl("h_kids","Kids & Family","Safe picks for the little ones", ()=>showKids("popular")));
  main.appendChild(sectionEl("h_music","Music Spotlight","Trending music films & docs", ()=>showMusic("trend")));

  const gs = document.createElement("div"); gs.className = "section";
  gs.innerHTML = '<div class="section-head"><h2>Browse by Genre</h2><p>Find something by mood</p></div>';
  gs.appendChild(genreChipsBar(dedupeGenres([...genresMovie, ...genresTV]), g => showGenreGrid(g,"all")));
  main.appendChild(gs);

  buildHero(async ()=> (await tmdb("/trending/all/week")).results, "TRENDING THIS WEEK");
  loadRail("h_top10", async ()=> (await tmdb("/trending/all/week")).results.slice(0,10), {top10:true});
  loadRail("h_new", async () => {
    const [m,t] = await Promise.all([
      tmdb("/discover/movie",{sort_by:"primary_release_date.desc","primary_release_date.lte":TODAY,"vote_count.gte":30, include_adult:false}),
      tmdb("/discover/tv",{sort_by:"first_air_date.desc","first_air_date.lte":TODAY,"vote_count.gte":15, include_adult:false})
    ]);
    return mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})), cmpDate).slice(0,14);
  });
  loadRail("h_top", async () => {
    const [m,t] = await Promise.all([tmdb("/movie/top_rated"), tmdb("/tv/top_rated")]);
    return mergeTwo(m.results.map(x=>({...x,media_type:"movie"})), t.results.map(x=>({...x,media_type:"tv"})), cmpRating).slice(0,14);
  });
  loadRail("h_upcoming", async ()=> (await tmdb("/movie/upcoming", {region:REGION})).results.map(x=>({...x,media_type:"movie"})).slice(0,14));
  loadRail("h_anime", async ()=> (await animeDiscover({sort_by:"popularity.desc"})).slice(0,14));
  loadRail("h_kids", async ()=> (await kidsDiscover({sort_by:"popularity.desc"})).slice(0,14), {kids:true});
  loadRail("h_music", async ()=> (await musicDiscover({sort_by:"popularity.desc"})).slice(0,14), {music:true});

  buildProviderLauncher("homeProviderLauncher", 12);
}

/* ================= PROVIDER LAUNCHER ================= */
const FEATURED_PROVIDERS = ["Netflix","Disney Plus","Disney+","Crunchyroll","Amazon Prime Video","Prime Video","Max","Hulu","Apple TV","Apple TV+","Paramount Plus","Peacock","Stan","Binge"];
async function fetchAllProviders(){
  const key = "providers_" + REGION;
  const cached = providerMapCache[key];
  if (cached && cached._at && Date.now() - cached._at < 60*60*1000) return cached.list;
  try {
    const [m,t] = await Promise.all([tmdb("/watch/providers/movie",{watch_region:REGION}), tmdb("/watch/providers/tv",{watch_region:REGION})]);
    const map = {};
    [...m.results, ...t.results].forEach(p => { map[p.provider_id] = {id:p.provider_id, name:p.provider_name, logo:p.logo_path}; });
    const list = Object.values(map).sort((a,b) => {
      const aF = FEATURED_PROVIDERS.indexOf(a.name), bF = FEATURED_PROVIDERS.indexOf(b.name);
      if (aF>=0 && bF<0) return -1;
      if (bF>=0 && aF<0) return 1;
      if (aF>=0 && bF>=0) return aF-bF;
      return a.name.localeCompare(b.name);
    });
    providerMapCache[key] = { list, _at: Date.now() };
    return list;
  } catch(e){ return []; }
}
async function buildProviderLauncher(containerId, limit=12){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  for (let i=0;i<limit;i++){ const sk = document.createElement("div"); sk.className = "skel"; sk.style.cssText = "width:72px;height:72px;border-radius:20px;"; el.appendChild(sk); }
  const providers = await fetchAllProviders();
  if (!providers.length){ el.innerHTML = '<div class="loader small" style="grid-column:1/-1;padding:14px 0;">Couldn\'t load providers.</div>'; return; }
  el.innerHTML = "";
  providers.slice(0, limit).forEach((p, i) => {
    const design = getProviderDesign(p.name);
    const btn = document.createElement("button");
    btn.className = "provider-app anim-pop";
    btn.style.animationDelay = Math.min(i*35, 400) + "ms";
    btn.style.setProperty("--pa-color", design.color);
    btn.setAttribute("aria-label", p.name);
    const initials = p.name.split(/\s+/).map(w => w[0]).join("").replace(/'/g,"").slice(0,2).toUpperCase();
    btn.innerHTML = '<div class="provider-app-icon">' +
      (p.logo ? '<img src="' + providerLogo(p.logo,"w92") + '" alt="' + p.name + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'pa-fallback\',textContent:\'' + initials + '\'}))">' : '<span class="pa-fallback">' + initials + '</span>') +
      '</div><div class="provider-app-name">' + p.name + '</div>';
    btn.onclick = () => { btn.style.transform = "translateY(-2px) scale(.94)"; setTimeout(() => renderProviderHome({id:p.id, name:p.name}), 90); };
    el.appendChild(btn);
  });
}

/* ================= PROVIDER HOME ================= */
function contrastText(hex){
  const raw = String(hex || "#ffffff").replace("#","").trim();
  const full = raw.length === 3 ? raw.split("").map(c => c+c).join("") : raw;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return "#0a0a0d";
  const r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  return (0.2126*r + 0.7152*g + 0.0722*b) > 186 ? "#0a0a0d" : "#ffffff";
}
function applyBrandTheme(design){
  const color = (design && design.color) ? design.color : "#ffffff";
  document.body.style.setProperty("--cta", color);
  document.body.style.setProperty("--cta-text", contrastText(color));
  document.body.style.setProperty("--rank", color);
  document.body.style.setProperty("--p-color", color);
  if (design){
    if (design.bg) document.body.style.setProperty("--p-bg", design.bg);
    if (design.bg2) document.body.style.setProperty("--p-bg2", design.bg2);
    if (design.accent) document.body.style.setProperty("--p-accent", design.accent);
  }
}
function clearBrandTheme(){
  ["--cta","--cta-text","--rank","--p-color","--p-bg","--p-bg2","--p-accent"].forEach(k => document.body.style.removeProperty(k));
}
function enterProvMode(design){
  document.body.classList.add("prov-mode");
  document.body.style.background = design.bg;
  applyBrandTheme(design);
  const mc = document.getElementById("mainContent");
  mc.className = "prov-home theme-" + design.style;
  mc.style.cssText = "--p-color:" + design.color + ";--p-bg:" + design.bg + ";--p-bg2:" + design.bg2 + ";--p-accent:" + design.accent + ";--cta:" + design.color + ";--cta-text:" + contrastText(design.color) + ";--rank:" + design.color + ";";
}
function exitProvMode(){
  document.body.classList.remove("prov-mode");
  document.body.style.background = "";
  clearBrandTheme();
  const mc = document.getElementById("mainContent");
  mc.className = ""; mc.style.cssText = "";
  const hero = document.getElementById("hero");
  hero.classList.remove("prov-hero");
  hero.style.background = ""; hero.style.backgroundColor = ""; hero.style.backgroundImage = "";
}

let provToken = 0;
async function renderProviderHome(prov){
  const myToken = ++provToken;
  await ensureGenres();
  if (myToken !== provToken) return;
  const main = document.getElementById("mainContent");
  const hero = document.getElementById("hero");
  const design = getProviderDesign(prov.name);
  const cfg = { ...DEFAULT_PROVIDER_CONTENT, ...(PROVIDER_CONTENT[design.key] || {}) };
  enterProvMode(design);
  main.innerHTML = "";
  hero.classList.add("prov-hero");
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
