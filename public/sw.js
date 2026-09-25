/**
 * sw.js — deixa o sistema abrir sem rede (diário de obra no canteiro).
 *
 * - A página (index.html, o sistema inteiro num arquivo): rede primeiro,
 *   cache se não houver rede. Assim uma publicação nova chega na hora, e o
 *   canteiro sem sinal ainda abre a última versão.
 * - Bibliotecas do CDN (supabase-js, jspdf, xlsx) e fontes: cache e
 *   atualização em segundo plano — a URL é versionada.
 * - Todo o resto (a API do Supabase, sobretudo) passa direto: dado nunca
 *   vem do cache do service worker. Sem rede, quem guarda os dados é o
 *   Store (localStorage), que reenvia quando a conexão volta.
 */
const CACHE = 'souz-v1';
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

async function redePrimeiro(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    return (await cache.match(req)) || (await cache.match('./')) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cacheEAtualiza(req) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req);
  const nova = fetch(req)
    .then((resp) => {
      if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
      return resp;
    })
    .catch(() => guardada);
  return guardada || nova;
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || (url.origin === self.location.origin && /(\/|\.html)$/.test(url.pathname))) {
    ev.respondWith(redePrimeiro(req));
  } else if (CDN.includes(url.hostname)) {
    ev.respondWith(cacheEAtualiza(req));
  }
});
