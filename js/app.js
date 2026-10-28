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
 undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 sliders:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'};
const GRUPOS=[
 {t:"Vender",m:[{k:"almacenamiento",n:"Punto de venta",i:"sale",h:"almacenamiento.html",ok:1},{k:"facturas",n:"Facturas",i:"receipt",h:"almacenamiento.html#fac",ok:1},{k:"clientes",n:"Clientes",i:"users",h:"clientes.html",ok:1},{k:"devoluciones",n:"Devoluciones",i:"undo",h:"devoluciones.html",ok:1,adm:1},{k:"descuentos",n:"Descuentos",i:"tag",h:"descuentos.html",ok:1,adm:1},{k:"cotizacion",n:"Cotización",i:"quote",h:"traslados.html"},{k:"reservas",n:"Reservas",i:"cal",h:"reservas.html"}]},
 {t:"Almacén",m:[{k:"inventario",n:"Inventario",i:"box",h:"reportes.html",ok:1},{k:"compra",n:"Compra",i:"cart",h:"compra.html",ok:1,adm:1},{k:"catalogo",n:"Catálogo",i:"store",h:"gastos.html"}]},
 {t:"Negocio",m:[{k:"finanzas",n:"Finanzas",i:"bank",h:"finanzas.html",ok:1,adm:1},{k:"usuarios",n:"Usuarios",i:"users",h:"usuarios.html",ok:1,adm:1},{k:"actividad",n:"Actividad",i:"clock",h:"actividad.html",ok:1,adm:1}]}];
const svg=k=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const visibles=(g,rol)=>g.m.filter(m=>!m.adm||rol==="admin");
const enlace=(m,c,on)=>`<a class="${c||""}${m.ok?"":" off"}${on===m.k?" on":""}" href="${m.ok?m.h:"#"}" ${m.ok?"":`data-n="${esc(m.n)}"`}>${svg(m.i)}<span>${esc(m.n)}</span></a>`;
/* Ventanas propias (reemplazan los avisos feos del navegador) */
function dlgCss(){if(document.getElementById("dayDlgCss"))return;const st=document.createElement("style");st.id="dayDlgCss";
 st.textContent='dialog.dday{border:0;border-radius:16px;padding:0;width:min(420px,92vw);background:var(--card,#fff);color:var(--ink,#2a1a1f);box-shadow:0 20px 60px rgba(0,0,0,.35)}dialog.dday::backdrop{background:rgba(0,0,0,.55)}dialog.dday .dd-h{padding:18px 20px 2px;font:700 18px "Bricolage Grotesque",system-ui,sans-serif;margin:0}dialog.dday .dd-b{padding:6px 20px 12px;font:15px/1.5 "DM Sans",system-ui,sans-serif;white-space:pre-line}dialog.dday input{width:100%;box-sizing:border-box;margin-top:10px;padding:10px 12px;border:1px solid var(--line,#ddd);border-radius:10px;font:inherit;background:var(--card,#fff);color:inherit}dialog.dday .dd-f{display:flex;gap:8px;justify-content:flex-end;padding:8px 20px 18px;flex-wrap:wrap}dialog.dday button{min-height:42px;padding:8px 18px;border-radius:10px;font:700 14px "DM Sans",system-ui,sans-serif;cursor:pointer;border:1px solid var(--line,#ddd);background:none;color:var(--wine,#6B2D3E)}dialog.dday button.pr{background:var(--wine,#6B2D3E);border-color:var(--wine,#6B2D3E);color:#fff}dialog.dday button.dg{background:#B3261E;border-color:#B3261E;color:#fff}';
 document.head.appendChild(st)}
function dlg(titulo,texto,o){o=o||{};dlgCss();
 return new Promise(res=>{const d=document.createElement("dialog");d.className="dday";
  d.innerHTML=`<h2 class="dd-h">${esc(titulo)}</h2><div class="dd-b">${esc(texto)}${o.input?`<input type="text" value="${esc(o.def||"")}" autocomplete="off">`:""}</div><div class="dd-f">${o.aviso?"":'<button type="button" data-n>'+esc(o.no||"Cancelar")+'</button>'}<button type="button" class="${o.peligro?"dg":"pr"}" data-y>${esc(o.ok||"Aceptar")}</button></div>`;
  document.body.appendChild(d);let hecho=false;
  const fin=v=>{if(hecho)return;hecho=true;try{d.close()}catch(e){}d.remove();res(v)};
  const inp=d.querySelector("input");
  d.querySelector("[data-y]").onclick=()=>fin(o.input?inp.value:true);
  const n=d.querySelector("[data-n]");if(n)n.onclick=()=>fin(o.input?null:false);
  d.addEventListener("cancel",e=>{e.preventDefault();fin(o.aviso?true:o.input?null:false)});
  if(inp)inp.addEventListener("keydown",e=>{if(e.key==="Enter")fin(inp.value)});
  d.showModal();setTimeout(()=>(inp||d.querySelector("[data-y]")).focus(),40)})}
