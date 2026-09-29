const LIBCURL_SOURCES = [
  "https://cdn.jsdelivr.net/npm/libcurl.js@0.7.4/libcurl_full.js",
  "https://unpkg.com/libcurl.js@0.7.4/libcurl_full.js",
  "https://cdn.jsdelivr.net/npm/libcurl.js@latest/libcurl_full.js"
];
const DEFAULT_WISP_URLS = [
  "wss://wisp.mercurywork.shop/",
  "wss://wisp.mercurywork.shop/wisp/",
  "wss://wisp.crazymid.dev/",
  "wss://wisp.terbium.app/"
];
const INV = [
  "https://invidious.f5.si",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be"
];
const PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.me.projectsegfau.lt",
  "https://api.piped.private.coffee"
];
const TOP_PLAYLISTS = [
  "RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs",
  "RDCLAK5uy_nrS6tX1-aHomOfpEBSbVYNfM9R58rAlrs",
  "PL4fGSI1pDJn69On1f-8NAvX_CYlx7QyZc"
];
const NEW_PLAYLISTS = [
  "PL4fGSI1pDJn61unMfmrUSz68RT8IFFnks",
  "PLNcZGm7R37QHVurZRFwzvcZft7Dfmiv4w"
];
const NEW_SEED = [
  {id:"32si5cfrCNc",title:"new trick",artist:"ROSÉ"},
  {id:"FyS5dAywkEo",title:"SaWaDiKa",artist:"LISA"},
  {id:"sf02ugzPFE4",title:"CLICK",artist:"JISOO"},
  {id:"fcnDmrtj6Sk",title:"Dai Dai",artist:"Shakira & Burna Boy"},
  {id:"nUsrYVxrDwI",title:"Choosin' Texas",artist:"Ella Langley"},
  {id:"78wrful9cVU",title:"drop dead",artist:"Olivia Rodrigo"},
  {id:"6KjVYeQ9SRw",title:"Dracula",artist:"Tame Impala"},
  {id:"3sur4BmjQt8",title:"So Easy (To Fall In Love)",artist:"Olivia Dean"},
  {id:"mrV8kK5t0V8",title:"I Just Might",artist:"Bruno Mars"},
  {id:"aWpw-Ynl0Yc",title:"Bass Persuades",artist:"Miley Cyrus"},
  {id:"ko70cExuzZM",title:"The Fate of Ophelia",artist:"Taylor Swift"},
  {id:"b4iVv91Z6lY",title:"SWIM",artist:"BTS"}
];
const TOP_SEED = [
  {id:"nUsrYVxrDwI",title:"Choosin' Texas",artist:"Ella Langley"},
  {id:"fRIhCiUVaKs",title:"BbY WOW",artist:"KAROL G, Judeline"},
  {id:"78wrful9cVU",title:"drop dead",artist:"Olivia Rodrigo"},
  {id:"6KjVYeQ9SRw",title:"Dracula",artist:"Tame Impala"},
  {id:"3sur4BmjQt8",title:"So Easy (To Fall In Love)",artist:"Olivia Dean"},
  {id:"fcnDmrtj6Sk",title:"Dai Dai",artist:"Shakira & Burna Boy"},
  {id:"V9PVRfjEBTI",title:"BIRDS OF A FEATHER",artist:"Billie Eilish"},
  {id:"FyS5dAywkEo",title:"SaWaDiKa",artist:"LISA"}
];

