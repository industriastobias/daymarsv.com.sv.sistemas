/* DAYMARSV · Conteo físico (toma de inventario). Solo el administrador principal. */
(async()=>{
"use strict";
const {db,esc,$$,toast,mountSide,requireSession}=DAY;
const {$,fdate,ftime,fetchAll,espera,modal,confirmar,norm}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
const pr=await db.rpc("es_principal");
if(!pr||pr.data!==true){location.replace("menu.html");return}
mountSide($("side"),"conteo",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="40px";

let INV=null,IT=[],filtro="todos",texto="",lim=120,modo="uno",ultimo=null,QR=null,vista=null;
const cents=n=>Math.round((+n||0)*100);
const base=i=>i.stock_al_contar!=null?i.stock_al_contar:i.esperado;
const dif=i=>i.contado==null?null:i.contado-base(i);
const nombre=i=>i.nombre+(i.color?" · "+i.color:"");
const estado=i=>{const d=dif(i);return d===null?"pend":d===0?"ok":"dif"};

/* ---------- datos ---------- */
async function cargarInventarios(){
 const {data,error}=await db.from("inventarios").select("*").order("created_at",{ascending:false}).limit(60);
 if(error)throw new Error(error.message);return data||[]}
async function cargarItems(id){
 const L=await fetchAll(()=>db.from("inventario_items").select("*").eq("inventario_id",id).order("nombre").order("color"));
 try{const P=await fetchAll(()=>db.from("productos").select("id,foto_url").not("foto_url","is",null));
  const M={};P.forEach(p=>M[p.id]=p.foto_url);L.forEach(i=>{i.foto=M[i.producto_id]||""})}catch(e){}
 return L}
const inicial=t=>esc(String(t||"?").trim().charAt(0).toUpperCase());
function verFoto(u){modal("Foto",`<img src="${esc(DAY.grande(u))}" onerror="this.onerror=null;this.src='${esc(u)}'" alt="" style="width:100%;max-height:70vh;object-fit:contain;border-radius:10px">`)}

/* ---------- resumen ---------- */
function resumen(L){
 const r={total:L.length,cont:0,ok:0,falt:0,sobr:0,uf:0,us:0,vf:0,vs:0,pend:0};
 L.forEach(i=>{const d=dif(i);if(d===null){r.pend++;return}r.cont++;if(d===0)r.ok++;else if(d<0){r.falt++;r.uf+=-d;r.vf+=-d*(+i.costo)}else{r.sobr++;r.us+=d;r.vs+=d*(+i.costo)}});
 return r}
function filas(L){
 const q=norm(texto);
 return L.filter(i=>(filtro==="todos"||estado(i)===filtro)&&(!q||norm([i.nombre,i.color,i.codigo,i.codigo_barras,i.categoria].join(" ")).includes(q)))}

/* ---------- pantalla principal ---------- */
async function inicio(){
 pararCamara();
 const H=await espera(async()=>cargarInventarios(),"Cargando…");if(!H)return;
 const ab=H.find(h=>h.estado==="abierto");
 if(ab){INV=ab;IT=await espera(async()=>cargarItems(ab.id),"Cargando conteo…")||[];vista=null;pintarAbierto();return}
 INV=null;IT=[];pintarHistorial(H)}

function pintarHistorial(H){
 $("cMain").innerHTML=`<div class="card cin"><h3>Hacer un conteo físico</h3>
  <p>El sistema guarda una foto de todo tu inventario. Tú vas contando lo que hay en el almacén (escaneando o escribiendo la cantidad) y al final ves qué productos <b>faltan</b> y cuáles <b>sobran</b>. Si quieres, el sistema se corrige solo con lo que contaste.</p>
  <ul class="cl2"><li>Puedes parar y seguir otro día: el conteo queda abierto hasta que lo cierres.</li><li>Las ventas que se hagan mientras cuentas no se pierden ni se cuentan doble.</li><li>Los productos con colores se cuentan color por color.</li></ul>
  <button class="btn" id="cNew" type="button">Iniciar conteo físico</button></div>
  <h3 class="sect">Conteos anteriores</h3>
  <div id="cHist">${H.length?H.map(h=>`<button type="button" class="rw chh" data-h="${h.id}"><div class="ti"><b>Conteo #${h.numero}</b><small>${fdate(h.created_at)} ${ftime(h.created_at)}${h.nota?" · "+esc(h.nota):""}</small></div>
   <span class="bd ${h.estado==="cerrado"?"ok":"mu"}">${h.estado==="cerrado"?"Cerrado":"Cancelado"}</span>${h.estado==="cerrado"?`<span class="bd ${h.ajustado?"pu":"bl2"}">${h.ajustado?"Se ajustó el sistema":"Solo reporte"}</span>`:""}</button>`).join(""):'<div class="empty card">Todavía no has hecho ningún conteo.</div>'}</div>`;
 $("cNew").onclick=iniciar;
 $("cHist").onclick=async e=>{const b=e.target.closest("[data-h]");if(!b)return;const h=H.find(x=>x.id===b.dataset.h);
  const L=await espera(async()=>cargarItems(h.id),"Cargando…");if(L)detalle(h,L,H)}}

async function iniciar(){
 if(!await confirmar("Se guardará una foto de tu inventario actual y empezarás a contar. Podrás cerrarlo hoy o seguir otro día.",{titulo:"Iniciar conteo",ok:"Iniciar"}))return;
 const ok=await espera(async()=>{const {error}=await db.rpc("inventario_iniciar",{p_nota:null});if(error)throw new Error(error.message);return true},"Preparando el conteo…");
 if(ok){filtro="todos";texto="";lim=120;ultimo=null;await inicio()}}

/* ---------- conteo abierto ---------- */
function pintarAbierto(){
 $("cMain").innerHTML=`<div class="cprog card"><div class="cpt"><b id="cpT"></b><span id="cpP"></span></div><div class="cbar"><i id="cpB"></i></div></div>
  <div class="cscan card">
   <div class="csr"><input id="cQ" type="search" autocomplete="off" inputmode="search" placeholder="Escanea el código de barras o busca por nombre"><button class="btn g" id="cCam" type="button">Cámara</button></div>
   <div class="cmode" id="cMd"><button type="button" data-m="uno">Cada escaneo suma 1</button><button type="button" data-m="cant">Escribir la cantidad</button></div>
   <div id="cUl"></div>
  </div>
  <div class="seg2" id="cF" style="overflow-x:auto"><button data-f="todos">Todos</button><button data-f="pend">Pendientes</button><button data-f="dif">Con diferencia</button><button data-f="ok">Coinciden</button></div>
  <div id="cL"></div><div class="ctl"><span class="grow"></span><button class="btn g hidden" id="cMas" type="button">Ver más</button><span class="grow"></span></div>
  <div class="cfin"><button class="btn" id="cFin" type="button">Terminar conteo</button><button class="btn g" id="cCan" type="button">Cancelar conteo</button></div>`;
 $("cQ").value=texto;
 $("cMd").onclick=e=>{const b=e.target.closest("[data-m]");if(!b)return;modo=b.dataset.m;pintarModo();$("cQ").focus()};
 $("cF").onclick=e=>{const b=e.target.closest("[data-f]");if(!b)return;filtro=b.dataset.f;lim=120;pintarLista()};
 $("cMas").onclick=()=>{lim+=150;pintarLista()};
 $("cQ").addEventListener("input",()=>{texto=$("cQ").value;lim=120;pintarLista()});
 $("cQ").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const c=$("cQ").value.trim();if(c)escanear(c,true)}});
 $("cCam").onclick=()=>QR?pararCamara():camara();
 $("cL").addEventListener("click",lista);$("cL").addEventListener("change",lista);$("cUl").addEventListener("click",lista);$("cUl").addEventListener("change",lista);
 $("cFin").onclick=terminar;$("cCan").onclick=cancelar;
 pintarModo();pintarProgreso();pintarUltimo();pintarLista();
 if(matchMedia("(pointer:fine)").matches)$("cQ").focus()}

