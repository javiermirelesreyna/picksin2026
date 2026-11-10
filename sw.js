/* Picksin como app (Javier, 10/11/2026: "hagamos la app"). El service worker de la app instalable:
   - la pagina (index.html) y los datos (data/*.json): primero la red, y si no hay senal, lo ultimo guardado;
   - lo de assets/ con version (?v=): de lo guardado (la version cambia cuando cambia el archivo); sin version
     (imagenes, letras): lo guardado al instante y se refresca por detras;
   - lo que no es de la pagina (el intermediario del modo editor, Playdoit...) no se toca. */
var CACHE = 'picksin-app-1';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['./', 'index.html']); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* guarda una respuesta y borra las versiones viejas del mismo archivo (app.js?v=36 al llegar la 37) */
function guardar(req, res) {
  if (!res || !res.ok || res.type === 'opaque') { return; }
  var u = new URL(req.url), copia = res.clone();
  caches.open(CACHE).then(function (c) {
    return c.keys().then(function (ks) {
      ks.forEach(function (k) {
        var v = new URL(k.url);
        if (v.pathname === u.pathname && v.search !== u.search) { c.delete(k); }
      });
      return c.put(req, copia);
    });
  });
}
/* la pagina se pide sin la copia de 10 minutos del navegador: lo que se sube se ve en cuanto GitHub lo publica */
function primeroRed(req) {
  var red = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
  return red.then(function (res) { guardar(req, res); return res; }, function () {
    return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (r) {
      return r || (req.mode === 'navigate' ? caches.match('index.html') : null);
    }).then(function (r) {
      return r || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    });
  });
}
function primeroGuardado(req, refrescar) {
  return caches.match(req).then(function (r) {
    var red = fetch(req).then(function (res) { guardar(req, res); return res; });
    if (r) { if (refrescar) { red.catch(function () {}); } return r; }
    return red;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }
  var u = new URL(req.url);
  if (u.origin !== self.location.origin) { return; }
  if (req.mode === 'navigate' || /\/data\//.test(u.pathname) || /\.html$/.test(u.pathname)) { e.respondWith(primeroRed(req)); return; }
  if (/\/assets\//.test(u.pathname)) { e.respondWith(primeroGuardado(req, !u.search)); }
});
