/* DAYMAR-SHOP · service worker mínimo: solo permite instalar la app. No guarda nada en caché, así siempre ves la versión más nueva. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("dms-estaticos-")&&x!==CACHE).map(x=>caches.delete(x))))])));
/* Caché solo de archivos con versión (?v=…) y librerías fijas: la URL cambia cuando el archivo cambia, así que nunca se ve código viejo. Las páginas y los datos siempre van a la red. */
const CACHE="dms-estaticos-1";
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;let u;try{u=new URL(r.url)}catch(x){return}
 const fijo=/(^|\.)(cdn\.jsdelivr\.net|fonts\.gstatic\.com|fonts\.googleapis\.com)$/.test(u.hostname),ver=u.origin===self.location.origin&&u.searchParams.has("v")&&/\.(js|css|png|webmanifest)$/.test(u.pathname);
 if(!fijo&&!ver)return;
 e.respondWith(caches.open(CACHE).then(c=>c.match(r).then(h=>h||fetch(r).then(n=>{if(n&&(n.ok||n.type==="opaque"))c.put(r,n.clone()).catch(()=>{});return n}))))});

/* Avisos de pedidos en línea (Web Push) */
self.addEventListener("push",e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){}
 e.waitUntil(self.registration.showNotification(d.titulo||"DAYMARSV",{body:d.cuerpo||"",icon:"favicon-192.png",badge:"favicon-192.png",tag:"pedido-linea",renotify:true,data:{url:d.url||"pedidos.html"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();const u=new URL((e.notification.data&&e.notification.data.url)||"pedidos.html",self.registration.scope).href;
 e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(L=>{for(const c of L){if(c.url.startsWith(self.registration.scope)&&"focus" in c){c.navigate(u).catch(()=>{});return c.focus()}}return self.clients.openWindow(u)}))});