function pintarModo(){document.querySelectorAll("#cMd [data-m]").forEach(b=>b.classList.toggle("on",b.dataset.m===modo))}
function pintarProgreso(){
 const r=resumen(IT),p=r.total?Math.round(r.cont/r.total*100):0;
 $("cpT").textContent=`Conteo #${INV.numero} · ${r.cont} de ${r.total} productos contados`;$("cpP").textContent=`${p}%`;$("cpB").style.width=p+"%";
 document.querySelectorAll("#cF [data-f]").forEach(b=>{const k=b.dataset.f,n=k==="todos"?r.total:k==="pend"?r.pend:k==="dif"?r.falt+r.sobr:r.ok;b.classList.toggle("on",k===filtro);b.dataset.n=n;b.innerHTML=({todos:"Todos",pend:"Pendientes",dif:"Con diferencia",ok:"Coinciden"})[k]+` <span class="badge">${n}</span>`})}

const badge=i=>{const d=dif(i);return d===null?'<span class="bd mu">Pendiente</span>':d===0?'<span class="bd ok">Coincide</span>':d<0?`<span class="bd bad">Faltan ${-d}</span>`:`<span class="bd wa">Sobran ${d}</span>`};
function fila(i,ro){
 return `<div class="ci ${estado(i)}" data-id="${i.id}"><div class="cf">${i.foto?`<img src="${esc(i.foto)}" alt="" loading="lazy" data-foto="${esc(i.foto)}">`:`<div class="ph">${inicial(i.nombre)}</div>`}<div class="ti"><b>${esc(i.nombre)}</b>${i.color?` <span class="bd bl2">${esc(i.color)}</span>`:""}<small>${esc(i.codigo||"")}${i.codigo_barras?" · "+esc(i.codigo_barras):""}${i.categoria?" · "+esc(i.categoria):""}</small></div></div>
  <div class="cs"><small>Sistema</small><b>${base(i)}</b></div>
  <div class="cq">${ro?`<b>${i.contado==null?"—":i.contado}</b>`:`<button type="button" data-st="-1" aria-label="Menos">−</button><input type="number" min="0" step="1" inputmode="numeric" value="${i.contado==null?"":i.contado}" placeholder="—" data-q="${i.id}" aria-label="Cantidad contada"><button type="button" data-st="1" aria-label="Más">+</button>`}</div>
  <div class="cd">${badge(i)}</div></div>`}
