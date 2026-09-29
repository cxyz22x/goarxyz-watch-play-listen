(function(){
  function fitChrome(){
    const shell = document.getElementById("app-shell");
    const dock = document.getElementById("app-dock");
    const root = document.documentElement;
    if (shell) root.style.setProperty("--shell-h", Math.ceil(shell.getBoundingClientRect().height) + "px");
    if (dock) root.style.setProperty("--dock-h", Math.ceil(dock.getBoundingClientRect().height) + "px");
  }
  fitChrome();
  addEventListener("resize", fitChrome);
  const titles={home:"goarxyz",movie:"Movies — goarxyz",tv:"TV — goarxyz",live:"Live — goarxyz",list:"List — goarxyz",music:"Music — goarxyz",games:"Games — goarxyz"};
  let gamesLoaded=false;
  function show(name, push){
    if(name==="watch") name="movie";
    const asked = name;
    const watchTabs=["movie","tv","anime","kids","hubs","music","list","live"];
    let inner=null;
    if(name==="live"||name==="list"){ inner=name; name="movie"; }
    const view = name==="home"||name==="music"||name==="games" ? name : "watch";
    ["home","watch","music","games"].forEach(v=>{
      const el=document.getElementById("view-"+v);
      if(el) el.classList.toggle("on", v===view);
    });
    document.querySelectorAll("#sideNav [data-view], #app-dock [data-view]").forEach(b=>{
      if(b.classList.contains("brand")) return;
      const id=b.getAttribute("data-view");
      const page=inner||asked;
      b.classList.toggle("on", id===page);
    });
    document.body.classList.remove("nav-open");
    document.title=titles[asked]||"goarxyz";
    if(view==="watch" && typeof routeTo==="function"){
      routeTo(inner || (watchTabs.indexOf(name)>=0?name:"home"));
    }
    if(name==="games") loadGames();
    requestAnimationFrame(fitChrome);
    if(push){
      const url = asked==="home" ? "./" : "./?v="+asked;
      history.pushState({view:asked}, "", url);
    }
  }
  let GAMES = [];
  let gamesReady = false;
  let gameQuery = "";
  let gameCat = "all";
  const GAME_CATS = ["all","arcade","puzzle","word","skill","strategy","creative"];
  function renderGames(){
    const box = document.getElementById("gameGrid");
    const q = gameQuery.trim().toLowerCase();
    const rows = GAMES.filter(function(g){
      if (gameCat !== "all" && (g.category || "") !== gameCat) return false;
      if (!q) return true;
      return ((g.title || "") + " " + (g.description || "") + " " + (g.category || "")).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length){ box.innerHTML = '<p class="gempty">No games match.</p>'; return; }
    box.innerHTML = rows.map(function(g){
      const cover = g.cover || "";
      const title = g.title || "Game";
      return '<button type="button" data-id="' + g.id + '"><img src="' + cover + '" alt="" loading="lazy"><b>' + String(title).replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/>/g,"&"+"gt;") + '</b><span>' + (g.category || "") + '</span></button>';
    }).join("");
    box.querySelectorAll("[data-id]").forEach(function(el){
      el.onclick = function(){ playGame(el.getAttribute("data-id")); };
    });
  }
  function playGame(id){
    const g = GAMES.find(function(x){ return x.id === id; });
    if (!g || !g.file) return;
    const play = document.getElementById("gamePlay");
    const frame = document.getElementById("gameFrame");
    const status = document.getElementById("gameStatus");
    document.getElementById("gameTitle").textContent = g.title || "Game";
    if (status) status.textContent = "Loading…";
    play.hidden = false;
    document.body.classList.add("playing-game");
    frame.onload = function(){
      if (!status) return;
      let href = "";
      try { href = frame.contentWindow.location.href || ""; } catch(e){ href = "game"; }
      if (href.indexOf("about:srcdoc") >= 0) return;
      status.textContent = "";
    };
    const url = g.file;
    let src = url;
    try {
      const u = new URL(url);
      if (/marketjs\.com$/i.test(u.hostname)) src = "/gcdn" + u.pathname + (u.search || "");
    } catch (e) {}
    frame.removeAttribute("srcdoc");
    frame.src = src;
  }
  function closeGame(){
    const frame = document.getElementById("gameFrame");
    frame.removeAttribute("srcdoc");
    frame.src = "about:blank";
    document.getElementById("gamePlay").hidden = true;
    document.body.classList.remove("playing-game");
  }
  function loadGames(){
    if (gamesReady) return;
    gamesReady = true;
    const box = document.getElementById("gameGrid");
    if (box) box.innerHTML = '<p class="gempty">Loading games…</p>';
    fetch("games.json").then(function(r){ if(!r.ok) throw new Error("games list"); return r.json(); }).then(function(list){
      GAMES = Array.isArray(list) ? list : [];
      const cats = document.getElementById("gameCats");
      cats.innerHTML = GAME_CATS.map(function(c){
        return '<button type="button" class="gchip' + (c===gameCat?" on":"") + '" data-cat="' + c + '">' + (c==="all"?"All":c) + '</button>';
      }).join("");
      cats.querySelectorAll("[data-cat]").forEach(function(btn){
        btn.onclick = function(){
          gameCat = btn.getAttribute("data-cat");
          cats.querySelectorAll(".gchip").forEach(function(x){ x.classList.toggle("on", x===btn); });
          renderGames();
        };
      });
      document.getElementById("gameSearch").addEventListener("input", function(e){
        gameQuery = e.target.value || "";
        renderGames();
      });
      document.getElementById("gameBack").onclick = closeGame;
      document.addEventListener("keydown", function(e){ if (e.key === "Escape") closeGame(); });
      renderGames();
    }).catch(function(){
      gamesReady = false;
      if (box) box.innerHTML = '<p class="gempty">Games list failed to load.</p>';
    });
  }
  window.goarShow = show;
  document.querySelectorAll("#app-shell [data-view], #view-home [data-view], #app-dock [data-view], #sideNav [data-view]").forEach(el=>{
    el.addEventListener("click", ev=>{ ev.preventDefault(); show(el.getAttribute("data-view"), true); });
  });
  const sideToggle = document.getElementById("sideToggle");
  const navShade = document.getElementById("navShade");
  if (sideToggle) sideToggle.addEventListener("click", ev => { ev.stopPropagation(); document.body.classList.toggle("nav-open"); });
  if (navShade) navShade.addEventListener("click", () => document.body.classList.remove("nav-open"));
  window.addEventListener("popstate", ev=> show((ev.state&&ev.state.view)||new URLSearchParams(location.search).get("v")||"home", false));
  show(new URLSearchParams(location.search).get("v")||"home", false);
})();
