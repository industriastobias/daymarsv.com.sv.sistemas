/* DAYMARSV · Pedidos en línea (llegan desde la tienda) */
(async()=>{
"use strict";
const {esc,toast,mountSide,requireSession,$$,db}=DAY;
const {$,fdate,ftime,rpc,espera,modal,confirmar}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"pedidos",me.rol);$("app").classList.remove("hidden");
const bonito=m=>{m=String(m||"Ocurrió un error");
 let r=m.match(/Producto no registrado en el sistema: (.*) \((.*)\)/);if(r)return `${r[1]||"Un producto"} (código ${r[2]}) no está registrado en el sistema, así que no se puede crear la venta. Toca Emparejar en esa línea para elegir el producto del sistema, u Omitir esta línea, y vuelve a aceptar.`;
 r=m.match(/Stock insuficiente de (.*): quedan (\d+)/);if(r)return `No hay stock suficiente de ${r[1]}: quedan ${r[2]}. Puedes rechazar el pedido o ajustar el inventario y volver a aceptar.`;
 return m};
/* igual que espera, pero los errores salen en una ventana visible (el aviso normal queda detrás de este modal) */
const con=async(fn,txt)=>{const o=$("ov");if(o){$("ovT").textContent=txt||"Procesando…";o.classList.add("on")}
 try{return await fn()}catch(e){console.error(e);if(o)o.classList.remove("on");await DAY.say(bonito(e&&e.message),{titulo:"No se pudo completar"});return undefined}finally{if(o)o.classList.remove("on")}};
const EST={nuevo:["wa","Nuevo"],aceptado:["ok","Aceptado"],rechazado:["or","Rechazado"]};
let L=[];
async function cargar(){const d=await espera(async()=>{const {data,error}=await db.from("pedidos_linea").select("*").order("created_at",{ascending:false}).limit(200);if(error)throw new Error(error.message);return data},"Cargando pedidos…");if(d){L=d;pintar();DAY.refrescarBadges()}}
const lineas=p=>(p.items||[]).map(i=>`<div>${esc(i.cantidad)}× ${esc(i.nombre||i.codigo)} <small>(${esc(i.codigo)})</small> · ${$$(+i.precio)}</div>`).join("");
function pintar(){
 const nu=L.filter(x=>x.estado==="nuevo").length;
 $("kK").innerHTML=`<div><span>Por atender</span><b>${nu}</b></div><div><span>Aceptados</span><b>${L.filter(x=>x.estado==="aceptado").length}</b></div><div><span>Rechazados</span><b>${L.filter(x=>x.estado==="rechazado").length}</b></div>`;
 $("kL").innerHTML=L.length?L.map(p=>{const es=EST[p.estado];return `<div class="rw" data-k="${p.id}" style="cursor:pointer"><div class="ti"><b>${esc(p.cliente_nombre||"Sin nombre")} · ${$$(+p.total)}</b><small>${fdate(p.created_at)} ${ftime(p.created_at)} · ${(p.items||[]).length} producto${(p.items||[]).length===1?"":"s"} · ${esc(p.metodo)}</small></div><span class="bd ${es[0]}">${es[1]}</span></div>`}).join(""):`<div class="empty card">Aún no hay pedidos de la tienda.</div>`}
/* catálogo del sistema para saber qué líneas ya están registradas y poder emparejar las demás */
let CAT=null,VAR=[],EQ={};
async function catalogo(){if(CAT)return;
 CAT=await UI.fetchAll(()=>db.from("productos").select("id,nombre,codigo,codigo_barras,stock,foto_url").eq("activo",true).order("nombre")).catch(()=>[]);
 VAR=await UI.fetchAll(()=>db.from("producto_variantes").select("producto_id,nombre,codigo_barras,stock")).catch(()=>[]);
 const {data}=await db.from("tienda_equivalencias").select("codigo_tienda,codigo_sistema");EQ={};(data||[]).forEach(e=>EQ[e.codigo_tienda]=e.codigo_sistema)}
const buscar=i=>{const c=String(EQ[i.codigo]||i.sys||i.codigo).toLowerCase();
 const p=CAT.find(x=>String(x.codigo_barras||"").toLowerCase()===c||String(x.codigo||"").toLowerCase()===c);if(p)return {nombre:p.nombre,stock:p.stock,foto:p.foto_url};
 const v=VAR.find(x=>String(x.codigo_barras||"").toLowerCase()===c);if(v){const b=CAT.find(x=>x.id===v.producto_id);return {nombre:(b?b.nombre+" – ":"")+v.nombre,stock:v.stock,foto:b&&b.foto_url}}return null};
const lineasEst=p=>(p.items||[]).map(i=>{const x=buscar(i),falta=x&&x.stock<+i.cantidad;
 const T="https://industriastobias.github.io/klohesvtiendaonline/",foto=i.imagen||(x&&x.foto)||T+"generalimg/"+encodeURIComponent(i.codigo)+".jpg";
 return `<div class="ln" style="padding:6px 0;border-top:1px solid var(--line);display:flex;gap:10px;align-items:flex-start"><img src="${esc(foto)}" alt="" loading="lazy" style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex:none;background:var(--chip)" onerror="this.style.visibility='hidden'"><div style="flex:1"><div>${esc(i.cantidad)}× <b>${esc(i.nombre||i.codigo)}</b> <small>(${esc(i.codigo)})</small> · ${$$(+i.precio)}</div>`+
 (x?`<small style="color:${falta?"var(--bad,#b3261e)":"var(--ok,#2f7d4f)"}">${falta?"⚠ Stock insuficiente":"✓ En el sistema"}: ${esc(x.nombre)} · quedan ${x.stock}</small>`
  :`<small style="color:var(--bad,#b3261e)">✗ No registrado en el sistema</small> <button type="button" class="btn g sm" data-emp="${esc(i.codigo)}">Emparejar</button> <label class="chk" style="margin-left:6px"><input type="checkbox" data-omit="${esc(i.codigo)}"> Omitir esta línea</label>`)+`</div></div>`}).join("");
function elegirProducto(i,hecho){
 const m=modal("Emparejar con un producto del sistema",`<p class="pw" style="margin-top:0">Tienda: <b>${esc(i.nombre||i.codigo)}</b> (código ${esc(i.codigo)}). Busca el producto del sistema que es el mismo. Se recordará para los próximos pedidos y el stock se sincronizará.</p><input id="epQ" type="search" placeholder="Buscar por nombre o código" autocomplete="off"><div id="epL" style="max-height:50vh;overflow:auto;margin-top:8px"></div>`,{foot:'<button class="btn g" data-x>Cancelar</button>'});
 const pint=()=>{const q=m.q("#epQ").value.toLowerCase().trim();const F=CAT.filter(x=>!q||(x.nombre+" "+(x.codigo_barras||"")+" "+(x.codigo||"")).toLowerCase().includes(q)).slice(0,40);
  m.q("#epL").innerHTML=F.length?F.map(x=>`<div class="sv" data-pc="${esc(x.codigo_barras||x.codigo)}" style="cursor:pointer"><div class="ti"><b>${esc(x.nombre)}</b><small>${esc(x.codigo_barras||x.codigo||"")} · stock ${x.stock}</small></div></div>`).join(""):'<div class="empty">Sin resultados</div>'};
 m.q("#epQ").addEventListener("input",pint);pint();
 m.q("#epL").addEventListener("click",async e=>{const b=e.target.closest("[data-pc]");if(!b)return;const cod=b.dataset.pc;
  const ok=await con(async()=>{await rpc("guardar_equivalencia",{p_tienda:i.codigo,p_sistema:cod});return true},"Guardando…");if(ok){EQ[i.codigo]=cod;m.close();hecho()}})}
async function abrir(p){await catalogo();
 const nuevo=p.estado==="nuevo";
 const I=(n,l,v,t)=>`<div><label>${l}</label><input name="${n}" type="${t||"text"}" maxlength="${n==="direccion"||n==="nota"?300:120}" value="${esc(v||"")}"></div>`;
 const ficha=nuevo?`<div class="fg">${I("nombre","Cliente",p.cliente_nombre)}${I("telefono","Teléfono",p.cliente_telefono,"tel")}${I("correo","Correo",p.cliente_correo,"email")}${I("direccion","Dirección",p.cliente_direccion)}${I("nota","Nota",p.nota)}<div><label>Pago</label><select name="metodo"><option${p.metodo==="Efectivo"?" selected":""}>Efectivo</option><option${p.metodo==="Transferencia"?" selected":""}>Transferencia</option></select></div>${I("envio","Envío ($)",(+p.envio).toFixed(2),"number")}</div>`
  :`<div class="ti" style="line-height:1.7"><div><b>Cliente:</b> ${esc(p.cliente_nombre||"—")}</div><div><b>Teléfono:</b> ${esc(p.cliente_telefono||"—")}</div><div><b>Correo:</b> ${esc(p.cliente_correo||"—")}</div><div><b>Dirección:</b> ${esc(p.cliente_direccion||"—")}</div>${p.nota?`<div><b>Nota:</b> ${esc(p.nota)}</div>`:""}<div><b>Pago:</b> ${esc(p.metodo)}</div><div><b>Envío:</b> ${$$(+p.envio)}</div></div>`;
 const m=modal("Pedido en línea",`${ficha}<div class="ti" style="line-height:1.7;margin-top:8px"><hr style="border:0;border-top:1px solid var(--line)">${nuevo?lineasEst(p):lineas(p)}<div style="margin-top:6px"><b>Total: ${$$(+p.total)}</b>${nuevo?" <small>(se recalcula si cambias el envío)</small>":""}</div>${nuevo?`<p class="hint">Puedes completar o corregir los datos del cliente. Al aceptar se crea una venta contra entrega y se descuenta el stock. Los precios se toman del sistema.</p>`:""}</div>`,
  {foot:nuevo?'<button class="btn g" data-x>Cerrar</button><button class="btn g" id="pSv">Guardar datos</button><button class="btn g" id="pPv">Llevar al punto de venta</button><button class="btn dg" id="pRe">Rechazar</button><button class="btn" id="pOk">Aceptar</button>':'<button class="btn g" data-x>Cerrar</button><button class="btn dg" id="pDel">Eliminar del historial</button>'});
 if(!nuevo){m.q("#pDel").onclick=async()=>{if(!await confirmar("Se borrará este pedido del historial. La venta (si se aceptó) no se toca.",{titulo:"Eliminar pedido",ok:"Eliminar",peligro:true}))return;const v=await con(()=>rpc("borrar_pedidos_linea",{p_ids:[p.id]}));if(v!==undefined&&v!==null){m.close();toast("Pedido eliminado");await cargar()}};return}
 m.el.addEventListener("click",e=>{const b=e.target.closest("[data-emp]");if(!b)return;const it=(p.items||[]).find(x=>String(x.codigo)===b.dataset.emp);if(it)elegirProducto(it,()=>{m.close();abrir(p)})});
 const datos=()=>{const g=n=>m.q("[name="+n+"]").value;return {nombre:g("nombre"),telefono:g("telefono"),correo:g("correo"),direccion:g("direccion"),nota:g("nota"),metodo:g("metodo"),envio:g("envio")}};
 const guardar=()=>espera(async()=>{await rpc("editar_pedido_linea",{p_id:p.id,p_datos:datos()});return true},"Guardando…");
 m.q("#pPv").onclick=async()=>{if(!await guardar())return;
  const items=[],falta=[];(p.items||[]).forEach(i=>{if(!buscar(i)){falta.push(i.nombre||i.codigo);return}items.push({codigo:String(EQ[i.codigo]||i.sys||i.codigo),cantidad:+i.cantidad})});
  if(!items.length){await DAY.say("Ningún producto de este pedido está registrado en el sistema. Usa Emparejar en cada línea primero.",{titulo:"No se puede llevar al punto de venta"});return}
  if(falta.length&&!await confirmar("Estos productos no están en el sistema y no irán al punto de venta: "+falta.join(", ")+". ¿Continuar con el resto?",{titulo:"Productos no registrados",ok:"Continuar"}))return;
  try{sessionStorage.setItem("dms_pedido_pv",JSON.stringify({id:p.id,cliente:{nombre:p.cliente_nombre,correo:p.cliente_correo,telefono:p.cliente_telefono,direccion:p.cliente_direccion},envio:+p.envio,metodo:p.metodo,items}))}catch(e){}
  location.href="almacenamiento.html"};
 m.q("#pSv").onclick=async()=>{if(await guardar()){m.close();toast("Datos guardados");await cargar()}};
 m.q("#pOk").onclick=async()=>{if(!await guardar())return;const v=await con(()=>rpc("aceptar_pedido_linea",{p_id:p.id,p_omitir:[...m.el.querySelectorAll("[data-omit]:checked")].map(x=>x.dataset.omit)}),"Creando la venta…");if(v){m.close();toast("Pedido aceptado: venta creada en Pendientes");await cargar()}};
 m.q("#pRe").onclick=async()=>{if(!await confirmar("Se rechazará este pedido. El inventario no cambia.",{titulo:"Rechazar pedido",ok:"Rechazar",peligro:true}))return;const v=await con(async()=>{await rpc("rechazar_pedido_linea",{p_id:p.id});return true});if(v){m.close();toast("Pedido rechazado");await cargar()}}}
$("kL").addEventListener("click",ev=>{const r=ev.target.closest("[data-k]");if(!r)return;const p=L.find(z=>z.id===r.dataset.k);if(p)abrir(p)});
const ha=document.querySelector(".hact");if(ha){ha.innerHTML='<button class="btn g" id="pLimp" type="button">Limpiar historial</button>';
 $("pLimp").onclick=()=>{const m=modal("Limpiar historial de pedidos",`<p class="pw" style="margin-top:0">Borra los pedidos <b>ya atendidos</b> (aceptados o rechazados) para ahorrar espacio. Los pedidos nuevos no se tocan y las ventas que se crearon al aceptar tampoco.</p><div class="ctl" style="flex-direction:column;align-items:stretch;gap:8px"><button class="btn g" data-d="30" type="button">Borrar los atendidos de hace más de 30 días</button><button class="btn g" data-d="7" type="button">Borrar los atendidos de hace más de 7 días</button><button class="btn g" data-d="all" type="button" style="color:var(--bad)">Borrar todo el historial atendido</button></div>`,{foot:'<button class="btn g" data-x>Cancelar</button>'});
  m.el.addEventListener("click",async e=>{const b=e.target.closest("[data-d]");if(!b)return;const dias=b.dataset.d==="all"?null:+b.dataset.d;m.close();
   if(!await confirmar(dias===null?"Se borrarán <b>todos</b> los pedidos atendidos.":"Se borrarán los pedidos atendidos de hace más de <b>"+dias+" días</b>.",{titulo:"Limpiar historial",ok:"Borrar",peligro:true}))return;
   const n=await con(()=>rpc("borrar_pedidos_linea",{p_dias:dias}),"Limpiando…");if(n!==undefined&&n!==null){toast(n+" pedido"+(n===1?"":"s")+" borrado"+(n===1?"":"s"));await cargar()}})}}
await cargar();
})();