function pintarLista(){
 const F=filas(IT);
 $("cL").innerHTML=F.length?F.slice(0,lim).map(i=>fila(i)).join(""):`<div class="empty card">${IT.length?"No hay productos con ese filtro.":"No hay productos."}</div>`;
 $("cMas").classList.toggle("hidden",F.length<=lim);pintarProgreso()}
function pintarUltimo(){
 const i=ultimo&&IT.find(x=>x.id===ultimo);
 $("cUl").innerHTML=i?`<div class="cult">${fila(i)}</div>`:`<p class="hint" style="margin:8px 0 0">Aquí aparece el último producto que contaste.</p>`}

/* ---------- contar ---------- */
const cola=new Map();
function guardar(i,n){
 const ant={c:i.contado,s:i.stock_al_contar};
 i.contado=n;if(n!=null&&i.stock_al_contar==null)i.stock_al_contar=i.esperado;if(n==null)i.stock_al_contar=null;
 const p=(cola.get(i.id)||Promise.resolve()).then(async()=>{
  const {data,error}=await db.rpc("inventario_contar",{p_item:i.id,p_contado:n});
  if(error){i.contado=ant.c;i.stock_al_contar=ant.s;toast(error.message);refrescar();return}
  if(data){i.stock_al_contar=data.stock_al_contar;refrescar(i.id)}});
 cola.set(i.id,p)}
