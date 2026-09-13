const CACHE='sf-preventivi-v3';
const CORE=['./','./index.html','./styles.css','./db.js','./contract.js','./pdf.js','./app.js','./manifest.webmanifest','./icons/icon.svg','https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(async c=>{for(const u of CORE){try{await c.add(u)}catch(err){console.warn('cache',u,err)}}}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(x=>x.put(e.request,copy)).catch(()=>{});return r}).catch(()=>caches.match('./index.html'))))});
