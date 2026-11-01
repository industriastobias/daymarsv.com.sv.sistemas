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
 const m=modal("Pedido en línea",`<div class="ti" style="line-height:1.7"><div><b>Cliente:</b> ${esc(p.cliente_nombre||"—")}</div><div><b>Teléfono:</b> ${esc(p.cliente_telefono||"—")}</div><div><b>Correo:</b> ${esc(p.cliente_correo||"—")}</div><div><b>Dirección:</b> ${esc(p.cliente_direccion||"—")}</div>${p.nota?`<div><b>Nota:</b> ${esc(p.nota)}</div>`:""}<div><b>Pago:</b> ${esc(p.metodo)}</div><hr style="border:0;border-top:1px solid var(--line)">${lineas(p)}<div style="margin-top:6px">Envío: ${$$(+p.envio)} · <b>Total: ${$$(+p.total)}</b></div>${nuevo?`<p class="hint">Al aceptar se crea una venta contra entrega y se descuenta el stock. Los precios se toman del sistema.</p>`:""}</div>`,
  {foot:nuevo?'<button class="btn g" data-x>Cerrar</button><button class="btn dg" id="pRe">Rechazar</button><button class="btn" id="pOk">Aceptar</button>':'<button class="btn g" data-x>Cerrar</button>'});
 if(!nuevo)return;
 m.q("#pOk").onclick=async()=>{const v=await espera(()=>rpc("aceptar_pedido_linea",{p_id:p.id}),"Creando la venta…");if(v){m.close();toast("Pedido aceptado: venta creada en Pendientes");await cargar()}};
 m.q("#pRe").onclick=async()=>{if(!await confirmar("Se rechazará este pedido. El inventario no cambia.",{titulo:"Rechazar pedido",ok:"Rechazar",peligro:true}))return;const v=await espera(async()=>{await rpc("rechazar_pedido_linea",{p_id:p.id});return true});if(v){m.close();toast("Pedido rechazado");await cargar()}}});
await cargar();
})();
