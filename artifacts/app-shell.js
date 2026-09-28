(function () {
  const inFrame = window.parent && window.parent !== window;
  const embed = /(?:\?|&)embed=1(?:&|$)/.test(location.search) || inFrame;
  if (embed) document.documentElement.classList.add("in-shell");

  const man = document.querySelector('link[rel="manifest"]') || document.createElement("link");
  man.rel = "manifest";
  man.href = "manifest.webmanifest";
  if (!man.parentNode) document.head.appendChild(man);

  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = "icon-192.png";
    document.head.appendChild(icon);
  }

  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (secure && "serviceWorker" in navigator && !inFrame) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
