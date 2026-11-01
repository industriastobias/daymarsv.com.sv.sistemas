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
const lineas=p=>`<div class="pl-items">`+(p.items||[]).map(i=>`<div class="pl-it">${imgH(fotoT(i))}<div class="pl-b"><div class="pl-n">${esc(i.nombre||i.codigo)}</div><div class="pl-m1"><span class="pl-c">Cant. ${esc(i.cantidad)}</span><span class="pl-c">${$$(+i.precio)}</span><span class="pl-c">Cód. ${esc(i.codigo)}</span></div></div></div>`).join("")+`</div>`;
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
const TIENDA="https://industriastobias.github.io/klohesvtiendaonline/";
const fotoT=i=>i.imagen||TIENDA+"generalimg/"+encodeURIComponent(i.codigo)+".jpg";
const imgH=(src,cls)=>src?`<img ${cls?`class="${cls}" `:""}src="${esc(src)}" alt="" loading="lazy" onerror="this.style.opacity='0'">`:`<div class="pl-ph"></div>`;
const lineasEst=p=>`<div class="pl-items">`+(p.items||[]).map(i=>{const x=buscar(i),falta=x&&x.stock<+i.cantidad,foto=i.imagen||(x&&x.foto)||fotoT(i);
 const est=x?(falta?`<span class="pl-st warn">⚠ Stock insuficiente</span>`:`<span class="pl-st ok">✓ En el sistema</span>`):`<span class="pl-st bad">✗ No registrado</span>`;
 return `<div class="pl-it${x?"":" bad"}">${imgH(foto)}<div class="pl-b"><div class="pl-n">${esc(i.nombre||i.codigo)}</div>
  <div class="pl-m1"><span class="pl-c">Cant. ${esc(i.cantidad)}</span><span class="pl-c">${$$(+i.precio)}</span><span class="pl-c">Cód. ${esc(i.codigo)}</span></div>
  ${est}${x?`<span class="pl-sn">${esc(x.nombre)} · quedan ${x.stock}</span>`:`<div class="pl-acts"><button type="button" class="btn g sm" data-emp="${esc(i.codigo)}">Emparejar con el sistema</button><label class="chk"><input type="checkbox" data-omit="${esc(i.codigo)}"> Omitir esta línea</label></div>`}</div></div>`}).join("")+`</div>`;
function elegirProducto(i,hecho){
 const m=modal("Emparejar con un producto del sistema",`<div class="pl-cmp">${imgH(fotoT(i))}<div><b>${esc(i.nombre||i.codigo)}</b><small>En la tienda · código ${esc(i.codigo)} · ${$$(+i.precio)}</small><small>Busca abajo el mismo producto en el sistema y compara las fotos. Quedará guardado para los próximos pedidos.</small></div></div>
  <div class="pl-q"><input id="epQ" type="search" placeholder="Buscar por nombre o código" autocomplete="off"></div><div class="pl-res" id="epL"></div>`,{foot:'<button class="btn g" data-x>Cancelar</button>'});
 m.el.classList.add("pl-m");
 const pint=()=>{const q=m.q("#epQ").value.toLowerCase().trim();const F=CAT.filter(x=>!q||(x.nombre+" "+(x.codigo_barras||"")+" "+(x.codigo||"")).toLowerCase().includes(q)).slice(0,40);
  m.q("#epL").innerHTML=F.length?F.map(x=>`<button type="button" class="pl-pc" data-pc="${esc(x.codigo_barras||x.codigo)}">${imgH(x.foto_url)}<span><b>${esc(x.nombre)}</b><small>${esc(x.codigo_barras||x.codigo||"")} · stock ${x.stock}</small></span></button>`).join(""):'<div class="pl-vacio">Sin resultados</div>'};
 m.q("#epQ").addEventListener("input",pint);pint();
 m.q("#epL").addEventListener("click",async e=>{const b=e.target.closest("[data-pc]");if(!b)return;const cod=b.dataset.pc;
  const ok=await con(async()=>{await rpc("guardar_equivalencia",{p_tienda:i.codigo,p_sistema:cod});return true},"Guardando…");if(ok){EQ[i.codigo]=cod;m.close();hecho()}})}
