const CACHE='matjari-app-1.1.5';
const FILES=["./","./index.html","./app-icon.svg","./manifest.webmanifest","./styles.css?v=1.1.5","./theme.css?v=1.1.5","./inventory.js?v=1.1.5","./ledger.js?v=1.1.5","./commerce.js?v=1.1.5","./report-data.js?v=1.1.5","./grocery-catalog.js?v=1.1.5","./backup-data.js?v=1.1.5","./reports.js?v=1.1.5","./settings.js?v=1.1.5","./cloud.css?v=1.1.5","./cloud-config.js?v=1.1.5","./cloud.bundle.js?v=1.1.5","./app.js?v=1.1.5"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>{if(!self.registration.active)return self.skipWaiting();})));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('matjari-app-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.pathname==='/__revision'||url.pathname.endsWith('/version.json'))return;
  const local=url.origin===self.location.origin&&(!url.pathname.split('/').pop().includes('.')||/\.(html|css|js|svg|webmanifest)$/.test(url.pathname));
  const image=/^[a-z0-9-]+\.convex\.cloud$/.test(url.hostname)&&url.pathname.startsWith('/api/storage/');
  const cdn=['fonts.googleapis.com','fonts.gstatic.com','unpkg.com'].includes(url.hostname);
  if(!local&&!image&&!cdn)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),saved=await cache.match(request);
    if((image||cdn)&&saved)return saved;
    try{const response=await fetch(request);if(response.ok||response.type==='opaque'){await cache.put(request,response.clone());if(image){const keys=await cache.keys();const images=keys.filter(r=>new URL(r.url).pathname.startsWith('/api/storage/'));if(images.length>250)await cache.delete(images[0]);}}return response;}
    catch(error){if(saved)return saved;if(request.mode==='navigate')return await cache.match('./index.html');throw error;}
  })());
});
