const GIST = "https://gist.githubusercontent.com/goarxyz/32cda7ea99aceb680a533cb51fb6546f/raw/af549f9cbfdfa6a0287d66c6084209cc75f5985b/marketjs.json";
const $ = (s) => document.querySelector(s);
function esc(s){
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&" + "amp;",
    "<": "&" + "lt;",
    ">": "&" + "gt;",
    '"': "&" + "quot;",
    "'": "&" + "#39;"
  }[c]));
}
let games = [], cat = "all", q = "";

function parse(raw){
  const t = String(raw || "").trim();
  const json = JSON.parse(t[0] === "[" ? t : "[" + t + "]");
  return Array.isArray(json) ? json : Object.values(json || {});
}
async function loadGames(){
  for (const url of ["/games.json", GIST]){
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      games = parse(await r.text()).filter((g) => g && g.title && g.file);
      if (games.length) break;
    } catch (e) {}
  }
  const cats = ["all", ...[...new Set(games.map((g) => g.category || "arcade"))].sort()];
  $("#gchips").innerHTML = cats.map((c) => `<button type="button" class="chip ${c === "all" ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  $("#gchips").onclick = (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    cat = b.dataset.cat;
    document.querySelectorAll("#gchips .chip").forEach((x) => x.classList.toggle("on", x === b));
    paintGames();
  };
  $("#gq").oninput = (e) => { q = e.target.value.trim().toLowerCase(); paintGames(); };
  paintGames();
}
function paintGames(){
  const rows = games.filter((g) => {
    if (cat !== "all" && (g.category || "") !== cat) return false;
    if (q && !(g.title + " " + (g.description || "") + " " + (g.category || "")).toLowerCase().includes(q)) return false;
    return true;
  });
  const box = $("#ggrid");
  if (!rows.length){ box.innerHTML = '<div class="empty">No games in this filter.</div>'; return; }
  box.innerHTML = rows.map((g) => `<button type="button" class="gcard" data-id="${esc(g.id)}"><img src="${esc(g.cover || "")}" alt="" loading="lazy" referrerpolicy="no-referrer"><div class="m"><b>${esc(g.title)}</b><span>${esc(g.category || "arcade")}</span></div></button>`).join("");
  box.querySelectorAll(".gcard").forEach((el) => el.onclick = () => openGame(el.dataset.id));
}
function proxyFile(file){
  try {
    const u = new URL(file);
    if (!/marketjs\.com$/i.test(u.hostname)) return "";
    return "/gcdn" + u.pathname + (u.search || "");
  } catch (e) {
    return "";
  }
}
function wakeGame(frame){
  let n = 0;
  const iv = setInterval(() => {
    n++;
    try {
      const w = frame.contentWindow;
      const ig = w && w.ig;
      if (!ig || !ig.system || !ig.game) return;
      const vis = ig.visibilityHandler;
      if (vis && !vis.__goar) {
        vis.__goar = true;
        vis.isFocused = true;
        vis.pauseHandler = function () {};
        vis.systemPaused = function () { return true; };
      }
      if (vis) vis.isPaused = false;
      ig.game.paused = false;
      try { if (ig.sizeHandler && ig.sizeHandler.resize) ig.sizeHandler.resize(); } catch (e) {}
      if (!ig.system.running || !ig.system.__goar) {
        ig.system.__goar = true;
        if (ig.game.resumeGame) ig.game.resumeGame();
        else ig.system.startRunLoop();
      }
      try { w.focus(); } catch (e) {}
      if (ig.system.running && n > 3) clearInterval(iv);
    } catch (e) {}
    if (n > 40) clearInterval(iv);
  }, 250);
}
function openGame(id){
  const g = games.find((x) => x.id === id);
  if (!g || !g.file) return;
  const src = proxyFile(g.file);
  $("#playTitle").textContent = g.title;
  const frame = $("#playFrame");
  $("#gameStage").classList.add("on");
  frame.removeAttribute("srcdoc");
  frame.src = src || g.file;
  frame.onload = () => wakeGame(frame);
}
function closeGame(){
  const frame = $("#playFrame");
  frame.onload = null;
  frame.src = "about:blank";
  $("#gameStage").classList.remove("on");
}
$("#playClose").onclick = closeGame;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeGame(); });
if (window.navigation) {
  navigation.addEventListener("navigate", (e) => {
    const stage = document.getElementById("gameStage");
    if (stage && stage.classList.contains("on")) e.preventDefault();
  });
}
loadGames();
