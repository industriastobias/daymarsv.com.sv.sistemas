/* DAYMAR-SHOP · Historial de ventas (todas las ventas hechas) · Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,fdate,ftime,deb,fetchAll,espera,modal,norm,rango}=UI;
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"ventas",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
let V=[],q="today",lim=40;
const TIPO={inmediata:"Venta normal",cod:"Contra entrega",entrega_pendiente:"Entrega pendiente",cobro_pendiente:"Cobro pendiente"};
const ESTBD={completada:["Completada","ok"],pendiente:["Pendiente","wa"],anulada:["Anulada","mu"]};
const ini=n=>(n||"?").trim().charAt(0).toUpperCase()||"?";
const its=v=>v.venta_items||[];
const uds=v=>its(v).reduce((s,i)=>s+i.cantidad,0);
const resumen=v=>{const L=its(v);if(!L.length)return "Venta";const a=L.slice(0,2).map(i=>`${i.cantidad>1?i.cantidad+"× ":""}${i.nombre||"Producto"}`).join(", ");return a+(L.length>2?` y ${L.length-2} más`:"")};
const dr=(a,b)=>{const [y1,m1,d1]=a.split("-").map(Number),[y2,m2,d2]=b.split("-").map(Number);return [new Date(y1,m1-1,d1).toISOString(),new Date(y2,m2-1,d2+1).toISOString()]};
async function cargar(){
 const d=$("vD").value,h=$("vH").value;
 V=await fetchAll(()=>{let s=db.from("ventas").select("*,profiles(nombre),venta_items(id,nombre,cantidad,precio_unit,productos(foto_url))").order("created_at",{ascending:false});
  if(d&&h){const r=dr(d,h);s=s.gte("created_at",r[0]).lt("created_at",r[1])}return s});
 const us=[...new Map(V.filter(v=>v.usuario_id&&v.profiles).map(v=>[v.usuario_id,v.profiles.nombre])).entries()],cur=$("vU").value;
 $("vU").innerHTML='<option value="">Todos</option>'+us.map(([i,n])=>`<option value="${i}">${esc(n)}</option>`).join("");$("vU").value=us.some(x=>x[0]===cur)?cur:""}
function filtradas(){
 const t=norm($("vQ").value),e=$("vE").value,p=$("vP").value,ty=$("vT").value,u=$("vU").value;
 return V.filter(v=>(!e||v.estado===e)&&(!p||v.metodo_pago===p)&&(!ty||v.tipo===ty)&&(!u||v.usuario_id===u)&&(!t||norm([v.numero,v.cliente_nombre,...its(v).map(i=>i.nombre)].join(" ")).includes(t)))}
function pintar(){
 const L=filtradas(),ok=L.filter(v=>v.estado==="completada"),tot=ok.reduce((s,v)=>s+ +v.total,0);
 const pg=m=>ok.filter(v=>v.metodo_pago===m).reduce((s,v)=>s+ +v.total,0);
 $("vK").innerHTML=`<div><span>Ventas</span><b>${L.length}</b></div><div><span>Total vendido</span><b>${$$(tot)}</b><small>${ok.length} completadas</small></div><div><span>Venta promedio</span><b>${$$(ok.length?tot/ok.length:0)}</b></div><div><span>Productos vendidos</span><b>${ok.reduce((s,v)=>s+uds(v),0)}</b></div><div><span>Efectivo</span><b>${$$(pg("Efectivo"))}</b></div><div><span>Transferencia</span><b>${$$(pg("Transferencia"))}</b>${pg("Tarjeta")?`<small>Tarjeta ${$$(pg("Tarjeta"))}</small>`:""}</div>`;
 $("vSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.q===q));
 document.querySelectorAll(".vfd").forEach(x=>x.classList.toggle("off",q!=="custom"));
 const R=L.slice(0,lim);
 $("vL").innerHTML=R.length?R.map(fila).join(""):`<div class="empty card">${V.length?"Ninguna venta coincide con los filtros.":"No hay ventas en este periodo."}</div>`;
 $("vMas").classList.toggle("hidden",L.length<=lim);$("vMas").textContent=`Ver más (${L.length-lim})`}
function fila(v){
 const L=its(v).slice(0,1),f=L[0]&&L[0].productos&&L[0].productos.foto_url,E=ESTBD[v.estado]||[v.estado,"mu"];
 return `<div class="vr2 ${v.estado==="anulada"?"an":""}" data-id="${v.id}"><div class="vth">${f?`<img src="${esc(f)}" alt="" loading="lazy">`:`<div class="ph0">${esc(ini((its(v)[0]||{}).nombre))}</div>`}</div>
 <div class="vtx"><b>${esc(resumen(v))}</b><small>#${v.numero} · ${fdate(v.created_at)} ${ftime(v.created_at)}</small>${v.cliente_nombre?`<small>${esc(v.cliente_nombre)}</small>`:""}</div>
 <div class="vmt"><b>${$$(v.total)}</b></div>
 <div class="vbd"><span class="bd ${E[1]}">${E[0]}</span><span class="bd bl2">${esc(v.metodo_pago||"")}</span>${v.tipo&&v.tipo!=="inmediata"?`<span class="bd wa">${esc(TIPO[v.tipo]||v.tipo)}</span>`:""}${v.profiles?`<span class="bd mu">${esc(v.profiles.nombre)}</span>`:""}</div></div>`}
function detalle(v){
 const E=ESTBD[v.estado]||[v.estado,"mu"],L=its(v);
 const lin=L.map(i=>`<div class="rw">${i.productos&&i.productos.foto_url?`<img class="im" src="${esc(i.productos.foto_url)}" alt="">`:""}<div class="ti"><b>${esc(i.nombre||"Producto")}</b><small>${i.cantidad} × ${$$(i.precio_unit)}</small></div><div class="am2"><b>${$$(r2(i.cantidad*i.precio_unit))}</b></div></div>`).join("");
 const extra=r2(+v.total-+v.subtotal);
 const m=modal("Venta #"+v.numero,`<div class="vdt"><p class="hint" style="margin-top:0">${fdate(v.created_at)} ${ftime(v.created_at)}${v.profiles?" · Vendió "+esc(v.profiles.nombre):""}${v.cliente_nombre?" · "+esc(v.cliente_nombre):""}</p>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><span class="bd ${E[1]}">${E[0]}</span><span class="bd bl2">${esc(v.metodo_pago||"")}</span><span class="bd wa">${esc(TIPO[v.tipo]||"Venta normal")}</span></div>
  ${lin||'<div class="empty">Sin productos.</div>'}
  <div style="margin-top:8px"><div class="vtt"><span>Subtotal</span><span>${$$(v.subtotal)}</span></div>${+v.descuento_pct?`<div class="vtt"><span>Descuento</span><span>${+v.descuento_pct}%</span></div>`:""}${Math.abs(extra)>0.004&&!+v.descuento_pct?`<div class="vtt"><span>Envío, comisión u otros</span><span>${extra>0?"+":"−"}${$$(Math.abs(extra))}</span></div>`:""}<div class="vtt g"><span>Total</span><span>${$$(v.total)}</span></div></div></div>`,
  {foot:`<button class="btn g" data-x>Cerrar</button>${ADM&&v.estado==="completada"?`<a class="btn g" href="devoluciones.html#v=${v.id}">Devolver o cambiar</a>`:""}`})}
function excel(){
 const L=filtradas();if(!L.length)return toast("No hay ventas para exportar");
 UI.excel("historial-ventas",[{n:"Ventas",c:[["N.º",8],["Fecha",12],["Hora",9],["Cliente",24],["Productos",48],["Unidades",9],["Pago",14],["Tipo",18],["Estado",13],["Vendedor",18],["Subtotal",12,"money"],["Total",12,"money"]],
  f:L.map(v=>[v.numero,fdate(v.created_at),ftime(v.created_at),v.cliente_nombre||"",its(v).map(i=>`${i.cantidad}× ${i.nombre}`).join("; "),uds(v),v.metodo_pago||"",TIPO[v.tipo]||"",(ESTBD[v.estado]||[v.estado])[0],(v.profiles&&v.profiles.nombre)||"",+v.subtotal,+v.total])}])}
const recargar=()=>espera(async()=>{await cargar();pintar();return true},"Buscando ventas…");
function periodo(k){q=k;lim=40;if(k!=="custom"){const [a,b]=rango(k);$("vD").value=a;$("vH").value=b;recargar()}else pintar()}
$("vSg").onclick=e=>{const b=e.target.closest("button");if(b)periodo(b.dataset.q)};
["vD","vH"].forEach(i=>$(i).addEventListener("change",()=>{if($("vD").value&&$("vH").value)recargar()}));
["vE","vP","vT","vU"].forEach(i=>$(i).addEventListener("change",()=>{lim=40;pintar()}));
$("vQ").addEventListener("input",deb(()=>{lim=40;pintar()},200));
$("vMas").onclick=()=>{lim+=40;pintar()};$("vXls").onclick=excel;
$("vL").addEventListener("click",e=>{const r=e.target.closest("[data-id]");const v=r&&V.find(x=>x.id===r.dataset.id);if(v)detalle(v)});
try{periodo("today")}catch(e){$("vL").innerHTML=`<div class="empty card">${esc(e.message)}</div>`}
})();
