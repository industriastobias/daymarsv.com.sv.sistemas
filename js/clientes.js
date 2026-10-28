/* DAYMAR-SHOP · Clientes · conectado a Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,fdate,deb,rpc,fetchAll,espera,modal,confirmar,pedirClave,excel,norm}=UI;
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"clientes",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
const S={C:[],V:[],F:[],CU:[],PE:[],DV:[],orden:"nombre"};
const ini=n=>(n||"?").trim().charAt(0).toUpperCase()||"?";
/* ---------- datos ---------- */
async function cargar(){
 const [c,v,f,cu,pe,dv]=await Promise.all([
  fetchAll(()=>db.from("clientes").select("*").order("nombre")),
  fetchAll(()=>db.from("ventas").select("id,numero,total,created_at,cliente_id,cliente_nombre").eq("estado","completada").or("cliente_id.not.is.null,cliente_nombre.not.is.null").order("created_at",{ascending:false})),
  fetchAll(()=>db.from("facturas").select("id,numero,fecha,total,cliente_nombre,estado").eq("estado","emitida").not("cliente_nombre","is",null).order("fecha",{ascending:false})),
  ADM?fetchAll(()=>db.from("fin_cuentas").select("*").eq("tipo","cobrar").eq("estado","pendiente").order("vence",{ascending:true,nullsFirst:false})):[],
  fetchAll(()=>db.from("ventas").select("id,numero,created_at,cliente_nombre,pendiente_monto,total").eq("estado","pendiente").eq("tipo","cobro_pendiente")),
  fetchAll(()=>db.from("devoluciones").select("id,numero,fecha,tipo,cliente_nombre,monto_devuelto,diferencia").order("fecha",{ascending:false}))]);
 S.C=c;S.V=v;S.F=f;S.CU=cu;S.PE=pe;S.DV=dv;
 const mapa={};S.C.forEach(x=>{mapa[norm(x.nombre)]=x.id});
 S.stats={};
 S.C.forEach(x=>S.stats[x.id]={n:0,t:0,u:null,ventas:[],facs:[],cuentas:[],pend:[],devs:[],deuda:0});
 S.V.forEach(x=>{const id=x.cliente_id&&S.stats[x.cliente_id]?x.cliente_id:mapa[norm(x.cliente_nombre)];if(!id)return;const o=S.stats[id];o.n++;o.t+=+x.total;o.ventas.push(x);if(!o.u||x.created_at>o.u)o.u=x.created_at});
 S.F.forEach(x=>{const id=mapa[norm(x.cliente_nombre)];if(id)S.stats[id].facs.push(x)});
 S.CU.forEach(x=>{const id=x.cliente_id&&S.stats[x.cliente_id]?x.cliente_id:mapa[norm(x.tercero)];if(id){const o=S.stats[id];o.cuentas.push(x);o.deuda+=+x.monto-+x.abonado}});
 S.PE.forEach(x=>{const id=mapa[norm(x.cliente_nombre)];if(id){const o=S.stats[id];o.pend.push(x);o.deuda+=+x.pendiente_monto}});
 S.DV.forEach(x=>{const id=mapa[norm(x.cliente_nombre)];if(id)S.stats[id].devs.push(x)})}
/* ---------- lista ---------- */
function filtrados(){
 const q=norm($("cQ").value);let L=S.C.filter(c=>!q||norm([c.nombre,c.codigo,c.telefono,c.correo,c.documento].join(" ")).includes(q));
 const st=c=>S.stats[c.id];
 if(S.orden==="gasto")L=L.slice().sort((a,b)=>st(b).t-st(a).t);else if(S.orden==="deuda")L=L.filter(c=>st(c).deuda>0).sort((a,b)=>st(b).deuda-st(a).deuda);else if(S.orden==="reciente")L=L.slice().sort((a,b)=>(st(b).u||"").localeCompare(st(a).u||""));
 return L}
const waUrl=(c,s)=>{let t=String(c.telefono||"").replace(/\D/g,"");if(t.length===8)t="503"+t;if(t.length<8)return "";
 const m=`Hola ${c.nombre}, te escribimos de DAYMARSV.`+(s&&s.deuda>0?` Tienes un saldo pendiente de ${$$(s.deuda)}.`:"");return "https://wa.me/"+t+"?text="+encodeURIComponent(m)};
