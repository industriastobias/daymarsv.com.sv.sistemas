/* DAYMAR-SHOP · Devoluciones y cambios (solo administradores) */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,norm,fdate,ftime,deb,rpc,fetchAll,espera,modal}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"devoluciones",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
const MOTIVOS=["Producto defectuoso o dañado","Talla o medida incorrecta","El cliente se arrepintió","Error en la venta","Otro"];
const S={D:[],per:"month"};
const mrg=n=>n<0?"−"+$$(-n):$$(n);
/* ---------- lista ---------- */
function rangoPer(){const t=new Date(),y=t.getFullYear(),m=t.getMonth(),f=d=>ymd(d);
 if(S.per==="month")return [f(new Date(y,m,1)),f(t)];if(S.per==="prev")return [f(new Date(y,m-1,1)),f(new Date(y,m,0))];if(S.per==="year")return [f(new Date(y,0,1)),f(t)];return ["2000-01-01",f(t)]}
async function cargar(){const [a,b]=rangoPer();
 S.D=await fetchAll(()=>db.from("devoluciones").select("*,profiles(nombre)").gte("fecha",a).lte("fecha",b).order("fecha",{ascending:false}).order("numero",{ascending:false}))}
function pintar(){
 const q=norm($("dQ").value),L=S.D.filter(d=>!q||norm([d.numero,d.venta_numero,d.cliente_nombre,d.motivo].join(" ")).includes(q));
 const ref=S.D.reduce((s,d)=>s+(+d.diferencia<0?-d.diferencia:0),0),cob=S.D.reduce((s,d)=>s+(+d.diferencia>0?+d.diferencia:0),0);
 $("dK").innerHTML=`<div><span>Devoluciones y cambios</span><b>${S.D.length}</b><small>${S.D.filter(d=>d.tipo==="cambio").length} cambios</small></div><div><span>Valor devuelto</span><b>${$$(S.D.reduce((s,d)=>s+ +d.monto_devuelto,0))}</b></div><div><span>Reembolsado</span><b class="neg">${$$(ref)}</b></div><div><span>Cobrado en cambios</span><b class="pos">${$$(cob)}</b></div>`;
 $("dP").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.p===S.per));
 $("dL").innerHTML=L.length?L.map(d=>`<div class="rw" data-d="${d.id}" style="cursor:pointer"><div class="ti"><b>${d.tipo==="cambio"?"Cambio":"Devolución"} #${d.numero} · Venta #${d.venta_numero||"—"}</b><small>${fdate(d.fecha)}${d.cliente_nombre?" · "+esc(d.cliente_nombre):""}${d.motivo?" · "+esc(d.motivo):""}${d.profiles?" · "+esc(d.profiles.nombre):""}</small></div>
  <div class="am2"><span class="bd ${d.tipo==="cambio"?"bl2":"or"}">${d.tipo==="cambio"?"Cambio":"Devolución"}</span> <b class="${+d.diferencia<0?"neg":"pos"}">${+d.diferencia===0?"$0.00":+d.diferencia<0?"−"+$$(-d.diferencia):"+"+$$(d.diferencia)}</b><br><small>${+d.diferencia<0?"reembolsado":+d.diferencia>0?"cobrado":"sin diferencia"} · ${esc(d.metodo)}</small></div></div>`).join("")
  :`<div class="empty card">No hay devoluciones ni cambios en este periodo.</div>`}
