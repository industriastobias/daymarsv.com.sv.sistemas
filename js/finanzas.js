/* DAYMAR-SHOP · Finanzas (solo administradores) · conectado a Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,cents,norm,fdate,money,ic,deb,rpc,fetchAll,espera,modal,confirmar,pedirClave,pestanas,vistaDoc,DOC_CSS,excel,rango}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"finanzas",me.rol);$("app").classList.remove("hidden");
const IC={res:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',mov:'<path d="M7 7h13l-3-3M17 17H4l3 3"/>',cue:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',cap:'<path d="M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 1.8 2.5 4 2.5 4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5"/>',inf:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',ban:'<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',prov:'<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/>'};
const S={q:"month",desde:"",hasta:"",V:[],M:[],VD:[],DV:[],C:[],PR:[],B:[],CL:[],K:[],VA:[],MA:[],kt:"all",inv:0,tipo:"all",cu:"cobrar",PC:[],ready:false,all:[]};
const CATS=["Alquiler","Servicios (luz, agua, internet)","Salarios","Publicidad","Transporte y envíos","Empaque","Impuestos","Mercadería","Flete","Comisiones","Materiales","Otros ingresos","Otros gastos"];
const TN={ingreso:["Ingreso","ok"],gasto:["Gasto","or"],costo:["Costo directo","wa"],compra:["Compra de mercadería","wa"]};
const mkey=d=>String(d).slice(0,7);
const mes=k=>{const [y,m]=k.split("-");return["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][+m-1]+" "+y.slice(2)};

/* ---------- datos ---------- */
async function cargarPeriodo(){
 if(S.q!=="custom"){[S.desde,S.hasta]=rango(S.q);$("fD").value=S.desde;$("fH").value=S.hasta}
 const d0=new Date(S.desde+"T00:00:00-06:00"),d1=new Date(S.hasta+"T00:00:00-06:00");d1.setDate(d1.getDate()+1);
 const [v,m,vd,dv]=await Promise.all([
  db.rpc("fin_ventas_mensuales",{p_desde:S.desde,p_hasta:S.hasta}),
  fetchAll(()=>db.from("fin_movimientos").select("*,proveedores(nombre)").gte("fecha",S.desde).lte("fecha",S.hasta).order("fecha",{ascending:false}).order("created_at",{ascending:false})),
  fetchAll(()=>db.from("ventas").select("id,numero,created_at,total,tipo,metodo_pago,cliente_nombre,profiles(nombre),venta_items(cantidad,precio_unit,nombre,productos(nombre))").eq("estado","completada").gte("created_at",d0.toISOString()).lt("created_at",d1.toISOString()).order("created_at",{ascending:false})),
  fetchAll(()=>db.from("devoluciones").select("id,numero,fecha,created_at,venta_numero,cliente_nombre,monto_devuelto,monto_nuevo").gte("fecha",S.desde).lte("fecha",S.hasta)).catch(()=>[])]);
 if(v.error)throw new Error(v.error.message);S.V=v.data||[];S.M=m;S.VD=vd;S.DV=dv}
async function cargarGeneral(){
 const [kk,va,ma,cl]=await Promise.all([db.from("capital_movs").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false}),db.rpc("fin_ventas_mensuales",{p_desde:"2000-01-01",p_hasta:ymd(new Date())}),fetchAll(()=>db.from("fin_movimientos").select("tipo,monto")),fetchAll(()=>db.from("clientes").select("id,nombre").order("nombre"))]);
 if(kk.error)throw new Error(kk.error.message);if(va.error)throw new Error(va.error.message);S.K=kk.data;S.VA=va.data||[];S.MA=ma;S.CL=cl;
 const [c,p,b,pr,all]=await Promise.all([db.from("fin_cuentas").select("*").order("vence",{ascending:true,nullsFirst:false}),db.from("proveedores").select("*").order("nombre"),db.from("fin_banco").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false}).limit(12),
  fetchAll(()=>db.from("productos").select("stock,precio_costo").eq("activo",true)),fetchAll(()=>db.from("fin_movimientos").select("id,fecha,tipo,monto,conciliado,descripcion,categoria").order("fecha",{ascending:false}).limit(1000))]);
 [c,p,b].forEach(x=>{if(x.error)throw new Error(x.error.message)});
 S.PC=await fetchAll(()=>db.from("ventas").select("id,numero,created_at,cliente_nombre,subtotal,abonado,pendiente_monto").eq("estado","pendiente").eq("tipo","cobro_pendiente").order("created_at",{ascending:false})).catch(()=>[]);
 S.C=c.data;S.PR=p.data;S.B=b.data;S.inv=pr.reduce((s,x)=>s+x.stock*x.precio_costo,0);S.all=all}
const sumM=(t)=>S.M.filter(m=>m.tipo===t).reduce((s,m)=>s+ +m.monto,0);
function calc(){
 const ventas=S.V.reduce((s,x)=>s+ +x.ventas,0),costoV=S.V.reduce((s,x)=>s+ +x.costo,0),nV=S.V.reduce((s,x)=>s+ +x.n,0);
 const oi=sumM("ingreso"),ga=sumM("gasto"),co=sumM("costo"),cm=sumM("compra");
 const ingresos=ventas+oi,egresos=costoV+co+ga,util=ingresos-egresos;
 const dias=Math.max(1,Math.round((new Date(S.hasta)-new Date(S.desde))/864e5)+1);
 return {ventas,costoV,nV,oi,ga,co,cm,ingresos,egresos,util,dias,bruta:ventas-costoV}}