const ask=(t,o)=>dlg((o&&o.titulo)||"Confirmar",t,o);
const say=(t,o)=>dlg((o&&o.titulo)||"Aviso",t,Object.assign({aviso:true},o));
const input=(t,def,o)=>dlg((o&&o.titulo)||"Escribe un valor",t,Object.assign({input:true,def:def},o));
const salir=()=>ask("¿Quieres cerrar tu sesión?",{titulo:"Cerrar sesión",ok:"Cerrar sesión"}).then(o=>{if(o)logout()});
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
 el.querySelector("#lo1").onclick=salir;
 el.querySelector("#cfg1").onclick=abrirConfig;
 el.querySelector("#hb1").onclick=()=>{PREF("dms_nosd","1");aplicarPrefs()};
 el.addEventListener("click",e=>{const a=e.target.closest("[data-n]");if(a){e.preventDefault();toast(a.dataset.n+" se conectará a la base de datos pronto.")}});
 pintarUsr();aplicarPrefs()}
/* Ventana de configuración: nombre, foto, tema y opciones del menú */
const TABLAS_RESPALDO=["productos","categorias","producto_imagenes","proveedores","clientes","ventas","venta_items","movimientos_stock","facturas","factura_items","devoluciones","devolucion_items","fin_movimientos","fin_cuentas","fin_banco","capital_movs","cierres_caja","promo_codigos","descuentos_programados","config_negocio","profiles","invitaciones","bitacora","accesos"];
async function respaldo(){
 if(!await ask("Se descargará un archivo ZIP con una copia de todos tus datos (productos, ventas, clientes, finanzas…). Contiene información del negocio y de tus clientes: guárdalo en un lugar seguro.",{titulo:"Descargar respaldo",ok:"Descargar"}))return;
 toast("Preparando respaldo… puede tardar un momento");
 try{if(!window.JSZip)await new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=ok;s.onerror=()=>ko(new Error("No se pudo cargar la librería. Revisa tu conexión."));document.head.appendChild(s)});
  const zip=new JSZip(),res=[];
  for(const t of TABLAS_RESPALDO){try{const rows=[];for(let f=0;;f+=1000){const r=await db.from(t).select("*").order("id").range(f,f+999);if(r.error)throw new Error(r.error.message);rows.push(...r.data);if(r.data.length<1000)break}
    zip.file(t+".json",JSON.stringify(rows,null,1));res.push(t+": "+rows.length+" registros")}catch(e){res.push(t+": no se pudo leer ("+(e.message||"error")+")")}}
  const fch=new Date().toISOString();
  zip.file("LEEME.txt","Respaldo de DAYMAR-SHOP\nGenerado: "+fch+"\nPor: "+(DAY.me?DAY.me.nombre:"")+"\n\nContenido:\n"+res.join("\n")+"\n\nNota: las fotos de productos no van dentro del ZIP; los archivos traen su dirección (url) y siguen guardadas en el sistema.\nLos datos están en formato JSON (se abren con cualquier editor de texto).\n");
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="respaldo-daymar-"+fch.slice(0,10)+".zip";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  try{localStorage.setItem("dms_backup",fch)}catch(e){}toast("Respaldo descargado")}
 catch(e){await say("No se pudo crear el respaldo: "+e.message)}}
