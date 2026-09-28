function paintQueue(){
  const box=$("#npQueue");
  box.innerHTML="<h3>Up next</h3>"+state.list.map((s,i)=>`<div class="np-qrow ${i===state.i?"on":""}" data-i="${i}"><img src="${thumb(s.id)}" alt=""><div><div class="t-title">${esc(s.title)}</div><div class="t-sub">${esc(s.artist||"")}</div></div></div>`).join("");
  box.querySelectorAll(".np-qrow").forEach(el=>el.onclick=()=>playAt(Number(el.dataset.i),true));
}
function trackRows(items){
  return `<table class="tracks"><thead><tr><th class="num">#</th><th>Title</th><th></th></tr></thead><tbody>
    ${items.map((s,i)=>`<tr data-id="${esc(s.id)}" class="${current()&&current().id===s.id?"on":""}"><td class="num">${i+1}</td><td><div style="display:flex;gap:10px;align-items:center"><img class="t-art" src="${thumb(s.id)}" alt=""><div><div class="t-title">${esc(s.title)}</div><div class="t-sub">${esc(s.artist||"")}</div></div></div></td><td><button class="add" data-add="${esc(s.id)}" title="Save">+</button></td></tr>`).join("")}
  </tbody></table>`;
}
function albumRail(items){ return `<div class="rail">${items.map(s=>`<article class="album" data-id="${esc(s.id)}"><img src="${thumb(s.id)}" alt=""><b>${esc(s.title)}</b><span>${esc(s.artist||"")}</span></article>`).join("")}</div>`; }
function bindList(root, items){
  root.querySelectorAll("[data-id]").forEach(el=>el.onclick=e=>{
    if(e.target.closest("[data-add]")) return;
    const song=items.find(x=>x.id===el.dataset.id); if(!song) return;
    useList(items, song.id, true);
  });
  root.querySelectorAll("[data-add]").forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const song=items.find(x=>x.id===btn.dataset.add); if(song) addSong(song);
  });
}
function useList(items, id, auto){
  state.list=items.slice();
  const idx=Math.max(0, state.list.findIndex(x=>x.id===id));
  playAt(idx, auto);
}
function setNav(){
  $$("[data-view]").forEach(b=>b.classList.toggle("on", b.dataset.view===state.view));
}

function viewHome(){
  state.view="home"; setNav();
  const feat=state.tops[0]||TOP_SEED[0];
  $("#stage").innerHTML=`
    <div class="topbar">
      <button class="circle" type="button" id="backBtn">←</button>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
        <input id="q" placeholder="Search today's hits or paste a link"></div>
    </div>
    <div class="page">
      <div class="hero">
        <img class="hero-art" src="${thumb(feat.id)}" alt="">
        <div>
          <div class="kicker">Today · ${new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})}</div>
          <h1>Top Picks</h1>
          <p>Own player. Audio first through WISP + libcurl. Stretch the dock for the full screen.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-play" id="heroPlay">Play</button>
            <button class="btn btn-ghost" id="heroOpen">Open player</button>
          </div>
        </div>
      </div>
      <div class="section"><div class="section-head"><h2>Today's Top Picks</h2><span class="see" id="seeTops">Play all</span></div>${trackRows(state.tops.slice(0,12))}</div>
      <div class="section"><div class="section-head"><h2>New Mainstream Releases</h2><span class="see" id="seeNews">Play all</span></div>${albumRail(state.news.slice(0,14))}</div>
      <div class="section"><div class="section-head"><h2>Fresh singles</h2></div>${trackRows(state.news.slice(0,10))}</div>
    </div>`;
  bindList($("#stage"), state.tops.concat(state.news));
  $("#heroPlay").onclick=()=>useList(state.tops, state.tops[0]&&state.tops[0].id, true);
  $("#heroOpen").onclick=()=>{ if(!current()) useList(state.tops, state.tops[0]&&state.tops[0].id, false); openPlayer(); };
  $("#seeTops").onclick=()=>useList(state.tops, state.tops[0]&&state.tops[0].id, true);
  $("#seeNews").onclick=()=>useList(state.news, state.news[0]&&state.news[0].id, true);
  $("#q").addEventListener("keydown", e=>{ if(e.key==="Enter") viewSearch(e.target.value.trim()); });
  $("#backBtn").onclick=()=>viewHome();
}
function viewLibrary(){
  state.view="library"; setNav();
  const saved=S.list();
  $("#stage").innerHTML=`<div class="topbar"><button class="circle" type="button" id="backBtn">←</button></div>
    <div class="page"><div class="hero"><div class="hero-art" style="display:grid;place-items:center;background:linear-gradient(135deg,#a855f7,#5b8def);font-size:64px">♪</div>
    <div><div class="kicker">Playlist</div><h1>Your Library</h1><p>${saved.length?saved.length+" saved tracks":"Save a pick or drop local files."}</p>
    <div style="display:flex;gap:10px"><button class="btn btn-play" id="libPlay">Play</button><button class="btn btn-ghost" id="libFiles">Add files</button></div></div></div>
    ${saved.length?trackRows(saved):'<div class="empty">Nothing saved yet. Use + on a track or add files.</div>'}</div>`;
  bindList($("#stage"), saved);
  $("#libPlay").onclick=()=>{ if(saved.length) useList(saved, saved[0].id, true); };
  $("#libFiles").onclick=()=>$("#filePick").click();
  $("#backBtn").onclick=viewHome;
}
function viewSearch(q0=""){
  state.view="search"; setNav();
  $("#stage").innerHTML=`<div class="topbar"><button class="circle" type="button" id="backBtn">←</button>
    <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
    <input id="q" value="${esc(q0)}" placeholder="Song, artist, or link" autofocus></div></div>
    <div class="page"><div id="sres" class="empty">Type a query and press Enter.</div></div>`;
  $("#backBtn").onclick=viewHome;
  const run=async()=>{
    const q=$("#q").value.trim(), box=$("#sres"), id=parseVideoId(q);
    if(!q){ box.className="empty"; box.textContent="Type a query and press Enter."; return; }
    box.className="empty"; box.textContent="Searching…";
    try{
      let items=id?[{id,title:id,artist:"YouTube"}]:await searchSongs(q);
      if(id){ try{ const meta=await invGet("/api/v1/videos/"+id+"?region=US"); items=[{id,title:meta.title||id,artist:meta.author||"YouTube"}]; }catch{} }
      if(!items.length){ box.textContent="No results. Tunnel may still be connecting — try again."; return; }
      box.className=""; box.innerHTML=trackRows(items); bindList(box, items);
    }catch(e){ box.textContent=e.message||"Search failed"; }
  };
  $("#q").addEventListener("keydown", e=>{ if(e.key==="Enter") run(); });
  if(q0) run();
}

