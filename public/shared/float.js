(function(){
  const LINKS = [
    ["Home", "/index.html"],
    ["Movies", "/pages/watch/index.html?tab=movie"],
    ["TV", "/pages/watch/index.html?tab=tv"],
    ["Music", "/pages/music/index.html"],
    ["Games", "/pages/games/index.html"],
    ["Live", "/pages/live/index.html"],
    ["Anime", "/pages/anime/index.html"]
  ];
  const btn = document.createElement("button");
  btn.id = "goarFloat";
  btn.type = "button";
  btn.setAttribute("aria-label", "Menu");
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  const menu = document.createElement("nav");
  menu.id = "goarFloatMenu";
  menu.hidden = true;
  const here = location.pathname;
  LINKS.forEach(function(pair){
    const a = document.createElement("a");
    a.href = pair[1];
    a.textContent = pair[0];
    const path = pair[1].split("?")[0].replace(/index\.html$/, "");
    if (here.indexOf(path) === 0) a.className = "on";
    menu.appendChild(a);
  });
  document.body.appendChild(menu);
  document.body.appendChild(btn);
  const KEY = "goar-float";
  function place(x, y){
    const w = 56, h = 56;
    x = Math.max(8, Math.min(x, innerWidth - w - 8));
    y = Math.max(8, Math.min(y, innerHeight - h - 8));
    btn.style.left = x + "px";
    btn.style.top = y + "px";
    const mw = menu.offsetWidth || 160;
    const mh = menu.offsetHeight || 300;
    let mx = x - mw - 10;
    if (mx < 8) mx = x + w + 10;
    let my = y;
    if (my + mh > innerHeight - 8) my = innerHeight - mh - 8;
    menu.style.left = mx + "px";
    menu.style.top = Math.max(8, my) + "px";
  }
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  place(saved && typeof saved.x === "number" ? saved.x : innerWidth - 72, saved && typeof saved.y === "number" ? saved.y : innerHeight - 88);
  let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
  btn.addEventListener("pointerdown", function(e){
    dragging = true;
    moved = false;
    btn.setPointerCapture(e.pointerId);
    const r = btn.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
  });
  btn.addEventListener("pointermove", function(e){
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    place(ox + dx, oy + dy);
  });
  btn.addEventListener("pointerup", function(){
    if (!dragging) return;
    dragging = false;
    const r = btn.getBoundingClientRect();
    try { localStorage.setItem(KEY, JSON.stringify({ x: r.left, y: r.top })); } catch (e) {}
    if (!moved) menu.hidden = !menu.hidden;
  });
  btn.addEventListener("pointercancel", function(){ dragging = false; });
  addEventListener("resize", function(){
    const r = btn.getBoundingClientRect();
    place(r.left, r.top);
  });
})();
