/* DAYMARSV · Búsqueda global: productos, clientes, ventas y pedidos en línea desde cualquier página (botón Buscar, Ctrl+K o "/") */
(()=>{
"use strict";
const {db,esc}=DAY;
const BUSQ_PAG={"ventas.html":"#vQ","clientes.html":"#cQ","reportes.html":"#pQ","pedidos.html":"#kQ","kardex.html":"#kQ","catalogo.html":"#kQ"};

/* Si venimos de un resultado, escribe lo buscado en el buscador de la página destino */
function aplicarPendiente(){let q="";try{q=sessionStorage.getItem("dms_q")||"";sessionStorage.removeItem("dms_q")}catch(e){}
 const sel=BUSQ_PAG[location.pathname.split("/").pop()];if(!q||!sel)return;let n=0;
 const t=setInterval(()=>{const i=document.querySelector(sel),app=document.getElementById("app");n++;
  if(i&&app&&!app.classList.contains("hidden")){clearInterval(t);setTimeout(()=>{i.value=q;i.dispatchEvent(new Event("input",{bubbles:true}));i.dispatchEvent(new Event("change",{bubbles:true}))},500)}else if(n>40)clearInterval(t)},250)}

const permitido=k=>{const m=DAY.me;return !m||m.rol==="admin"||!Array.isArray(m.modulos_ocultos)||!m.modulos_ocultos.includes(k)};

function abrir(){
 if(document.getElementById("gsDlg")||!DAY.me)return;
 const d=document.createElement("dialog");d.id="gsDlg";
 d.style.cssText="border:0;border-radius:16px;padding:0;margin:8vh auto auto;width:min(560px,94vw);max-height:84vh;background:var(--card,#fff);color:var(--ink,#2a1a1f);box-shadow:0 20px 60px rgba(0,0,0,.35)";
 d.innerHTML=`<style>#gsDlg::backdrop{background:rgba(0,0,0,.55)}#gsDlg .gsr:hover,#gsDlg .gsr:focus{background:var(--chip,#f0e6e9);outline:0}</style><div style="padding:14px"><div style="display:flex;gap:8px;align-items:center"><input id="gsQ" type="text" inputmode="search" enterkeyhint="search" placeholder="Buscar producto, cliente, venta o pedido…" autocomplete="off" style="flex:1;min-width:0;box-sizing:border-box;padding:12px 14px;border:1px solid var(--line,#e6dde0);border-radius:12px;font:inherit;font-size:16px;background:var(--card,#fff);color:inherit"><button type="button" id="gsX" aria-label="Cerrar" style="flex:none;width:44px;height:44px;border:1px solid var(--line,#e6dde0);border-radius:12px;background:var(--card,#fff);color:inherit;font-size:20px;line-height:1;cursor:pointer">✕</button></div><div id="gsR" style="margin-top:10px;max-height:60vh;overflow:auto"><p style="color:var(--mute,#7b6a70);font-size:13px;margin:6px 2px">Escribe al menos 2 letras o números. Puedes buscar por nombre, código, teléfono o n.º de pedido.</p></div></div>`;
 document.body.appendChild(d);d.showModal();d.addEventListener("close",()=>d.remove());
 d.querySelector("#gsX").onclick=()=>d.close();
 d.addEventListener("click",e=>{if(e.target===d)d.close()});
 const q=d.querySelector("#gsQ"),R=d.querySelector("#gsR");let tm=0,seq=0,A=[];
 const ir=(href,txt,id)=>{
  if(id){if(window.DMS_abrirProducto){d.close();window.DMS_abrirProducto(id);return}try{sessionStorage.setItem("dms_prod",id)}catch(e){}location.href=href;return}
  try{sessionStorage.setItem("dms_q",txt)}catch(e){}location.href=href};
 const fila=(i,t,s)=>`<button type="button" class="gsr" data-i="${i}" style="display:block;width:100%;text-align:left;padding:9px 10px;border:0;border-radius:10px;background:none;color:inherit;font:inherit;cursor:pointer"><b style="font-size:14px">${esc(t)}</b><br><small style="color:var(--mute,#7b6a70)">${esc(s)}</small></button>`;
 const sec=(tt,arr)=>arr.length?`<div style="font:700 11px 'DM Sans',sans-serif;color:var(--mute,#7b6a70);text-transform:uppercase;letter-spacing:.06em;margin:10px 4px 2px">${tt}</div>`+arr.join(""):"";
 async function buscar(){
  const t=q.value.trim().replace(/[%,()*]/g," ").trim(),my=++seq;if(t.length<2){R.innerHTML="";return}
  R.innerHTML='<p style="color:var(--mute,#7b6a70);font-size:13px">Buscando…</p>';
  const L=`%${t}%`,vac=[];
  const [pr,cl,ve,pe]=await Promise.all([
   db.from("productos").select("id,nombre,codigo,codigo_barras,stock,precio_venta").eq("activo",true).or(`nombre.ilike.${L},codigo.ilike.${L},codigo_barras.ilike.${L}`).limit(6).then(r=>r.data||[],()=>vac),
   permitido("clientes")?db.from("clientes").select("id,nombre,telefono,correo").or(`nombre.ilike.${L},telefono.ilike.${L},correo.ilike.${L}`).limit(5).then(r=>r.data||[],()=>vac):vac,
   permitido("ventas")?db.from("ventas").select("id,numero,codigo,cliente_nombre,total,created_at").or(`codigo.ilike.${L},cliente_nombre.ilike.${L}`+(/^\d{1,9}$/.test(t)?`,numero.eq.${t}`:"")).order("created_at",{ascending:false}).limit(5).then(r=>r.data||[],()=>vac):vac,
   permitido("pedidos")?db.from("pedidos_linea").select("id,codigo,cliente_nombre,total,estado").or(`codigo.ilike.${L},cliente_nombre.ilike.${L}`).order("created_at",{ascending:false}).limit(5).then(r=>r.data||[],()=>vac):vac]);
  if(my!==seq)return;A=[];
  const add=(href,txt,id)=>A.push([href,txt,id])-1;
  const h=sec("Productos",pr.map(x=>fila(add("almacenamiento.html",x.nombre,x.id),x.nombre,(x.codigo_barras||x.codigo||"")+" · stock "+x.stock+" · $"+Number(x.precio_venta||0).toFixed(2))))
   +sec("Clientes",cl.map(x=>fila(add("clientes.html",x.nombre),x.nombre,[x.telefono,x.correo].filter(Boolean).join(" · "))))
   +sec("Ventas",ve.map(x=>fila(add("ventas.html",String(x.codigo||x.numero)),"Venta #"+x.numero+(x.cliente_nombre?" · "+x.cliente_nombre:""),(x.codigo||"")+" · $"+Number(x.total||0).toFixed(2)+" · "+String(x.created_at).slice(0,10))))
   +sec("Pedidos en línea",pe.map(x=>fila(add("pedidos.html",x.codigo),String(x.codigo).replace(/^D[YM]-/,"")+(x.cliente_nombre?" · "+x.cliente_nombre:""),x.estado+" · $"+Number(x.total||0).toFixed(2))));
  R.innerHTML=h||'<p style="color:var(--mute,#7b6a70);font-size:13px">Sin resultados.</p>'}
 q.oninput=()=>{clearTimeout(tm);tm=setTimeout(buscar,300)};
 R.onclick=e=>{const b=e.target.closest("[data-i]");if(b&&A[+b.dataset.i])ir(...A[+b.dataset.i])};
 q.onkeydown=e=>{if(e.key==="Enter"){const b=R.querySelector("[data-i]");if(b)b.click()}};
 q.focus()}
DAY.buscarGlobal=abrir;

document.addEventListener("keydown",e=>{const t=e.target&&e.target.tagName,k=(e.key||"").toLowerCase();
 if(((e.ctrlKey||e.metaKey)&&k==="k")||(e.key==="/"&&t!=="INPUT"&&t!=="TEXTAREA"&&t!=="SELECT"&&!(e.target&&e.target.isContentEditable))){if(!DAY.me)return;e.preventDefault();abrir()}});

/* Botón "Buscar" en el menú lateral (de escritorio) y en la barra superior del menú principal (celular) */
const ICO='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
let n=0;const t=setInterval(()=>{n++;
 const side=document.getElementById("side"),nav=side&&side.querySelector("nav");
 if(nav&&!document.getElementById("gs1")){const b=document.createElement("button");b.type="button";b.id="gs1";b.title="Buscar (Ctrl + K)";b.style.cssText="display:flex;align-items:center;gap:10px;width:calc(100% - 20px);margin:4px 10px 10px;padding:9px 12px;border:1px solid var(--line,#e6dde0);border-radius:12px;background:var(--card,#fff);color:var(--mute,#7b6a70);font:inherit;font-size:14px;cursor:pointer";b.innerHTML=ICO+'<span style="flex:1;text-align:left">Buscar</span><kbd style="font:600 11px sans-serif;padding:2px 6px;border:1px solid var(--line,#e6dde0);border-radius:6px">Ctrl K</kbd>';b.onclick=abrir;side.insertBefore(b,nav)}
 const who=document.querySelector(".top .who");
 if(who&&!document.getElementById("gs2")){const b=document.createElement("button");b.type="button";b.id="gs2";b.className="tbtn";b.setAttribute("aria-label","Buscar");b.title="Buscar";b.innerHTML=ICO;b.onclick=abrir;who.insertBefore(b,who.firstChild)}
 if(n>60||(document.getElementById("gs1")||!document.getElementById("side"))&&(document.getElementById("gs2")||!document.querySelector(".top .who")))clearInterval(t)},250);
aplicarPendiente();
})();
