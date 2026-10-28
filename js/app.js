/* DAYMAR-SHOP · funciones compartidas (conexión, sesión y utilidades) */
(function(){
const CFG={url:"https://itafqiemoulcztmhfqah.supabase.co",key:"sb_publishable_gkdG2OvACj7eGxaa5JSsLw_wO7w0bEB"};
const db=supabase.createClient(CFG.url,CFG.key);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $$=n=>"$"+Number(n||0).toLocaleString("es-SV",{minimumFractionDigits:2,maximumFractionDigits:2});
const ymd=d=>d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);
const toast=t=>{const e=document.getElementById("toast");if(!e)return;e.textContent=t;e.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("on"),3000)};
try{const th=localStorage.getItem("dms_th");if(th)document.documentElement.dataset.theme=th}catch(e){}
const toggleTheme=()=>{const r=document.documentElement,dk=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme:dark)").matches;r.dataset.theme=dk?"light":"dark";try{localStorage.setItem("dms_th",r.dataset.theme)}catch(e){}};
/* Iconos (líneas finas) y grupos del menú. ok = ya conectado a la base de datos · adm = solo administrador */
const ICON={
 cart:'<circle cx="9" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/><path d="M2 3h3l2.7 12.4a1 1 0 001 .8h9.7a1 1 0 001-.8L21 7H6"/>',
 box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
 store:'<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0"/>',
 users:'<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0112 0v1M17 4a4 4 0 010 8M22 21v-1a5 5 0 00-4-4.9"/>',
 tag:'<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
 receipt:'<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
 quote:'<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
 sale:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2"/>',
 cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"/>',
 chip:'<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
 bank:'<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
 stock:'<path d="M3 9l9-6 9 6v12H3z"/><path d="M8 21v-7h8v7"/>',
 home:'<path d="M3 12l9-9 9 9M5 10v10h14V10"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 sliders:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'};
const GRUPOS=[
 {t:"Vender",m:[{k:"almacenamiento",n:"Punto de venta",i:"sale",h:"almacenamiento.html",ok:1},{k:"facturas",n:"Facturas",i:"receipt",h:"almacenamiento.html#fac",ok:1},{k:"clientes",n:"Clientes",i:"users",h:"clientes.html",ok:1},{k:"descuentos",n:"Descuentos",i:"tag",h:"descuentos.html",ok:1,adm:1},{k:"cotizacion",n:"Cotización",i:"quote",h:"traslados.html"},{k:"reservas",n:"Reservas",i:"cal",h:"reservas.html"}]},
 {t:"Almacén",m:[{k:"inventario",n:"Inventario",i:"box",h:"reportes.html",ok:1},{k:"compra",n:"Compra",i:"cart",h:"compra.html",ok:1,adm:1},{k:"catalogo",n:"Catálogo",i:"store",h:"gastos.html"}]},
 {t:"Negocio",m:[{k:"finanzas",n:"Finanzas",i:"bank",h:"finanzas.html",ok:1,adm:1},{k:"usuarios",n:"Usuarios",i:"users",h:"usuarios.html",ok:1,adm:1},{k:"actividad",n:"Actividad",i:"clock",h:"actividad.html",ok:1,adm:1}]}];
const svg=k=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const visibles=(g,rol)=>g.m.filter(m=>!m.adm||rol==="admin");
const enlace=(m,c,on)=>`<a class="${c||""}${m.ok?"":" off"}${on===m.k?" on":""}" href="${m.ok?m.h:"#"}" ${m.ok?"":`data-n="${esc(m.n)}"`}>${svg(m.i)}<span>${esc(m.n)}</span></a>`;
/* Preferencias de este dispositivo (se guardan en el navegador) */
const PREF=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
const avatarHTML=(p,c)=>`<span class="av ${c||""}">${p&&p.avatar?`<img src="${esc(p.avatar)}" alt="">`:esc(((p&&p.nombre)||"?").trim().charAt(0).toUpperCase()||"?")}</span>`;
function aplicarPrefs(){
 const sh=document.querySelector(".shell"),ocultar=PREF("dms_nosd")==="1";
 if(sh)sh.classList.toggle("nosd",ocultar);
 document.querySelectorAll(".side .brand").forEach(b=>b.classList.toggle("hidden",PREF("dms_nobrand")==="1"));
 let o=document.getElementById("sdOpen");
 if(ocultar&&sh){if(!o){o=document.createElement("button");o.id="sdOpen";o.type="button";o.setAttribute("aria-label","Mostrar el menú lateral");o.title="Mostrar el menú";o.innerHTML=svg("menu");o.onclick=()=>{PREF("dms_nosd","0");aplicarPrefs()};document.body.appendChild(o)}}
 else if(o)o.remove()}
