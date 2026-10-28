/* DAYMAR-SHOP · Clientes · conectado a Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,fdate,deb,fetchAll,espera,modal,confirmar,pedirClave,excel,norm}=UI;
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"clientes",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
const S={C:[],V:[],F:[],orden:"nombre"};
const ini=n=>(n||"?").trim().charAt(0).toUpperCase()||"?";
/* ---------- datos ---------- */
async function cargar(){
 const [c,v,f]=await Promise.all([
  fetchAll(()=>db.from("clientes").select("*").order("nombre")),
  fetchAll(()=>db.from("ventas").select("id,numero,total,created_at,cliente_id,cliente_nombre").eq("estado","completada").or("cliente_id.not.is.null,cliente_nombre.not.is.null").order("created_at",{ascending:false})),
  me.rol==="admin"||true?fetchAll(()=>db.from("facturas").select("id,numero,fecha,total,cliente_nombre,estado").eq("estado","emitida").not("cliente_nombre","is",null).order("fecha",{ascending:false})):[]]);
 S.C=c;S.V=v;S.F=f;
 const mapa={};S.C.forEach(x=>{mapa[norm(x.nombre)]=x.id});
 S.stats={};
 S.C.forEach(x=>S.stats[x.id]={n:0,t:0,u:null,ventas:[],facs:[]});
 S.V.forEach(x=>{const id=x.cliente_id&&S.stats[x.cliente_id]?x.cliente_id:mapa[norm(x.cliente_nombre)];if(!id)return;const o=S.stats[id];o.n++;o.t+=+x.total;o.ventas.push(x);if(!o.u||x.created_at>o.u)o.u=x.created_at});
 S.F.forEach(x=>{const id=mapa[norm(x.cliente_nombre)];if(id)S.stats[id].facs.push(x)})}
/* ---------- lista ---------- */
function filtrados(){
 const q=norm($("cQ").value);let L=S.C.filter(c=>!q||norm([c.nombre,c.telefono,c.correo,c.documento].join(" ")).includes(q));
 const st=c=>S.stats[c.id];
 if(S.orden==="gasto")L=L.slice().sort((a,b)=>st(b).t-st(a).t);else if(S.orden==="reciente")L=L.slice().sort((a,b)=>(st(b).u||"").localeCompare(st(a).u||""));
 return L}
function pintar(){
 const act=S.C.filter(c=>S.stats[c.id].n>0).length,tot=S.C.reduce((s,c)=>s+S.stats[c.id].t,0);
 $("cK").innerHTML=`<div><span>Clientes</span><b>${S.C.length}</b></div><div><span>Con compras</span><b>${act}</b></div><div><span>Vendido a clientes</span><b>${$$(tot)}</b></div>`;
 $("cSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.o===S.orden));
 const L=filtrados();
 $("cL").innerHTML=L.length?L.slice(0,400).map(c=>{const s=S.stats[c.id];
  return `<div class="rw" data-c="${c.id}" style="cursor:pointer"><div class="th ph">${esc(ini(c.nombre))}</div><div class="ti"><b>${esc(c.nombre)}</b><small>${esc([c.telefono,c.correo].filter(Boolean).join(" · ")||"Sin contacto")}</small></div>
  <div class="am2"><b>${$$(s.t)}</b><br><small>${s.n} compra${s.n===1?"":"s"}${s.u?" · "+fdate(s.u):""}</small></div></div>`}).join("")
  :`<div class="empty card">${S.C.length?"Ningún cliente coincide con la búsqueda.":"Aún no hay clientes. Toca “Nuevo cliente” para crear el primero."}</div>`}
/* ---------- formulario ---------- */
function form(c){
 c=c||{};const nuevo=!c.id;
 const d=modal(nuevo?"Nuevo cliente":"Editar cliente",`<div class="fg"><div class="full"><label>Nombre</label><input name="n" maxlength="100" value="${esc(c.nombre||"")}" autocomplete="off"></div>
  <div><label>Teléfono</label><input name="t" type="tel" maxlength="30" inputmode="tel" value="${esc(c.telefono||"")}"></div><div><label>Correo</label><input name="c" type="email" maxlength="100" value="${esc(c.correo||"")}"></div>
  <div><label>DUI / NIT <small>(para factura)</small></label><input name="d" maxlength="30" value="${esc(c.documento||"")}"></div><div><label>Dirección <small>(opcional)</small></label><input name="a" maxlength="200" value="${esc(c.direccion||"")}"></div>
  <div class="full"><label>Notas <small>(opcional)</small></label><input name="o" maxlength="300" value="${esc(c.notas||"")}"></div></div><div class="err2" id="fE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="fOk">Guardar</button>`});
 const g=n=>d.q(`[name=${n}]`).value.trim();setTimeout(()=>d.q("[name=n]").focus(),60);
 d.q("#fOk").onclick=async()=>{if(!g("n")){d.q("#fE").textContent="Escribe el nombre del cliente.";return}
  const dup=S.C.find(x=>x.id!==c.id&&(norm(x.nombre)===norm(g("n"))||(g("t")&&x.telefono&&x.telefono.replace(/\D/g,"")===g("t").replace(/\D/g,""))));
  if(dup&&!await confirmar(`Ya existe un cliente parecido: <b>${esc(dup.nombre)}</b>${dup.telefono?" ("+esc(dup.telefono)+")":""}. ¿Guardar igual?`,{titulo:"Posible duplicado",ok:"Guardar igual"}))return;
  const row={nombre:g("n"),telefono:g("t")||null,correo:g("c")||null,documento:g("d")||null,direccion:g("a")||null,notas:g("o")||null};
  const ok=await espera(async()=>{const {error}=c.id?await db.from("clientes").update(row).eq("id",c.id):await db.from("clientes").insert(row);if(error)throw new Error(/documento|direccion/.test(error.message)?"Falta aplicar la migración de clientes (002_clientes.sql).":error.message);return true});
  if(ok){d.close();toast("Cliente guardado");await recargar()}}}
