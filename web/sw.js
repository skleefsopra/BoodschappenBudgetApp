// Werkt offline: de app zelf uit de cache, de prijzen eerst van internet en anders de laatst bekende.
const CACHE = "weekmenu-v1";
const APP = ["./", "index.html", "app.js", "planner.js", "manifest.webmanifest", "icon.svg"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Netwerk eerst, zodat nieuwe prijzen en nieuwe versies van de app meteen binnenkomen.
  e.respondWith(fetch(e.request).then((r) => {
    const kopie = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, kopie));
    return r;
  }).catch(() => caches.match(e.request)));
});