const pcTot=()=>S.PC.reduce((s,v)=>s+(+v.pendiente_monto||0),0);
const pend=t=>S.C.filter(c=>c.tipo===t&&c.estado==="pendiente").reduce((s,c)=>s+(c.monto-c.abonado),0)+(t==="cobrar"?pcTot():0);

/* ---------- Resumen ---------- */
function grafico(){
 const mp={};S.V.forEach(x=>{const k=mkey(x.mes);mp[k]=mp[k]||{i:0,e:0};mp[k].i+=+x.ventas;mp[k].e+=+x.costo});
 S.M.forEach(m=>{const k=mkey(m.fecha);mp[k]=mp[k]||{i:0,e:0};if(m.tipo==="ingreso")mp[k].i+=+m.monto;else mp[k].e+=+m.monto});
 const ks=Object.keys(mp).sort();if(!ks.length)return `<div class="empty">Sin movimientos en este periodo.</div>`;
 const W=640,H=230,pl=44,pb=26,pt=10,mx=Math.max(1,...ks.map(k=>Math.max(mp[k].i,mp[k].e))),ih=H-pb-pt,bw=Math.min(34,(W-pl)/ks.length/2.6),gp=(W-pl)/ks.length;
 const nice=v=>{const p=Math.pow(10,Math.floor(Math.log10(v)));const f=v/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p},top=nice(mx);
 let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y egresos por mes">`;
 for(let i=0;i<=4;i++){const y=pt+ih-ih*i/4;s+=`<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${pl-6}" y="${y+4}" text-anchor="end">${top*i/4>=1000?(top*i/4/1000)+"k":Math.round(top*i/4)}</text>`}
 ks.forEach((k,j)=>{const cx=pl+gp*j+gp/2,hi=mp[k].i/top*ih,he=mp[k].e/top*ih;
  s+=`<rect x="${cx-bw-1}" y="${pt+ih-hi}" width="${bw}" height="${hi}" rx="3" style="fill:var(--wine)"><title>${mes(k)} · Ingresos ${money(mp[k].i)}</title></rect><rect x="${cx+1}" y="${pt+ih-he}" width="${bw}" height="${he}" rx="3" style="fill:var(--gold)"><title>${mes(k)} · Egresos ${money(mp[k].e)}</title></rect><text x="${cx}" y="${H-8}" text-anchor="middle">${mes(k)}</text>`});
 return s+"</svg>"}
function pintarRes(){
 const c=calc();
 $("rK").innerHTML=`<div><span>Ingresos</span><b>${$$(c.ingresos)}</b><small>ventas ${$$(c.ventas)}</small></div><div><span>Egresos</span><b>${$$(c.egresos)}</b><small>costo de ventas + costos + gastos</small></div><div><span>Utilidad neta</span><b class="${c.util>=0?"pos":"neg"}">${$$(c.util)}</b><small>${c.ingresos?(c.util/c.ingresos*100).toFixed(1):"0.0"}% de margen</small></div><div><span>Compras de mercadería</span><b>${$$(c.cm)}</b><small>inventario: no baja la utilidad</small></div><div><span>Por cobrar</span><b>${$$(pend("cobrar"))}</b></div><div><span>Por pagar</span><b>${$$(pend("pagar"))}</b></div>`;
 $("rG").innerHTML=grafico();
 const ven=S.C.filter(x=>x.estado==="pendiente"&&x.vence&&x.vence<ymd(new Date()));
 $("rA").innerHTML=ven.length?`<div class="alert bad"><div><b>${ven.length} cuenta(s) vencida(s)</b>${ven.slice(0,3).map(x=>esc(x.tercero)).join(", ")}${ven.length>3?"…":""} — revísalas en Cuentas.</div></div>`:""}

/* ---------- Movimientos ---------- */
const TIPO_V={inmediata:"Inmediata",cod:"Contra entrega",entrega_pendiente:"Pend. entrega",cobro_pendiente:"Pend. cobro"};
function filasMov(){const q=norm($("mQ").value),R=[];
 S.M.forEach(m=>{if((S.tipo==="all"||m.tipo===S.tipo)&&(!q||norm(m.categoria+" "+(m.descripcion||"")+" "+(m.referencia||"")+" "+(m.proveedores?m.proveedores.nombre:"")).includes(q)))R.push({k:"m",m,ts:new Date(m.fecha+"T12:00:00-06:00").getTime()})});
 if(S.tipo==="all"||S.tipo==="ingreso"||S.tipo==="venta"){
  S.VD.forEach(v=>{const items=(v.venta_items||[]).map(i=>`${i.cantidad}× ${i.nombre||(i.productos&&i.productos.nombre)||"Producto"} a ${$$(i.precio_unit)}`);
   if(!q||norm("venta "+v.numero+" "+items.join(" ")+" "+(v.cliente_nombre||"")+" "+(v.profiles?v.profiles.nombre:"")+" "+v.metodo_pago).includes(q))R.push({k:"v",v,items,ts:new Date(v.created_at).getTime()})});
  S.DV.forEach(d=>{if(!q||norm("devolucion "+(d.cliente_nombre||"")).includes(q))R.push({k:"d",d,ts:new Date((d.created_at||d.fecha+"T12:00:00-06:00")).getTime()})})}
 return R.sort((a,b)=>b.ts-a.ts)}