function pintarUsr(){const b=document.getElementById("cfg1");if(!b||!DAY.me)return;b.innerHTML=avatarHTML(DAY.me)+`<span class="un"><b>${esc(DAY.me.nombre)}</b><small>Configuración</small></span>`}
/* Menú lateral de escritorio (en el celular se oculta y se navega desde el menú principal) */
function mountSide(el,activo,rol){
 el.innerHTML=`<div class="sbar"><div class="brand">DAYMAR<i>-SHOP</i></div><button type="button" class="hb" id="hb1" aria-label="Ocultar el menú" title="Ocultar el menú">${svg("menu")}</button></div><nav><a href="menu.html" class="${activo==="menu"?"on":""}">${svg("home")}<span>Inicio</span></a>`+
  GRUPOS.map(g=>`<div class="sg">${g.t}</div>`+visibles(g,rol).map(m=>enlace(m,"",activo)).join("")).join("")+`</nav><div class="usr"><button type="button" class="ub" id="cfg1" aria-label="Configuración"></button></div><button class="lo" id="lo1">Cerrar sesión</button>`;
 el.querySelector("#lo1").onclick=()=>{if(confirm("¿Cerrar sesión?"))logout()};
 el.querySelector("#cfg1").onclick=abrirConfig;
 el.querySelector("#hb1").onclick=()=>{PREF("dms_nosd","1");aplicarPrefs()};
 el.addEventListener("click",e=>{const a=e.target.closest("[data-n]");if(a){e.preventDefault();toast(a.dataset.n+" se conectará a la base de datos pronto.")}});
 pintarUsr();aplicarPrefs()}
