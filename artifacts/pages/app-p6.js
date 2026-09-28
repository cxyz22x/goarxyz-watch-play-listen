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