async function detalle(id){
 const d=S.D.find(x=>x.id===id);if(!d)return;
 const it=await espera(async()=>{const {data,error}=await db.from("devolucion_items").select("*").eq("devolucion_id",id);if(error)throw new Error(error.message);return data});if(!it)return;
 const fila=i=>`<div class="rw"><div class="ti"><b>${i.cantidad}× ${esc(i.nombre||"Producto")}</b><small>${i.direccion==="entra"?(i.regresa_stock?"Vuelve al stock":"No vuelve al stock (dañado o perdido)"):"Entregado a cambio"}</small></div><div class="am2"><b>${$$(i.cantidad*i.precio_unit)}</b></div></div>`;
 modal((d.tipo==="cambio"?"Cambio":"Devolución")+" #"+d.numero,`<p class="hint" style="margin-top:0">Venta #${d.venta_numero||"—"} · ${fdate(d.fecha)} ${ftime(d.created_at)}${d.cliente_nombre?" · "+esc(d.cliente_nombre):""}${d.profiles?" · Registró "+esc(d.profiles.nombre):""}</p>
  ${d.motivo?`<p><b>Motivo:</b> ${esc(d.motivo)}</p>`:""}<h3 class="sect">El cliente devolvió</h3>${it.filter(i=>i.direccion==="entra").map(fila).join("")}
  ${it.some(i=>i.direccion==="sale")?`<h3 class="sect">Se entregó a cambio</h3>${it.filter(i=>i.direccion==="sale").map(fila).join("")}`:""}
  <div class="pan" style="margin-top:12px"><div class="rw" style="border:0;padding:4px 0"><div class="ti">Valor devuelto</div><div class="am2">${$$(d.monto_devuelto)}</div></div>${+d.monto_nuevo?`<div class="rw" style="border:0;padding:4px 0"><div class="ti">Valor entregado</div><div class="am2">${$$(d.monto_nuevo)}</div></div>`:""}
  <div class="rw" style="border:0;padding:4px 0"><div class="ti"><b>${+d.diferencia<0?"Se le devolvió al cliente":+d.diferencia>0?"El cliente pagó la diferencia":"Sin diferencia"} (${esc(d.metodo)})</b></div><div class="am2"><b>${$$(Math.abs(d.diferencia))}</b></div></div></div>`,
  {foot:`<button class="btn" data-x>Cerrar</button>`})}
$("dL").addEventListener("click",e=>{const r=e.target.closest("[data-d]");if(r)detalle(r.dataset.d)});
$("dP").addEventListener("click",async e=>{const b=e.target.closest("[data-p]");if(!b)return;S.per=b.dataset.p;await recargar()});
$("dQ").addEventListener("input",deb(pintar,150));
async function recargar(){const ok=await espera(async()=>{await cargar();return true},"Actualizando…");if(ok)pintar()}
/* ---------- nueva: paso 1, elegir la venta ---------- */
const SEL="*,venta_items(id,cantidad,precio_unit,nombre,producto_id,descuento_pct)";
const resumen=v=>(v.venta_items||[]).map(i=>`${i.cantidad}× ${esc(i.nombre||"Producto")}`).join(" · ");
async function elegirVenta(){
 const L=await espera(()=>fetchAll(()=>db.from("ventas").select(SEL).eq("estado","completada").order("created_at",{ascending:false}).limit(400)));if(!L)return;
 const m=modal("¿De qué venta?",`<input id="evQ" type="search" placeholder="Buscar por número, cliente o producto" autocomplete="off"><div id="evL" style="margin-top:10px;max-height:55vh;overflow:auto"></div>`,{big:true,foot:`<button class="btn g" data-x>Cancelar</button>`});
 const pinta=()=>{const q=norm(m.q("#evQ").value),R=L.filter(v=>!q||norm(v.numero+" "+(v.cliente_nombre||"")+" "+resumen(v)).includes(q)).slice(0,60);
  m.q("#evL").innerHTML=R.length?R.map(v=>`<div class="rw" data-v="${v.id}" style="cursor:pointer"><div class="ti"><b>Venta #${v.numero}</b><small>${fdate(v.created_at)} ${ftime(v.created_at)}${v.cliente_nombre?" · "+esc(v.cliente_nombre):""}<br>${resumen(v)}</small></div><div class="am2"><b>${$$(v.total)}</b></div></div>`).join(""):`<div class="empty card">No se encontró esa venta.</div>`};
 pinta();m.q("#evQ").addEventListener("input",deb(pinta,150));setTimeout(()=>m.q("#evQ").focus(),60);
 m.el.addEventListener("click",e=>{const r=e.target.closest("[data-v]");if(r){const v=L.find(x=>x.id===r.dataset.v);m.close();formDev(v)}})}
