/* DAYMAR-SHOP · Descuentos (conectado a Supabase) */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,norm,fdate,money,ic,deb,rpc,fetchAll,espera,modal,confirmar,pestanas}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"descuentos",me.rol);$("app").classList.remove("hidden");
const IC={box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',tag:'<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',gift:'<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9M8 8a2.5 2.5 0 110-5c2 0 4 2 4 5 0-3 2-5 4-5a2.5 2.5 0 110 5"/>'};
const S={prods:[],cats:[],promos:[],prog:[],sel:new Set(),sub:"cod"};
const fin=p=>r2(p.precio_venta*(1-(+p.descuento_pct||0)/100));
async function cargar(){
 const [P,C,PR,PG]=await Promise.all([
  fetchAll(()=>db.from("productos").select("id,codigo,nombre,precio_venta,descuento_pct,stock,categoria_id,foto_url,categorias(nombre)").eq("activo",true).order("nombre")),
  db.from("categorias").select("id,nombre").order("nombre"),
  db.from("promo_codigos").select("*").order("created_at",{ascending:false}),
  db.from("descuentos_programados").select("*,categorias(nombre)").order("desde",{ascending:false})]);
 S.prods=P.map(p=>({...p,cat:p.categorias?p.categorias.nombre:"Sin categoría"}));S.cats=C.data||[];S.promos=PR.data||[];S.prog=PG.data||[];
 [...S.sel].forEach(id=>{if(!S.prods.some(p=>p.id===id))S.sel.delete(id)})}
const pctOk=v=>{const n=Number(v);return isFinite(n)&&n>=0&&n<=100&&String(v).trim()!==""};

/* ---------- Productos ---------- */
function filtrados(){const q=norm($("pQ").value),c=$("pCat").value,e=$("pEst").value;
 return S.prods.filter(p=>(!q||norm(p.nombre+" "+(p.codigo||"")).includes(q))&&(!c||p.categoria_id===c)&&(e==="all"||(e==="con"?+p.descuento_pct>0:!(+p.descuento_pct>0))))}
function pintarProd(){
 const L=filtrados(),con=S.prods.filter(p=>+p.descuento_pct>0),val=S.prods.reduce((s,p)=>s+p.precio_venta*p.stock,0),proy=S.prods.reduce((s,p)=>s+fin(p)*p.stock,0);
 $("pKpi").innerHTML=`<div><span>Productos</span><b>${S.prods.length}</b></div><div><span>Con descuento</span><b>${con.length}</b></div><div><span>Valor a precio regular</span><b>${$$(val)}</b></div><div><span>Valor con descuentos</span><b>${$$(proy)}</b></div><div><span>Descuento total</span><b>${$$(val-proy)}</b></div>`;
 $("pInfo").innerHTML=`<b>${L.length}</b> productos · <b>${S.sel.size}</b> seleccionados`;
 $("pAll").checked=L.length>0&&L.every(p=>S.sel.has(p.id));
 $("pList").innerHTML=L.length?L.slice(0,400).map(p=>`<div class="rw" data-id="${p.id}"><input type="checkbox" class="ck" data-ck="${p.id}" ${S.sel.has(p.id)?"checked":""} aria-label="Seleccionar ${esc(p.nombre)}">
  ${p.foto_url?`<img class="th" src="${esc(p.foto_url)}" alt="" loading="lazy">`:`<div class="th ph">${esc((p.nombre[0]||"?").toUpperCase())}</div>`}
  <div class="ti"><b>${esc(p.nombre)}</b><small>${esc(p.codigo||"")} · ${esc(p.cat)} · Stock ${p.stock}</small></div>
  <div class="am2">${+p.descuento_pct>0?`<s>${$$(p.precio_venta)}</s> <b>${$$(fin(p))}</b><span class="bd or">-${+p.descuento_pct}%</span>`:`<b>${$$(p.precio_venta)}</b>`}</div>
  <button class="btn g sm" data-ed="${p.id}">Cambiar %</button></div>`).join(""):`<div class="empty card">No hay productos con estos filtros.</div>`}
async function aplicarIds(ids,pct){
 if(!ids.length)return;
 const ok=await espera(async()=>{for(let i=0;i<ids.length;i+=100){const {error}=await db.from("productos").update({descuento_pct:pct}).in("id",ids.slice(i,i+100));if(error)throw new Error(error.message)}return true},"Aplicando descuento…");
 if(ok){toast(pct>0?`Descuento del ${pct}% aplicado a ${ids.length} producto(s)`:`Descuento quitado de ${ids.length} producto(s)`);await cargar();pintarTodo()}}
function pedirPct(titulo,texto,def){return new Promise(ok=>{let r=null;
 const m=modal(esc(titulo),`<p class="pw" style="margin-top:0">${texto}</p><label>Descuento (%)</label><input id="pcI" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${def||""}" placeholder="0 – 100"><div class="err2" id="pcE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="pcOk">Aplicar</button>`,onclose:()=>ok(r)});
 const go=()=>{const v=m.q("#pcI").value;if(!pctOk(v)){m.q("#pcE").textContent="Escribe un número entre 0 y 100.";return}r=Number(v);m.close()};
 m.q("#pcOk").onclick=go;m.q("#pcI").addEventListener("keydown",e=>{if(e.key==="Enter")go()});setTimeout(()=>m.q("#pcI").focus(),50)})}