function refrescar(id){pintarProgreso();pintarLista();if(ultimo)pintarUltimo()}
function marcar(i,n){ultimo=i.id;guardar(i,n);pintarUltimo();pintarLista()}
function lista(e){
 const ft=e.target.closest("[data-foto]");if(ft&&e.type==="click"){verFoto(ft.dataset.foto);return}
 const row=e.target.closest(".ci");if(!row)return;const i=IT.find(x=>x.id===row.dataset.id);if(!i)return;
 const st=e.target.closest("[data-st]");
 if(st&&e.type==="click"){const n=Math.max(0,(i.contado==null?(+st.dataset.st>0?0:0):i.contado)+(+st.dataset.st));marcar(i,n);return}
 if(e.type==="change"&&e.target.matches("[data-q]")){const v=e.target.value.trim();if(v===""){guardar(i,null);pintarProgreso();pintarLista();pintarUltimo();return}
  const n=parseInt(v,10);if(!(n>=0)){toast("Escribe un número válido");pintarLista();return}marcar(i,n)}}

function escanear(c,deTeclado){
 const code=c.trim(),q=norm(code);
 const ex=IT.filter(i=>(i.codigo_barras&&i.codigo_barras.trim()===code)||(i.codigo&&i.codigo.trim().toLowerCase()===code.toLowerCase()));
 if(ex.length===1){contarUno(ex[0]);if(deTeclado)limpiarBusqueda();return}
 if(ex.length>1){elegir(ex);if(deTeclado)limpiarBusqueda();return}
 const m=IT.filter(i=>norm([i.nombre,i.color].join(" ")).includes(q));
 if(m.length===1&&deTeclado){contarUno(m[0]);limpiarBusqueda();return}
 if(!m.length){try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}toast("No encontré ese código en el inventario");if(deTeclado)$("cQ").select();return}
 if(deTeclado)toast(m.length+" coincidencias: toca el producto para contarlo")}
function limpiarBusqueda(){texto="";$("cQ").value="";lim=120;pintarLista();if(matchMedia("(pointer:fine)").matches)$("cQ").focus()}
function contarUno(i){
 if(modo==="uno"){const n=(i.contado||0)+1;marcar(i,n);toast(`+1 · ${nombre(i)} → ${n}`)}
 else{ultimo=i.id;pintarUltimo();toast("Escribe la cantidad de "+nombre(i));const inp=document.querySelector(`#cUl [data-q="${i.id}"]`);if(inp){inp.focus();inp.select()}}}
function elegir(L){
 const m=modal("¿Cuál es?",`<p style="margin:0 0 8px">Ese código es de varios colores:</p><div id="elL">${L.map((i,k)=>`<button type="button" class="sv" data-k="${k}" style="width:100%;text-align:left;cursor:pointer">${i.foto?`<img src="${esc(i.foto)}" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover;margin-right:10px;vertical-align:middle">`:""}<div class="ti" style="display:inline-block;vertical-align:middle"><b>${esc(nombre(i))}</b><small>Sistema: ${base(i)}${i.contado!=null?" · Contado: "+i.contado:""}</small></div></button>`).join("")}</div>`);
 m.q("#elL").addEventListener("click",e=>{const b=e.target.closest("[data-k]");if(!b)return;const i=L[+b.dataset.k];m.close();contarUno(i)})}

/* ---------- cámara ---------- */
let lastCode="",lastSeen=0;
function camara(){
 if(QR)return;
 if(typeof Html5Qrcode==="undefined"){toast("No se pudo cargar el escáner. Revisa tu conexión.");return}
 const box=document.createElement("div");box.className="scan";box.id="scanBox";
 box.innerHTML=`<div class="sh"><strong>Escanear código</strong><button class="btn g sm" type="button" id="scX">Cerrar</button></div><div id="rdr"></div>`;document.body.appendChild(box);
 box.querySelector("#scX").onclick=pararCamara;
 QR=new Html5Qrcode("rdr");lastCode="";
 QR.start({facingMode:"environment"},{fps:12,aspectRatio:1.6,qrbox:(w,h)=>({width:Math.max(120,Math.floor(w*.86)),height:Math.max(70,Math.floor(h*.62))})},txt=>{
  const c=txt.trim(),now=Date.now(),hueco=now-lastSeen;lastSeen=now;
  if(c===lastCode&&hueco<700)return;
  lastCode=c;escanear(c,false)},()=>{}).catch(e=>{toast("No se pudo abrir la cámara: "+(e&&e.message||e));pararCamara()})}