/* ---------- ficha ---------- */
function ficha(id){
 const c=S.C.find(x=>x.id===id);if(!c)return;const s=S.stats[id];
 const tel=(c.telefono||"").replace(/\D/g,""),wa=tel.length===8?"503"+tel:tel;
 const d=modal(esc(c.nombre),`<div class="kp" style="grid-template-columns:repeat(3,1fr);margin:0 0 12px"><div><span>Compras</span><b>${s.n}</b></div><div><span>Total</span><b>${$$(s.t)}</b></div><div><span>Ticket prom.</span><b>${$$(s.n?s.t/s.n:0)}</b></div></div>
  <div class="ti" style="margin-bottom:10px">${[c.telefono&&"Tel. "+esc(c.telefono),c.correo&&esc(c.correo),c.documento&&"Doc. "+esc(c.documento),c.direccion&&esc(c.direccion)].filter(Boolean).map(x=>`<div>${x}</div>`).join("")||'<small>Sin datos de contacto</small>'}${c.notas?`<div style="margin-top:6px"><small>${esc(c.notas)}</small></div>`:""}</div>
  <div class="ctl" style="flex-wrap:wrap">${tel?`<a class="btn g sm" href="tel:${esc(c.telefono)}">Llamar</a><a class="btn g sm" target="_blank" rel="noopener" href="https://wa.me/${wa}">WhatsApp</a>`:""}${c.correo?`<a class="btn g sm" href="mailto:${esc(c.correo)}">Correo</a>`:""}<a class="btn g sm" href="almacenamiento.html#fac">Facturar</a></div>
  <h3 class="sect">Últimas compras</h3>${s.ventas.length?s.ventas.slice(0,8).map(v=>`<div class="rw"><div class="ti"><b>Venta #${v.numero}</b><small>${fdate(v.created_at)}</small></div><div class="am2"><b>${$$(v.total)}</b></div></div>`).join(""):'<p class="hint">Todavía no tiene compras registradas. Las ventas se ligan por el nombre del cliente.</p>'}
  ${s.facs.length?`<h3 class="sect">Facturas</h3>${s.facs.slice(0,5).map(f=>`<div class="rw"><div class="ti"><b>Factura ${String(f.numero).padStart(6,"0")}</b><small>${fdate(f.fecha)}</small></div><div class="am2"><b>${$$(f.total)}</b></div></div>`).join("")}`:""}`,
  {foot:`${ADM?'<button class="btn g" id="fDel" style="color:var(--bad);margin-right:auto">Eliminar</button>':""}<button class="btn g" data-x>Cerrar</button><button class="btn" id="fEd">Editar</button>`});
 d.q("#fEd").onclick=()=>{d.close();form(c)};
 const del=d.q("#fDel");if(del)del.onclick=async()=>{if(!await pedirClave("Vas a eliminar al cliente "+c.nombre+"."))return;
  const ok=await espera(async()=>{const {error}=await db.from("clientes").delete().eq("id",id);if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Cliente eliminado");await recargar()}}}
async function recargar(){const ok=await espera(async()=>{await cargar();return true},"Actualizando…");if(ok)pintar()}
$("cQ").addEventListener("input",deb(pintar,150));
$("cSg").addEventListener("click",e=>{const b=e.target.closest("[data-o]");if(b){S.orden=b.dataset.o;pintar()}});
$("cL").addEventListener("click",e=>{const r=e.target.closest("[data-c]");if(r)ficha(r.dataset.c)});
$("cNew").onclick=()=>form();
$("cXls").onclick=()=>excel("clientes",[{n:"Clientes",c:[["Nombre",28],["Teléfono",16],["Correo",26],["DUI / NIT",18],["Dirección",34],["Compras",10],["Total comprado",16,"money"],["Última compra",14],["Notas",30]],f:S.C.map(c=>{const s=S.stats[c.id];return[c.nombre,c.telefono||"",c.correo||"",c.documento||"",c.direccion||"",s.n,s.t,s.u?s.u.slice(0,10):"",c.notas||""]})}]);
await recargar();
})();