$("pList").addEventListener("click",async e=>{
 const ck=e.target.closest("[data-ck]");if(ck){ck.checked?S.sel.add(ck.dataset.ck):S.sel.delete(ck.dataset.ck);pintarProd();return}
 const ed=e.target.closest("[data-ed]");if(ed){const p=S.prods.find(x=>x.id===ed.dataset.ed);const v=await pedirPct("Descuento de "+esc(p.nombre),"Precio regular: <b>"+$$(p.precio_venta)+"</b>. Pon 0 para quitar el descuento.",+p.descuento_pct||"");if(v!==null)aplicarIds([p.id],v)}});
["pQ"].forEach(i=>$(i).addEventListener("input",deb(pintarProd,150)));["pCat","pEst"].forEach(i=>$(i).onchange=pintarProd);
$("pAll").onchange=()=>{const L=filtrados();if($("pAll").checked)L.forEach(p=>S.sel.add(p.id));else L.forEach(p=>S.sel.delete(p.id));pintarProd()};
$("pApply").onclick=async()=>{if(!S.sel.size){toast("Selecciona productos primero");return}const v=await pedirPct("Aplicar descuento",`Se aplicará a <b>${S.sel.size}</b> producto(s) seleccionados.`);if(v!==null)aplicarIds([...S.sel],v)};
$("pClear").onclick=async()=>{if(!S.sel.size){toast("Selecciona productos primero");return}if(await confirmar(`Se quitará el descuento de <b>${S.sel.size}</b> producto(s).`,{titulo:"Quitar descuento",ok:"Quitar",peligro:true}))aplicarIds([...S.sel],0)};

/* ---------- Categorías ---------- */
function pintarCat(){
 const fila=(id,nombre,L)=>{const ps=[...new Set(L.map(p=>+p.descuento_pct||0))];const act=ps.length===1?ps[0]:null;
  return `<div class="rw"><div class="th ph">${ic(IC.tag)}</div><div class="ti"><b>${esc(nombre)}</b><small>${L.length} producto(s)</small></div>
  <div class="am2">${act===null?'<span class="bd">Varios</span>':act>0?`<span class="bd or">-${act}%</span>`:'<span class="bd">Sin descuento</span>'}</div>
  <button class="btn sm" data-ca="${id}">Aplicar %</button><button class="btn g sm" data-cq="${id}" ${act===0?"disabled":""}>Quitar</button></div>`};
 $("cList").innerHTML=fila("all","Todas las categorías",S.prods)+S.cats.map(c=>fila(c.id,c.nombre,S.prods.filter(p=>p.categoria_id===c.id))).join("")
  +(S.prods.some(p=>!p.categoria_id)?fila("none","Sin categoría",S.prods.filter(p=>!p.categoria_id)):"")}