function pintar(){
 const act=S.C.filter(c=>S.stats[c.id].n>0).length,tot=S.C.reduce((s,c)=>s+S.stats[c.id].t,0),deu=S.C.reduce((s,c)=>s+S.stats[c.id].deuda,0);
 $("cK").innerHTML=`<div><span>Clientes</span><b>${S.C.length}</b></div><div><span>Con compras</span><b>${act}</b></div><div><span>Vendido a clientes</span><b>${$$(tot)}</b></div><div><span>Por cobrar</span><b class="${deu>0?"neg":""}">${$$(deu)}</b><small>${S.C.filter(c=>S.stats[c.id].deuda>0).length} cliente(s)</small></div>`;
 $("cSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.o===S.orden));
 const L=filtrados();
 $("cL").innerHTML=L.length?L.slice(0,400).map(c=>{const s=S.stats[c.id];
  return `<div class="rw" data-c="${c.id}" style="cursor:pointer"><div class="th ph">${esc(ini(c.nombre))}</div><div class="ti"><b>${esc(c.nombre)}</b><small>${esc([c.codigo,c.telefono,c.correo].filter(Boolean).join(" · ")||"Sin contacto")}</small></div>
  ${waUrl(c,s)?`<a class="cwa" href="${waUrl(c,s)}" target="_blank" rel="noopener" aria-label="WhatsApp de ${esc(c.nombre)}" title="Escribir por WhatsApp" style="flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#25d366;color:#fff;margin-right:8px"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.6.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.6-1.2a.5.5 0 000-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.4.8 3.2.7a2.7 2.7 0 001.8-1.3 2.2 2.2 0 00.2-1.3c-.1-.1-.3-.2-.6-.3z"/></svg></a>`:""}<div class="am2"><b>${$$(s.t)}</b><br><small>${s.n} compra${s.n===1?"":"s"}${s.u?" · "+fdate(s.u):""}</small>${s.deuda>0?`<br><span class="bd or">Debe ${$$(s.deuda)}</span>`:""}</div></div>`}).join("")
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
  <div class="ti" style="margin-bottom:10px">${[c.codigo&&"Código "+esc(c.codigo),c.telefono&&"Tel. "+esc(c.telefono),c.correo&&esc(c.correo),c.documento&&"Doc. "+esc(c.documento),c.direccion&&esc(c.direccion)].filter(Boolean).map(x=>`<div>${x}</div>`).join("")||'<small>Sin datos de contacto</small>'}${c.notas?`<div style="margin-top:6px"><small>${esc(c.notas)}</small></div>`:""}</div>
  <div class="ctl" style="flex-wrap:wrap">${tel?`<a class="btn g sm" href="tel:${esc(c.telefono)}">Llamar</a><a class="btn g sm" target="_blank" rel="noopener" href="https://wa.me/${wa}">WhatsApp</a>`:""}${c.correo?`<a class="btn g sm" href="mailto:${esc(c.correo)}">Correo</a>`:""}<a class="btn g sm" href="almacenamiento.html#fac">Facturar</a></div>
  ${fichaDeuda(c,s)}
  <h3 class="sect">Últimas compras</h3>${s.ventas.length?s.ventas.slice(0,8).map(v=>`<div class="rw"><div class="ti"><b>Venta #${v.numero}</b><small>${fdate(v.created_at)}</small></div><div class="am2"><b>${$$(v.total)}</b></div></div>`).join(""):'<p class="hint">Todavía no tiene compras registradas. Las ventas se ligan por el nombre del cliente.</p>'}
  ${s.devs.length?`<h3 class="sect">Devoluciones y cambios</h3>${s.devs.slice(0,5).map(x=>`<div class="rw"><div class="ti"><b>${x.tipo==="cambio"?"Cambio":"Devolución"} #${x.numero}</b><small>${fdate(x.fecha)}</small></div><div class="am2"><b>${$$(x.monto_devuelto)}</b></div></div>`).join("")}`:""}
  ${s.facs.length?`<h3 class="sect">Facturas</h3>${s.facs.slice(0,5).map(f=>`<div class="rw"><div class="ti"><b>Factura ${String(f.numero).padStart(6,"0")}</b><small>${fdate(f.fecha)}</small></div><div class="am2"><b>${$$(f.total)}</b></div></div>`).join("")}`:""}`,
  {foot:`${ADM?'<button class="btn g" id="fDel" style="color:var(--bad);margin-right:auto">Eliminar</button>':""}<button class="btn g" data-x>Cerrar</button><button class="btn" id="fEd">Editar</button>`});
 d.q("#fEd").onclick=()=>{d.close();form(c)};
 d.el.addEventListener("click",e=>{const ab=e.target.closest("[data-ab]");if(ab){const cu=s.cuentas.find(z=>z.id===ab.dataset.ab);d.close();abonar(c,cu)}if(e.target.closest("#fNC")){d.close();nuevaCuenta(c)}});
 const del=d.q("#fDel");if(del)del.onclick=async()=>{if(!await pedirClave("Vas a eliminar al cliente "+c.nombre+"."))return;
  const ok=await espera(async()=>{const {error}=await db.from("clientes").delete().eq("id",id);if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Cliente eliminado");await recargar()}}}
function fichaDeuda(c,s){
 const hay=s.cuentas.length||s.pend.length;
 return `<h3 class="sect">Por cobrar${s.deuda>0?` · <span class="neg">${$$(s.deuda)}</span>`:""}</h3>
  ${s.cuentas.map(x=>`<div class="rw"><div class="ti"><b>${esc(x.concepto||"Cuenta por cobrar")}</b><small>${x.vence?"vence "+fdate(x.vence):"sin vencimiento"} · de ${$$(x.monto)}, abonado ${$$(x.abonado)}</small></div><div class="am2"><b>${$$(x.monto-x.abonado)}</b></div>${ADM?`<button class="btn sm" data-ab="${x.id}">Abonar</button>`:""}</div>`).join("")}
  ${s.pend.map(x=>`<div class="rw"><div class="ti"><b>Venta #${x.numero} pendiente de cobro</b><small>${fdate(x.created_at)} · se cobra en Punto de venta</small></div><div class="am2"><b>${$$(x.pendiente_monto)}</b></div><a class="btn g sm" href="almacenamiento.html#pend">Ver</a></div>`).join("")}
  ${hay?"":'<p class="hint" style="margin:0 0 6px">No debe nada.</p>'}${ADM?'<div class="ctl"><button class="btn g sm" id="fNC" type="button">Nueva cuenta por cobrar</button></div>':""}`}
function abonar(c,cu){
 const sal=r2(cu.monto-cu.abonado);
 const d=modal("Registrar abono",`<p class="pw" style="margin-top:0">${esc(c.nombre)} · saldo <b>${$$(sal)}</b>. El abono se registra también como ingreso.</p><label>Monto del abono ($)</label><input name="a" type="number" min="0.01" step="0.01" max="${sal}" value="${sal}" inputmode="decimal"><div class="err2" id="abE"></div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="abOk">Registrar</button>`,onclose:()=>{}});
 d.q("#abOk").onclick=async()=>{const v=Number(d.q("[name=a]").value);if(!(v>0)||v>sal+.001){d.q("#abE").textContent="El abono debe ser mayor a cero y no pasar del saldo.";return}
  const ok=await espera(async()=>{await rpc("abonar_cuenta",{p_id:cu.id,p_monto:r2(v)});return true});if(ok){d.close();toast("Abono registrado");await recargar();ficha(c.id)}}}
function nuevaCuenta(c){
 const d=modal("Nueva cuenta por cobrar",`<p class="pw" style="margin-top:0">Para <b>${esc(c.nombre)}</b>. Úsala para ventas fiadas o dinero que te debe.</p><div class="fg"><div class="full"><label>Concepto <small>(opcional)</small></label><input name="c" maxlength="160" placeholder="Ej. 3 camisas fiadas"></div><div><label>Monto ($)</label><input name="m" type="number" min="0.01" step="0.01" inputmode="decimal"></div><div><label>Vence <small>(opcional)</small></label><input name="v" type="date"></div></div><div class="err2" id="ncE"></div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="ncOk">Guardar</button>`});
 const g=n=>d.q(`[name=${n}]`).value.trim();
 d.q("#ncOk").onclick=async()=>{if(!(Number(g("m"))>0)){d.q("#ncE").textContent="Escribe un monto mayor a cero.";return}
  const ok=await espera(async()=>{const {error}=await db.from("fin_cuentas").insert({tipo:"cobrar",tercero:c.nombre,cliente_id:c.id,concepto:g("c")||null,monto:r2(Number(g("m"))),vence:g("v")||null});if(error)throw new Error(/cliente_id/.test(error.message)?"Falta aplicar la migración 003 en Supabase.":error.message);return true});
  if(ok){d.close();toast("Cuenta registrada");await recargar();ficha(c.id)}}}
async function recargar(){const ok=await espera(async()=>{await cargar();return true},"Actualizando…");if(ok)pintar()}
$("cQ").addEventListener("input",deb(pintar,150));
$("cSg").addEventListener("click",e=>{const b=e.target.closest("[data-o]");if(b){S.orden=b.dataset.o;pintar()}});
$("cL").addEventListener("click",e=>{if(e.target.closest(".cwa"))return;const r=e.target.closest("[data-c]");if(r)ficha(r.dataset.c)});
$("cNew").onclick=()=>form();
$("cXls").onclick=()=>excel("clientes",[{n:"Clientes",c:[["Código",10],["Nombre",28],["Teléfono",16],["Correo",26],["DUI / NIT",18],["Dirección",34],["Compras",10],["Total comprado",16,"money"],["Última compra",14],["Notas",30]],f:S.C.map(c=>{const s=S.stats[c.id];return[c.codigo||"",c.nombre,c.telefono||"",c.correo||"",c.documento||"",c.direccion||"",s.n,s.t,s.u?s.u.slice(0,10):"",c.notas||""]})}]);
await recargar();
const hc=location.hash.match(/c=([\w-]+)/);if(hc&&S.stats[hc[1]])ficha(hc[1]);
})();
