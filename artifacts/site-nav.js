(function () {
  if (document.getElementById("goarGo")) return;
  var PAGES = [
    { href: "index.html", label: "Home", key: "home" },
    { href: "goarxyz.html?tab=movie", label: "Movies", key: "movie" },
    { href: "goarxyz.html?tab=tv", label: "TV", key: "tv" },
    { href: "music.html", label: "Music", key: "music" },
    { href: "games.html", label: "Games", key: "games" },
    { href: "live.html", label: "Live", key: "live" },
    { href: "goarxyz-anime.html", label: "Anime", key: "anime" }
  ];
  var here = (location.pathname || "") + (location.search || "");
  function on(p) {
    if (p.key === "home") return /index\.html$|\/$/.test(location.pathname) && !/goarxyz|music|games|live|anime/.test(here);
    if (p.key === "movie") return /goarxyz\.html/.test(here) && !/[?&]tab=tv/.test(here) && !/anime/.test(here);
    if (p.key === "tv") return /[?&]tab=tv/.test(here);
    if (p.key === "music") return /music/.test(here);
    if (p.key === "games") return /games/.test(here);
    if (p.key === "live") return /live/.test(here);
    if (p.key === "anime") return /anime/.test(here);
    return false;
  }
  var css = document.createElement("style");
  css.textContent = [
    "#goarGo{position:fixed;z-index:1000;width:44px;height:44px;border-radius:50%;",
    "border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;",
    "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);",
    "display:flex;align-items:center;justify-content:center;",
    "cursor:grab;touch-action:none;box-shadow:none;padding:0;opacity:.55}",
    "#goarGo:hover{opacity:.95;background:rgba(255,255,255,.16)}",
    "#goarGo svg{width:20px;height:20px;opacity:.9}",
    "#goarGo:active{cursor:grabbing}",
    "#goarGoMenu{position:fixed;z-index:1000;min-width:148px;padding:8px;border-radius:16px;",
    "background:rgba(16,16,24,.86);border:1px solid rgba(255,255,255,.12);",
    "backdrop-filter:blur(16px);display:flex;flex-direction:column;gap:2px;",
    "box-shadow:0 16px 40px rgba(0,0,0,.4)}",
    "#goarGoMenu[hidden]{display:none}",
    "#goarGoMenu a{color:#c8c9d4;text-decoration:none;font:500 14px Inter,system-ui,sans-serif;",
    "padding:10px 12px;border-radius:10px}",
    "#goarGoMenu a.on,#goarGoMenu a:hover{background:rgba(255,255,255,.92);color:#07070c}"
  ].join("");
  document.documentElement.appendChild(css);
  var btn = document.createElement("button");
  btn.id = "goarGo";
  btn.type = "button";
  btn.setAttribute("aria-label", "Settings");
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var menu = document.createElement("nav");
  menu.id = "goarGoMenu";
  menu.setAttribute("aria-label", "Pages");
  menu.hidden = true;
  PAGES.forEach(function (p) {
    var a = document.createElement("a");
    a.href = p.href;
    a.textContent = p.label;
    if (on(p)) a.className = "on";
    menu.appendChild(a);
  });
  function mount() {
    if (!document.body) return;
    document.body.appendChild(menu);
    document.body.appendChild(btn);
    var KEY = "goar-float";
    function place(x, y) {
      var w = 48, h = 48;
      x = Math.max(8, Math.min(x, innerWidth - w - 8));
      y = Math.max(8, Math.min(y, innerHeight - h - 8));
      btn.style.left = x + "px";
      btn.style.top = y + "px";
      var mw = menu.offsetWidth || 160;
      var mh = menu.offsetHeight || 300;
      var mx = x - mw - 10;
      if (mx < 8) mx = x + w + 10;
      var my = y;
      if (my + mh > innerHeight - 8) my = innerHeight - mh - 8;
      menu.style.left = mx + "px";
      menu.style.top = Math.max(8, my) + "px";
    }
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    place(saved && typeof saved.x === "number" ? saved.x : innerWidth - 72, saved && typeof saved.y === "number" ? saved.y : innerHeight - 88);
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    btn.addEventListener("pointerdown", function (e) {
      dragging = true; moved = false;
      btn.setPointerCapture(e.pointerId);
      var r = btn.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    });
    btn.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      place(ox + dx, oy + dy);
    });
    btn.addEventListener("pointerup", function () {
      if (!dragging) return;
      dragging = false;
      var r = btn.getBoundingClientRect();
      try { localStorage.setItem(KEY, JSON.stringify({ x: r.left, y: r.top })); } catch (e) {}
      if (!moved) menu.hidden = !menu.hidden;
    });
    addEventListener("resize", function () {
      var r = btn.getBoundingClientRect();
      place(r.left, r.top);
    });
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