function pararCamara(){const q=QR;QR=null;const rm=()=>{const b=document.getElementById("scanBox");if(b)b.remove()};if(q){q.stop().then(rm).catch(rm)}else rm()}

/* ---------- terminar / cancelar ---------- */
function terminar(){
 const r=resumen(IT);
 const m=modal("Terminar conteo",`<div class="cres">
   <div><span>Contados</span><b>${r.cont} de ${r.total}</b></div><div><span>Coinciden</span><b class="pos">${r.ok}</b></div>
   <div><span>Con faltantes</span><b class="neg">${r.falt}</b><small>${r.uf} unidades · ${$$(r.vf)} al costo</small></div>
   <div><span>Con sobrantes</span><b>${r.sobr}</b><small>${r.us} unidades · ${$$(r.vs)} al costo</small></div></div>
  ${r.pend?`<div class="alert warn" style="margin:10px 0"><div><b>${r.pend===1?"Te falta 1 producto por contar":"Te faltan "+r.pend+" productos por contar"}</b>Puedes seguir contando otro día, o terminar ahora.</div></div>`:""}
  <label class="chk"><input type="checkbox" id="tAj" checked> Corregir el inventario del sistema con lo que conté</label>
  <small class="hint" style="display:block;margin:0 0 6px 30px">Cambia el stock de los productos con diferencia y deja el registro en los movimientos de stock.</small>
  ${r.pend?`<label class="chk" id="tCeroW"><input type="checkbox" id="tCero"> Los productos que no conté, ponerlos en 0</label>`:""}
  <div class="err2" id="tE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Seguir contando</button><button class="btn" id="tOk">Cerrar conteo</button>`});
 const sync=()=>{const w=m.q("#tCeroW");if(w)w.style.opacity=m.q("#tAj").checked?1:.45;const c=m.q("#tCero");if(c)c.disabled=!m.q("#tAj").checked};
 m.q("#tAj").onchange=sync;sync();
 m.q("#tOk").onclick=async()=>{
  const aj=m.q("#tAj").checked,cero=aj&&!!(m.q("#tCero")&&m.q("#tCero").checked);
  if(aj&&!await confirmar("Se cambiará el stock de los productos con diferencia. Esto no se puede deshacer.",{titulo:"Corregir inventario",ok:"Sí, corregir",peligro:true}))return;
  const res=await espera(async()=>{const {data,error}=await db.rpc("inventario_cerrar",{p_inv:INV.id,p_ajustar:aj,p_no_contados_cero:cero});if(error)throw new Error(error.message);return data},"Cerrando el conteo…");
  if(!res)return;m.close();
  toast(aj?`Conteo cerrado. Se corrigieron ${res.productos_ajustados} productos.`:"Conteo cerrado.");
  const L=await cargarItems(INV.id),H=await cargarInventarios();detalle(H.find(h=>h.id===INV.id),L,H)}}

async function cancelar(){
 if(!await confirmar("Se descarta este conteo y no se cambia nada del inventario.",{titulo:"Cancelar conteo",ok:"Cancelar conteo",peligro:true}))return;
 const ok=await espera(async()=>{const {error}=await db.rpc("inventario_cancelar",{p_inv:INV.id});if(error)throw new Error(error.message);return true});
 if(ok){toast("Conteo cancelado");await inicio()}}