/* ---------- paso 2: qué se devuelve y, si aplica, qué se entrega ---------- */
async function formDev(v){
 const ya=await espera(async()=>{const ids=(v.venta_items||[]).map(i=>i.id);const {data,error}=await db.from("devolucion_items").select("venta_item_id,cantidad").eq("direccion","entra").in("venta_item_id",ids);if(error)throw new Error(error.message);return data});if(!ya)return;
 const P=await espera(()=>fetchAll(()=>db.from("productos").select("id,nombre,codigo,precio_venta,descuento_pct,stock").eq("activo",true).gt("stock",0).order("nombre")));if(!P)return;
 try{const cv=await fetchAll(()=>db.from("producto_variantes").select("id,producto_id,nombre,stock,orden").order("orden"));const vm={};cv.forEach(x=>(vm[x.producto_id]=vm[x.producto_id]||[]).push(x));
  const R=[];P.forEach(p=>{const vs=vm[p.id];if(!vs)R.push({...p,pid:p.id,vid:null});else vs.filter(x=>+x.stock>0).forEach(x=>R.push({...p,id:p.id+":"+x.id,pid:p.id,vid:x.id,nombre:p.nombre+" – "+x.nombre,stock:+x.stock}))});P.splice(0,P.length,...R)}catch(e){P.forEach(p=>{p.pid=p.id;p.vid=null})}
 const f=1-(+v.descuento_pct||0)/100,rest={};(v.venta_items||[]).forEach(i=>{rest[i.id]=i.cantidad-ya.filter(x=>x.venta_item_id===i.id).reduce((s,x)=>s+x.cantidad,0)});
 if(!Object.values(rest).some(n=>n>0)){toast("Esta venta ya fue devuelta por completo.");return}
 let modo="dev",nuevos=new Map();
 const fin=p=>r2(p.precio_venta*(1-(+p.descuento_pct||0)/100));
 const m=modal("Venta #"+v.numero,`<p class="hint" style="margin-top:0">${fdate(v.created_at)}${v.cliente_nombre?" · "+esc(v.cliente_nombre):""} · total ${$$(v.total)}${+v.descuento_pct?` · descuento ${+v.descuento_pct}%`:""}</p>
  <h3 class="sect">¿Qué devuelve el cliente?</h3>
  ${(v.venta_items||[]).map(i=>rest[i.id]>0?`<div class="rw" data-i="${i.id}"><div class="ti"><b>${esc(i.nombre||"Producto")}</b><small>${$$(r2(i.precio_unit*f))} c/u · se pueden devolver ${rest[i.id]}</small><label class="cf-c" style="margin:0"><input type="checkbox" data-st ${i.producto_id?"checked":"disabled"}> Vuelve al stock</label></div><div class="am2"><input type="number" min="0" max="${rest[i.id]}" value="0" inputmode="numeric" data-q style="width:72px"></div></div>`:"").join("")}
  <label>Motivo</label><select id="dvM">${MOTIVOS.map(x=>`<option>${x}</option>`).join("")}</select>
  <div class="seg2" id="dvT" style="margin-top:12px"><button type="button" data-t="dev" class="on">Solo devolver</button><button type="button" data-t="cam">Cambiar por otros productos</button></div>
  <div id="dvC" class="hidden"><input id="dvQ" type="search" placeholder="Buscar el producto que se lleva" autocomplete="off" style="margin-top:8px"><div id="dvPL" style="max-height:170px;overflow:auto"></div><div id="dvSel"></div></div>
  <div class="pan" style="margin-top:12px"><div class="rw" style="border:0;padding:3px 0"><div class="ti">Valor devuelto</div><div class="am2" id="dvA">$0.00</div></div><div class="rw hidden" id="dvNW" style="border:0;padding:3px 0"><div class="ti">Valor que se lleva</div><div class="am2" id="dvB">$0.00</div></div>
  <div class="rw" style="border:0;padding:3px 0"><div class="ti"><b id="dvDt">—</b></div><div class="am2"><b id="dvD">$0.00</b></div></div></div>
  <label>Método de ${"pago o reembolso"}</label><select id="dvMe"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select><div class="err2" id="dvE" role="alert"></div>`,
  {big:true,foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="dvOk">Registrar</button>`});
 const lineas=()=>[...m.el.querySelectorAll("[data-i]")].map(r=>({venta_item_id:r.dataset.i,cantidad:Math.max(0,Math.floor(+r.querySelector("[data-q]").value||0)),regresa_stock:r.querySelector("[data-st]").checked})).filter(x=>x.cantidad>0);
 const calc=()=>{const L=lineas(),ib=Object.fromEntries((v.venta_items||[]).map(i=>[i.id,i]));
  const dev=L.reduce((s,x)=>s+x.cantidad*r2(ib[x.venta_item_id].precio_unit*f),0),nw=[...nuevos].reduce((s,[id,q])=>s+q*fin(P.find(p=>p.id===id)),0),df=modo==="cam"?nw-dev:-dev;
  m.q("#dvA").textContent=$$(dev);m.q("#dvB").textContent=$$(nw);m.q("#dvNW").classList.toggle("hidden",modo!=="cam");
  m.q("#dvDt").textContent=df<0?"Hay que devolverle al cliente":df>0?"El cliente debe pagar":"Sin diferencia";m.q("#dvD").textContent=$$(Math.abs(df));return {L,df}};
 const pintaP=()=>{const q=norm(m.q("#dvQ").value);const R=q?P.filter(p=>norm(p.nombre+" "+(p.codigo||"")).includes(q)).slice(0,12):[];
  m.q("#dvPL").innerHTML=R.map(p=>`<div class="rw" data-p="${p.id}" style="cursor:pointer;padding:8px"><div class="ti"><b>${esc(p.nombre)}</b><small>Stock ${p.stock}</small></div><div class="am2">${$$(fin(p))}</div></div>`).join("")};
 const pintaS=()=>{m.q("#dvSel").innerHTML=[...nuevos].map(([id,q])=>{const p=P.find(x=>x.id===id);return `<div class="rw" data-n="${id}"><div class="ti"><b>${esc(p.nombre)}</b><small>${$$(fin(p))} c/u</small></div><div class="am2"><input type="number" min="1" max="${p.stock}" value="${q}" data-nq style="width:72px"> <button type="button" class="btn g sm" data-nd>✕</button></div></div>`}).join("");calc()};
 m.el.addEventListener("input",e=>{if(e.target.matches("[data-q]")){const mx=+e.target.max;if(+e.target.value>mx)e.target.value=mx;calc()}if(e.target.matches("[data-nq]")){const id=e.target.closest("[data-n]").dataset.n,p=P.find(x=>x.id===id);let q=Math.max(1,Math.min(p.stock,Math.floor(+e.target.value||1)));nuevos.set(id,q);calc()}});
 m.el.addEventListener("change",e=>{if(e.target.matches("[data-st]"))calc()});
 m.el.addEventListener("click",e=>{
  const t=e.target.closest("#dvT [data-t]");if(t){modo=t.dataset.t;m.el.querySelectorAll("#dvT button").forEach(b=>b.classList.toggle("on",b===t));m.q("#dvC").classList.toggle("hidden",modo!=="cam");calc();return}
  const p=e.target.closest("[data-p]");if(p){nuevos.set(p.dataset.p,(nuevos.get(p.dataset.p)||0)+1);const pr=P.find(x=>x.id===p.dataset.p);if(nuevos.get(pr.id)>pr.stock)nuevos.set(pr.id,pr.stock);m.q("#dvQ").value="";pintaP();pintaS();return}
  const d=e.target.closest("[data-nd]");if(d){nuevos.delete(d.closest("[data-n]").dataset.n);pintaS()}});
 m.q("#dvQ").addEventListener("input",deb(pintaP,120));calc();
 m.q("#dvOk").onclick=async()=>{const {L,df}=calc(),E=m.q("#dvE");E.textContent="";
  if(!L.length){E.textContent="Pon la cantidad que el cliente devuelve.";return}
  if(modo==="cam"&&!nuevos.size){E.textContent="Elige el producto que se lleva a cambio, o cambia a “Solo devolver”.";return}
  const ok=await espera(async()=>{await rpc("registrar_devolucion",{p_venta:v.id,p_items:L,p_motivo:m.q("#dvM").value,p_metodo:m.q("#dvMe").value,p_nuevos:modo==="cam"?[...nuevos].map(([k,cantidad])=>{const o=P.find(x=>x.id===k);return {producto_id:o.pid,variante_id:o.vid,cantidad}}):[]});return true},"Registrando…");
  if(ok){m.close();toast(modo==="cam"?"Cambio registrado":"Devolución registrada");await recargar()}}}
$("dNew").onclick=elegirVenta;
/* ---------- arranque ---------- */
await recargar();
const h=location.hash.match(/v=([\w-]+)/);
if(h){const v=await espera(async()=>{const {data,error}=await db.from("ventas").select(SEL).eq("id",h[1]).single();if(error)throw new Error(error.message);return data});history.replaceState(null,"",location.pathname);if(v&&v.estado==="completada")formDev(v);else if(v)toast("Solo se pueden devolver ventas completadas.")}
})();
