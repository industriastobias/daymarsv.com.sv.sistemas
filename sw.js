/* DAYMAR-SHOP · service worker mínimo: solo permite instalar la app. No guarda nada en caché, así siempre ves la versión más nueva. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",()=>{});