const STORE="gxm5_";
const S={
  get(k,f){ try{ const v=JSON.parse(localStorage.getItem(STORE+k)); return v==null?f:v;}catch{return f;} },
  set(k,v){ try{ localStorage.setItem(STORE+k,JSON.stringify(v)); }catch{} },
  list(){ return this.get("pl",[]); },
  save(l){ this.set("pl",l); },
  prefs(){ return Object.assign({repeat:"off",shuffle:false,vol:80,wisp:DEFAULT_WISP_URLS[0]}, this.get("prefs",{})); },
  setPrefs(p){ this.set("prefs", Object.assign(this.prefs(),p)); }
};
const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>[...c.querySelectorAll(s)];
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const phArt="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="8" fill="#17171e"/><text x="40" y="46" text-anchor="middle" fill="#c084fc" font-size="18" font-family="sans-serif">♪</text></svg>');
function songArt(song, big){
  const obj=song&&typeof song==="object"?song:null;
  const id=String(obj?obj.id:song||"");
  if(id.startsWith("local_")) return phArt;
  if(obj&&obj.cover) return obj.cover;
  const yt=obj&&/^[\w-]{11}$/.test(String(obj.ytId||""))?obj.ytId:(/^[\w-]{11}$/.test(id)?id:"");
  if(!yt) return phArt;
  return "https://i.ytimg.com/vi/"+yt+(big?"/maxresdefault.jpg":"/hqdefault.jpg");
}
const thumb=song=>songArt(song,false);
const maxart=song=>songArt(song,true);
const fmt=s=>{s=Math.max(0,Math.floor(s||0)); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");};
function toast(msg){ $$(".toast").forEach(t=>t.remove()); const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2400); }
function parseVideoId(input){
  if(!input) return "";
  const s=String(input).trim();
  if(/^[\w-]{11}$/.test(s)) return s;
  try{ const u=new URL(s); if(u.hostname.includes("youtu.be")) return u.pathname.replace(/^\//,"").slice(0,11); if(u.searchParams.get("v")) return u.searchParams.get("v"); const m=u.pathname.match(/\/(embed|shorts)\/([\w-]{11})/); if(m) return m[2]; }catch{}
  return "";
}

function normalizeWispUrl(url){
  if(!url) return "";
  let u=String(url).trim();
  if(u.startsWith("https://")) u="wss://"+u.slice(8);
  if(u.startsWith("http://")) u="ws://"+u.slice(7);
  try{ const d=new URL(u.replace(/^wss:/i,"https:").replace(/^ws:/i,"http:")); d.port=""; u=(d.protocol==="https:"?"wss://":"ws://")+d.hostname+(d.pathname||"/")+d.search; }
  catch{ u=u.replace(/^(wss?:\/\/[^/]+):\d+/i,"$1"); }
  if(u && !u.endsWith("/")) u+="/";
  return u;
}
function loadSavedWispList(){
  const extra=[];
  try{ const c=localStorage.getItem("goar_wisp_custom"); if(c) extra.push(normalizeWispUrl(c)); const l=localStorage.getItem("goar_wisp_url"); if(l) extra.push(normalizeWispUrl(l)); }catch{}
  extra.push(normalizeWispUrl(S.prefs().wisp));
  const seen=new Set();
  return [...extra, ...DEFAULT_WISP_URLS.map(normalizeWispUrl)].filter(u=>{ if(!u||seen.has(u)) return false; seen.add(u); return true; });
}
let WISP_URL=loadSavedWispList()[0];
let tunnelState={status:"boot",url:WISP_URL,error:""};
let _libcurlReady=null, _httpSession=null;
function getLibcurl(){
  if(typeof window.libcurl!=="undefined" && window.libcurl) return window.libcurl;
  try{ const lc=(0,eval)("typeof libcurl!=='undefined'?libcurl:null"); if(lc){ window.libcurl=lc; return lc; } }catch{}
  return null;
}
function injectLibcurlScript(src){
  if(getLibcurl()) return Promise.resolve(src);
  if(document.querySelector('script[src*="libcurl"]')) return waitLibcurlObject(8000).then(()=>src);
  return new Promise((resolve,reject)=>{ const s=document.createElement("script"); s.src=src; s.async=true; s.onload=()=>resolve(src); s.onerror=()=>reject(new Error(src)); document.head.appendChild(s); });
}
function waitLibcurlObject(ms){
  return new Promise((resolve,reject)=>{
    const hit=getLibcurl(); if(hit) return resolve(hit);
    const t0=Date.now(); const iv=setInterval(()=>{ const lc=getLibcurl(); if(lc){ clearInterval(iv); resolve(lc);} else if(Date.now()-t0>ms){ clearInterval(iv); reject(new Error("libcurl missing")); } },50);
  });
}
async function waitLibcurlWasm(lc){
  if(lc.ready===true) return lc;
  if(typeof lc.load_wasm==="function"){ try{ await lc.load_wasm(); return lc; }catch{} }
  await new Promise((resolve,reject)=>{
    let done=false; const ok=()=>{ if(!done){ done=true; resolve(); } }; const fail=e=>{ if(!done){ done=true; reject(e||new Error("abort")); } };
    if(typeof lc.onload==="undefined" || lc.onload===null) lc.onload=ok;
    document.addEventListener("libcurl_load",ok,{once:true});
    document.addEventListener("libcurl_abort",(ev)=>fail(ev&&ev.error),{once:true});
    if(lc.events && typeof lc.events.addEventListener==="function") lc.events.addEventListener("load",ok,{once:true});
    setTimeout(()=>{ if(lc.ready===true||(lc.version&&lc.fetch)) ok(); },200);
    setTimeout(()=>fail(new Error("wasm timeout")),20000);
  });
  return lc;
}
function applyWispUrl(lc,url){
  const u=normalizeWispUrl(url); if(!u) throw new Error("WISP URL required");
  try{ lc.transport="wisp"; }catch{}
  lc.set_websocket(u); WISP_URL=u; tunnelState.url=u;
  try{ localStorage.setItem("goar_wisp_url",u); }catch{}
}
async function probeTunnel(lc){
  const ctrl=typeof AbortController!=="undefined"?new AbortController():null;
  const timer=setTimeout(()=>{ try{ ctrl&&ctrl.abort(); }catch{} },12000);
  try{
    const r=await lc.fetch("https://example.com/", ctrl?{signal:ctrl.signal}:{});
    const body=await r.text();
    if(!r.ok && r.status>=500) throw new Error("probe HTTP "+r.status);
    if(!body) throw new Error("empty probe");
    return true;
  } finally{ clearTimeout(timer); }
}
function getHttpSession(){
  if(_httpSession) return _httpSession;
  const lc=window.libcurl;
  if(lc&&lc.HTTPSession){ try{ _httpSession=new lc.HTTPSession({enable_cookies:true}); if(_httpSession.set_connections) _httpSession.set_connections(30,20,6);}catch{ _httpSession=null; } }
  return _httpSession;
}
function resetHttpSession(){ if(_httpSession&&_httpSession.close){ try{_httpSession.close();}catch{} } _httpSession=null; }
async function ensureLibcurl(force){
  if(_libcurlReady && !force) return _libcurlReady;
  _libcurlReady=(async()=>{
    setStatus("Tunnel…");
    let lc=null;
    try{ lc=await waitLibcurlObject(1500); }
    catch(e){
      let last=e;
      for(const src of LIBCURL_SOURCES){ try{ await injectLibcurlScript(src); lc=await waitLibcurlObject(8000); break; }catch(err){ last=err; } }
      if(!lc) throw last;
    }
    await waitLibcurlWasm(lc);
    if(typeof lc.fetch!=="function"||typeof lc.set_websocket!=="function") throw new Error("libcurl incomplete");
    const urls=loadSavedWispList(); let lastErr=null;
    for(const url of urls){
      try{ applyWispUrl(lc,url); resetHttpSession(); await probeTunnel(lc); tunnelState.status="ok"; tunnelState.error=""; window.libcurl=lc; setStatus("Tunnel live"); return lc; }
      catch(e){ lastErr=e; }
    }
    applyWispUrl(lc, urls[0]); tunnelState.status="bad"; tunnelState.error=lastErr&&lastErr.message?lastErr.message:"wisp down"; window.libcurl=lc; setStatus("Local / direct"); return lc;
  })();
  try{ return await _libcurlReady; }catch(e){ _libcurlReady=null; tunnelState.status="bad"; throw e; }
}
async function wispFetch(url, init){
  const lc=await ensureLibcurl();
  const sess=getHttpSession();
  const fn=(sess&&sess.fetch)?sess.fetch.bind(sess):lc.fetch.bind(lc);
  return fn(url, init);
}
async function fetchAny(url, opts={}, timeout=16000){
  const tryWisp=async()=>{
    const lc=getLibcurl();
    if(!lc || typeof lc.fetch!=="function") return null;
    return Promise.race([wispFetch(url,opts), new Promise((_,rej)=>setTimeout(()=>rej(new Error("wisp timeout")),timeout))]);
  };
  try{ const r=await tryWisp(); if(r) return r; }catch{}
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeout);
  try{ return await fetch(url, Object.assign({},opts,{signal:ctrl.signal})); } finally{ clearTimeout(t); }
}

const state={ view:"home", tops:S.get("tops",TOP_SEED.slice()), news:S.get("news",NEW_SEED.slice()), chartName:S.get("chartName","Top 50 Global"), list:S.list().length?S.list():TOP_SEED.slice(), i:0, playing:false, token:0, skip:0 };
const media=$("#player");
const engine={ hls:null, blob:null, kind:"" };
media.volume=Math.max(0,Math.min(1,(S.prefs().vol||80)/100));
$("#vol").value=S.prefs().vol||80;
const current=()=>state.list[state.i]||null;
function setStatus(msg){
  if(state.playing && /tunnel|local \/|direct|wisp/i.test(String(msg||""))) return;
  const el=$("#playStatus"); if(el) el.textContent=msg;
}

function uniqSongs(items){
  const out=[], seen=new Set();
  (items||[]).forEach(it=>{
    if(!it) return;
    const id=parseVideoId(it.id||it.videoId||it.url||"")||(typeof it.videoId==="string"&&it.videoId.length===11?it.videoId:"");
    const title=it.title||it.name; if(!id||!title||seen.has(id)||String(id).length!==11) return;
    seen.add(id); out.push({id,title,artist:String(it.artist||it.author||it.uploaderName||it.uploader||"YouTube").split("•")[0].trim(),preview:it.preview||"",sp:/^[A-Za-z0-9]{22}$/.test(String(it.sp||""))?it.sp:"",cover:it.cover||""});
  });
  return out;
}
async function invGet(path){
  let last;
  for(const base of INV){
    try{ const r=await fetchAny(base.replace(/\/$/,"")+path,{headers:{Accept:"application/json"}}); if(r&&r.ok) return r.json(); last=new Error("HTTP "+(r&&r.status)); }
    catch(e){ last=e; }
  }
  throw last||new Error("catalog down");
}
async function playlistRss(pid){
  const r=await fetchAny("https://www.youtube.com/feeds/videos.xml?playlist_id="+pid);
  if(!r||!r.ok) return [];
  const xml=await r.text();
  const out=[];
  xml.split("<entry>").slice(1).forEach(block=>{
    const id=(block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)||[])[1];
    const title=(block.match(/<title>([^<]+)<\/title>/)||[])[1];
    const artist=(block.match(/<name>([^<]+)<\/name>/)||[])[1]||"YouTube";
    if(id&&title) out.push({id,title,artist});
  });
  return uniqSongs(out);
}
async function playlistSongs(pid){
  try{ const pl=await invGet("/api/v1/playlists/"+pid); const rows=uniqSongs(pl.videos||[]); if(rows.length) return rows; }catch{}
  for(const base of PIPED){
    try{ const r=await fetchAny(base+"/playlists/"+pid); if(!r||!r.ok) continue; const j=await r.json(); const rows=uniqSongs(j.relatedStreams||j.videos||j); if(rows.length) return rows; }catch{}
  }
  try{ return await playlistRss(pid); }catch{ return []; }
}
function kindOfUrl(url, mime){
  const u=String(url||""), m=String(mime||"").toLowerCase();
  if(/\.m3u8(\?|$)/i.test(u) || m.includes("mpegurl") || m.includes("apple.mpeg")) return "hls";
  if(/\.mpd(\?|$)/i.test(u) || m.includes("dash+xml") || m.includes("mpd")) return "dash";
  return "file";
}
function pushCand(list, url, mime, title, artist, audioOnly){
  if(!url || /signatureCipher=|s=/.test(url) && !/[?&]url=/.test(url)) return;
  list.push({ url, mime:mime||"", kind:kindOfUrl(url, mime), title:title||"", artist:artist||"", audioOnly:!!audioOnly });
}
/* Client list mirrors iv-org/invidious src/invidious/yt_backend/youtube_api.cr */
const YT_CLIENTS = [
  { name:"ANDROID", version:"20.10.38", id:"3", ua:"com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip", extra:{ androidSdkVersion:30 } },
  { name:"ANDROID", version:"21.03.38", id:"3", ua:"com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip", extra:{ androidSdkVersion:34 } },
  { name:"TVHTML5", version:"7.20260311.16.00", id:"7", ua:"Mozilla/5.0 (ChromiumStyle TV)", extra:{} },
  { name:"MWEB", version:"2.20260722.01.00", id:"2", ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36", extra:{} }
];
const YT_PLAYER_ENDPOINTS = [
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  "https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false&key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
];
function harvestPlayer(j, into){
  if(!j) return into;
  const d=j.videoDetails||{};
  if(d.title) into.title=d.title;
  if(d.author) into.artist=d.author;
  const sd=j.streamingData||{};
  if(sd.hlsManifestUrl) into.hls=into.hls||sd.hlsManifestUrl;
  (sd.adaptiveFormats||[]).forEach(f=>{ if(f&&f.url) into.adaptive.push(f); });
  (sd.formats||[]).forEach(f=>{ if(f&&f.url) into.muxed.push(f); });
  return into;
}
function hasUsable(bag){
  return !!(bag.hls || bag.adaptive.some(f=>f.url) || bag.muxed.some(f=>f.url));
}
async function ytPlayerClient(id, client){
  const ctxClient=Object.assign({
    clientName:client.name,
    clientVersion:client.version,
    hl:"en", gl:"US",
    userAgent:client.ua,
    utcOffsetMinutes:-new Date().getTimezoneOffset()
  }, client.extra||{});
  const body={
    context:{ client:ctxClient },
    videoId:id,
    contentCheckOk:true,
    racyCheckOk:true,
    playbackContext:{ contentPlaybackContext:{ html5Preference:"HTML5_PREF_WANTS", vis:0, splay:false, lactMilliseconds:"-1" } }
  };
  for(const url of YT_PLAYER_ENDPOINTS){
    try{
      const r=await fetchAny(url,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "X-YouTube-Client-Name":client.id,
          "X-YouTube-Client-Version":client.version,
          "User-Agent":client.ua,
          "Origin":"https://www.youtube.com",
          "Referer":"https://www.youtube.com/"
        },
        body:JSON.stringify(body)
      },18000);
      if(r&&r.ok) return r.json();
    }catch{}
  }
  return null;
}
async function ytExtract(id){
  const bag={ title:"", artist:"", hls:"", adaptive:[], muxed:[] };
  for(const client of YT_CLIENTS){
    try{
      const j=await ytPlayerClient(id, client);
      harvestPlayer(j, bag);
      if(hasUsable(bag) && (bag.adaptive.length || bag.muxed.length)) break;
    }catch{}
  }
  return bag;
}
async function ytMusicSearch(q){
  const body={
    context:{ client:{ clientName:"WEB_REMIX", clientVersion:"1.20260804.16.00", hl:"en", gl:"US" } },
    query:q
  };
  try{
    const r=await fetchAny("https://music.youtube.com/youtubei/v1/search?prettyPrint=false&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30",{
      method:"POST",
      headers:{ "Content-Type":"application/json", "X-YouTube-Client-Name":"67", "X-YouTube-Client-Version":"1.20260804.16.00" },
      body:JSON.stringify(body)
    },18000);
    if(!r||!r.ok) return [];
    const j=await r.json();
    const songs=[]; const seen=new Set();
    (function walk(n){
      if(!n||typeof n!=="object") return;
      if(Array.isArray(n)){ n.forEach(walk); return; }
      const item=n.musicResponsiveListItemRenderer;
      if(item){
        let id=item.playlistItemData&&item.playlistItemData.videoId;
        if(!id){ JSON.stringify(item).replace(/"videoId":"([\w-]{11})"/,(_,v)=>id=id||v); }
        if(id&&!seen.has(id)){
          const cols=(item.flexColumns||[]).map(c=>{
            const t=(c.musicResponsiveListItemFlexColumnRenderer||{}).text||{};
            return t.simpleText||(Array.isArray(t.runs)?t.runs.map(x=>x.text||"").join(""):"");
          });
          seen.add(id); songs.push({id,title:cols[0]||id,artist:String(cols[1]||"YouTube").split("•")[0].trim()});
        }
      }
      Object.values(n).forEach(walk);
    })(j);
    return uniqSongs(songs);
  }catch{ return []; }
}
async function resolveSources(id){
  const cands=[]; let title="", artist="";
  try{
    const bag=await ytExtract(id);
    title=bag.title||title; artist=bag.artist||artist;
    bag.adaptive.filter(f=>/audio/i.test(f.mimeType||f.type||"")).sort((a,b)=>(b.bitrate||0)-(a.bitrate||0)).forEach(f=>pushCand(cands,f.url,f.mimeType||f.type,title,artist,true));
    bag.muxed.forEach(f=>pushCand(cands,f.url,f.mimeType||f.type,title,artist,false));
    if(bag.hls) pushCand(cands, bag.hls, "application/vnd.apple.mpegurl", title, artist, false);
  }catch{}
  try{
    const j=await invGet("/api/v1/videos/"+encodeURIComponent(id)+"?region=US");
    title=j.title||title; artist=j.author||artist;
    const adaptive=j.adaptiveFormats||[], muxed=j.formatStreams||[];
    adaptive.filter(f=>/audio/i.test(f.type||f.mimeType||"")&&f.url).sort((a,b)=>(b.bitrate||0)-(a.bitrate||0)).forEach(f=>pushCand(cands,f.url,f.type||f.mimeType,title,artist,true));
    muxed.filter(f=>f.url).forEach(f=>pushCand(cands,f.url,f.type||f.mimeType,title,artist,false));
    if(j.hlsUrl) pushCand(cands, j.hlsUrl, "application/vnd.apple.mpegurl", title, artist, false);
  }catch{}
  for(const base of PIPED){
    try{
      const r=await fetchAny(base+"/streams/"+id); if(!r||!r.ok) continue;
      const j=await r.json();
      title=j.title||title; artist=j.uploader||artist;
      (j.audioStreams||[]).sort((a,b)=>(b.bitrate||0)-(a.bitrate||0)).forEach(f=>pushCand(cands,f.url,f.mimeType||f.codec,title,artist,true));
      if(j.hls) pushCand(cands, j.hls, "application/vnd.apple.mpegurl", title, artist, false);
      (j.videoStreams||[]).filter(f=>f.url).slice(0,2).forEach(f=>pushCand(cands,f.url,f.mimeType,title,artist,false));
      if(cands.length) break;
    }catch{}
  }
  const seen=new Set();
  const out=cands.filter(c=>{ if(!c.url||seen.has(c.url)) return false; seen.add(c.url); return true; });
  out.sort((a,b)=>{
    const rank=x=>x.audioOnly&&x.kind==="file"?0:x.kind==="file"?1:x.kind==="hls"?2:3;
    return rank(a)-rank(b);
  });
  if(!out.length) throw new Error("no playable source");
  out.forEach(c=>{ c.title=c.title||title; c.artist=c.artist||artist; });
  return out;
}
class WispHlsLoader{
  constructor(config){ this.config=config; this.stats={aborted:false,loaded:0,retry:0,total:0,chunkCount:0,bwEstimate:0,loading:{start:0,first:0,end:0},buffering:{start:0,first:0,end:0},parsing:{start:0,end:0}}; this._abort=false; }
  abort(){ this._abort=true; this.stats.aborted=true; }
  destroy(){ this.abort(); }
  load(context, config, callbacks){
    this.stats.loading.start=performance.now();
    const wantText=context.responseType==="text" || (context.type && String(context.type).indexOf("manifest")>=0);
    fetchAny(context.url).then(async r=>{
      if(this._abort) return;
      if(!r.ok) throw new Error("HTTP "+r.status);
      const data=wantText ? await r.text() : await r.arrayBuffer();
      this.stats.loaded=typeof data==="string"?data.length:data.byteLength;
      this.stats.total=this.stats.loaded;
      this.stats.loading.first=this.stats.loading.end=performance.now();
      callbacks.onSuccess({url:context.url,data}, this.stats, context, null);
    }).catch(err=>{
      if(this._abort) return;
      callbacks.onError({code:0,text:String(err&&err.message?err.message:err)}, context, null);
    });
  }
}
function destroyEngine(){
  if(engine.hls){ try{ engine.hls.destroy(); }catch{} engine.hls=null; }
  try{ media.pause(); media.removeAttribute("src"); media.load(); }catch{}
  if(engine.blob){ try{ URL.revokeObjectURL(engine.blob); }catch{} engine.blob=null; }
  engine.kind="";
}
let ytPlayer=null, ytReadyApi=false;
window.onYouTubeIframeAPIReady=function(){ ytReadyApi=true; };
function waitYtApi(){
  if(window.YT && YT.Player){ ytReadyApi=true; return Promise.resolve(); }
  return new Promise((resolve,reject)=>{
    const t0=Date.now();
    const iv=setInterval(()=>{
      if(window.YT && YT.Player){ clearInterval(iv); ytReadyApi=true; resolve(); }
      else if(Date.now()-t0>12000){ clearInterval(iv); reject(new Error("YouTube player API missing")); }
    },50);
  });
}
function ytState(){ try{ return ytPlayer && ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1; }catch{ return -1; } }
function attachYt(id, auto){
  return waitYtApi().then(()=>new Promise((resolve,reject)=>{
    const start=()=>{
      try{
        if(ytPlayer && ytPlayer.loadVideoById){
          if(auto) ytPlayer.loadVideoById(id); else ytPlayer.cueVideoById(id);
          engine.kind="yt";
          resolve();
          return;
        }
      }catch{}
      try{ if(ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); }catch{}
      ytPlayer=new YT.Player("ytMount",{
        width:1, height:1, videoId:id,
        playerVars:{ autoplay:auto?1:0, controls:0, disablekb:1, fs:0, rel:0, modestbranding:1, playsinline:1, origin:location.origin },
        events:{
          onReady(e){
            try{ e.target.setVolume(S.prefs().vol||80); }catch{}
            engine.kind="yt";
            resolve();
          },
          onStateChange(e){
            if(e.data===YT.PlayerState.PLAYING){ state.playing=true; setStatus("Playing"); paintNow(); }
            if(e.data===YT.PlayerState.PAUSED){ state.playing=false; paintNow(); }
            if(e.data===YT.PlayerState.ENDED) next();
          },
          onError(){
            setStatus("Track blocked");
            if(state.skip<3 && state.list.length>1){ state.skip++; setTimeout(()=>next(), 400); }
          }
        }
      });
    };
    start();
  }));
}
async function wispBlobUrl(url, mime){
  const r=await fetchAny(url, {}, 28000);
  if(!r || !r.ok) throw new Error("tunnel HTTP "+(r&&r.status));
  const buf=await r.arrayBuffer();
  engine.blob=URL.createObjectURL(new Blob([buf], {type: mime||"audio/mp4"}));
  return engine.blob;
}
function waitMedia(el, timeout){
  return new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(new Error("media timeout")), timeout||12000);
    const ok=()=>{ clearTimeout(t); cleanup(); resolve(); };
    const bad=()=>{ clearTimeout(t); cleanup(); reject(new Error("media error")); };
    const cleanup=()=>{ el.removeEventListener("loadeddata",ok); el.removeEventListener("canplay",ok); el.removeEventListener("error",bad); };
    el.addEventListener("loadeddata",ok,{once:true});
    el.addEventListener("canplay",ok,{once:true});
    el.addEventListener("error",bad,{once:true});
  });
}
async function attachHls(url){
  if(media.canPlayType && media.canPlayType("application/vnd.apple.mpegurl") && !(window.Hls && Hls.isSupported())){
    media.src=url; await waitMedia(media); return;
  }
  if(typeof Hls==="undefined" || !Hls.isSupported()) throw new Error("hls.js missing");
  async function go(loader){
    const opts={enableWorker:false,lowLatencyMode:false,maxBufferLength:18,maxMaxBufferLength:36};
    if(loader) opts.loader=loader;
    const hls=new Hls(opts);
    engine.hls=hls;
    await new Promise((resolve,reject)=>{
      const t=setTimeout(()=>reject(new Error("manifest timeout")),16000);
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{ clearTimeout(t); resolve(); });
      hls.on(Hls.Events.ERROR,(_,data)=>{ if(data&&data.fatal){ clearTimeout(t); reject(new Error(data.details||data.type||"hls fatal")); } });
      hls.loadSource(url); hls.attachMedia(media);
    });
  }
  try{ await go(WispHlsLoader); }
  catch(e){ destroyEngine(); await go(null); }
}
async function attachFile(url, mime){
  if(getLibcurl() && typeof getLibcurl().fetch==="function"){
    try{
      setStatus("Audio via tunnel…");
      media.src=await wispBlobUrl(url, mime);
      await waitMedia(media, 18000);
      return;
    }catch{ destroyEngine(); }
  }
  media.src=url;
  await waitMedia(media, 8000);
}
async function playCandidate(c){
  destroyEngine();
  engine.kind=c.kind==="hls"?"hls":"file";
  setStatus(c.kind==="hls"?"HLS…":"Audio…");
  if(c.kind==="hls") await attachHls(c.url);
  else await attachFile(c.url, c.mime);
}
async function searchSongs(q){
  try{
    const r=await fetch("/spotify/search?q="+encodeURIComponent(q));
    if(r.ok){
      const j=await r.json();
      if(Array.isArray(j)&&j.length) return j.slice(0,24).map(row=>({
        id:row.id||("sp_"+(row.sp||"")),
        sp:row.sp||"",
        title:row.title||"",
        artist:row.artist||"",
        cover:row.cover||"",
        preview:row.preview||"",
        source:"spotify"
      })).filter(row=>row.title&&row.sp);
    }
  }catch{}
  try{ const rows=uniqSongs(await invGet("/api/v1/search?type=video&region=US&q="+encodeURIComponent(q))); if(rows.length) return rows.slice(0,24); }catch{}
  const yt=await ytMusicSearch(q); if(yt.length) return yt.slice(0,24);
  for(const base of PIPED){
    try{ const r=await fetchAny(base+"/search?q="+encodeURIComponent(q)+"&filter=videos"); if(!r||!r.ok) continue; const j=await r.json(); const rows=uniqSongs(Array.isArray(j)?j:(j.items||[])); if(rows.length) return rows.slice(0,24); }catch{}
  }
  return [];
}
async function loadLiveCatalog(){
  const today=new Date().toISOString().slice(0,10);
  const cached=S.get("chart",null);
  if(cached&&cached.day===today&&Array.isArray(cached.tops)&&cached.tops.length){
    state.tops=cached.tops;
    if(Array.isArray(cached.news)&&cached.news.length) state.news=cached.news;
    state.chartName=cached.name||state.chartName;
    if(!S.list().length) state.list=state.tops.slice();
  }
  try{
    const r=await fetch("/spotify/hits");
    if(r.ok){
      const j=await r.json();
      if(j&&Array.isArray(j.tops)&&j.tops.length){
        state.tops=j.tops;
        if(Array.isArray(j.news)&&j.news.length) state.news=j.news;
        state.chartName=j.name||"Top 50 Global";
        S.set("chart",{day:j.day||today,name:state.chartName,tops:state.tops,news:state.news});
        S.set("tops",state.tops); S.set("news",state.news); S.set("chartName",state.chartName);
        if(!S.list().length) state.list=state.tops.slice();
        prefetchNext();
        return;
      }
    }
  }catch{}
  if((state.tops||[]).some(row=>row&&row.sp)) return;
  const tops=[], news=[];
  for(const pid of TOP_PLAYLISTS){ const rows=await playlistSongs(pid); tops.push(...rows); if(uniqSongs(tops).length>=16) break; }
  try{ const tr=await invGet("/api/v1/trending?type=music&region=US"); tops.push(...uniqSongs(Array.isArray(tr)?tr:[])); }catch{}
  for(const pid of NEW_PLAYLISTS){ const rows=await playlistSongs(pid); news.push(...rows); }
  const t=uniqSongs(tops.concat(TOP_SEED));
  const n=uniqSongs(news.concat(NEW_SEED));
  if(t.length){ state.tops=t.slice(0,40); S.set("tops",state.tops); }
  if(n.length){ state.news=n.slice(0,40); S.set("news",state.news); }
  if(!S.list().length) state.list=state.tops.slice();
}