function pintarMov(){
 const L=filasMov(),c=calc(),t=k=>S.M.filter(m=>m.tipo===k).reduce((s,m)=>s+ +m.monto,0);
 $("mK").innerHTML=`<div><span>Ingresos</span><b class="pos">${$$(c.ingresos)}</b><small>ventas ${$$(c.ventas)} (automático) + otros ${$$(c.oi)}</small></div><div><span>Gastos</span><b class="neg">${$$(t("gasto"))}</b></div><div><span>Costos directos</span><b>${$$(t("costo"))}</b></div><div><span>Compras de mercadería</span><b>${$$(t("compra"))}</b><small>Inventario, no baja la utilidad</small></div>`;
 $("mSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===S.tipo));
 const fh=iso=>fdate(iso)+" "+new Date(iso).toLocaleTimeString("es-SV",{hour:"2-digit",minute:"2-digit"});
 $("mL").innerHTML=L.length?L.slice(0,300).map(r=>{
  if(r.k==="v"){const v=r.v;return`<div class="rw"><div class="ti"><b>Venta #${v.numero}${v.cliente_nombre?" · "+esc(v.cliente_nombre):""}</b><small style="display:block">${r.items.map(esc).join(" · ")}</small><small style="display:block">${fh(v.created_at)} · Vendió: ${esc(v.profiles?v.profiles.nombre:"—")} · ${esc(v.metodo_pago||"")} · ${TIPO_V[v.tipo]||""}</small></div><div class="am2"><span class="bd ok">Venta</span> <b class="pos">+${$$(v.total)}</b></div></div>`}
  if(r.k==="d"){const d=r.d,n=+d.monto_nuevo-+d.monto_devuelto;return`<div class="rw"><div class="ti"><b>Devolución/cambio #${d.numero}${d.cliente_nombre?" · "+esc(d.cliente_nombre):""}</b><small>${fdate(d.fecha)} · de la venta #${d.venta_numero||"—"}</small></div><div class="am2"><span class="bd wa">Devolución</span> <b class="${n>=0?"pos":"neg"}">${n>=0?"+":"−"}${$$(Math.abs(n))}</b></div></div>`}
  const m=r.m;return`<div class="rw"><div class="ti"><b>${esc(m.categoria)}${m.descripcion?" · "+esc(m.descripcion):""}</b><small>${fdate(m.fecha)} · ${esc(m.metodo||"")}${m.proveedores?" · "+esc(m.proveedores.nombre):""}${m.referencia?" · Ref. "+esc(m.referencia):""}</small></div>
  <div class="am2"><span class="bd ${TN[m.tipo][1]}">${TN[m.tipo][0]}</span> <b class="${m.tipo==="ingreso"?"pos":"neg"}">${m.tipo==="ingreso"?"+":"−"}${$$(m.monto)}</b></div><button class="btn g sm" data-me="${m.id}">Editar</button></div>`}).join("")+(L.length>300?`<p class="hint">Mostrando los 300 más recientes. Acota el periodo para ver el resto.</p>`:"")
  :`<div class="empty card">No hay movimientos en este periodo.</div>`}
function formMov(m){
 m=m||{tipo:"gasto",fecha:ymd(new Date()),categoria:"",descripcion:"",monto:"",metodo:"Efectivo",proveedor_id:"",referencia:""};
 let tipo=m.tipo;
 const d=modal(m.id?"Editar movimiento":"Nuevo movimiento",`<div class="tp" id="fmT">${Object.keys(TN).map(k=>`<button type="button" data-t="${k}" class="${k===tipo?"on":""}">${TN[k][0]}</button>`).join("")}</div>
  <div class="fg"><div><label>Fecha</label><input name="f" type="date" value="${m.fecha}"></div><div><label>Monto ($)</label><input name="mo" type="number" min="0.01" step="0.01" inputmode="decimal" value="${m.monto}"></div>
  <div><label>Categoría</label><input name="c" list="dlCat" maxlength="60" value="${esc(m.categoria)}" placeholder="Ej. Alquiler"><datalist id="dlCat">${CATS.map(c=>`<option>${esc(c)}`).join("")}</datalist></div>
  <div><label>Método</label><select name="me">${["Efectivo","Transferencia","Tarjeta"].map(x=>`<option ${x===m.metodo?"selected":""}>${x}</option>`).join("")}</select></div>
  <div class="full"><label>Descripción <small>(opcional)</small></label><input name="d" maxlength="160" value="${esc(m.descripcion||"")}"></div>
  <div><label>Proveedor <small>(opcional)</small></label><select name="p"><option value="">—</option>${S.PR.map(p=>`<option value="${p.id}" ${p.id===m.proveedor_id?"selected":""}>${esc(p.nombre)}</option>`).join("")}</select></div>
  <div><label>Referencia <small>(factura, recibo)</small></label><input name="r" maxlength="60" value="${esc(m.referencia||"")}"></div></div><div class="err2" id="fmE" role="alert"></div>`,
  {foot:`${m.id?'<button class="btn g" id="fmDel" style="color:var(--bad);margin-right:auto">Eliminar</button>':""}<button class="btn g" data-x>Cancelar</button><button class="btn" id="fmOk">Guardar</button>`});
 d.q("#fmT").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(!b)return;tipo=b.dataset.t;d.el.querySelectorAll("#fmT button").forEach(x=>x.classList.toggle("on",x===b))});
 const g=n=>d.q(`[name=${n}]`).value.trim();
 d.q("#fmOk").onclick=async()=>{const mo=Number(g("mo"));if(!(mo>0)){d.q("#fmE").textContent="Escribe un monto mayor a cero.";return}if(!g("f")){d.q("#fmE").textContent="Elige la fecha.";return}if(!g("c")){d.q("#fmE").textContent="Escribe una categoría.";return}
  const row={tipo,fecha:g("f"),monto:r2(mo),categoria:g("c"),descripcion:g("d")||null,metodo:g("me"),proveedor_id:g("p")||null,referencia:g("r")||null};
  const ok=await espera(async()=>{const {error}=m.id?await db.from("fin_movimientos").update(row).eq("id",m.id):await db.from("fin_movimientos").insert({...row,creado_por:me.id});if(error)throw new Error(error.message);return true});
  if(ok){d.close();toast("Movimiento guardado");await refrescar()}};
 const del=d.q("#fmDel");if(del)del.onclick=async()=>{if(!await pedirClave("Vas a eliminar este movimiento."))return;
  const ok=await espera(async()=>{const {error}=await db.from("fin_movimientos").delete().eq("id",m.id);if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Movimiento eliminado");await refrescar()}}}
$("mNew").onclick=()=>formMov();
$("mL").addEventListener("click",e=>{const b=e.target.closest("[data-me]");if(b)formMov(S.M.find(x=>x.id===b.dataset.me))});
$("mSg").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(b){S.tipo=b.dataset.t;pintarMov()}});
$("mQ").addEventListener("input",deb(pintarMov,150));
$("mXls").onclick=()=>excel("finanzas-movimientos",[{n:"Movimientos",c:[["Fecha",12],["Tipo",14],["Categoría",24],["Descripción",34],["Monto",12,"money"],["Método",14],["Proveedor",22],["Referencia",18]],f:S.M.map(m=>[m.fecha,TN[m.tipo][0],m.categoria,m.descripcion||"",+m.monto,m.metodo||"",m.proveedores?m.proveedores.nombre:"",m.referencia||""])},
 {n:"Ventas por mes",c:[["Mes",12],["Ventas",14,"money"],["Costo de ventas",16,"money"],["N.º de ventas",14]],f:S.V.map(v=>[mkey(v.mes),+v.ventas,+v.costo,+v.n])}]);

/* ---------- Cuentas ---------- */
function pintarCue(){
 $("cSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===S.cu));
 const L=S.C.filter(c=>c.tipo===S.cu),hoy=ymd(new Date()),p=L.filter(c=>c.estado==="pendiente");
 const pcs=S.cu==="cobrar"?S.PC:[],totC=p.reduce((s,c)=>s+c.monto-c.abonado,0);
 $("cK").innerHTML=`<div><span>${S.cu==="cobrar"?"Total por cobrar":"Por pagar"}</span><b>${$$(totC+(S.cu==="cobrar"?pcTot():0))}</b><small>${p.length+pcs.length} pendiente(s)</small></div>${S.cu==="cobrar"?`<div><span>Pendientes de cobro (ventas)</span><b>${$$(pcTot())}</b><small>${pcs.length} cliente(s)</small></div><div><span>Otras cuentas por cobrar</span><b>${$$(totC)}</b><small>${p.length} cuenta(s)</small></div>`:""}<div><span>Vencidas</span><b class="neg">${p.filter(c=>c.vence&&c.vence<hoy).length}</b></div>`;
 const filasPC=pcs.map(v=>`<div class="rw"><div class="ti"><b>${esc(v.cliente_nombre||"Cliente")}</b><small>Venta #${v.numero} · pendiente de cobro · ${fdate(v.created_at)}</small><div class="bar" style="margin-top:6px"><i style="width:${+v.subtotal?(+v.abonado/+v.subtotal*100):0}%"></i></div></div><div class="am2"><b>${$$(v.pendiente_monto)}</b><br><small>de ${$$(v.subtotal)}</small></div><a class="btn g sm" href="pendientes.html">Ver</a></div>`).join("");
 $("cL").innerHTML=filasPC+(L.length?L.map(c=>{const pc=c.monto?c.abonado/c.monto*100:0,v=c.estado==="pendiente"&&c.vence&&c.vence<hoy;
  return `<div class="rw"><div class="ti"><b>${esc(c.tercero)}</b><small>${c.cliente_id?"Cliente guardado · ":""}${esc(c.concepto||"")}${c.concepto?" · ":""}${c.vence?"vence "+fdate(c.vence):"sin vencimiento"}</small><div class="bar ${c.estado==="pagada"?"ok":""}" style="margin-top:6px"><i style="width:${pc}%"></i></div></div>
  <div class="am2"><b>${$$(c.monto-c.abonado)}</b><br><small>de ${$$(c.monto)}</small></div>${c.estado==="pagada"?'<span class="bd ok">Pagada</span>':v?'<span class="bd or">Vencida</span>':""}
  ${c.estado==="pendiente"?`<button class="btn sm" data-ab="${c.id}">Abonar</button>`:""}<button class="btn g sm" data-cd="${c.id}" style="color:var(--bad)">Eliminar</button></div>`}).join(""):(filasPC?"":`<div class="empty card">No hay cuentas ${S.cu==="cobrar"?"por cobrar":"por pagar"}.</div>`))}
$("cSg").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(b){S.cu=b.dataset.t;pintarCue()}});
$("cNew").onclick=()=>{const d=modal("Nueva cuenta por "+(S.cu==="cobrar"?"cobrar":"pagar"),`<div class="fg">${S.cu==="cobrar"?`<div class="full"><label>Cliente guardado</label><select name="cl"><option value="">— Otra persona (escribir nombre) —</option>${S.CL.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}</select></div>`:""}<div class="full"><label>${S.cu==="cobrar"?"Nombre":"Proveedor / acreedor"}</label><input name="t" maxlength="100"></div><div class="full"><label>Concepto <small>(opcional)</small></label><input name="c" maxlength="160"></div>
  <div><label>Monto ($)</label><input name="m" type="number" min="0.01" step="0.01" inputmode="decimal"></div><div><label>Vence <small>(opcional)</small></label><input name="v" type="date"></div></div><div class="err2" id="cnE"></div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="cnOk">Guardar</button>`});
 const g=n=>d.q(`[name=${n}]`).value.trim();
 const sel=d.q("[name=cl]");if(sel)sel.addEventListener("change",()=>{const c=S.CL.find(x=>x.id===sel.value);d.q("[name=t]").value=c?c.nombre:"";d.q("[name=t]").readOnly=!!c});
 d.q("#cnOk").onclick=async()=>{if(!g("t")){d.q("#cnE").textContent="Escribe el nombre.";return}if(!(Number(g("m"))>0)){d.q("#cnE").textContent="Escribe un monto mayor a cero.";return}
  const ok=await espera(async()=>{const {error}=await db.from("fin_cuentas").insert({tipo:S.cu,tercero:g("t"),concepto:g("c")||null,monto:r2(Number(g("m"))),vence:g("v")||null,cliente_id:(sel&&sel.value)||null});if(error)throw new Error(error.message);return true});
  if(ok){d.close();toast("Cuenta registrada");await refrescar()}}};
