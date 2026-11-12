const cacheName = "role-radar-v1:" + self.registration.scope;
const prefix = "role-radar-";
const shell = ["./","./index.html","./style.css","./app.js","./manifest.webmanifest","./icon-192.png","./icon-512.png","./data/jobs.json"];
self.addEventListener("install", event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key.endsWith(":" + self.registration.scope) && key !== cacheName).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  const isFeed = new URL(request.url).pathname.endsWith("/data/jobs.json");
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (!response.ok) throw new Error("Network response unavailable");
      await cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      const cached = await cache.match(request) || (request.mode === "navigate" && await cache.match("./"));
      if (cached && isFeed) {
        const headers = new Headers(cached.headers);
        headers.set("X-Role-Radar-Offline", "1");
        return new Response(cached.body, {headers});
      }
      return cached || Response.error();
    }
  })());
});
