/* DAYMARSV · Preventa: productos de la próxima colección y sus apartados (reservas de preventa) */
(async()=>{
"use strict";
const {db,esc,$$,toast,mountSide,requireSession}=DAY;
const {$,r2,fdate,deb,rpc,fetchAll,espera,modal,confirmar,norm}=UI;
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"preventa",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
const S={P:[],V:{},R:[],AP:{},C:[],tab:"apa",f:"activos"};
const EST={falta:"Falta pago",anticipo:"Anticipo",pagado:"Pagado",entregado:"Entregado",cancelado:"Cancelado"};
const est=r=>r.cancelada_en?"cancelado":r.entregada_en?"entregado":+r.monto_pagado>=+r.precio_total-0.005?"pagado":+r.monto_pagado>0?"anticipo":"falta";
const saldo=r=>Math.max(0,r2(+r.precio_total-+r.monto_pagado));
const fCorta=d=>{try{return new Date(d+"T12:00:00").toLocaleDateString("es-SV",{day:"numeric",month:"short"})}catch(e){return d||""}};
const fin=p=>r2(+p.precio_venta*(1-(+p.descuento_pct||0)/100));
const prodDe=r=>{const it=(r.items||[])[0];return it?S.P.find(p=>p.id===it.producto_id)||S.todos[it.producto_id]:null};

/* ---------- datos ---------- */
async function cargar(){
 const [prods,res,ap]=await Promise.all([
  fetchAll(()=>db.from("productos").select("id,nombre,precio_venta,descuento_pct,stock,foto_url,preventa,preventa_llega,preventa_limite,preventa_anticipo,created_at").eq("activo",true)),
  fetchAll(()=>db.from("reservas").select("*").eq("preventa",true).order("created_at",{ascending:false})),
  rpc("preventa_resumen").catch(()=>[])]);
 S.todos={};prods.forEach(p=>S.todos[p.id]=p);
 S.P=prods.filter(p=>p.preventa).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
 S.R=res;S.AP={};(ap||[]).forEach(x=>S.AP[x.producto_id]=x.apartadas);
 S.V={};const ids=S.P.map(p=>p.id);
 if(ids.length){try{const vs=await fetchAll(()=>db.from("producto_variantes").select("*").in("producto_id",ids).order("orden").order("nombre"));vs.forEach(v=>(S.V[v.producto_id]=S.V[v.producto_id]||[]).push(v))}catch(e){}}}
async function recargar(){const ok=await espera(async()=>{await cargar();return true},"Actualizando…");if(ok)pintar()}

/* ---------- pintar ---------- */
function pintar(){
 const act=S.R.filter(r=>!r.cancelada_en&&!r.entregada_en),vivos=S.R.filter(r=>!r.cancelada_en);
 const porCobrar=act.reduce((s,r)=>s+saldo(r),0),cobrado=vivos.reduce((s,r)=>s+(+r.monto_pagado||0),0);
 $("pvK").innerHTML=`<div><span>Apartados</span><b>${act.length}</b></div><div><span>Por cobrar</span><b class="${porCobrar>0?"neg":""}">${$$(porCobrar)}</b></div><div><span>Cobrado</span><b>${$$(cobrado)}</b></div>`;
 $("pvSeg").innerHTML=`<button data-t="pro" type="button" class="${S.tab==="pro"?"on":""}">Productos (${S.P.length})</button><button data-t="apa" type="button" class="${S.tab==="apa"?"on":""}">Apartados (${act.length})</button>`;
 $("pvApa").classList.toggle("hidden",S.tab!=="apa");$("pvPro").classList.toggle("hidden",S.tab!=="pro");
 if(S.tab==="apa")pintarApa();else pintarPro()}
function pintarApa(){
 const cnt={activos:0,falta:0,anticipo:0,pagado:0,entregado:0,cancelado:0};
 S.R.forEach(r=>{const e=est(r);cnt[e]++;if(e!=="entregado"&&e!=="cancelado")cnt.activos++});
 const F=[["activos","Activos"],["falta",EST.falta],["anticipo",EST.anticipo],["pagado",EST.pagado],["entregado",EST.entregado],["cancelado",EST.cancelado]];
 $("pvF").innerHTML=F.map(([k,n])=>`<button type="button" data-f="${k}" class="${S.f===k?"on":""}">${n}<i>${cnt[k]}</i></button>`).join("");
 const q=norm($("pvQ").value.trim());
 const L=S.R.filter(r=>{const e=est(r);if(S.f==="activos"?(e==="entregado"||e==="cancelado"):e!==S.f)return false;
  return !q||norm([r.cliente_nombre,r.telefono,r.producto,r.numero].join(" ")).includes(q)});
 $("pvL").innerHTML=L.length?L.map(r=>{const e=est(r),p=prodDe(r),s=saldo(r),img=r.imagen_url||(p&&p.foto_url);
  return `<div class="pvc2" data-r="${r.id}"><div class="pvr">${img?`<img src="${esc(img)}" alt="" loading="lazy" decoding="async">`:`<div class="ph0">${esc((r.cliente_nombre||"?").charAt(0))}</div>`}
   <div class="tx"><b>${esc(r.cliente_nombre)}</b><small>${esc(r.producto)}</small><small>${esc([r.telefono,"#"+r.numero,fdate(r.created_at)].filter(Boolean).join(" · "))}${p&&p.preventa&&p.preventa_llega?" · llega "+esc(fCorta(p.preventa_llega)):""}</small><span class="est ${e}">${EST[e]}</span></div>
   <div class="mo"><b>${$$(r.precio_total)}</b><small>${e==="cancelado"?"cancelado":s>0?"debe "+$$(s):"pagado"}</small></div></div>
   ${e==="entregado"||e==="cancelado"?"":`<div class="pvac">${s>0?`<button class="btn" type="button" data-a="pago">Registrar pago</button>`:`<button class="btn" type="button" data-a="ent">Entregar</button>`}${r.telefono?`<button class="btn g wa" type="button" data-a="wa">WhatsApp</button>`:""}${s>0?`<button class="btn g" type="button" data-a="ent">Entregar</button>`:""}<button class="btn g" type="button" data-a="mas" aria-label="Más opciones">•••</button></div>`}</div>`}).join("")
  :`<div class="empty card">${S.R.length?"No hay apartados con ese filtro.":"Aún no hay apartados. Toca «Apartar» para anotar el primero, o acepta un pedido de preventa en Pedidos en línea."}</div>`}
function pintarPro(){
 $("pvP").innerHTML=S.P.length?S.P.map(p=>{const ap=S.AP[p.id]||0,vs=S.V[p.id]||[];
  return `<div class="pvc2" data-p="${p.id}"><div class="pvr">${p.foto_url?`<img src="${esc(p.foto_url)}" alt="" loading="lazy" decoding="async">`:`<div class="ph0">${esc(p.nombre.charAt(0))}</div>`}
   <div class="tx"><b>${esc(p.nombre)}</b><small>${p.preventa_llega?"Llega aprox. "+esc(fCorta(p.preventa_llega))+" · ":""}${$$(fin(p))}${vs.length?" · "+vs.length+(vs.length===1?" variante":" variantes"):""}</small>
   ${p.preventa_limite?`<div class="pvbar2"><i style="width:${Math.min(100,Math.round(ap/p.preventa_limite*100))}%"></i></div><small>${ap} de ${p.preventa_limite} apartados</small>`:`<small>${ap} apartado${ap===1?"":"s"} · sin límite</small>`}
   ${+p.stock>0?`<small style="color:var(--ok)">Ya hay ${p.stock} en inventario</small>`:""}</div></div>
   <div class="pvac"><button class="btn" type="button" data-a="apartar">+ Apartar</button><button class="btn g" type="button" data-a="ver">Ver apartados</button>${ADM?`<a class="btn g" href="compra.html">Editar</a><button class="btn g" type="button" data-a="terminar">Terminar preventa</button>`:""}</div></div>`}).join("")
  :`<div class="empty card">No hay productos en preventa. Actívala en Compra → Nuevo o Editar producto → «Preventa».</div>`}

/* ---------- acciones de un apartado ---------- */
function pagar(r){
 const s=saldo(r),p=prodDe(r),pct=p&&p.preventa_anticipo!=null?+p.preventa_anticipo:50,ant=r2(Math.max(0,+r.precio_total*pct/100-(+r.monto_pagado||0)));
 const d=modal("Registrar pago",`<div class="pvsum"><div><span>Total</span><b>${$$(r.precio_total)}</b></div><div><span>Pagado</span><b>${$$(r.monto_pagado)}</b></div><div><span>Debe</span><b>${$$(s)}</b></div></div>
  <p style="margin:0 0 6px"><b>${esc(r.cliente_nombre)}</b> · ${esc(r.producto)}</p>
  <div class="pvq">${ant>0&&ant<s?`<button type="button" data-v="${ant}">Anticipo ${pct}% · ${$$(ant)}</button>`:""}<button type="button" data-v="${s}">Todo · ${$$(s)}</button></div>
  <div class="fg"><div><label>Monto ($)</label><input name="m" type="number" min="0.01" step="0.01" max="${s}" inputmode="decimal" value="${ant>0&&ant<s?ant:s}"></div>
  <div><label>Método</label><select name="me"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></div>
  <div class="full"><label>Nota <small>(opcional)</small></label><input name="n" maxlength="120"></div></div><div class="err2" id="pgE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="pgOk">Registrar</button>`});
 d.el.addEventListener("click",e=>{const b=e.target.closest("[data-v]");if(b)d.q("[name=m]").value=b.dataset.v});
 d.q("#pgOk").onclick=async()=>{const v=r2(Number(d.q("[name=m]").value));if(!(v>0)||v>s+0.001){d.q("#pgE").textContent="El pago debe ser mayor a cero y no pasar de lo que debe ("+$$(s)+").";return}
  const ok=await espera(async()=>{const {error}=await db.from("reserva_abonos").insert({reserva_id:r.id,monto:v,metodo:d.q("[name=me]").value,nota:d.q("[name=n]").value.trim()||null});if(error)throw new Error(error.message);return true});
  if(ok){d.close();toast("Pago registrado");await recargar()}}}
function waUrl(r){let t=String(r.telefono||"").replace(/\D/g,"");if(t.length===8)t="503"+t;if(t.length<8)return "";
 const e=est(r),p=prodDe(r),s=saldo(r),nom=String(r.cliente_nombre||"").trim().split(/\s+/)[0],prod=String(r.producto||"").replace(/^\d+×\s*/,"");
 const llego=p&&+p.stock>0,f=p&&p.preventa_llega?fCorta(p.preventa_llega):"";
 const m=llego?`Hola ${nom}, ¡ya llegó tu ${prod}! 🎉`+(s>0?` Tu saldo es ${$$(s)}.`:"")+" ¿Cuándo te queda bien recogerlo o que te lo enviemos?"
  :e==="falta"?`Hola ${nom}, te escribimos de DAYMARSV por tu apartado de ${prod} (preventa${f?", llega aprox. "+f:""}). El total es ${$$(r.precio_total)}. ¿Cómo prefieres hacer tu pago?`
  :s>0?`Hola ${nom}, gracias por tu pago de tu ${prod}. Te queda un saldo de ${$$(s)}${f?". Llega aprox. "+f:""}. Te avisamos cuando esté aquí.`
  :`Hola ${nom}, tu ${prod} está pagado ✅${f?" y llega aprox. "+f:""}. Te avisamos en cuanto llegue.`;
 return "https://wa.me/"+t+"?text="+encodeURIComponent(m)}
async function entregar(r){
 const s=saldo(r);if(s>0.005){await DAY.say("Primero registra el pago completo. Falta "+$$(s)+".",{titulo:"No se puede entregar"});return}
 if(!await confirmar(`¿Ya le entregaste <b>${esc(r.producto)}</b> a <b>${esc(r.cliente_nombre)}</b>?<br><br>Al entregarla se descuentan las unidades del inventario.`,{titulo:"Entregar apartado",ok:"Sí, entregada"}))return;
 const ok=await espera(async()=>{await rpc("entregar_preventa",{p_id:r.id});return true});if(ok){toast("Apartado entregado");await recargar()}}
function cancelar(r){
 const pag=+r.monto_pagado>0;
 const d=modal("Cancelar apartado",`<p style="margin:0 0 8px"><b>${esc(r.cliente_nombre)}</b> · ${esc(r.producto)}</p>${pag?`<div class="alert warn" style="margin-bottom:8px"><div><b>El cliente ya pagó ${$$(r.monto_pagado)}</b>Elige qué pasa con ese dinero.</div></div><label>Pago</label><select id="cD"><option value="1">Devolverlo al cliente (se registra como gasto)</option><option value="0">Quedármelo</option></select>`:""}<label>Motivo <small>(opcional)</small></label><input id="cM" maxlength="160">`,
  {foot:`<button class="btn g" data-x>Volver</button><button class="btn dg" id="cOk">Cancelar apartado</button>`});
 d.q("#cOk").onclick=async()=>{const ok=await espera(async()=>{await rpc("cancelar_reserva",{p_id:r.id,p_motivo:d.q("#cM").value.trim()||null,p_devolver:pag&&d.q("#cD").value==="1"});return true});if(ok){d.close();toast("Apartado cancelado");await recargar()}}}
function mas(r){
 const d=modal("Apartado #"+r.numero,`<p style="margin:0 0 10px"><b>${esc(r.cliente_nombre)}</b> · ${esc(r.producto)}${r.notas?`<br><small style="color:var(--mute)">${esc(r.notas)}</small>`:""}</p>
  <div class="pvac" style="margin-top:0"><a class="btn g" href="reservas.html">Ver en Reservas (abonos)</a>${r.cliente_id?`<a class="btn g" href="clientes.html#c=${esc(r.cliente_id)}">Ficha del cliente</a>`:""}<button class="btn g" type="button" id="mxC" style="color:var(--bad)">Cancelar apartado</button></div>`,
  {foot:`<button class="btn g" data-x>Cerrar</button>`});
 d.q("#mxC").onclick=()=>{d.close();cancelar(r)}}
$("pvL").addEventListener("click",e=>{const b=e.target.closest("[data-a]");if(!b)return;const c=b.closest("[data-r]");const r=S.R.find(x=>x.id===c.dataset.r);if(!r)return;
 const a=b.dataset.a;if(a==="pago")pagar(r);else if(a==="ent")entregar(r);else if(a==="mas")mas(r);else if(a==="wa"){const u=waUrl(r);if(u)window.open(u,"_blank","noopener");else toast("Este cliente no tiene un teléfono válido")}});
$("pvF").addEventListener("click",e=>{const b=e.target.closest("[data-f]");if(b){S.f=b.dataset.f;pintarApa()}});
$("pvQ").addEventListener("input",deb(pintarApa,150));
$("pvSeg").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(b){S.tab=b.dataset.t;pintar()}});

