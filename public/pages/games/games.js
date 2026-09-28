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
  box.innerHTML = rows.map((g) => `<button type="button" class="gcard" data-id="${esc(g.id)}"><img src="${esc(g.cover || "")}" alt="" loading="lazy"><div class="m"><b>${esc(g.title)}</b><span>${esc(g.category || "arcade")}</span></div></button>`).join("");
  box.querySelectorAll(".gcard").forEach((el) => el.onclick = () => openGame(el.dataset.id));
}
function openGame(id){
  const g = games.find((x) => x.id === id);
  if (!g) return;
  $("#playTitle").textContent = g.title;
  $("#playFrame").src = g.file;
  $("#play").classList.add("on");
}
function closeGame(){
  $("#play").classList.remove("on");
  $("#playFrame").src = "about:blank";
}
$("#playClose").onclick = closeGame;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeGame(); });
loadGames();