async function abrir(p){await catalogo();
 const nuevo=p.estado==="nuevo";
 const I=(n,l,v,t,full)=>`<div${full?' class="full"':""}><label>${l}</label><input name="${n}" type="${t||"text"}" maxlength="${n==="direccion"||n==="nota"?300:120}" value="${esc(v||"")}"></div>`;
 const ficha=nuevo?`<div class="pl-g">${I("nombre","Cliente",p.cliente_nombre)}${I("telefono","Teléfono",p.cliente_telefono,"tel")}${I("correo","Correo",p.cliente_correo,"email")}<div><label>Pago</label><select name="metodo"><option${p.metodo==="Efectivo"?" selected":""}>Efectivo</option><option${p.metodo==="Transferencia"?" selected":""}>Transferencia</option></select></div>${I("direccion","Dirección",p.cliente_direccion,"text",1)}${I("nota","Nota",p.nota,"text")}${I("envio","Envío ($)",(+p.envio).toFixed(2),"number")}</div>`
  :`<div class="pl-g"><div><label>Teléfono</label><b>${esc(p.cliente_telefono||"—")}</b></div><div><label>Correo</label><b>${esc(p.cliente_correo||"—")}</b></div><div class="full"><label>Dirección</label><b>${esc(p.cliente_direccion||"—")}</b></div>${p.nota?`<div class="full"><label>Nota</label><b>${esc(p.nota)}</b></div>`:""}<div><label>Pago</label><b>${esc(p.metodo)}</b></div><div><label>Envío</label><b>${$$(+p.envio)}</b></div></div>`;
 const ini=String(p.cliente_nombre||"?").trim().charAt(0).toUpperCase()||"?",sub=(p.items||[]).reduce((t,i)=>t+(+i.precio)*(+i.cantidad),0),nP=(p.items||[]).length,es=EST[p.estado];
 const m=modal("Pedido en línea",`<div class="pl-top"><div class="pl-av">${esc(ini)}</div><div class="pl-who"><b>${esc(p.cliente_nombre||"Sin nombre")}</b><small>${fdate(p.created_at)} ${ftime(p.created_at)} · ${nP} producto${nP===1?"":"s"}</small></div><div class="pl-tt"><b id="plTop">${$$(+p.total)}</b><span class="bd ${es[0]}">${es[1]}</span></div></div>
  <div class="pl-sec">Datos del cliente</div>${ficha}
  <div class="pl-sec">Productos</div>${nuevo?lineasEst(p):lineas(p)}
  <div class="pl-tot"><div><span>Productos</span><span>${$$(sub)}</span></div><div><span>Envío</span><span id="plEnv">${$$(+p.envio)}</span></div><div class="t"><span>Total</span><span id="plTot">${$$(+p.total)}</span></div></div>
  ${nuevo?`<p class="pl-hint">Puedes completar o corregir los datos antes de aceptar. Al aceptar se crea una venta contra entrega y baja el stock; los precios se toman del sistema. Si cambias el envío, el total se recalcula al guardar.</p>`:""}`,
  {foot:nuevo?'<button class="btn g" data-x>Cerrar</button><button class="btn g" id="pSv">Guardar datos</button><button class="btn g" id="pPv">Llevar al punto de venta</button><button class="btn dg" id="pRe">Rechazar</button><button class="btn" id="pOk">Aceptar</button>':'<button class="btn g" data-x>Cerrar</button><button class="btn dg" id="pDel">Eliminar del historial</button>'});
 m.el.classList.add("pl-m");
 if(nuevo){const ei=m.q("[name=envio]"),rec=()=>{const e=Math.min(50,Math.max(0,parseFloat(ei.value)||0)),t=Math.round((sub+e)*100)/100;m.q("#plEnv").textContent=$$(e);m.q("#plTot").textContent=$$(t);m.q("#plTop").textContent=$$(t)};ei.addEventListener("input",rec);rec()}
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
 m.q("#pOk").onclick=async()=>{if(!await guardar())return;
  const marcadas=[...m.el.querySelectorAll("[data-omit]:checked")].map(x=>x.dataset.omit);
  const sinReg=(p.items||[]).filter(i=>!buscar(i)&&!marcadas.includes(String(i.codigo)));
  const reg=(p.items||[]).filter(i=>buscar(i));
  if(sinReg.length&&!reg.length){await DAY.say("Ningún producto de este pedido está registrado en el sistema. Usa Emparejar en cada línea, o rechaza el pedido y atiéndelo por WhatsApp.",{titulo:"No se puede aceptar"});return}
  if(sinReg.length&&!await confirmar("Se aceptará el pedido solo con los productos registrados ("+reg.length+"). Estos NO se incluirán en la venta: "+sinReg.map(i=>i.nombre||i.codigo).join(", ")+".",{titulo:"Aceptar parcialmente",ok:"Aceptar los registrados"}))return;
  const omit=[...new Set([...marcadas,...sinReg.map(i=>String(i.codigo))])];
  const v=await con(()=>rpc("aceptar_pedido_linea",{p_id:p.id,p_omitir:omit}),"Creando la venta…");if(v){m.close();toast("Pedido aceptado: venta creada en Pendientes");await cargar()}};
 m.q("#pRe").onclick=async()=>{if(!await confirmar("Se rechazará este pedido. El inventario no cambia.",{titulo:"Rechazar pedido",ok:"Rechazar",peligro:true}))return;const v=await con(async()=>{await rpc("rechazar_pedido_linea",{p_id:p.id});return true});if(v){m.close();toast("Pedido rechazado");await cargar()}}}
