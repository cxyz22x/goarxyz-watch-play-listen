const CACHE = "goarxyz-shell-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./site-nav.js",
  "./app-shell.js",
  "./goarxyz.html",
  "./music.html",
  "./games.html",
  "./embeds.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = req.url;
  if (
    url.includes("api.themoviedb.org") ||
    url.includes("image.tmdb.org") ||
    url.includes("youtube.com") ||
    url.includes("youtubei.googleapis.com") ||
    url.includes("vidrock.") ||
    url.includes("googlevideo.com") ||
    url.includes("libcurl") ||
    url.includes("hls.js") ||
    url.includes("wisp.") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok && new URL(req.url).origin === location.origin) {
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => hit))
  );
});
