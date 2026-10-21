const FEEDS = [
  ["United States", "https://iptv-org.github.io/iptv/countries/us.m3u"],
  ["United Kingdom", "https://iptv-org.github.io/iptv/countries/uk.m3u"],
  ["Australia", "https://iptv-org.github.io/iptv/countries/au.m3u"],
  ["Canada", "https://iptv-org.github.io/iptv/countries/ca.m3u"],
  ["Ireland", "https://iptv-org.github.io/iptv/countries/ie.m3u"],
  ["New Zealand", "https://iptv-org.github.io/iptv/countries/nz.m3u"]
];
const BAD = /religious|shop|adult|xxx|betting|gambling/i;
const ORDER = ["News","Sports","Entertainment","Movies","Kids","Music","Documentary","Lifestyle","Business","Weather","General","Culture","Education","Science","Outdoor","Relax"];
let all = [], country = "All", query = "", hls = null, current = null, featured = null;

function parseM3U(text, countryName){
  const out = [];
  const lines = String(text||"").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++){
    const line = lines[i];
    if (line.indexOf("#EXTINF") !== 0) continue;
    const logo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || "";
    const group = (line.match(/group-title="([^"]*)"/) || [])[1] || "General";
    const name = line.slice(line.lastIndexOf(",") + 1).trim();
    let url = "";
    for (let j = i + 1; j < lines.length; j++){
      const s = lines[j].trim();
      if (!s || s.charAt(0) === "#") continue;
      url = s; break;
    }
    if (!logo || url.indexOf("http") !== 0) continue;
    if (/imgur\.com|ibb\.co/i.test(logo)) continue;
    if (BAD.test(group) || BAD.test(name)) continue;
    if (/geo-?blocked|test card|color bars/i.test(name)) continue;
    const rm = name.match(/\((\d{3,4})p\)/);
    const res = rm ? parseInt(rm[1], 10) : 0;
    const clean = name.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s*\(\d{3,4}p\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const cat = (group.split(";")[0] || "General").trim();
    out.push({ c: countryName, n: clean, g: cat, u: url, i: logo, r: res, k: countryName + "|" + clean.toLowerCase() });
  }
  return out;
}
function best(rows){
  const map = {};
  rows.forEach(ch => { const prev = map[ch.k]; if (!prev || (ch.r||0) > (prev.r||0)) map[ch.k] = ch; });
  return Object.values(map).sort((a,b) => (b.r||0) - (a.r||0) || a.n.localeCompare(b.n));
}
function esc(s){
  return String(s).replace(/[&<>"]/g, function(c){
    if (c === "&") return "&" + "amp;";
    if (c === "<") return "&" + "lt;";
    if (c === ">") return "&" + "gt;";
    return "&" + "quot;";
  });
}
function filtered(){
  const q = query.trim().toLowerCase();
  return all.filter(ch => {
    if (country !== "All" && ch.c !== country) return false;
    if (!q) return true;
    return (ch.n + " " + ch.c + " " + ch.g).toLowerCase().includes(q);
  });
}
function card(ch){
  const res = ch.r ? ch.r + "p" : "Live";
  const on = current && current.k === ch.k ? " on" : "";
  return '<button type="button" class="card'+on+'" data-k="'+esc(ch.k)+'"><img src="'+esc(ch.i)+'" alt="" loading="lazy" referrerpolicy="no-referrer"><em>'+res+'</em><b>'+esc(ch.n)+'</b><span>'+esc(ch.c)+'</span></button>';
}
function bindCards(root){
  root.querySelectorAll(".card").forEach(btn => {
    const img = btn.querySelector("img");
    img.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "ph";
      ph.textContent = (btn.querySelector("b").textContent || "TV").slice(0, 2).toUpperCase();
      img.replaceWith(ph);
    };
    btn.onclick = () => {
      const ch = all.find(x => x.k === btn.dataset.k);
      if (ch) play(ch, true);
    };
  });
}
function paintHero(rows){
  featured = rows[0] || null;
  const hero = document.getElementById("hero");
  if (!featured){
    document.getElementById("heroTitle").textContent = "Nothing in this filter";
    document.getElementById("heroText").textContent = "";
    hero.style.backgroundImage = "none";
    return;
  }
  document.getElementById("heroKicker").textContent = featured.g + " · " + featured.c;
  document.getElementById("heroTitle").textContent = featured.n;
  document.getElementById("heroText").textContent = (featured.r ? featured.r + "p · " : "") + "Play it in the player. The bar at the bottom keeps what is on.";
  hero.style.backgroundImage = "url('" + featured.i.replace(/'/g, "") + "')";
}
function paint(){
  const rows = filtered();
  paintHero(rows);
  const groups = {};
  rows.forEach(ch => { (groups[ch.g] = groups[ch.g] || []).push(ch); });
  const names = Object.keys(groups).sort((a,b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || groups[b].length - groups[a].length;
  }).filter(name => groups[name].length >= 4).slice(0, 10);
  const host = document.getElementById("rails");
  const blocks = [];
  if (rows.length) blocks.push('<section class="rail"><h2>' + (query ? "Results" : "Top channels") + '</h2><div class="row">' + rows.slice(0, 18).map(card).join("") + '</div></section>');
  if (!query) names.forEach(name => {
    blocks.push('<section class="rail"><h2>'+esc(name)+'</h2><div class="row">'+groups[name].slice(0, 18).map(card).join("")+'</div></section>');
  });
  host.innerHTML = blocks.join("") || '<p class="eyebrow" style="padding:24px 4vw">No channels.</p>';
  bindCards(host);
}
function chips(){
  const counts = {};
  all.forEach(ch => counts[ch.c] = (counts[ch.c]||0) + 1);
  const names = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
  const el = document.getElementById("chips");
  el.innerHTML = ["All"].concat(names).map(c => '<button type="button" class="chip'+(c===country?" on":"")+'" data-c="'+esc(c)+'">'+esc(c)+'</button>').join("");
  el.querySelectorAll("[data-c]").forEach(btn => btn.onclick = () => {
    country = btn.dataset.c;
    el.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x===btn));
    paint();
  });
}
function setStatus(t){ document.getElementById("status").textContent = t || ""; }
function destroy(){
  if (hls){ hls.destroy(); hls = null; }
  const v = document.getElementById("video");
  v.removeAttribute("src");
  try { v.load(); } catch(e){}
}
function applyQuality(){
  if (!hls || !hls.levels) return;
  const pref = document.getElementById("quality").value;
  if (pref === "auto"){ hls.currentLevel = -1; return; }
  const want = Number(pref);
  let pick = 0, diff = Infinity;
  hls.levels.forEach((lv, i) => { const d = Math.abs((lv.height||0) - want); if (d < diff){ diff = d; pick = i; } });
  hls.currentLevel = pick;
}
function showNow(ch){
  const bar = document.getElementById("nowbar");
  bar.classList.add("show");
  document.getElementById("nowName").textContent = ch.n;
  document.getElementById("nowMeta").textContent = ch.g + " · " + ch.c + (ch.r ? " · " + ch.r + "p" : "");
  const img = document.getElementById("nowLogo");
  img.src = ch.i;
  document.getElementById("playerName").textContent = ch.n;
  document.getElementById("playerMeta").textContent = ch.g + " · " + ch.c;
}
async function play(ch, open){
  current = ch;
  showNow(ch);
  if (open) document.getElementById("player").classList.add("open");
  destroy();
  setStatus("Starting " + ch.n + "…");
  const video = document.getElementById("video");
  const native = video.canPlayType("application/vnd.apple.mpegurl");
  if (!window.Hls || !Hls.isSupported()){
    video.src = ch.u;
    setStatus(native ? "" : "This browser cannot play the stream.");
    try { await video.play(); } catch(e){}
    paint();
    return;
  }
  hls = new Hls({ enableWorker:true, lowLatencyMode:false, maxBufferLength:8 });
  hls.on(Hls.Events.MANIFEST_PARSED, () => { applyQuality(); setStatus(""); video.play().catch(()=>{}); });
  hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
    const lv = hls.levels && hls.levels[data.level];
    if (lv && lv.height){
      setStatus(lv.height + "p");
      document.getElementById("nowMeta").textContent = ch.g + " · " + ch.c + " · " + lv.height + "p";
    }
  });
  hls.on(Hls.Events.ERROR, (_, data) => { if (data && data.fatal) setStatus("Couldn't play this channel."); });
  hls.loadSource(ch.u);
  hls.attachMedia(video);
  paint();
}
function stop(){
  destroy();
  current = null;
  document.getElementById("player").classList.remove("open");
  document.getElementById("nowbar").classList.remove("show");
  paint();
}
document.getElementById("close").onclick = () => document.getElementById("player").classList.remove("open");
document.getElementById("nowOpen").onclick = () => { if (current) document.getElementById("player").classList.add("open"); };
document.getElementById("nowStop").onclick = stop;
document.getElementById("quality").onchange = applyQuality;
document.getElementById("heroPlay").onclick = () => { if (featured) play(featured, true); };
document.getElementById("q").addEventListener("input", e => { query = e.target.value || ""; paint(); });

(async function load(){
  const parts = await Promise.all(FEEDS.map(pair =>
    fetch(pair[1]).then(r => { if (!r.ok) throw new Error(pair[0]); return r.text(); }).then(t => parseM3U(t, pair[0])).catch(() => [])
  ));
  all = best([].concat(...parts));
  chips();
  paint();
})();