async function aplicarCat(id,pct){
 const ids=S.prods.filter(p=>id==="all"||(id==="none"?!p.categoria_id:p.categoria_id===id)).map(p=>p.id);
 if(!ids.length){toast("No hay productos en esa categoría");return}
 if(id==="all"||id==="none")return aplicarIds(ids,pct);
 const ok=await espera(()=>rpc("aplicar_descuento",{p_categoria:id,p_pct:pct}),"Aplicando descuento…");
 if(ok!==undefined){toast(pct>0?`Descuento del ${pct}% aplicado`:"Descuento quitado");await cargar();pintarTodo()}}
$("cList").addEventListener("click",async e=>{
 const a=e.target.closest("[data-ca]"),q=e.target.closest("[data-cq]");
 if(a){const v=await pedirPct("Descuento por categoría","Se aplicará a <b>todos los productos</b> de la categoría y reemplaza el descuento que tengan.");if(v!==null)aplicarCat(a.dataset.ca,v)}
 else if(q&&!q.disabled&&await confirmar("Se quitará el descuento de todos los productos de esta categoría.",{titulo:"Quitar descuento",ok:"Quitar",peligro:true}))aplicarCat(q.dataset.cq,0)});
$("cMay").onclick=async()=>{if(await confirmar("Se aplicará <b>30%</b> de descuento a <b>todos</b> los productos (precio mayorista). Puedes quitarlo cuando quieras.",{titulo:"Precio mayorista",ok:"Aplicar 30%"}))aplicarIds(S.prods.map(p=>p.id),30)};
$("cNone").onclick=async()=>{if(await confirmar("Se quitará el descuento de <b>todos</b> los productos.",{titulo:"Quitar todos",ok:"Quitar todos",peligro:true}))aplicarIds(S.prods.map(p=>p.id),0)};

/* ---------- Promociones ---------- */
function pintarPromo(){
 $("sgPromo").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.s===S.sub));
 $("promoCod").classList.toggle("hidden",S.sub!=="cod");$("promoProg").classList.toggle("hidden",S.sub!=="prog");
 $("prList").innerHTML=S.promos.length?S.promos.map(p=>`<div class="rw"><div class="th ph">${ic(IC.gift)}</div><div class="ti"><b class="mono">${esc(p.codigo)}</b><small>Creado ${fdate(p.created_at)}</small></div>
  <div class="am2"><span class="bd ${p.activo?"ok":""}">${p.activo?"Activo":"Pausado"}</span> <span class="bd or">-${+p.pct}%</span></div>
  <button class="btn g sm" data-pt="${p.id}">${p.activo?"Pausar":"Activar"}</button><button class="btn g sm" data-pd="${p.id}" style="color:var(--bad)">Eliminar</button></div>`).join("")
  :`<div class="empty card">Todavía no hay códigos. Los códigos se escriben al emitir una factura para aplicar el descuento.</div>`;
 $("pgCat").innerHTML='<option value="">Todas las categorías</option>'+S.cats.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join("");
 const E={pendiente:["Programado","bl2"],activo:["Activo ahora","ok"],finalizado:["Finalizado",""]};
 $("pgList").innerHTML=S.prog.length?S.prog.map(g=>`<div class="rw"><div class="th ph">${ic(IC.tag)}</div><div class="ti"><b>${g.categorias?esc(g.categorias.nombre):"Todas las categorías"}</b><small>${fdate(g.desde)} → ${fdate(g.hasta)}</small></div>
  <div class="am2"><span class="bd ${E[g.estado][1]}">${E[g.estado][0]}</span> <span class="bd or">-${+g.pct}%</span></div><button class="btn g sm" data-gd="${g.id}" style="color:var(--bad)">Eliminar</button></div>`).join("")
  :`<div class="empty card">No hay descuentos programados.</div>`}