const IDB_NAME="goarxyz-music", IDB_STORE="tracks";
function idbOpen(){ return new Promise((res,rej)=>{ const req=indexedDB.open(IDB_NAME,1); req.onupgradeneeded=()=>req.result.createObjectStore(IDB_STORE); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); }); }
async function idbPut(id,blob){ const db=await idbOpen(); await new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,"readwrite"); tx.objectStore(IDB_STORE).put(blob,id); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function idbGet(id){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,"readonly"); const req=tx.objectStore(IDB_STORE).get(id); req.onsuccess=()=>res(req.result||null); req.onerror=()=>rej(req.error); }); }
function isLocal(s){ return !!(s&&(s.local||String(s.id||"").startsWith("local_"))); }

function paintNow(){
  const s=current(), p=S.prefs();
  ["#btnShuffle","#npShuffle"].forEach(id=>$(id)&&$(id).classList.toggle("on",!!p.shuffle));
  ["#btnRepeat","#npRepeat"].forEach(id=>$(id)&&$(id).classList.toggle("on",p.repeat!=="off"));
  const glyph=state.playing?"❚❚":"▶";
  $("#btnPlay").textContent=glyph; $("#npPlay").textContent=glyph;
  if(!s){ $("#nowTitle").textContent="Today's Top Picks"; $("#nowArtist").textContent="Open full player"; return; }
  $("#nowTitle").textContent=s.title; $("#nowArtist").textContent=s.artist||"";
  $("#npTitle").textContent=s.title; $("#npArtist").textContent=s.artist||"";
  const art=thumb(s), big=maxart(s);
  $("#nowArt").src=art; $("#nowArt").referrerPolicy="no-referrer";
  $("#npArt").src=big; $("#npArt").referrerPolicy="no-referrer";
  $("#npBg").style.backgroundImage="url('"+String(big).replace(/'/g,"%27")+"')";
  document.title=s.title+" — goarxyz";
  if(navigator.mediaSession) navigator.mediaSession.metadata=new MediaMetadata({title:s.title,artist:s.artist||"goarxyz",artwork:isLocal(s)?[]:[{src:thumb(s),sizes:"480x360",type:"image/jpeg"}]});
  paintQueue(); paintSide();
}
function paintSide(){
  const rows=state.list.slice(0,24);
  $("#sideLib").innerHTML=rows.map(s=>`<div class="lib-item ${current()&&current().id===s.id?"on":""}" data-id="${esc(s.id)}"><img src="${thumb(s)}" referrerpolicy="no-referrer" alt=""><div><b>${esc(s.title)}</b><span>${esc(s.artist||"")}</span></div></div>`).join("");
  $("#sideLib").querySelectorAll(".lib-item").forEach(el=>el.onclick=()=>jump(el.dataset.id,true));
}
function paintQueue(){
  const box=$("#npQueue");
  box.innerHTML="<h3>Up next</h3>"+state.list.map((s,i)=>`<div class="np-qrow ${i===state.i?"on":""}" data-i="${i}"><img src="${thumb(s)}" referrerpolicy="no-referrer" alt=""><div><div class="t-title">${esc(s.title)}</div><div class="t-sub">${esc(s.artist||"")}</div></div></div>`).join("");
  box.querySelectorAll(".np-qrow").forEach(el=>el.onclick=()=>playAt(Number(el.dataset.i),true));
}
function trackRows(items){
  return `<table class="tracks"><thead><tr><th class="num">#</th><th>Title</th><th></th></tr></thead><tbody>
    ${items.map((s,i)=>`<tr data-id="${esc(s.id)}" class="${current()&&current().id===s.id?"on":""}"><td class="num">${i+1}</td><td><div style="display:flex;gap:10px;align-items:center"><img class="t-art" src="${thumb(s)}" referrerpolicy="no-referrer" alt=""><div><div class="t-title">${esc(s.title)}</div><div class="t-sub">${esc(s.artist||"")}</div></div></div></td><td><button class="add" data-add="${esc(s.id)}" title="Save">+</button></td></tr>`).join("")}
  </tbody></table>`;
}
function albumRail(items){ return `<div class="rail">${items.map(s=>`<article class="album" data-id="${esc(s.id)}"><img src="${thumb(s)}" referrerpolicy="no-referrer" alt=""><b>${esc(s.title)}</b><span>${esc(s.artist||"")}</span></article>`).join("")}</div>`; }
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
        <input id="q" placeholder="Search Spotify"></div>
    </div>
    <div class="page">
      <div class="hero">
        <img class="hero-art" src="${thumb(feat)}" referrerpolicy="no-referrer" alt="">
        <div>
          <div class="kicker">Today · ${new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})}</div>
          <h1>${esc(state.chartName||"Top 50 Global")}</h1>
          <p>Today's Spotify chart. Full tracks play here. Art is from YouTube.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-play" id="heroPlay">Play</button>
            <button class="btn btn-ghost" id="heroOpen">Open player</button>
          </div>
        </div>
      </div>
      <div class="section"><div class="section-head"><h2>${esc(state.chartName||"Top 50 Global")}</h2><span class="see" id="seeTops">Play all</span></div>${trackRows(state.tops.slice(0,12))}</div>
      <div class="section"><div class="section-head"><h2>Today's Top Hits</h2><span class="see" id="seeNews">Play all</span></div>${albumRail(state.news.slice(0,14))}</div>
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
    <input id="q" value="${esc(q0)}" placeholder="Search Spotify" autofocus></div></div>
    <div class="page"><div id="sres" class="empty">Type a query and press Enter.</div></div>`;
  $("#backBtn").onclick=viewHome;
  const run=async()=>{
    const q=$("#q").value.trim(), box=$("#sres"), id=parseVideoId(q);
    if(!q){ box.className="empty"; box.textContent="Type a query and press Enter."; return; }
    box.className="empty"; box.textContent="Searching…";
    try{
      let items=id?[{id,title:id,artist:"YouTube"}]:await searchSongs(q);
      if(id){ try{ const meta=await invGet("/api/v1/videos/"+id+"?region=US"); items=[{id,title:meta.title||id,artist:meta.author||"YouTube"}]; }catch{} }
      if(!items.length){ box.textContent="No tracks for that search."; return; }
      box.className=""; box.innerHTML=trackRows(items); bindList(box, items);
    }catch(e){ box.textContent=e.message||"Search failed"; }
  };
  $("#q").addEventListener("keydown", e=>{ if(e.key==="Enter") run(); });
  if(q0) run();
}

function began(el, ms){
  return new Promise((resolve)=>{
    let done=false;
    const finish=(v)=>{ if(done) return; done=true; el.removeEventListener("timeupdate", ok); el.removeEventListener("error", bad); resolve(v); };
    const ok=()=>{ if(el.currentTime>0.25) finish(true); };
    const bad=()=>finish(false);
    el.addEventListener("timeupdate", ok);
    el.addEventListener("error", bad);
    setTimeout(()=>finish(el.currentTime>0.25), ms||6000);
  });
}
async function spotifyFileUrl(song){
  const id=song&&(song.sp||(String(song.id||"").startsWith("sp_")?String(song.id).slice(3):""));
  if(!id) return "";
  try{
    const r=await fetch("/spotify/file?id="+encodeURIComponent(id));
    if(!r.ok) return "";
    const j=await r.json();
    if(j&&j.cover&&song&&!song.cover) song.cover=j.cover;
    if(j&&j.artist&&song&&!song.artist) song.artist=j.artist;
    return j&&j.url||"";
  }catch{ return ""; }
}
async function playSpotify(song, auto){
  const sp=song.sp||(String(song.id||"").startsWith("sp_")?String(song.id).slice(3):"");
  if(sp) song.sp=sp;
  if(!song.sp) return false;
  if(!auto){ setStatus("Ready"); return true; }
  setStatus("Loading…");
  const direct=await spotifyFileUrl(song);
  if(direct && await playSrc(direct, 7000)) return fullTrack();
  if(await playSrc("/spotify/audio?id="+encodeURIComponent(song.sp), 12000)) return fullTrack();
  return false;
}
function fullTrack(){
  const src=media.currentSrc||media.src||"";
  if(/mp3-preview|\/spotify\/preview|p\.scdn\.co/.test(src)){ destroyEngine(); return false; }
  const d=media.duration;
  if(Number.isFinite(d) && d>0 && d<=32){ destroyEngine(); return false; }
  return true;
}
function prefetchNext(){
  const list=state.list||[];
  if(list.length<2) return;
  const n=list[(state.i+1)%list.length];
  const id=n&&(n.sp||(String(n.id||"").startsWith("sp_")?String(n.id).slice(3):""));
  if(!id) return;
  fetch("/spotify/file?id="+encodeURIComponent(id)).catch(()=>{});
}
async function playSrc(url, ms){
  destroyEngine();
  try{ if(ytPlayer&&ytPlayer.pauseVideo) ytPlayer.pauseVideo(); }catch{}
  media.volume=Math.max(0,Math.min(1,(S.prefs().vol||80)/100));
  media.src=url;
  engine.kind="file";
  const gate=began(media, ms);
  const play=media.play();
  if(play&&play.catch) play.catch(()=>{});
  return gate;
}

function addSong(song){
  if(!song||!song.id) return;
  const saved=S.list(); if(saved.some(x=>x.id===song.id)) return toast("Already saved");
  saved.unshift({id:song.id,title:song.title||song.id,artist:song.artist||"",local:!!song.local,preview:song.preview||"",sp:song.sp||"",cover:song.cover||""});
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
    } else if(song.sp || String(song.id||"").startsWith("sp_")){
      const ok=await playSpotify(song, !!auto);
      if(my!==state.token) return;
      if(!ok) throw new Error("Full track unavailable");
      state.playing=!!(auto && media.currentTime>0.25 && !media.paused);
    } else {
      try{ if(ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo(); }catch{}
      try{ media.pause(); }catch{}
      const sources=await resolveSources(song.id);
      if(my!==state.token) return;
      if(sources[0]){
        if(sources[0].title) song.title=sources[0].title;
        if(sources[0].artist) song.artist=sources[0].artist;
      }
      let last=null;
      for(const src of sources){
        try{
          await playCandidate(src);
          if(my!==state.token) return;
          media.volume=Math.max(0,Math.min(1,(S.prefs().vol||80)/100));
          if(auto){ const play=media.play(); if(play&&play.catch) play.catch(()=>{}); }
          const moved=auto ? await began(media, 4000) : true;
          state.playing=!!(auto && moved && !media.paused);
          last=null;
          if(moved || !auto) break;
          destroyEngine();
        }catch(e){
          last=e;
          destroyEngine();
        }
      }
      if(last) throw last;
      if(auto && !state.playing && engine.kind!=="yt" && /^[\w-]{11}$/.test(String(song.id||""))){
        try{ await attachYt(song.id, true); engine.kind="yt"; }
        catch(e){ throw e; }
      }
      if(auto && !state.playing && engine.kind!=="yt") throw new Error("no playable source");
    }
    state.skip=0;
    setStatus(state.playing?"Playing":(engine.kind==="yt"?"Loading…":"Ready"));
    paintNow();
    if(state.playing) prefetchNext();
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
  if(media.paused){ const play=media.play(); if(play&&play.catch) play.catch(()=>setStatus("Tap play")); }
  else { media.pause(); state.playing=false; }
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
media.addEventListener("timeupdate", ()=>{
  tick();
  if(!media.paused && media.currentTime>0.25 && !state.playing){
    state.playing=true;
    setStatus("Playing");
    paintNow();
  }
});
setInterval(()=>{ if(engine.kind==="yt") tick(); }, 400);
media.addEventListener("play", ()=>{
  if(media.currentTime>0.25){ state.playing=true; setStatus("Playing"); }
  paintNow();
});
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
loadLiveCatalog().then(()=>{ if(state.view==="home") viewHome(); paintSide(); }).catch(()=>{});
ensureLibcurl().catch(()=>{ setStatus(state.playing?"":"Direct"); });
