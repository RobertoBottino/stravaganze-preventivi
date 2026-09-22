const CACHE='sf-preventivi-v39';
const CORE=['./','./index.html','./styles.css?v=15','./proposal-v14.css?v=15','./crop-v18.css?v=20','./responsive-v19.css?v=19','./image-preview-v24.css?v=24','./nav-v29.css?v=29','./ux-v34.css?v=35','./google-forms-v37.css?v=37','./theme-light-v38.css?v=38','./db.js?v=15','./legacy-import-normalize-v27.js?v=27','./crop-v18.js?v=20','./image-preview-v24.js?v=24','./pdf.js?v=9','./contract-v10.js?v=36','./pdf-v10.js?v=33','./project-embed-v15.js?v=15','./app.js?v=39','./ui-v23.js?v=23','./pdf-import-v25.js?v=32','./nav-v29.js?v=35','./google-forms-v37.js?v=37','./manifest.webmanifest?v=15','./icons/icon.svg'];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',e=>{
  if(e.data?.type==='SKIP_WAITING')self.skipWaiting();
  if(e.data?.type==='CLEAR_OLD_CACHES'){
    e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  }
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);

  // OAuth and Google Forms data must always go directly to Google.
  if(u.hostname==='accounts.google.com'||u.hostname==='forms.googleapis.com'||u.hostname==='oauth2.googleapis.com')return;

  if(u.origin===location.origin){
    // Network-first + bypass the browser HTTP cache. This is important for installed
    // PWAs: every reopen checks the deployed files instead of trusting stale assets.
    e.respondWith(
      fetch(new Request(e.request,{cache:'no-store'}))
        .then(r=>{
          if(r&&r.ok){
            const copy=r.clone();
            caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
          }
          return r;
        })
        .catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
    );
    return;
  }

  // CDN libraries remain cache-first for speed/offline use.
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      if(res&&res.ok){
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      }
      return res;
    }))
  );
});
