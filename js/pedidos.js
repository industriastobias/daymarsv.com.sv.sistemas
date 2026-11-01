/* DAYMARSV · Pedidos en línea (llegan desde la tienda) */
(async()=>{
"use strict";
const {esc,toast,mountSide,requireSession,$$,db}=DAY;
const {$,fdate,ftime,rpc,espera,modal,confirmar}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"pedidos",me.rol);$("app").classList.remove("hidden");
const EST={nuevo:["wa","Nuevo"],aceptado:["ok","Aceptado"],rechazado:["or","Rechazado"]};
let L=[];
async function cargar(){const d=await espera(async()=>{const {data,error}=await db.from("pedidos_linea").select("*").order("created_at",{ascending:false}).limit(200);if(error)throw new Error(error.message);return data},"Cargando pedidos…");if(d){L=d;pintar();DAY.refrescarBadges()}}
const lineas=p=>(p.items||[]).map(i=>`<div>${esc(i.cantidad)}× ${esc(i.nombre||i.codigo)} <small>(${esc(i.codigo)})</small> · ${$$(+i.precio)}</div>`).join("");
function pintar(){
 const nu=L.filter(x=>x.estado==="nuevo").length;
 $("kK").innerHTML=`<div><span>Por atender</span><b>${nu}</b></div><div><span>Aceptados</span><b>${L.filter(x=>x.estado==="aceptado").length}</b></div><div><span>Rechazados</span><b>${L.filter(x=>x.estado==="rechazado").length}</b></div>`;
 $("kL").innerHTML=L.length?L.map(p=>{const es=EST[p.estado];return `<div class="rw" data-k="${p.id}" style="cursor:pointer"><div class="ti"><b>${esc(p.cliente_nombre||"Sin nombre")} · ${$$(+p.total)}</b><small>${fdate(p.created_at)} ${ftime(p.created_at)} · ${(p.items||[]).length} producto${(p.items||[]).length===1?"":"s"} · ${esc(p.metodo)}</small></div><span class="bd ${es[0]}">${es[1]}</span></div>`}).join(""):`<div class="empty card">Aún no hay pedidos de la tienda.</div>`}
$("kL").addEventListener("click",ev=>{const r=ev.target.closest("[data-k]");if(!r)return;const p=L.find(z=>z.id===r.dataset.k);if(!p)return;
 const nuevo=p.estado==="nuevo";
 const I=(n,l,v,t)=>`<div><label>${l}</label><input name="${n}" type="${t||"text"}" maxlength="${n==="direccion"||n==="nota"?300:120}" value="${esc(v||"")}"></div>`;
 const ficha=nuevo?`<div class="fg">${I("nombre","Cliente",p.cliente_nombre)}${I("telefono","Teléfono",p.cliente_telefono,"tel")}${I("correo","Correo",p.cliente_correo,"email")}${I("direccion","Dirección",p.cliente_direccion)}${I("nota","Nota",p.nota)}<div><label>Pago</label><select name="metodo"><option${p.metodo==="Efectivo"?" selected":""}>Efectivo</option><option${p.metodo==="Transferencia"?" selected":""}>Transferencia</option></select></div>${I("envio","Envío ($)",(+p.envio).toFixed(2),"number")}</div>`
  :`<div class="ti" style="line-height:1.7"><div><b>Cliente:</b> ${esc(p.cliente_nombre||"—")}</div><div><b>Teléfono:</b> ${esc(p.cliente_telefono||"—")}</div><div><b>Correo:</b> ${esc(p.cliente_correo||"—")}</div><div><b>Dirección:</b> ${esc(p.cliente_direccion||"—")}</div>${p.nota?`<div><b>Nota:</b> ${esc(p.nota)}</div>`:""}<div><b>Pago:</b> ${esc(p.metodo)}</div><div><b>Envío:</b> ${$$(+p.envio)}</div></div>`;
 const m=modal("Pedido en línea",`${ficha}<div class="ti" style="line-height:1.7;margin-top:8px"><hr style="border:0;border-top:1px solid var(--line)">${lineas(p)}<div style="margin-top:6px"><b>Total: ${$$(+p.total)}</b>${nuevo?" <small>(se recalcula si cambias el envío)</small>":""}</div>${nuevo?`<p class="hint">Puedes completar o corregir los datos del cliente. Al aceptar se crea una venta contra entrega y se descuenta el stock. Los precios se toman del sistema.</p>`:""}</div>`,
  {foot:nuevo?'<button class="btn g" data-x>Cerrar</button><button class="btn g" id="pSv">Guardar datos</button><button class="btn dg" id="pRe">Rechazar</button><button class="btn" id="pOk">Aceptar</button>':'<button class="btn g" data-x>Cerrar</button><button class="btn dg" id="pDel">Eliminar del historial</button>'});
 if(!nuevo){m.q("#pDel").onclick=async()=>{if(!await confirmar("Se borrará este pedido del historial. La venta (si se aceptó) no se toca.",{titulo:"Eliminar pedido",ok:"Eliminar",peligro:true}))return;const v=await espera(()=>rpc("borrar_pedidos_linea",{p_ids:[p.id]}));if(v!==undefined&&v!==null){m.close();toast("Pedido eliminado");await cargar()}};return}
 const datos=()=>{const g=n=>m.q("[name="+n+"]").value;return {nombre:g("nombre"),telefono:g("telefono"),correo:g("correo"),direccion:g("direccion"),nota:g("nota"),metodo:g("metodo"),envio:g("envio")}};
 const guardar=()=>espera(async()=>{await rpc("editar_pedido_linea",{p_id:p.id,p_datos:datos()});return true},"Guardando…");
 m.q("#pSv").onclick=async()=>{if(await guardar()){m.close();toast("Datos guardados");await cargar()}};
 m.q("#pOk").onclick=async()=>{if(!await guardar())return;const v=await espera(()=>rpc("aceptar_pedido_linea",{p_id:p.id}),"Creando la venta…");if(v){m.close();toast("Pedido aceptado: venta creada en Pendientes");await cargar()}};
 m.q("#pRe").onclick=async()=>{if(!await confirmar("Se rechazará este pedido. El inventario no cambia.",{titulo:"Rechazar pedido",ok:"Rechazar",peligro:true}))return;const v=await espera(async()=>{await rpc("rechazar_pedido_linea",{p_id:p.id});return true});if(v){m.close();toast("Pedido rechazado");await cargar()}}});
const ha=document.querySelector(".hact");if(ha){ha.innerHTML='<button class="btn g" id="pLimp" type="button">Limpiar historial</button>';
 $("pLimp").onclick=()=>{const m=modal("Limpiar historial de pedidos",`<p class="pw" style="margin-top:0">Borra los pedidos <b>ya atendidos</b> (aceptados o rechazados) para ahorrar espacio. Los pedidos nuevos no se tocan y las ventas que se crearon al aceptar tampoco.</p><div class="ctl" style="flex-direction:column;align-items:stretch;gap:8px"><button class="btn g" data-d="30" type="button">Borrar los atendidos de hace más de 30 días</button><button class="btn g" data-d="7" type="button">Borrar los atendidos de hace más de 7 días</button><button class="btn g" data-d="all" type="button" style="color:var(--bad)">Borrar todo el historial atendido</button></div>`,{foot:'<button class="btn g" data-x>Cancelar</button>'});
  m.el.addEventListener("click",async e=>{const b=e.target.closest("[data-d]");if(!b)return;const dias=b.dataset.d==="all"?null:+b.dataset.d;m.close();
   if(!await confirmar(dias===null?"Se borrarán <b>todos</b> los pedidos atendidos.":"Se borrarán los pedidos atendidos de hace más de <b>"+dias+" días</b>.",{titulo:"Limpiar historial",ok:"Borrar",peligro:true}))return;
   const n=await espera(()=>rpc("borrar_pedidos_linea",{p_dias:dias}),"Limpiando…");if(n!==undefined&&n!==null){toast(n+" pedido"+(n===1?"":"s")+" borrado"+(n===1?"":"s"));await cargar()}})}}
await cargar();
})();