$("cL").addEventListener("click",async e=>{const a=e.target.closest("[data-ab]"),x=e.target.closest("[data-cd]");
 if(a){const c=S.C.find(z=>z.id===a.dataset.ab),sal=r2(c.monto-c.abonado);
  const d=modal("Registrar abono",`<p class="pw" style="margin-top:0">${esc(c.tercero)} · saldo <b>${$$(sal)}</b>. El abono se registra también como ${c.tipo==="cobrar"?"ingreso":"gasto"}.</p><label>Monto del abono ($)</label><input name="a" type="number" min="0.01" step="0.01" max="${sal}" value="${sal}" inputmode="decimal"><div class="err2" id="abE"></div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="abOk">Registrar</button>`});
  d.q("#abOk").onclick=async()=>{const v=Number(d.q("[name=a]").value);if(!(v>0)||v>sal+.001){d.q("#abE").textContent="El abono debe ser mayor a cero y no pasar del saldo.";return}
   const ok=await espera(async()=>{await rpc("abonar_cuenta",{p_id:c.id,p_monto:r2(v)});return true});if(ok){d.close();toast("Abono registrado");await refrescar()}}}
 if(x&&await confirmar("¿Eliminar esta cuenta? Los abonos ya registrados como movimientos no se borran.",{titulo:"Eliminar cuenta",ok:"Eliminar",peligro:true})){
  const ok=await espera(async()=>{const {error}=await db.from("fin_cuentas").delete().eq("id",x.dataset.cd);if(error)throw new Error(error.message);return true});if(ok){await refrescar()}}});