$("kL").addEventListener("click",ev=>{const r=ev.target.closest("[data-k]");if(!r)return;const p=L.find(z=>z.id===r.dataset.k);if(p)abrir(p)});
const ha=document.querySelector(".hact");if(ha){ha.innerHTML='<button class="btn g" id="pLimp" type="button">Limpiar historial</button>';
 $("pLimp").onclick=()=>{const m=modal("Limpiar historial de pedidos",`<p class="pw" style="margin-top:0">Borra los pedidos <b>ya atendidos</b> (aceptados o rechazados) para ahorrar espacio. Los pedidos nuevos no se tocan y las ventas que se crearon al aceptar tampoco.</p><div class="ctl" style="flex-direction:column;align-items:stretch;gap:8px"><button class="btn g" data-d="30" type="button">Borrar los atendidos de hace más de 30 días</button><button class="btn g" data-d="7" type="button">Borrar los atendidos de hace más de 7 días</button><button class="btn g" data-d="all" type="button" style="color:var(--bad)">Borrar todo el historial atendido</button></div>`,{foot:'<button class="btn g" data-x>Cancelar</button>'});
  m.el.addEventListener("click",async e=>{const b=e.target.closest("[data-d]");if(!b)return;const dias=b.dataset.d==="all"?null:+b.dataset.d;m.close();
   if(!await confirmar(dias===null?"Se borrarán <b>todos</b> los pedidos atendidos.":"Se borrarán los pedidos atendidos de hace más de <b>"+dias+" días</b>.",{titulo:"Limpiar historial",ok:"Borrar",peligro:true}))return;
   const n=await con(()=>rpc("borrar_pedidos_linea",{p_dias:dias}),"Limpiando…");if(n!==undefined&&n!==null){toast(n+" pedido"+(n===1?"":"s")+" borrado"+(n===1?"":"s"));await cargar()}})}}
await cargar();
})();