async function vaciarDatos(){
 const OPC=[["productos","Productos e inventario","incluye fotos, descuentos y códigos promo; exige borrar también las ventas"],["ventas","Ventas, devoluciones, facturas y cierres de caja","la numeración vuelve a #1"],["clientes","Clientes",""],["proveedores","Proveedores",""],["finanzas","Finanzas","movimientos, cuentas por cobrar y pagar, banco y capital"],["historial","Historial de Actividad e inicios de sesión",""]];
 dlgCss();const d=document.createElement("dialog");d.className="dday";
 d.innerHTML=`<h2 class="dd-h" style="color:var(--bad)">Vaciar datos de prueba</h2><div class="dd-b"><p style="margin:0 0 8px">Marca lo que quieres <b>borrar para siempre</b>. No se puede deshacer. <b>No se borran</b> usuarios, invitaciones, categorías ni los datos de tu negocio.</p>
  ${OPC.map(o=>`<label style="display:flex;gap:8px;align-items:flex-start;margin:8px 0;text-align:left"><input type="checkbox" data-k="${o[0]}" checked style="width:20px;height:20px;flex:none;margin-top:2px"><span><b>${o[1]}</b>${o[2]?`<br><small style="color:var(--mute)">${o[2]}</small>`:""}</span></label>`).join("")}
  <p style="margin:12px 0 4px">Para confirmar, escribe <b>BORRAR TODO</b>:</p><input type="text" id="vcT" autocomplete="off" placeholder="BORRAR TODO"><div class="err" id="vcE" role="alert"></div></div>
  <div class="dd-f"><button type="button" data-n>Cancelar</button><button type="button" class="dg" id="vcOk">Borrar</button></div>`;
 document.body.appendChild(d);const q=s=>d.querySelector(s),cerrar=()=>{try{d.close()}catch(e){}d.remove()};
 const sync=()=>{if(q('[data-k=productos]').checked){q('[data-k=ventas]').checked=true;q('[data-k=ventas]').disabled=true}else q('[data-k=ventas]').disabled=false};
 d.addEventListener("change",sync);sync();q("[data-n]").onclick=cerrar;d.addEventListener("cancel",e=>{e.preventDefault();cerrar()});
 q("#vcOk").onclick=async()=>{const op={};d.querySelectorAll("[data-k]").forEach(c=>op[c.dataset.k]=c.checked);
  if(!Object.values(op).some(Boolean)){q("#vcE").textContent="No marcaste nada.";return}
  if(q("#vcT").value.trim()!=="BORRAR TODO"){q("#vcE").textContent="Escribe exactamente BORRAR TODO.";return}
  q("#vcOk").disabled=true;q("#vcE").textContent="Borrando…";
  try{
   if(op.productos){let paths=[];for(let f=0;;f+=1000){const r=await db.from("producto_imagenes").select("path,thumb_path").range(f,f+999);if(r.error)throw new Error(r.error.message);r.data.forEach(x=>{if(x.path)paths.push(x.path);if(x.thumb_path)paths.push(x.thumb_path)});if(r.data.length<1000)break}
    for(let i=0;i<paths.length;i+=50){const e=await db.storage.from("productos").remove(paths.slice(i,i+50));if(e.error)throw new Error(e.error.message)}}
   const r=await db.rpc("reiniciar_datos",{p_opciones:op,p_confirmacion:"BORRAR TODO"});if(r.error)throw new Error(r.error.message);
   cerrar();await say("Listo. Los datos que marcaste se borraron. Ya puedes empezar con los reales.");location.reload()}
  catch(e){q("#vcOk").disabled=false;q("#vcE").textContent="No se pudo borrar: "+e.message}}
 d.showModal()}