/* ---------- Informes ---------- */
function filasEstado(){const c=calc(),por=(t)=>{const m={};S.M.filter(x=>x.tipo===t).forEach(x=>m[x.categoria]=(m[x.categoria]||0)+ +x.monto);return Object.entries(m).sort((a,b)=>b[1]-a[1])};
 const R=[["Ventas",c.ventas,"h"],["(−) Costo de lo vendido",-c.costoV,""],["Utilidad bruta",c.bruta,"t"]];
 if(c.oi){R.push(["Otros ingresos",null,"h"]);por("ingreso").forEach(([k,v])=>R.push(["   "+k,v,""]))}
 if(c.co){R.push(["(−) Costos directos",null,"h"]);por("costo").forEach(([k,v])=>R.push(["   "+k,-v,""]))}
 if(c.ga){R.push(["(−) Gastos de operación",null,"h"]);por("gasto").forEach(([k,v])=>R.push(["   "+k,-v,""]))}
 R.push(["Utilidad neta",c.util,"t"]);return R}
function filasBalance(){const b=S.B[0],cobrar=pend("cobrar"),pagar=pend("pagar"),banco=b?+b.saldo_banco:0,act=S.inv+cobrar+banco,patr=act-pagar;
 return [["Activos",null,"h"],["   Efectivo y bancos"+(b?" (saldo al "+fdate(b.fecha)+")":" (sin registrar)"),banco,""],["   Cuentas por cobrar",cobrar,""],["   Inventario (al costo)",S.inv,""],["Total activos",act,"t"],["Pasivos",null,"h"],["   Cuentas por pagar",pagar,""],["Total pasivos",pagar,"t"],["Patrimonio (activos − pasivos)",patr,"t"]]}
function filasInd(){const c=calc(),p=(a,b)=>b?(a/b*100).toFixed(1)+"%":"—";
 return [["Margen bruto",p(c.bruta,c.ventas)],["Margen neto",p(c.util,c.ingresos)],["Gastos sobre ingresos",p(c.ga+c.co,c.ingresos)],["Ticket promedio",c.nV?$$(c.ventas/c.nV):"—"],["Ventas promedio por día",$$(c.ventas/c.dias)],["Rotación de inventario",S.inv&&c.costoV?(c.costoV/S.inv).toFixed(2)+" veces":"—"],["Días de inventario",S.inv&&c.costoV?Math.round(S.inv/(c.costoV/c.dias))+" días":"—"]]}