function addSong(song){
  if(!song||!song.id) return;
  const saved=S.list(); if(saved.some(x=>x.id===song.id)) return toast("Already saved");
  saved.unshift({id:song.id,title:song.title||song.id,artist:song.artist||"",local:!!song.local});
  S.save(saved); toast("Saved to library"); paintSide();
  if(state.view==="library") viewLibrary();
}
async function playAt(i, auto){
  if(!state.list.length) return;
  state.i=(i+state.list.length)%state.list.length;
  const song=current(), my=++state.token;
  paintNow();
  setStatus("Loading…");
  try{
    if(isLocal(song)){
      destroyEngine();
      try{ if(ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo(); }catch{}
      const blob=await idbGet(song.id); if(!blob) throw new Error("File missing");
      engine.blob=URL.createObjectURL(blob);
      media.src=engine.blob;
      await waitMedia(media, 8000);
      engine.kind="file";
      media.volume=Math.max(0,Math.min(1,(S.prefs().vol||80)/100));
      if(auto) await media.play();
      state.playing=!media.paused;
    } else {
      try{ media.pause(); }catch{}
      await attachYt(song.id, !!auto);
      if(my!==state.token) return;
      state.playing=!!auto;
      engine.kind="yt";
    }
    state.skip=0;
    setStatus(state.playing?"Playing":"Ready");
    paintNow();
  }catch(e){
    if(my!==state.token) return;
    setStatus("Couldn't play");
    state.playing=false; paintNow();
    toast(e.message||"Playback failed");
  }
}
function jump(id, auto){ const idx=state.list.findIndex(x=>x.id===id); if(idx>=0) playAt(idx,auto); }
function togglePlay(){
  if(!current()) return playAt(0,true);
  if(engine.kind==="yt" && ytPlayer){
    const st=ytState();
    if(st===1){ ytPlayer.pauseVideo(); state.playing=false; }
    else { ytPlayer.playVideo(); state.playing=true; }
    paintNow(); return;
  }
  if(!media.src && !engine.hls) return playAt(state.i,true);
  if(media.paused){ media.play(); state.playing=true; } else { media.pause(); state.playing=false; }
  paintNow();
}
function next(){ const p=S.prefs(); if(p.repeat==="one") return playAt(state.i,true); if(p.shuffle) return playAt(Math.floor(Math.random()*state.list.length),true); playAt(state.i+1,true); }
function prev(){
  let cur=0;
  try{ cur=engine.kind==="yt"&&ytPlayer?ytPlayer.getCurrentTime():media.currentTime; }catch{}
  if(cur>3){
    if(engine.kind==="yt"&&ytPlayer) ytPlayer.seekTo(0,true);
    else media.currentTime=0;
    return;
  }
  playAt(state.i-1,true);
}
function openPlayer(){ document.body.classList.add("np-open"); $("#nowPlaying").classList.add("open"); paintNow(); }
function closePlayer(){ document.body.classList.remove("np-open"); $("#nowPlaying").classList.remove("open"); }

function mediaTime(){
  if(engine.kind==="yt" && ytPlayer && ytPlayer.getCurrentTime){
    return { cur:ytPlayer.getCurrentTime()||0, dur:ytPlayer.getDuration()||0 };
  }
  return { cur:media.currentTime||0, dur:media.duration||0 };
}
function bindSeek(el){
  el.oninput=e=>{
    const {dur}=mediaTime();
    if(!dur) return;
    const t=(e.target.value/1000)*dur;
    if(engine.kind==="yt" && ytPlayer) ytPlayer.seekTo(t,true);
    else media.currentTime=t;
  };
}
function tick(){
  const {cur,dur}=mediaTime();
  const t=fmt(cur), d=fmt(dur), v=dur?Math.floor((cur/dur)*1000):0;
  $("#curT").textContent=t; $("#durT").textContent=d; $("#npCur").textContent=t; $("#npDur").textContent=d;
  if(document.activeElement!==$("#seek")) $("#seek").value=v;
  if(document.activeElement!==$("#npSeek")) $("#npSeek").value=v;
}
media.addEventListener("timeupdate", tick);
setInterval(()=>{ if(engine.kind==="yt") tick(); }, 400);
media.addEventListener("play", ()=>{ state.playing=true; paintNow(); });
media.addEventListener("pause", ()=>{ state.playing=false; paintNow(); });
media.addEventListener("ended", ()=>{ if(S.prefs().repeat!=="off") next(); else next(); });
bindSeek($("#seek")); bindSeek($("#npSeek"));
$("#vol").oninput=e=>{
  const v=Number(e.target.value); S.setPrefs({vol:v});
  media.volume=v/100;
  try{ if(ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(v); }catch{}
};
function toggleShuffle(){ S.setPrefs({shuffle:!S.prefs().shuffle}); paintNow(); }
function cycleRepeat(){ const o=["off","all","one"]; S.setPrefs({repeat:o[(o.indexOf(S.prefs().repeat)+1)%3]}); toast("Repeat "+S.prefs().repeat); paintNow(); }
$("#btnPlay").onclick=$("#npPlay").onclick=togglePlay;
$("#btnNext").onclick=$("#npNext").onclick=next;
$("#btnPrev").onclick=$("#npPrev").onclick=prev;
$("#btnShuffle").onclick=$("#npShuffle").onclick=toggleShuffle;
$("#btnRepeat").onclick=$("#npRepeat").onclick=cycleRepeat;
$("#openNow").onclick=openPlayer; $("#expandBtn").onclick=openPlayer;
$("#npClose").onclick=closePlayer;
$("#npSave").onclick=()=>{ if(current()) addSong(current()); };
function goView(name){ if(name==="home") viewHome(); if(name==="search") viewSearch(""); if(name==="library") viewLibrary(); }
$$("[data-view]").forEach(b=>b.onclick=()=>goView(b.dataset.view));
$("#addFiles").onclick=$("#mAdd").onclick=()=>$("#filePick").click();
$("#filePick").onchange=async e=>{
  const files=[...e.target.files||[]].filter(f=>/^audio\//.test(f.type)||/\.(mp3|m4a|ogg|wav|flac|aac|opus)$/i.test(f.name));
  for(const file of files){ const id="local_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); await idbPut(id,file); addSong({id,title:file.name.replace(/\.[^.]+$/,""),artist:"This device",local:true}); }
  if(files.length) toast("Added "+files.length);
  e.target.value=""; if(state.view==="library") viewLibrary();
};
document.addEventListener("keydown", e=>{
  if(e.target.matches("input,textarea")) return;
  if(e.code==="Space"){ e.preventDefault(); togglePlay(); }
  if(e.code==="ArrowRight") next();
  if(e.code==="ArrowLeft") prev();
  if(e.code==="Escape") closePlayer();
  if(e.code==="KeyF") openPlayer();
});
if(navigator.mediaSession){
  navigator.mediaSession.setActionHandler("play", togglePlay);
  navigator.mediaSession.setActionHandler("pause", togglePlay);
  navigator.mediaSession.setActionHandler("nexttrack", next);
  navigator.mediaSession.setActionHandler("previoustrack", prev);
}

viewHome(); paintNow();
ensureLibcurl().then(()=>loadLiveCatalog()).then(()=>{ if(state.view==="home") viewHome(); paintSide(); }).catch(()=>{
  setStatus("Direct");
  loadLiveCatalog().then(()=>{ if(state.view==="home") viewHome(); paintSide(); }).catch(()=>{});
});