function abrirConfig(){
 if(document.querySelector("dialog.cfgd"))return;
 const me=DAY.me||{nombre:"",avatar:null};let foto=me.avatar||null,quitar=false,nueva=false;
 const d=document.createElement("dialog");d.className="cfgd";
 d.innerHTML=`<div class="cf-h"><h2>Configuración</h2><button type="button" class="x" data-x aria-label="Cerrar">×</button></div><div class="cf-b">
  <h3>Mi perfil</h3><div class="cf-p"><span id="cfAv"></span><div class="cf-ab"><button type="button" class="btn g s" id="cfFoto">Cambiar foto</button><button type="button" class="btn g s" id="cfQuit">Quitar foto</button><input type="file" id="cfFile" accept="image/*" hidden></div></div><div id="cfZw" class="hidden cf-z"><label for="cfZ">Acercar</label><input type="range" id="cfZ" min="1" max="4" step="0.02" value="1"><small class="cf-m">La foto llena todo el círculo. Arrastra para encuadrar tu cara y usa el control para acercar.</small></div>
  <label for="cfN">Nombre</label><input id="cfN" maxlength="60" autocomplete="name" value="${esc(me.nombre)}"><small class="cf-m">Aparece en el saludo y en tus ventas.</small>
  <h3>Apariencia</h3><label for="cfT">Tema</label><select id="cfT"><option value="auto">Automático (como tu dispositivo)</option><option value="light">Claro</option><option value="dark">Oscuro</option></select>
  <h3>Menú</h3><label class="cf-c"><input type="checkbox" id="cfS"> Ocultar el menú lateral (computadora)</label><label class="cf-c"><input type="checkbox" id="cfB"> Ocultar el nombre DAYMAR-SHOP</label>
  ${me.rol==="admin"?`<h3>Respaldo</h3><p class="cf-m" id="cfBkT" style="margin:0 0 8px"></p><button type="button" class="btn g s" id="cfBk">Descargar respaldo de datos</button>`:""}
  <div id="cfDz"></div>
  <h3>Cuenta</h3><p class="cf-m" style="margin:0">${esc(DAY.email||"")}</p><div class="err" id="cfE" role="alert"></div></div>
  <div class="cf-f"><button type="button" class="btn g" id="cfOut">Cerrar sesión</button><span style="flex:1"></span><button type="button" class="btn g" data-x>Cancelar</button><button type="button" class="btn" id="cfOk">Guardar</button></div>`;
 document.body.appendChild(d);
 const q=s=>d.querySelector(s),cerrar=()=>{try{d.close()}catch(e){}d.remove()};
let im=null,z=1,ox=0,oy=0;const cv=document.createElement("canvas");cv.width=cv.height=240;cv.className="cfcv";cv.title="Arrastra para mover";
 const dibujar=()=>{const x=cv.getContext("2d"),sc=240/Math.min(im.width,im.height)*z,w=im.width*sc,h=im.height*sc,mx=(w-240)/2,my=(h-240)/2;ox=Math.max(-mx,Math.min(mx,ox));oy=Math.max(-my,Math.min(my,oy));x.fillStyle="#efe7e4";x.fillRect(0,0,240,240);x.drawImage(im,120-w/2+ox,120-h/2+oy,w,h)};
 const pAv=()=>{const a=q("#cfAv");if(im){if(cv.parentNode!==a){a.innerHTML="";a.appendChild(cv)}q("#cfZw").classList.remove("hidden")}else{a.innerHTML=avatarHTML({nombre:q("#cfN").value||me.nombre,avatar:foto},"big");q("#cfZw").classList.add("hidden")}};
 q("#cfT").value=PREF("dms_th")||"auto";q("#cfS").checked=PREF("dms_nosd")==="1";q("#cfB").checked=PREF("dms_nobrand")==="1";pAv();
 q("#cfN").addEventListener("input",pAv);
 d.addEventListener("click",e=>{if(e.target.closest("[data-x]"))cerrar()});d.addEventListener("cancel",e=>{e.preventDefault();cerrar()});
 q("#cfFoto").onclick=()=>q("#cfFile").click();
q("#cfQuit").onclick=()=>{foto=null;quitar=true;nueva=false;im=null;pAv()};
q("#cfFile").onchange=function(){const f=this.files[0];if(!f)return;const t=new Image();
  t.onload=()=>{im=t;z=1;ox=oy=0;q("#cfZ").value=1;nueva=true;quitar=false;pAv();dibujar()};
  t.onerror=()=>{q("#cfE").textContent="No se pudo leer esa imagen."};t.src=URL.createObjectURL(f)};
 q("#cfZ").addEventListener("input",()=>{z=+q("#cfZ").value;if(im)dibujar()});
 let dr=null;cv.addEventListener("pointerdown",e=>{dr=[e.clientX,e.clientY];cv.setPointerCapture(e.pointerId)});
 cv.addEventListener("pointermove",e=>{if(!dr||!im)return;const k=240/cv.clientWidth;ox+=(e.clientX-dr[0])*k;oy+=(e.clientY-dr[1])*k;dr=[e.clientX,e.clientY];dibujar()});
 ["pointerup","pointercancel"].forEach(n=>cv.addEventListener(n,()=>{dr=null}));
 const bk=q("#cfBk");if(bk){const t=()=>{let u=null;try{u=localStorage.getItem("dms_backup")}catch(e){}q("#cfBkT").textContent=u?"Último respaldo en este dispositivo: "+new Date(u).toLocaleString("es-SV",{dateStyle:"medium",timeStyle:"short"}):"Aún no has descargado un respaldo desde este dispositivo."};t();
  bk.onclick=async()=>{bk.disabled=true;try{await respaldo();t()}finally{bk.disabled=false}}}
 db.rpc("es_principal").then(r=>{if(r&&r.data===true){q("#cfDz").innerHTML=`<h3 style="color:var(--bad)">Zona peligrosa</h3><p class="cf-m" style="margin:0 0 8px">Vaciar los datos de prueba para empezar con los reales. Solo el administrador principal.</p><button type="button" class="btn g s" id="cfVac" style="color:var(--bad)">Vaciar datos…</button>`;q("#cfVac").onclick=()=>{cerrar();vaciarDatos()}}},()=>{});
 q("#cfOut").onclick=salir;
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
window.DAY={db,esc,$$,ymd,toast,toggleTheme,ICON,GRUPOS,svg,visibles,enlace,mountSide,logout,requireSession,abrirConfig,ask,say,input,salir,avatarHTML,aplicarPrefs,PREF,me:null,email:""};
})();