$("sgPromo").addEventListener("click",e=>{const b=e.target.closest("[data-s]");if(b){S.sub=b.dataset.s;pintarPromo()}});
$("prAdd").onclick=async()=>{const c=$("prCod").value.trim().toUpperCase(),p=$("prPct").value;
 if(!/^[A-Z0-9_-]{3,20}$/.test(c)){toast("El código debe tener 3 a 20 letras o números");return}if(!pctOk(p)||Number(p)<=0){toast("El descuento debe estar entre 1 y 100");return}
 const ok=await espera(async()=>{const {error}=await db.from("promo_codigos").insert({codigo:c,pct:Number(p)});if(error)throw new Error(/duplicate|unique/i.test(error.message)?"Ese código ya existe":error.message);return true});
 if(ok){$("prCod").value="";$("prPct").value="";toast("Código "+c+" creado");await cargar();pintarPromo()}};
$("prList").addEventListener("click",async e=>{
 const t=e.target.closest("[data-pt]"),d=e.target.closest("[data-pd]");
 if(t){const p=S.promos.find(x=>x.id===t.dataset.pt);const ok=await espera(async()=>{const {error}=await db.from("promo_codigos").update({activo:!p.activo}).eq("id",p.id);if(error)throw new Error(error.message);return true});if(ok){await cargar();pintarPromo()}}
 if(d&&await confirmar("¿Eliminar este código promocional?",{titulo:"Eliminar código",ok:"Eliminar",peligro:true})){const ok=await espera(async()=>{const {error}=await db.from("promo_codigos").delete().eq("id",d.dataset.pd);if(error)throw new Error(error.message);return true});if(ok){await cargar();pintarPromo()}}});
$("pgAdd").onclick=async()=>{const p=$("pgPct").value,a=$("pgDesde").value,b=$("pgHasta").value;
 if(!pctOk(p)||Number(p)<=0){toast("El descuento debe estar entre 1 y 100");return}if(!a||!b||b<a){toast("Revisa las fechas: la final no puede ser anterior a la inicial");return}
 const ok=await espera(async()=>{const {error}=await db.from("descuentos_programados").insert({categoria_id:$("pgCat").value||null,pct:Number(p),desde:a,hasta:b});if(error)throw new Error(error.message);await rpc("aplicar_programados");return true});
 if(ok){["pgPct","pgDesde","pgHasta"].forEach(i=>$(i).value="");toast("Descuento programado");await cargar();pintarTodo()}};
$("pgList").addEventListener("click",async e=>{const d=e.target.closest("[data-gd]");if(!d)return;
 const g=S.prog.find(x=>x.id===d.dataset.gd);
 if(await confirmar(g.estado==="activo"?"Este descuento está <b>activo ahora</b>. Al eliminarlo, los productos conservan su descuento hasta que lo quites en Categorías.":"¿Eliminar este descuento programado?",{titulo:"Eliminar programado",ok:"Eliminar",peligro:true})){
  const ok=await espera(async()=>{const {error}=await db.from("descuentos_programados").delete().eq("id",g.id);if(error)throw new Error(error.message);return true});if(ok){await cargar();pintarPromo()}}});
$("pgRun").onclick=async()=>{const n=await espera(()=>rpc("aplicar_programados"),"Revisando…");if(n!==undefined){toast(n?`${n} cambio(s) aplicados`:"No había cambios pendientes");await cargar();pintarTodo()}};

function pintarTodo(){
 const c=$("pCat").value;$("pCat").innerHTML='<option value="">Todas las categorías</option>'+S.cats.map(x=>`<option value="${x.id}">${esc(x.nombre)}</option>`).join("");$("pCat").value=c;
 pintarProd();pintarCat();pintarPromo()}
pestanas([["prod","Productos",ic(IC.box)],["cat","Categorías",ic(IC.tag)],["promo","Promociones",ic(IC.gift)]].map(t=>[t[0],t[1],IC[t[0]==="prod"?"box":t[0]==="cat"?"tag":"gift"]]),()=>{});
await espera(async()=>{await db.rpc("aplicar_programados");await cargar()},"Cargando descuentos…");pintarTodo();
})();