/* ---------- detalle de un conteo cerrado ---------- */
function detalle(h,L,H){
 IT=L;const r=resumen(L);vista=h;filtro="dif";texto="";lim=200;
 const D=()=>filas(L).sort((a,b)=>Math.abs(dif(b)||0)-Math.abs(dif(a)||0));
 $("cMain").innerHTML=`<button class="btn g sm" id="dBack" type="button" style="margin-bottom:10px">‹ Todos los conteos</button>
  <div class="card cin"><h3>Conteo #${h.numero} <span class="bd ${h.estado==="cerrado"?"ok":"mu"}">${h.estado==="cerrado"?"Cerrado":"Cancelado"}</span></h3>
   <p style="margin:0">${fdate(h.created_at)} ${ftime(h.created_at)}${h.cerrado_en?" → "+fdate(h.cerrado_en)+" "+ftime(h.cerrado_en):""}<br>${h.ajustado?"El inventario del sistema se corrigió con este conteo.":"Solo reporte: no se cambió el inventario."}</p></div>
  <div class="cres"><div><span>Contados</span><b>${r.cont} de ${r.total}</b></div><div><span>Coinciden</span><b class="pos">${r.ok}</b></div>
   <div><span>Faltantes</span><b class="neg">${r.uf}</b><small>${r.falt} productos · ${$$(r.vf)} al costo</small></div><div><span>Sobrantes</span><b>${r.us}</b><small>${r.sobr} productos · ${$$(r.vs)} al costo</small></div></div>
  <div class="ctl"><button class="btn g" id="dXls" type="button">Descargar Excel</button></div>
  <div class="seg2" id="cF" style="overflow-x:auto"><button data-f="dif">Con diferencia</button><button data-f="todos">Todos</button><button data-f="pend">No contados</button><button data-f="ok">Coinciden</button></div>
  <div class="fl"><div class="full"><input id="dQ" type="search" placeholder="Buscar producto o código" autocomplete="off"></div></div>
  <div id="cL"></div><div class="ctl"><span class="grow"></span><button class="btn g hidden" id="cMas" type="button">Ver más</button><span class="grow"></span></div>`;
 const pintar=()=>{const F=D();document.querySelectorAll("#cF [data-f]").forEach(b=>b.classList.toggle("on",b.dataset.f===filtro));
  $("cL").innerHTML=F.length?F.slice(0,lim).map(i=>fila(i,true)+(i.ajuste?`<div class="caj">Ajuste aplicado: ${i.ajuste>0?"+":""}${i.ajuste}</div>`:"")).join(""):'<div class="empty card">No hay productos con ese filtro.</div>';
  $("cMas").classList.toggle("hidden",F.length<=lim)};
 $("dBack").onclick=()=>inicio();
 $("cF").onclick=e=>{const b=e.target.closest("[data-f]");if(!b)return;filtro=b.dataset.f;lim=200;pintar()};
 $("dQ").addEventListener("input",()=>{texto=$("dQ").value;lim=200;pintar()});
 $("cMas").onclick=()=>{lim+=200;pintar()};
 $("dXls").onclick=()=>excel(h,L);pintar()}

function excel(h,L){
 const f=L.slice().sort((a,b)=>Math.abs(dif(b)||0)-Math.abs(dif(a)||0)).map(i=>{const d=dif(i);return [i.codigo||"",i.codigo_barras||"",i.nombre,i.color||"",i.categoria||"",base(i),i.contado==null?"":i.contado,d==null?"No contado":d,+i.costo,d==null?0:d*(+i.costo),i.ajuste==null?"":i.ajuste]});
 UI.excel("conteo-fisico-"+h.numero,[{n:"Conteo "+h.numero,c:[["Código",14],["Código de barras",18],["Producto",34],["Color",14],["Categoría",18],["Sistema",10],["Contado",10],["Diferencia",12],["Costo",10,"money"],["Valor diferencia",16,"money"],["Ajuste aplicado",14]],f}])}

addEventListener("pagehide",pararCamara);
await inicio();
})();