const tabla=(R,tt)=>`<table${tt?"":' class="tb"'}><tbody>${R.map(r=>`<tr class="${r[2]}"><td${r[2]==="h"?' style="font-weight:700"':""}>${esc(r[0]).replace(/ /g,"&nbsp;")}</td><td class="r">${r[1]===null?"":typeof r[1]==="number"?(r[1]<0?"−":"")+money(Math.abs(r[1])):r[1]}</td></tr>`).join("")}</tbody></table>`;
function pintarInf(){
 $("iE").innerHTML=tabla(filasEstado());$("iB").innerHTML=tabla(filasBalance());$("iI").innerHTML=tabla(filasInd());
 $("iP").textContent=fdate(S.desde)+" al "+fdate(S.hasta)}
$("iDoc").onclick=()=>{const per=fdate(S.desde)+" al "+fdate(S.hasta),h=`<div class="fx"><style>${DOC_CSS}</style><div class="top"><div><h1>DAYMAR-SHOP</h1><div class="sl">Informe financiero</div></div><div class="no"><b>${per}</b><br><small>Generado ${fdate(new Date().toISOString())}</small></div></div>
 <h2>Estado de resultados</h2>${tabla(filasEstado(),1)}<h2>Balance general (a hoy)</h2>${tabla(filasBalance(),1)}<h2>Indicadores</h2>${tabla(filasInd(),1)}
 <p style="margin-top:14px;color:#666;font-size:11px">Informe de gestión interna basado en las ventas completadas y los movimientos registrados; no sustituye la contabilidad formal.</p></div>`;
 vistaDoc("Informe financiero",h,"informe-financiero-"+S.desde+"_"+S.hasta)};

/* ---------- Conciliación bancaria ---------- */
function pintarBan(){
 const b=S.B[0],L=S.all,sg=m=>m.tipo==="ingreso"?+m.monto:-m.monto;
 const conc=L.filter(m=>m.conciliado).reduce((s,m)=>s+sg(m),0),pend=L.filter(m=>!m.conciliado);
 $("bK").innerHTML=`<div><span>Saldo del banco${b?" ("+fdate(b.fecha)+")":""}</span><b>${b?$$(b.saldo_banco):"—"}</b></div><div><span>Neto de movimientos conciliados</span><b>${$$(conc)}</b></div><div><span>Pendientes de conciliar</span><b>${pend.length}</b><small>${$$(pend.reduce((s,m)=>s+sg(m),0))}</small></div>`;
 $("bL").innerHTML=L.length?L.slice(0,150).map(m=>`<label class="rw" style="cursor:pointer"><input type="checkbox" class="ck" data-cc="${m.id}" ${m.conciliado?"checked":""}><div class="ti"><b>${esc(m.categoria)}${m.descripcion?" · "+esc(m.descripcion):""}</b><small>${fdate(m.fecha)}</small></div><div class="am2"><b class="${m.tipo==="ingreso"?"pos":"neg"}">${m.tipo==="ingreso"?"+":"−"}${$$(m.monto)}</b></div></label>`).join(""):`<div class="empty card">Aún no hay movimientos para conciliar.</div>`}
$("bSave").onclick=async()=>{const v=$("bSal").value;if(v===""||!isFinite(Number(v))){toast("Escribe el saldo que muestra tu banco");return}
 const ok=await espera(async()=>{const {error}=await db.from("fin_banco").insert({fecha:$("bFec").value||ymd(new Date()),saldo_banco:r2(Number(v))});if(error)throw new Error(error.message);return true});
 if(ok){$("bSal").value="";toast("Saldo registrado");await refrescar()}};
$("bL").addEventListener("change",async e=>{const c=e.target.closest("[data-cc]");if(!c)return;const m=S.all.find(x=>x.id===c.dataset.cc);m.conciliado=c.checked;
 const {error}=await db.from("fin_movimientos").update({conciliado:c.checked}).eq("id",m.id);if(error){toast(error.message);m.conciliado=!c.checked}pintarBan()});
$("bFec").value=ymd(new Date());

/* ---------- Proveedores ---------- */
function pintarProv(){
 const tot={};S.all.length&&0;
 $("pL").innerHTML=S.PR.length?S.PR.map(p=>`<div class="rw"><div class="th ph">${esc((p.nombre[0]||"?").toUpperCase())}</div><div class="ti"><b>${esc(p.nombre)}</b><small>${[p.nit&&"NIT "+p.nit,p.telefono,p.correo].filter(Boolean).map(esc).join(" · ")||"Sin datos de contacto"}</small></div><button class="btn g sm" data-pe="${p.id}">Editar</button></div>`).join(""):`<div class="empty card">Aún no hay proveedores.</div>`}