/* Ventana de configuración: nombre, foto, tema y opciones del menú */
function abrirConfig(){
 if(document.querySelector("dialog.cfgd"))return;
 const me=DAY.me||{nombre:"",avatar:null};let foto=me.avatar||null,quitar=false,nueva=false;
 const d=document.createElement("dialog");d.className="cfgd";
 d.innerHTML=`<div class="cf-h"><h2>Configuración</h2><button type="button" class="x" data-x aria-label="Cerrar">×</button></div><div class="cf-b">
  <h3>Mi perfil</h3><div class="cf-p"><span id="cfAv"></span><div class="cf-ab"><button type="button" class="btn g s" id="cfFoto">Cambiar foto</button><button type="button" class="btn g s" id="cfQuit">Quitar foto</button><input type="file" id="cfFile" accept="image/*" hidden></div></div><div id="cfZw" class="hidden cf-z"><label for="cfZ">Alejar / acercar</label><input type="range" id="cfZ" min="0.4" max="3" step="0.05" value="0.7"><small class="cf-m">El círculo recorta las esquinas: con el control alejas la foto hasta que entre completa, o la acercas para enfocar. Arrastra para moverla.</small></div>
  <label for="cfN">Nombre</label><input id="cfN" maxlength="60" autocomplete="name" value="${esc(me.nombre)}"><small class="cf-m">Aparece en el saludo y en tus ventas.</small>
  <h3>Apariencia</h3><label for="cfT">Tema</label><select id="cfT"><option value="auto">Automático (como tu dispositivo)</option><option value="light">Claro</option><option value="dark">Oscuro</option></select>
  <h3>Menú</h3><label class="cf-c"><input type="checkbox" id="cfS"> Ocultar el menú lateral (computadora)</label><label class="cf-c"><input type="checkbox" id="cfB"> Ocultar el nombre DAYMAR-SHOP</label>
  <h3>Cuenta</h3><p class="cf-m" style="margin:0">${esc(DAY.email||"")}</p><div class="err" id="cfE" role="alert"></div></div>
  <div class="cf-f"><button type="button" class="btn g" id="cfOut">Cerrar sesión</button><span style="flex:1"></span><button type="button" class="btn g" data-x>Cancelar</button><button type="button" class="btn" id="cfOk">Guardar</button></div>`;
 document.body.appendChild(d);
 const q=s=>d.querySelector(s),cerrar=()=>{try{d.close()}catch(e){}d.remove()};
let im=null,z=0.7,ox=0,oy=0;const cv=document.createElement("canvas");cv.width=cv.height=240;cv.className="cfcv";cv.title="Arrastra para mover";
 const dibujar=()=>{const x=cv.getContext("2d");x.fillStyle="#efe7e4";x.fillRect(0,0,240,240);const sc=240/Math.max(im.width,im.height)*z,w=im.width*sc,h=im.height*sc;x.drawImage(im,120-w/2+ox,120-h/2+oy,w,h)};
 const pAv=()=>{const a=q("#cfAv");if(im){if(cv.parentNode!==a){a.innerHTML="";a.appendChild(cv)}q("#cfZw").classList.remove("hidden")}else{a.innerHTML=avatarHTML({nombre:q("#cfN").value||me.nombre,avatar:foto},"big");q("#cfZw").classList.add("hidden")}};
 q("#cfT").value=PREF("dms_th")||"auto";q("#cfS").checked=PREF("dms_nosd")==="1";q("#cfB").checked=PREF("dms_nobrand")==="1";pAv();
 q("#cfN").addEventListener("input",pAv);
 d.addEventListener("click",e=>{if(e.target.closest("[data-x]"))cerrar()});d.addEventListener("cancel",e=>{e.preventDefault();cerrar()});
 q("#cfFoto").onclick=()=>q("#cfFile").click();
q("#cfQuit").onclick=()=>{foto=null;quitar=true;nueva=false;im=null;pAv()};
q("#cfFile").onchange=function(){const f=this.files[0];if(!f)return;const t=new Image();
  t.onload=()=>{im=t;z=0.7;ox=oy=0;q("#cfZ").value=0.7;nueva=true;quitar=false;pAv();dibujar()};
  t.onerror=()=>{q("#cfE").textContent="No se pudo leer esa imagen."};t.src=URL.createObjectURL(f)};
 q("#cfZ").addEventListener("input",()=>{z=+q("#cfZ").value;if(im)dibujar()});
 let dr=null;cv.addEventListener("pointerdown",e=>{dr=[e.clientX,e.clientY];cv.setPointerCapture(e.pointerId)});
 cv.addEventListener("pointermove",e=>{if(!dr||!im)return;const k=240/cv.clientWidth;ox+=(e.clientX-dr[0])*k;oy+=(e.clientY-dr[1])*k;dr=[e.clientX,e.clientY];dibujar()});
 ["pointerup","pointercancel"].forEach(n=>cv.addEventListener(n,()=>{dr=null}));
 q("#cfOut").onclick=()=>{if(confirm("¿Cerrar sesión?"))logout()};
 q("#cfOk").onclick=async()=>{const nom=q("#cfN").value.trim();q("#cfE").textContent="";if(im&&nueva)foto=cv.toDataURL("image/jpeg",.85);
  if(!nom){q("#cfE").textContent="Escribe tu nombre.";return}
  const t=q("#cfT").value;try{if(t==="auto")localStorage.removeItem("dms_th");else localStorage.setItem("dms_th",t)}catch(e){}
  if(t==="auto")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;
  PREF("dms_nosd",q("#cfS").checked?"1":"0");PREF("dms_nobrand",q("#cfB").checked?"1":"0");aplicarPrefs();
  if(nom!==me.nombre||nueva||quitar){q("#cfOk").disabled=true;
   const {error}=await db.rpc("actualizar_mi_perfil",{p_nombre:nom,p_avatar:nueva?foto:null,p_quitar_avatar:quitar});q("#cfOk").disabled=false;
   if(error){q("#cfE").textContent=/function|actualizar_mi_perfil/i.test(error.message)?"Falta correr migracion_perfil.sql en Supabase para guardar nombre y foto.":error.message;return}
   DAY.me.nombre=nom;DAY.me.avatar=quitar?null:nueva?foto:DAY.me.avatar;pintarUsr();window.dispatchEvent(new CustomEvent("day:perfil"))}
  cerrar();toast("Configuración guardada")};
 d.showModal()}
async function logout(){await db.auth.signOut();location.replace("index.html")}
/* Si no hay sesión, manda al login. Devuelve el perfil del usuario. */
async function requireSession(){
 const {data}=await db.auth.getSession();
 if(!data.session){location.replace("index.html");return null}
 const r=await db.from("profiles").select("*").eq("id",data.session.user.id).single();
 if(r.error||!r.data||!r.data.activo){await db.auth.signOut();location.replace("index.html?e=perfil");return null}
 DAY.me=r.data;DAY.email=data.session.user.email;return r.data}
window.DAY={db,esc,$$,ymd,toast,toggleTheme,ICON,GRUPOS,svg,visibles,enlace,mountSide,logout,requireSession,abrirConfig,avatarHTML,aplicarPrefs,PREF,me:null,email:""};
})();