/* ---------- productos ---------- */
$("pvP").addEventListener("click",async e=>{const b=e.target.closest("button[data-a]");if(!b)return;const p=S.P.find(x=>x.id===b.closest("[data-p]").dataset.p);if(!p)return;
 if(b.dataset.a==="apartar")apartar(p.id);
 else if(b.dataset.a==="ver"){S.tab="apa";S.f="activos";$("pvQ").value=p.nombre;pintar()}
 else if(b.dataset.a==="terminar"){const pend=S.R.filter(r=>!r.cancelada_en&&!r.entregada_en&&(r.items||[]).some(i=>i.producto_id===p.id)).length;
  if(!await confirmar(`Se terminará la preventa de <b>${esc(p.nombre)}</b>: en la tienda se venderá normal (con sus unidades).${pend?`<br><br>Tiene <b>${pend}</b> apartado${pend===1?"":"s"} sin entregar; siguen aquí para cobrarlos y entregarlos.`:""}`,{titulo:"Terminar preventa",ok:"Terminar"}))return;
  const ok=await espera(async()=>{const {error}=await db.from("productos").update({preventa:false}).eq("id",p.id);if(error)throw new Error(error.message);return true});if(ok){toast("Preventa terminada");await recargar()}}});

/* ---------- nuevo apartado ---------- */
async function apartar(pid){
 if(!S.P.length){await DAY.say("No hay productos en preventa. Actívala primero en Compra → «Preventa».",{titulo:"Apartar"});return}
 if(!S.C.length){try{S.C=await fetchAll(()=>db.from("clientes").select("id,nombre,telefono").order("nombre"))}catch(e){S.C=[]}}
 let cli=null;
 const d=modal("Apartar producto",`<div class="fg">
  <div class="full"><label>Producto en preventa</label><select name="p">${S.P.map(p=>`<option value="${p.id}" ${p.id===pid?"selected":""}>${esc(p.nombre)} · ${$$(fin(p))}</option>`).join("")}</select><small class="h" id="apCupo"></small></div>
  <div class="full hidden" id="apVw"><label>Variante</label><select name="v"></select></div>
  <div><label>Cantidad</label><input name="q" type="number" min="1" max="99" step="1" value="1" inputmode="numeric"></div>
  <div><label>Total</label><input name="t" readonly></div>
  <div class="full pvcli"><label>Cliente</label><input name="c" placeholder="Busca por nombre o teléfono, o escribe uno nuevo" autocomplete="off"><div class="pvsug hidden" id="apSug"></div><div class="pvsel hidden" id="apSel"></div></div>
  <div class="full" id="apTelW"><label>Teléfono <small>(para WhatsApp)</small></label><input name="tel" type="tel" inputmode="tel" maxlength="20"></div>
  <div><label>Primer pago <small>(opcional)</small></label><input name="ab" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
  <div><label>Método</label><select name="me"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></div>
  <div class="full"><label>Nota <small>(opcional)</small></label><input name="n" maxlength="200" placeholder="Ej. lo pidió por WhatsApp"></div></div><div class="err2" id="apE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="apOk">Apartar</button>`});
 const g=n=>d.q(`[name=${n}]`);
 const prod=()=>S.P.find(p=>p.id===g("p").value);
 const pintaProd=()=>{const p=prod(),vs=S.V[p.id]||[],ap=S.AP[p.id]||0;
  d.q("#apVw").classList.toggle("hidden",!vs.length);g("v").innerHTML=vs.map(v=>`<option value="${v.id}">${esc(v.nombre)}</option>`).join("");
  d.q("#apCupo").textContent=(p.preventa_llega?"Llega aprox. "+fCorta(p.preventa_llega)+" · ":"")+(p.preventa_limite?"Quedan "+Math.max(0,p.preventa_limite-ap)+" de "+p.preventa_limite:"Sin límite");tot()};
 const tot=()=>{const p=prod(),q=Math.max(1,Math.trunc(Number(g("q").value)||1));g("t").value=$$(fin(p)*q)};
 g("p").onchange=pintaProd;g("q").oninput=tot;pintaProd();
 const sug=d.q("#apSug");
 const elegir=c=>{cli=c;g("c").value=c.nombre;sug.classList.add("hidden");d.q("#apSel").textContent="✓ Cliente registrado"+(c.telefono?" · "+c.telefono:"");d.q("#apSel").classList.remove("hidden");if(c.telefono)g("tel").value=c.telefono};
 g("c").addEventListener("input",()=>{cli=null;d.q("#apSel").classList.add("hidden");const q=norm(g("c").value.trim());
  if(q.length<2){sug.classList.add("hidden");return}
  const L=S.C.filter(c=>norm([c.nombre,c.telefono].join(" ")).includes(q)).slice(0,8);
  sug.innerHTML=L.map(c=>`<button type="button" data-c="${c.id}">${esc(c.nombre)} <small>${esc(c.telefono||"")}</small></button>`).join("");sug.classList.toggle("hidden",!L.length)});
 sug.addEventListener("click",e=>{const b=e.target.closest("[data-c]");if(b){const c=S.C.find(x=>x.id===b.dataset.c);if(c)elegir(c)}});
 d.q("#apOk").onclick=async()=>{const p=prod(),q=Math.trunc(Number(g("q").value)||0),ab=r2(Number(g("ab").value)||0),nom=g("c").value.trim();
  if(q<1){d.q("#apE").textContent="La cantidad debe ser 1 o más.";return}
  if(!cli&&!nom){d.q("#apE").textContent="Escribe el nombre del cliente o búscalo.";return}
  if(ab<0||ab>fin(p)*q+0.001){d.q("#apE").textContent="El primer pago no puede pasar del total.";return}
  const ok=await espera(async()=>{await rpc("crear_apartado_preventa",{p_producto:p.id,p_variante:(S.V[p.id]||[]).length?g("v").value:null,p_cantidad:q,p_cliente_id:cli?cli.id:null,p_nombre:cli?null:nom,p_telefono:g("tel").value.trim()||null,p_abono:ab,p_metodo:g("me").value,p_nota:g("n").value.trim()||null});return true},"Apartando…");
  if(ok){d.close();toast("Apartado guardado");S.C=[];S.tab="apa";S.f="activos";$("pvQ").value="";await recargar()}}}
$("pvNew").onclick=()=>apartar(null);

await recargar();
})();