function formProv(p){p=p||{};
 const d=modal(p.id?"Editar proveedor":"Nuevo proveedor",`<div class="fg"><div class="full"><label>Nombre</label><input name="n" maxlength="100" value="${esc(p.nombre||"")}"></div><div><label>NIT</label><input name="nit" maxlength="30" value="${esc(p.nit||"")}"></div><div><label>Teléfono</label><input name="t" maxlength="30" inputmode="tel" value="${esc(p.telefono||"")}"></div>
  <div class="full"><label>Correo</label><input name="c" type="email" maxlength="100" value="${esc(p.correo||"")}"></div><div class="full"><label>Dirección</label><input name="d" maxlength="160" value="${esc(p.direccion||"")}"></div><div class="full"><label>Observaciones</label><input name="o" maxlength="200" value="${esc(p.observaciones||"")}"></div></div><div class="err2" id="pvE"></div>`,
  {foot:`${p.id?'<button class="btn g" id="pvDel" style="color:var(--bad);margin-right:auto">Eliminar</button>':""}<button class="btn g" data-x>Cancelar</button><button class="btn" id="pvOk">Guardar</button>`});
 const g=n=>d.q(`[name=${n}]`).value.trim();
 d.q("#pvOk").onclick=async()=>{if(!g("n")){d.q("#pvE").textContent="Escribe el nombre.";return}
  const row={nombre:g("n"),nit:g("nit")||null,telefono:g("t")||null,correo:g("c")||null,direccion:g("d")||null,observaciones:g("o")||null};
  const ok=await espera(async()=>{const {error}=p.id?await db.from("proveedores").update(row).eq("id",p.id):await db.from("proveedores").insert(row);if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Proveedor guardado");await refrescar()}};
 const del=d.q("#pvDel");if(del)del.onclick=async()=>{if(!await pedirClave("Vas a eliminar al proveedor "+p.nombre+"."))return;
  const ok=await espera(async()=>{const {error}=await db.from("proveedores").delete().eq("id",p.id);if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Proveedor eliminado");await refrescar()}}}
$("pNew").onclick=()=>formProv();$("pL").addEventListener("click",e=>{const b=e.target.closest("[data-pe]");if(b)formProv(S.PR.find(x=>x.id===b.dataset.pe))});

/* ---------- Capital: inversión, retiros y préstamos ---------- */
const KT={inversion:["Inversión","ok"],retiro:["Retiro","or"],prestamo:["Préstamo recibido","bl2"],pago_prestamo:["Pago de préstamo","wa"]};
const $n=n=>n<0?"−"+$$(-n):$$(n);
const sumK=t=>S.K.filter(k=>k.tipo===t).reduce((s,k)=>s+ +k.monto,0);
function gananciaTotal(){const v=S.VA.reduce((s,x)=>s+ +x.ventas-+x.costo,0),m=t=>S.MA.filter(x=>x.tipo===t).reduce((s,x)=>s+ +x.monto,0);return v+m("ingreso")-m("gasto")-m("costo")}
function pintarCap(){
 const inv=sumK("inversion"),ret=sumK("retiro"),pre=sumK("prestamo"),pag=sumK("pago_prestamo"),gan=gananciaTotal();
 $("kK").innerHTML=`<div><span>Invertido en el negocio</span><b>${$$(inv)}</b></div><div><span>Ganancia del negocio</span><b class="${gan>=0?"pos":"neg"}">${$n(gan)}</b><small>todo el tiempo</small></div>
  <div><span>Retirado (dinero que tomaste)</span><b>${$$(ret)}</b></div><div><span>Ganancia sin retirar</span><b class="${gan-ret>=0?"pos":"neg"}">${$n(gan-ret)}</b></div>
  <div><span>Debes por préstamos</span><b class="${pre-pag>0?"neg":""}">${$$(pre-pag)}</b><small>recibido ${$$(pre)} · pagado ${$$(pag)}</small></div><div><span>Inversión recuperada</span><b>${inv?Math.min(100,Math.max(0,ret/inv*100)).toFixed(0)+"%":"—"}</b><small>retiros ÷ inversión</small></div>`;
 const T={};S.K.filter(k=>k.tipo==="prestamo"||k.tipo==="pago_prestamo").forEach(k=>{const n=(k.tercero||"Sin nombre").trim();T[n]=T[n]||{r:0,p:0};if(k.tipo==="prestamo")T[n].r+=+k.monto;else T[n].p+=+k.monto});
 const ks=Object.keys(T);
 $("kP").innerHTML=ks.length?ks.map(n=>{const t=T[n],pc=t.r?Math.min(100,t.p/t.r*100):0;return `<div class="rw"><div class="ti"><b>${esc(n)}</b><small>Recibido ${$$(t.r)} · pagado ${$$(t.p)}</small><div class="bar ${t.r-t.p<=0.005?"ok":""}" style="margin-top:6px"><i style="width:${pc}%"></i></div></div><div class="am2"><b>${$$(t.r-t.p)}</b><br><small>${t.r-t.p<=0.005?"Pagado":"saldo"}</small></div></div>`}).join(""):`<p class="hint" style="margin:0">Aún no hay préstamos registrados.</p>`;
 $("kSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===S.kt));
 const L=S.K.filter(k=>S.kt==="all"||k.tipo===S.kt);
 $("kL").innerHTML=L.length?L.slice(0,300).map(k=>`<div class="rw"><div class="ti"><b>${esc(k.tercero||KT[k.tipo][0])}${k.descripcion?" · "+esc(k.descripcion):""}</b><small>${fdate(k.fecha)} · ${esc(k.metodo||"")}</small></div>
  <div class="am2"><span class="bd ${KT[k.tipo][1]}">${KT[k.tipo][0]}</span> <b class="${k.tipo==="inversion"||k.tipo==="prestamo"?"pos":"neg"}">${k.tipo==="inversion"||k.tipo==="prestamo"?"+":"−"}${$$(k.monto)}</b></div><button class="btn g sm" data-ke="${k.id}">Editar</button></div>`).join(""):`<div class="empty card">No hay registros.</div>`}
function formCap(k){
 k=k||{tipo:"inversion",fecha:ymd(new Date()),tercero:"",descripcion:"",monto:"",metodo:"Efectivo"};
 const AYU={inversion:"Dinero tuyo que pones al negocio (para comprar mercadería, equipo…).",retiro:"Dinero que tomas de las ventas o de la ganancia para ti.",prestamo:"Dinero que te prestó alguien (familiar, banco…). Escribe quién.",pago_prestamo:"Dinero que devuelves de un préstamo. Escribe a quién."};
 const d=modal(k.id?"Editar registro":"Nuevo registro de capital",`<div class="tp" id="kfT">${Object.keys(KT).map(t=>`<button type="button" data-t="${t}" class="${t===k.tipo?"on":""}">${KT[t][0]}</button>`).join("")}</div><p class="hint" id="kfA" style="margin-top:8px">${AYU[k.tipo]}</p>
  <div class="fg"><div><label>Fecha</label><input name="f" type="date" value="${k.fecha}"></div><div><label>Monto ($)</label><input name="mo" type="number" min="0.01" step="0.01" inputmode="decimal" value="${k.monto}"></div>
  <div><label id="kfTl">Persona o entidad <small>(opcional)</small></label><input name="t" list="dlKt" maxlength="80" value="${esc(k.tercero||"")}"><datalist id="dlKt">${[...new Set(S.K.filter(x=>x.tercero).map(x=>x.tercero))].map(x=>`<option>${esc(x)}`).join("")}</datalist></div>
  <div><label>Método</label><select name="me">${["Efectivo","Transferencia","Tarjeta"].map(x=>`<option ${x===k.metodo?"selected":""}>${x}</option>`).join("")}</select></div>
  <div class="full"><label>Nota <small>(opcional)</small></label><input name="d" maxlength="160" value="${esc(k.descripcion||"")}"></div></div><div class="err2" id="kfE" role="alert"></div>`,
  {foot:`${k.id?'<button class="btn g" id="kfDel" style="color:var(--bad);margin-right:auto">Eliminar</button>':""}<button class="btn g" data-x>Cancelar</button><button class="btn" id="kfOk">Guardar</button>`});
 let tipo=k.tipo;
 d.q("#kfT").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(!b)return;tipo=b.dataset.t;d.el.querySelectorAll("#kfT button").forEach(x=>x.classList.toggle("on",x===b));d.q("#kfA").textContent=AYU[tipo]});
 const g=n=>d.q(`[name=${n}]`).value.trim();
 d.q("#kfOk").onclick=async()=>{const mo=Number(g("mo"));if(!(mo>0)){d.q("#kfE").textContent="Escribe un monto mayor a cero.";return}if(!g("f")){d.q("#kfE").textContent="Elige la fecha.";return}
  if((tipo==="prestamo"||tipo==="pago_prestamo")&&!g("t")){d.q("#kfE").textContent="Escribe quién prestó o a quién le pagas.";return}
  const row={tipo,fecha:g("f"),monto:r2(mo),tercero:g("t")||null,descripcion:g("d")||null,metodo:g("me")};
  if(tipo==="pago_prestamo"){const sal=S.K.filter(x=>x.tercero===row.tercero&&x.id!==k.id).reduce((s,x)=>s+(x.tipo==="prestamo"?+x.monto:x.tipo==="pago_prestamo"?-x.monto:0),0);
   if(row.monto>sal+.005&&!await confirmar(`Ese pago (${$$(row.monto)}) es mayor que lo que debes a ${esc(row.tercero)} (${$$(Math.max(0,sal))}). ¿Guardarlo igual?`,{titulo:"Revisa el pago",ok:"Guardar igual"}))return}
  const ok=await espera(async()=>{const {error}=k.id?await db.from("capital_movs").update(row).eq("id",k.id):await db.from("capital_movs").insert({...row,creado_por:me.id});if(error)throw new Error(error.message);return true});
  if(ok){d.close();toast("Registro guardado");await refrescar()}};
 const del=d.q("#kfDel");if(del)del.onclick=async()=>{if(!await pedirClave("Vas a eliminar este registro de capital."))return;
  const ok=await espera(async()=>{const {error}=await db.from("capital_movs").delete().eq("id",k.id);if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Registro eliminado");await refrescar()}}}
$("kNew").onclick=()=>formCap();
$("kL").addEventListener("click",e=>{const b=e.target.closest("[data-ke]");if(b)formCap(S.K.find(x=>x.id===b.dataset.ke))});
$("kSg").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(b){S.kt=b.dataset.t;pintarCap()}});

/* ---------- periodo y arranque ---------- */
function pintarTodo(){pintarRes();pintarMov();pintarCue();pintarInf();pintarBan();pintarProv();pintarCap();
 $("fBar").querySelectorAll("[data-q]").forEach(b=>b.classList.toggle("on",b.dataset.q===S.q))}
async function refrescar(){await espera(async()=>{await Promise.all([cargarPeriodo(),cargarGeneral()])},"Actualizando…");pintarTodo()}
$("fBar").addEventListener("click",e=>{const b=e.target.closest("[data-q]");if(!b)return;S.q=b.dataset.q;refrescar()});
["fD","fH"].forEach(i=>$(i).addEventListener("change",()=>{if($("fD").value&&$("fH").value&&$("fD").value<=$("fH").value){S.q="custom";S.desde=$("fD").value;S.hasta=$("fH").value;refrescar()}else toast("Revisa las fechas")}));
pestanas([["res","Resumen",IC.res],["mov","Movimientos",IC.mov],["cue","Cuentas",IC.cue],["inf","Informes",IC.inf],["ban","Banco",IC.ban],["cap","Capital",IC.cap],["prov","Proveedores",IC.prov]],k=>{$("fBar").parentElement.classList.toggle("hidden",!["res","mov","inf"].includes(k))});
await refrescar();
})();
