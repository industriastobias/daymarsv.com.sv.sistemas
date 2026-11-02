/* DAYMAR-SHOP · service worker mínimo: solo permite instalar la app. No guarda nada en caché, así siempre ves la versión más nueva. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",()=>{});

/* Avisos de pedidos en línea (Web Push) */
self.addEventListener("push",e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){}
 e.waitUntil(self.registration.showNotification(d.titulo||"DAYMARSV",{body:d.cuerpo||"",icon:"favicon-192.png",badge:"favicon-192.png",tag:"pedido-linea",renotify:true,data:{url:d.url||"pedidos.html"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();const u=new URL((e.notification.data&&e.notification.data.url)||"pedidos.html",self.registration.scope).href;
 e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(L=>{for(const c of L){if(c.url.startsWith(self.registration.scope)&&"focus" in c){c.navigate(u).catch(()=>{});return c.focus()}}return self.clients.openWindow(u)}))});
