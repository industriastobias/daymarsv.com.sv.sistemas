/* DAYMAR-SHOP · Cotización de lotes (costo real y ganancia) · solo administradores · Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,fdate,fetchAll,espera,modal,confirmar,norm}=UI;
const me=await requireSession();if(!me)return;
mountSide($("side"),"cotizacion",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
if(me.rol!=="admin"){$("cB").innerHTML='<div class="empty card">Esta página es solo para administradores.</div>';document.querySelector(".hact").remove();$("cMas").remove();$("cL").remove();return}
const BUCKET="productos";
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
let LT=[],IT=[],sel=LS("dms_cot_sel")||"",priv=LS("dms_cot_priv")==="1",vista=LS("dms_cot_vista")||"cards",bus="";
const REP={costo:["Según el costo de cada producto","Los gastos se reparten en proporción a lo que costó cada producto. Es lo más justo cuando hay productos baratos y caros."],unidades:["Igual por cada unidad","Cada unidad lleva la misma parte de los gastos, sin importar su costo."],producto:["Igual por cada producto","Cada producto (sin contar cuántas unidades) lleva la misma parte; así lo hacía la cotización anterior."]};
const M=v=>priv?'<span class="hv">$00.00</span>':$$(v);
const P=v=>priv?'<span class="hv">00%</span>':(Number.isFinite(v)?v.toFixed(1)+"%":"—");
const ini=n=>(n||"?").trim().charAt(0).toUpperCase()||"?";
/* ---------- cálculo ---------- */
function calc(l,its){
 const extras=r2(+l.envio_proveedor+ +l.envio_traslado+ +l.impuestos+ +l.otros);
 const w=i=>l.reparto==="unidades"?i.unidades:l.reparto==="producto"?1:i.costo*i.unidades,W=its.reduce((s,i)=>s+w(i),0);
 const rows=its.map(i=>{
  const share=W>0?extras*w(i)/W:0,extraU=share/i.unidades,real=+i.costo+extraU,inv=i.costo*i.unidades,cr=real*i.unidades,ing=i.precio*i.unidades,net=ing-cr;
  const vend=Math.min(i.unidades,i.vendidas||0),dev=Math.min(vend,i.devueltas||0),ns=vend-dev,pr=i.precio_real==null?+i.precio:+i.precio_real,ingR=ns*pr,gR=ingR-ns*real;
  return {...i,share,extraU,real,inv,cr,ing,net,margen:real>0?(i.precio-real)/real*100:0,vend,dev,ns,pr,ingR,gR,resta:i.unidades-ns,enInv:(i.unidades-ns)*real}});
 const S=k=>rows.reduce((s,r)=>s+r[k],0),t={n:rows.length,units:S("unidades"),inv:S("inv"),extras,cr:S("cr"),ing:S("ing"),net:S("net"),ns:S("ns"),ingR:S("ingR"),gR:S("gR"),enInv:S("enInv"),costoVend:rows.reduce((s,r)=>s+r.ns*r.real,0)};
 t.margen=t.cr>0?t.net/t.cr*100:0;t.recup=t.cr>0?t.ingR/t.cr*100:0;return {rows,t}}
const lote=()=>LT.find(l=>l.id===sel);
const itemsDe=id=>IT.filter(i=>i.lote_id===id);
const cerrado=()=>{const l=lote();return !!l&&l.estado==="cerrado"};
/* ---------- carga ---------- */
async function cargar(){
 LT=await fetchAll(()=>db.from("cot_lotes").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false}));
 IT=await fetchAll(()=>db.from("cot_items").select("*").order("orden").order("created_at"));
 if(!LT.some(l=>l.id===sel))sel=LT[0]?LT[0].id:""}
const recargar=()=>espera(async()=>{await cargar();pintar();return true},"Actualizando…");
const falta=e=>/does not exist|schema cache/.test(e.message)?new Error("Falta aplicar la migración 013 de cotización."):e;
/* ---------- pintar ---------- */
function pintar(){
 $("cEye").textContent=priv?"Mostrar números":"Ocultar números";$("cEye").setAttribute("aria-pressed",priv);
 $("cL").innerHTML=LT.length?LT.map(l=>`<option value="${l.id}">${esc(l.nombre)} · ${fdate(l.fecha)}${l.estado==="cerrado"?" · cerrado":""}</option>`).join(""):'<option value="">Sin lotes</option>';$("cL").value=sel;
 const l=lote();
 if(!l){$("cB").innerHTML='<div class="empty card">Aún no hay lotes. Toca “Nuevo lote” para crear el primero: ahí pones lo que pagaste de envío e impuestos y luego agregas los productos.</div>';return}
 const its=itemsDe(l.id),{rows,t}=calc(l,its),cl=l.estado==="cerrado";
 const V=bus?rows.filter(r=>norm(r.nombre).includes(norm(bus))):rows;
 const gast=[["Envío del proveedor",l.envio_proveedor],["Envío de traslado",l.envio_traslado],["Impuestos",l.impuestos],["Otros gastos",l.otros]];
 const pct=Math.max(0,Math.min(100,t.recup));
 $("cB").innerHTML=`<section class="card ctl2"><div class="ctt"><div><h2>${esc(l.nombre)} <span class="bd ${cl?"mu":"ok"}">${cl?"Cerrado":"Abierto"}</span></h2><small>${fdate(l.fecha)} · ${t.n} producto${t.n===1?"":"s"} · ${t.units} unidades${l.notas?" · "+esc(l.notas):""}</small></div><button class="btn g" data-a="lote">Editar lote</button></div>
  <div class="cgs">${gast.map(g=>`<div><span>${g[0]}</span><b>${M(g[1])}</b></div>`).join("")}<div class="tt"><span>Gastos del lote</span><b>${M(t.extras)}</b></div></div>
  <small class="crp">Reparto: <b>${REP[l.reparto][0]}</b> · cada unidad lleva en promedio ${M(t.units?t.extras/t.units:0)} de gastos</small></section>
  ${cl?'<div class="alert warn" style="margin:0 0 10px"><div><b>Lote cerrado</b>Para cambiar productos o gastos, ábrelo de nuevo en “Editar lote”.</div></div>':""}
  <div class="kp" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))"><div><span>Lo que compraste</span><b>${M(t.inv)}</b></div><div><span>Costo real total</span><b>${M(t.cr)}</b></div><div><span>Si vendes todo</span><b>${M(t.ing)}</b></div><div><span>Ganancia proyectada</span><b class="${t.net<0?"neg":"pos"}">${M(t.net)}</b></div><div><span>Margen neto</span><b>${P(t.margen)}</b></div><div><span>Ganancia real hasta hoy</span><b class="${t.gR<0?"neg":"pos"}">${M(t.gR)}</b></div></div>
  <div class="card crec"><div class="rpl"><span>Recuperado del costo del lote <b>${priv?"—":t.recup.toFixed(0)+"%"}</b></span><span>Vendidas <b>${t.ns}</b> de ${t.units}${t.enInv>0?` · en inventario ${M(t.enInv)}`:""}</span></div><div class="bar2"><i style="width:${priv?0:pct}%"></i></div></div>
  <div class="ctl"><input id="cQ" type="search" placeholder="Buscar producto del lote" autocomplete="off" value="${esc(bus)}" style="flex:1;min-width:160px">
   <div class="seg2"><button data-v="cards" class="${vista==="cards"?"on":""}">Tarjetas</button><button data-v="tabla" class="${vista==="tabla"?"on":""}">Tabla</button></div>
   ${cl?"":'<button class="btn g" data-a="inv">Desde inventario</button><button class="btn" data-a="add">Agregar producto</button>'}</div>
  ${V.length?(vista==="tabla"?tabla(V,t,cl):V.map(r=>tarjeta(r,cl)).join("")):`<div class="empty card">${rows.length?"Ningún producto coincide.":"Este lote aún no tiene productos. Agrégalos para ver su costo real y su ganancia."}</div>`}`}
function tarjeta(r,cl){
 const gn=r.net;
 return `<div class="ci" data-id="${r.id}">${r.imagen_url?`<img class="im" src="${esc(r.imagen_url)}" alt="" loading="lazy" data-img>`:`<div class="im ph0">${esc(ini(r.nombre))}</div>`}
 <div class="cit"><div class="cnm"><b>${esc(r.nombre)}</b><small>${r.unidades} unidades · costo ${M(r.costo)} · precio ${M(r.precio)}</small></div><div class="cmt"><b class="${gn<0?"neg":"pos"}">${M(gn)}</b><small>ganancia proyectada</small></div></div>
 <div class="cmx"><div><span>Costo real c/u</span><b>${M(r.real)}</b><small>+${M(r.extraU)} gastos</small></div><div><span>Ganancia c/u</span><b class="${r.precio-r.real<0?"neg":""}">${M(r.precio-r.real)}</b></div><div><span>Margen</span><b>${P(r.margen)}</b></div><div><span>Vendidas</span><b>${r.ns}/${r.unidades}</b>${r.dev?`<small>${r.dev} devuelta${r.dev===1?"":"s"}</small>`:""}</div><div><span>Ganancia real</span><b class="${r.gR<0?"neg":""}">${M(r.gR)}</b></div></div>
 ${cl?"":`<div class="ac2"><button class="btn g" data-a="edit">Editar</button><button class="btn g" data-a="dup">Duplicar</button><button class="btn g" data-a="del">Quitar</button></div>`}</div>`}
function tabla(V,t,cl){
 return `<div class="tw card"><table class="ctb"><thead><tr><th>Producto</th><th class="r">Uds</th><th class="r">Costo</th><th class="r">Gastos c/u</th><th class="r">Costo real</th><th class="r">Precio</th><th class="r">Margen</th><th class="r">Ganancia proy.</th><th class="r">Vend.</th><th class="r">Ganancia real</th>${cl?"":"<th></th>"}</tr></thead><tbody>${V.map(r=>`<tr data-id="${r.id}"><td>${r.imagen_url?`<img class="mi" src="${esc(r.imagen_url)}" alt="" data-img>`:""}${esc(r.nombre)}</td><td class="r">${r.unidades}</td><td class="r">${M(r.costo)}</td><td class="r">${M(r.extraU)}</td><td class="r">${M(r.real)}</td><td class="r">${M(r.precio)}</td><td class="r">${P(r.margen)}</td><td class="r ${r.net<0?"neg":"pos"}">${M(r.net)}</td><td class="r">${r.ns}</td><td class="r ${r.gR<0?"neg":""}">${M(r.gR)}</td>${cl?"":`<td class="r"><button class="btn g sm" data-a="edit">Editar</button></td>`}</tr>`).join("")}</tbody><tfoot><tr><td>Total</td><td class="r">${t.units}</td><td class="r">${M(t.inv)}</td><td class="r">${M(t.extras)}</td><td class="r">${M(t.cr)}</td><td class="r">${M(t.ing)}</td><td class="r">${P(t.margen)}</td><td class="r">${M(t.net)}</td><td class="r">${t.ns}</td><td class="r">${M(t.gR)}</td>${cl?"":"<td></td>"}</tr></tfoot></table></div>`}
/* ---------- imagen ---------- */
async function comprimir(file,max=600,q=.6){
 let src,w,h;const bmp=await createImageBitmap(file).catch(()=>null);
 if(bmp){src=bmp;w=bmp.width;h=bmp.height}else{src=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=URL.createObjectURL(file)});w=src.width;h=src.height}
 const s=Math.min(1,max/Math.max(w,h)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));
 const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(src,0,0,c.width,c.height);
 return new Promise(r=>c.toBlob(r,"image/jpeg",q))}
async function subirFoto(blob){const path="cotizaciones/"+crypto.randomUUID()+".jpg";
 const {error}=await db.storage.from(BUCKET).upload(path,blob,{contentType:"image/jpeg"});if(error)throw new Error(error.message);
 return {path,url:db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}}
const quitarFoto=async p=>{if(p)try{await db.storage.from(BUCKET).remove([p])}catch(e){}};
/* ---------- lote ---------- */
function formLote(l,dup){
 const nuevo=!l;l=l||{};
 const sig=()=>{let n=LT.length+1,nm;do{nm="Lote-"+String(n++).padStart(3,"0")}while(LT.some(x=>norm(x.nombre)===norm(nm)));return nm};
 const d=modal(nuevo?"Nuevo lote":dup?"Duplicar lote":"Editar lote",`<div class="fg">
  <div class="full"><label>Nombre del lote *</label><input name="n" maxlength="60" value="${esc(nuevo?sig():dup?l.nombre+" (copia)":l.nombre)}"></div>
  <div><label>Fecha de compra *</label><input name="f" type="date" value="${esc(l.fecha||ymd(new Date()))}"></div>
  <div><label>Envío del proveedor ($)</label><input name="ep" type="number" min="0" step="0.01" inputmode="decimal" value="${l.envio_proveedor??0}"></div>
  <div><label>Envío de traslado ($)</label><input name="et" type="number" min="0" step="0.01" inputmode="decimal" value="${l.envio_traslado??0}"></div>
  <div><label>Impuestos ($)</label><input name="im" type="number" min="0" step="0.01" inputmode="decimal" value="${l.impuestos??0}"></div>
  <div><label>Otros gastos ($)</label><input name="ot" type="number" min="0" step="0.01" inputmode="decimal" value="${l.otros??0}"></div>
  <div class="full"><label>¿Cómo se reparten los gastos entre los productos?</label><select name="rp">${Object.keys(REP).map(k=>`<option value="${k}" ${(l.reparto||"costo")===k?"selected":""}>${REP[k][0]}</option>`).join("")}</select><small id="rpT" style="color:var(--mute)"></small></div>
  <div class="full"><label>Notas <small>(opcional)</small></label><input name="o" maxlength="300" value="${esc(l.notas||"")}"></div>
  ${!nuevo&&!dup?`<div class="full"><label class="cf-ck"><input type="checkbox" name="ce" ${l.estado==="cerrado"?"checked":""}> Lote cerrado (ya terminé con él; no se podrá editar hasta reabrirlo)</label></div>`:""}</div>
  <div class="rcalc"><span>Gastos totales del lote</span><b id="lT">$0.00</b></div><div class="err2" id="fE" role="alert"></div>`,
  {foot:`${!nuevo&&!dup?'<button class="btn dg" id="lDel" style="margin-right:auto">Eliminar</button>':""}<button class="btn g" data-x>Cancelar</button><button class="btn" id="lOk">Guardar</button>`});
 const g=n=>d.q(`[name=${n}]`).value.trim(),num=n=>parseFloat(d.q(`[name=${n}]`).value)||0;
 const up=()=>{d.q("#lT").textContent=$$(num("ep")+num("et")+num("im")+num("ot"));d.q("#rpT").textContent=REP[g("rp")][1]};
 d.el.addEventListener("input",up);d.el.addEventListener("change",up);up();setTimeout(()=>d.q("[name=n]").focus(),60);
 if(d.q("#lDel"))d.q("#lDel").onclick=async()=>{if(!await confirmar(`Se eliminará <b>${esc(l.nombre)}</b> con todos sus productos. No se puede deshacer.`,{titulo:"Eliminar lote",ok:"Eliminar",peligro:true}))return;
  const ok=await espera(async()=>{const its=itemsDe(l.id);const {error}=await db.from("cot_lotes").delete().eq("id",l.id);if(error)throw falta(error);for(const i of its)await quitarFoto(i.imagen_path);return true});
  if(ok){d.close();toast("Lote eliminado");await recargar()}};
 d.q("#lOk").onclick=async()=>{const E=t=>{d.q("#fE").textContent=t};
  if(!g("n"))return E("Escribe el nombre del lote.");if(!g("f"))return E("Elige la fecha.");
  if(["ep","et","im","ot"].some(k=>num(k)<0))return E("Los gastos no pueden ser negativos.");
  const row={nombre:g("n"),fecha:g("f"),envio_proveedor:r2(num("ep")),envio_traslado:r2(num("et")),impuestos:r2(num("im")),otros:r2(num("ot")),reparto:g("rp"),notas:g("o")||null};
  if(d.q("[name=ce]"))row.estado=d.q("[name=ce]").checked?"cerrado":"abierto";
  const nid=await espera(async()=>{
   if(nuevo||dup){const {data,error}=await db.from("cot_lotes").insert(row).select("id").single();
    if(error)throw /cot_lotes_nombre_uq|duplicate/.test(error.message)?new Error("Ya existe un lote con ese nombre."):falta(error);
    if(dup){const its=itemsDe(l.id).map((i,k)=>({lote_id:data.id,producto_id:i.producto_id,nombre:i.nombre,imagen_url:i.imagen_url,imagen_path:null,unidades:i.unidades,costo:i.costo,precio:i.precio,orden:k}));
     if(its.length){const e2=await db.from("cot_items").insert(its);if(e2.error)throw new Error(e2.error.message)}}
    return data.id}
   const {error}=await db.from("cot_lotes").update(row).eq("id",l.id);
   if(error)throw /cot_lotes_nombre_uq|duplicate/.test(error.message)?new Error("Ya existe un lote con ese nombre."):falta(error);return l.id},"Guardando…");
  if(nid){sel=nid;LS("dms_cot_sel",sel);d.close();toast("Lote guardado");await recargar()}}}
/* ---------- producto del lote ---------- */
function formItem(i,pre){
 const l=lote();if(!l)return;
 i=i||pre||{};const nuevo=!i.id;let blob=null,borrar=false,prev=i.imagen_url||"";
 const otros=itemsDe(l.id).filter(x=>x.id!==i.id);
 const d=modal(nuevo?"Agregar producto":"Editar producto",`<div class="fg">
  <div class="full"><label>Nombre del producto *</label><input name="n" maxlength="200" autocomplete="off" value="${esc(i.nombre||"")}"></div>
  <div class="full"><label>Foto <small>(opcional)</small></label><div class="rup" id="rUp" tabindex="0" role="button"><img id="rPv" class="${prev?"":"hidden"}" src="${esc(prev)}" alt=""><span id="rUt">${prev?"Toca para cambiar la foto":"Toca para subir una foto, o pégala con Ctrl+V"}</span><input type="file" id="rFile" accept="image/*" hidden></div><button class="btn g sm ${prev?"":"hidden"}" id="rQuit" type="button" style="margin-top:6px">Quitar foto</button></div>
  <div><label>Unidades *</label><input name="u" type="number" min="1" step="1" inputmode="numeric" value="${i.unidades??1}"></div>
  <div><label>Costo por unidad *</label><input name="c" type="number" min="0.01" step="0.01" inputmode="decimal" value="${i.costo??""}"></div>
  <div><label>Precio de venta *</label><input name="p" type="number" min="0" step="0.01" inputmode="decimal" value="${i.precio??""}"></div>
  <div><label>Margen deseado % <small>(para sugerir)</small></label><div class="sgr"><input name="mg" type="number" min="0" step="1" inputmode="decimal" value="100"><button class="btn g sm" id="sug" type="button">Sugerir precio</button></div></div></div>
  <div class="cpv" id="cPv"></div>
  <details class="cdt" ${(i.vendidas||i.devueltas||i.precio_real!=null)?"open":""}><summary>Ventas reales <small>(opcional, para ver la ganancia que ya hiciste)</small></summary><div class="fg" style="margin-top:8px">
   <div><label>Unidades vendidas</label><input name="v" type="number" min="0" step="1" inputmode="numeric" value="${i.vendidas||0}"></div>
   <div><label>De esas, devueltas</label><input name="dv" type="number" min="0" step="1" inputmode="numeric" value="${i.devueltas||0}"></div>
   <div class="full"><label>Precio promedio real de venta <small>(vacío = el precio de venta)</small></label><input name="pr" type="number" min="0" step="0.01" inputmode="decimal" value="${i.precio_real??""}"></div>
   ${i.producto_id?`<div class="full"><button class="btn g sm" id="trae" type="button">Traer ventas del sistema desde ${fdate(l.fecha)}</button></div>`:""}</div></details>
  <div class="err2" id="fE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="iOk">Guardar producto</button>`,big:true});
 const g=n=>d.q(`[name=${n}]`).value.trim(),num=n=>parseFloat(d.q(`[name=${n}]`).value)||0;
 const cur=()=>({id:i.id||"nuevo",nombre:g("n"),unidades:Math.max(1,parseInt(g("u"),10)||1),costo:num("c"),precio:num("p"),vendidas:parseInt(g("v"),10)||0,devueltas:parseInt(g("dv"),10)||0,precio_real:g("pr")===""?null:num("pr")});
 const prev2=()=>{const it=cur(),{rows}=calc(l,[...otros,it]),r=rows.find(x=>x.id===it.id);
  d.q("#cPv").innerHTML=it.costo>0?`<div><span>Costo real c/u</span><b>${$$(r.real)}</b><small>${$$(it.costo)} + ${$$(r.extraU)} gastos</small></div><div><span>Ganancia c/u</span><b class="${it.precio-r.real<0?"neg":"pos"}">${$$(it.precio-r.real)}</b></div><div><span>Margen neto</span><b>${r.margen.toFixed(1)}%</b></div><div><span>Ganancia total</span><b class="${r.net<0?"neg":"pos"}">${$$(r.net)}</b></div><div><span>Para no perder, vende a</span><b>${$$(r.real)}</b></div>`:'<small style="color:var(--mute)">Escribe el costo para ver el costo real con los gastos del lote.</small>'};
 d.el.addEventListener("input",prev2);prev2();
 d.q("#sug").onclick=()=>{const it=cur();if(!(it.costo>0))return d.q("#fE").textContent="Escribe primero el costo.";const {rows}=calc(l,[...otros,it]),r=rows.find(x=>x.id===it.id);
  d.q("#fE").textContent="";d.q("[name=p]").value=(Math.ceil(r.real*(1+num("mg")/100)*20)/20).toFixed(2);prev2()};
 const poner=async f=>{if(!f||!f.type.startsWith("image/"))return;try{blob=await comprimir(f);borrar=false;const u=URL.createObjectURL(blob);d.q("#rPv").src=u;d.q("#rPv").classList.remove("hidden");d.q("#rUt").textContent="Toca para cambiar la foto";d.q("#rQuit").classList.remove("hidden")}catch(e){d.q("#fE").textContent="No se pudo leer esa imagen."}};
 d.q("#rUp").onclick=()=>d.q("#rFile").click();d.q("#rFile").onchange=e=>poner(e.target.files[0]);
 d.q("#rQuit").onclick=()=>{blob=null;borrar=true;d.q("#rPv").classList.add("hidden");d.q("#rUt").textContent="Toca para subir una foto, o pégala con Ctrl+V";d.q("#rQuit").classList.add("hidden")};
 const pegar=e=>{const it=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith("image/"));if(it){poner(it.getAsFile());e.preventDefault()}};
 document.addEventListener("paste",pegar);new MutationObserver(()=>{if(!document.body.contains(d.el))document.removeEventListener("paste",pegar)}).observe(document.body,{childList:true});
 if(d.q("#trae"))d.q("#trae").onclick=async()=>{const r=await espera(async()=>{
   const {data,error}=await db.from("venta_items").select("cantidad,precio_unit,ventas!inner(estado,created_at)").eq("producto_id",i.producto_id).eq("ventas.estado","completada").gte("ventas.created_at",l.fecha+"T00:00:00");
   if(error)throw new Error(error.message);return data||[]});if(!r)return;
  const q=r.reduce((s,x)=>s+x.cantidad,0),m=r.reduce((s,x)=>s+x.cantidad*x.precio_unit,0);
  d.q("[name=v]").value=q;d.q("[name=pr]").value=q?(m/q).toFixed(2):"";toast(q?`${q} vendidas en el sistema`:"No hay ventas de este producto desde esa fecha");prev2()};
 setTimeout(()=>d.q("[name=n]").focus(),60);
 d.q("#iOk").onclick=async()=>{const E=t=>{d.q("#fE").textContent=t},it=cur();
  if(!it.nombre)return E("Escribe el nombre del producto.");if(!(it.costo>0))return E("El costo debe ser mayor a cero.");if(!(it.precio>=0)||g("p")==="")return E("Escribe el precio de venta.");
  if(!Number.isInteger(+g("u"))||+g("u")<1)return E("Las unidades deben ser un número entero desde 1.");
  if(it.vendidas>it.unidades)return E("Las vendidas no pueden ser más que las unidades compradas.");if(it.devueltas>it.vendidas)return E("Las devueltas no pueden ser más que las vendidas.");
  if(it.precio_real!=null&&it.precio_real<0)return E("El precio real no puede ser negativo.");
  const row={nombre:it.nombre,unidades:it.unidades,costo:r2(it.costo),precio:r2(it.precio),vendidas:it.vendidas,devueltas:it.devueltas,precio_real:it.precio_real==null?null:r2(it.precio_real)};
  const ok=await espera(async()=>{let nueva=null;if(blob)nueva=await subirFoto(blob);
   if(nueva){row.imagen_url=nueva.url;row.imagen_path=nueva.path}else if(borrar){row.imagen_url=null;row.imagen_path=null}else if(nuevo&&i.imagen_url){row.imagen_url=i.imagen_url;row.imagen_path=null}
   if(nuevo){row.lote_id=l.id;row.producto_id=i.producto_id||null;row.orden=itemsDe(l.id).length;const {error}=await db.from("cot_items").insert(row);if(error){if(nueva)await quitarFoto(nueva.path);throw falta(error)}}
   else{const {error}=await db.from("cot_items").update(row).eq("id",i.id);if(error){if(nueva)await quitarFoto(nueva.path);throw falta(error)}if(nueva||borrar)await quitarFoto(i.imagen_path)}
   return true},"Guardando…");
  if(ok){d.close();toast("Producto guardado");await recargar()}}}
async function desdeInventario(){
 const L=await espera(()=>fetchAll(()=>db.from("productos").select("id,nombre,precio_costo,precio_venta,foto_url,stock").eq("activo",true).order("nombre")),"Cargando inventario…");if(!L)return;
 const en=new Set(itemsDe(sel).map(x=>x.producto_id).filter(Boolean));
 const d=modal("Agregar desde el inventario",`<input id="iQ" type="search" placeholder="Buscar producto" autocomplete="off" style="width:100%;margin-bottom:8px"><div id="iL" class="cinv"></div>`,{foot:'<button class="btn g" data-x>Cerrar</button>',big:true});
 const pt=()=>{const q=norm(d.q("#iQ").value),V=L.filter(p=>!q||norm(p.nombre).includes(q)).slice(0,60);
  d.q("#iL").innerHTML=V.length?V.map(p=>`<button type="button" class="rw" data-p="${p.id}">${p.foto_url?`<img class="mi" src="${esc(p.foto_url)}" alt="">`:`<span class="mi ph0">${esc(ini(p.nombre))}</span>`}<span class="ti"><b>${esc(p.nombre)}</b><small>Costo ${$$(p.precio_costo)} · Precio ${$$(p.precio_venta)} · Stock ${p.stock}${en.has(p.id)?" · ya está en el lote":""}</small></span></button>`).join(""):'<div class="empty">No hay coincidencias.</div>'};
 pt();d.q("#iQ").addEventListener("input",pt);setTimeout(()=>d.q("#iQ").focus(),60);
 d.q("#iL").onclick=e=>{const b=e.target.closest("[data-p]");if(!b)return;const p=L.find(x=>x.id===b.dataset.p);d.close();
  formItem(null,{producto_id:p.id,nombre:p.nombre,imagen_url:p.foto_url,costo:+p.precio_costo||"",precio:+p.precio_venta||"",unidades:1})}}
async function quitarItem(i){
 if(!await confirmar(`Se quitará <b>${esc(i.nombre)}</b> del lote.`,{titulo:"Quitar producto",ok:"Quitar",peligro:true}))return;
 const ok=await espera(async()=>{const {error}=await db.from("cot_items").delete().eq("id",i.id);if(error)throw falta(error);await quitarFoto(i.imagen_path);return true});
 if(ok){toast("Producto quitado");await recargar()}}
/* ---------- exportar ---------- */
async function nombreNegocio(){try{const {data}=await db.from("config_negocio").select("nombre").eq("id",1).maybeSingle();return (data&&data.nombre)||"DAYMAR-SHOP"}catch(e){return "DAYMAR-SHOP"}}
async function pdf(){
 const l=lote();if(!l)return;const {rows,t}=calc(l,itemsDe(l.id)),neg=await nombreNegocio();
 const html=`<div class="fx"><style>${UI.DOC_CSS}</style><div class="top"><div><h1>${esc(neg)}</h1><div class="sl">Cotización del lote · ${esc(l.nombre)}</div></div><div class="no"><b>${fdate(l.fecha)}</b><br><small>${l.estado==="cerrado"?"Lote cerrado":"Lote abierto"}</small></div></div>
 <div class="k"><div><b>${$$(t.inv)}</b><span>Compra</span></div><div><b>${$$(t.extras)}</b><span>Gastos</span></div><div><b>${$$(t.cr)}</b><span>Costo real</span></div><div><b class="${t.net<0?"bad":"ok"}">${$$(t.net)}</b><span>Ganancia proyectada</span></div></div>
 <h2>Gastos del lote</h2><div>Proveedor ${$$(l.envio_proveedor)} · Traslado ${$$(l.envio_traslado)} · Impuestos ${$$(l.impuestos)} · Otros ${$$(l.otros)}<br><small>Reparto: ${REP[l.reparto][0]}</small></div>
 <h2>Productos</h2><table><thead><tr><th>Producto</th><th class="r">Uds</th><th class="r">Costo</th><th class="r">Costo real</th><th class="r">Precio</th><th class="r">Margen</th><th class="r">Ganancia</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.nombre)}</td><td class="r">${r.unidades}</td><td class="r">${$$(r.costo)}</td><td class="r">${$$(r.real)}</td><td class="r">${$$(r.precio)}</td><td class="r">${r.margen.toFixed(1)}%</td><td class="r">${$$(r.net)}</td></tr>`).join("")}<tr class="t"><td>Total</td><td class="r">${t.units}</td><td class="r">${$$(t.inv)}</td><td class="r">${$$(t.cr)}</td><td class="r">${$$(t.ing)}</td><td class="r">${t.margen.toFixed(1)}%</td><td class="r">${$$(t.net)}</td></tr></tbody></table>
 <h2>Resultado real hasta hoy</h2><div>Vendidas ${t.ns} de ${t.units} · Ingreso ${$$(t.ingR)} · Ganancia real ${$$(t.gR)} · Recuperado ${t.recup.toFixed(0)}% del costo del lote</div>${l.notas?`<p><small>Notas: ${esc(l.notas)}</small></p>`:""}</div>`;
 UI.vistaDoc("Cotización · "+l.nombre,html,"cotizacion-"+l.nombre.replace(/\s+/g,"-"))}
function excel(){
 const l=lote();if(!l)return;const {rows,t}=calc(l,itemsDe(l.id));
 UI.excel("cotizacion-"+l.nombre.replace(/\s+/g,"-"),[
  {n:"Productos",c:[["Producto",32],["Unidades",10],["Costo",12,"money"],["Gastos c/u",12,"money"],["Costo real",12,"money"],["Precio",12,"money"],["Margen %",10],["Ganancia proyectada",18,"money"],["Vendidas",10],["Devueltas",10],["Precio real",12,"money"],["Ganancia real",14,"money"]],
   f:rows.map(r=>[r.nombre,r.unidades,+r.costo,r2(r.extraU),r2(r.real),+r.precio,+r.margen.toFixed(1),r2(r.net),r.vend,r.dev,r2(r.pr),r2(r.gR)])},
  {n:"Resumen",c:[["Concepto",34],["Valor",16,"money"]],f:[["Lote: "+l.nombre,""],["Compra",r2(t.inv)],["Envío del proveedor",+l.envio_proveedor],["Envío de traslado",+l.envio_traslado],["Impuestos",+l.impuestos],["Otros gastos",+l.otros],["Costo real total",r2(t.cr)],["Venta proyectada",r2(t.ing)],["Ganancia proyectada",r2(t.net)],["Ingreso real",r2(t.ingR)],["Ganancia real",r2(t.gR)]]}])}
/* ---------- más opciones ---------- */
function historial(){
 const F=LT.map(l=>({l,...calc(l,itemsDe(l.id)).t}));
 const T=F.reduce((a,x)=>({inv:a.inv+x.inv,net:a.net+x.net,gR:a.gR+x.gR}),{inv:0,net:0,gR:0});
 const d=modal("Historial de lotes",F.length?`<div class="tw"><table class="ctb"><thead><tr><th>Lote</th><th>Fecha</th><th class="r">Uds</th><th class="r">Compra</th><th class="r">Gastos</th><th class="r">Ganancia proy.</th><th class="r">Ganancia real</th><th class="r">Recup.</th></tr></thead><tbody>${F.map(x=>`<tr data-l="${x.l.id}" class="clk"><td><b>${esc(x.l.nombre)}</b>${x.l.estado==="cerrado"?' <span class="bd mu">cerrado</span>':""}</td><td>${fdate(x.l.fecha)}</td><td class="r">${x.units}</td><td class="r">${M(x.inv)}</td><td class="r">${M(x.extras)}</td><td class="r ${x.net<0?"neg":"pos"}">${M(x.net)}</td><td class="r ${x.gR<0?"neg":""}">${M(x.gR)}</td><td class="r">${priv?"—":x.recup.toFixed(0)+"%"}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="3">Todos los lotes</td><td class="r">${M(T.inv)}</td><td></td><td class="r">${M(T.net)}</td><td class="r">${M(T.gR)}</td><td></td></tr></tfoot></table></div><small style="color:var(--mute)">Toca un lote para abrirlo.</small>`:'<div class="empty">Aún no hay lotes.</div>',{foot:'<button class="btn g" data-x>Cerrar</button>',big:true});
 d.el.addEventListener("click",e=>{const r=e.target.closest("[data-l]");if(!r)return;sel=r.dataset.l;LS("dms_cot_sel",sel);d.close();pintar()})}
async function importar(){
 const inp=document.createElement("input");inp.type="file";inp.accept=".zip,.json";
 inp.onchange=async()=>{const f=inp.files[0];if(!f)return;
  const res=await espera(async()=>{
   let txt;if(/\.zip$/i.test(f.name)){await UI.lib("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");const z=await JSZip.loadAsync(f),j=z.file("lotes.json");if(!j)throw new Error("El ZIP no trae lotes.json de la cotización anterior.");txt=await j.async("string")}else txt=await f.text();
   const data=JSON.parse(txt);if(!data||!Array.isArray(data.lotes))throw new Error("El archivo no tiene el formato de la cotización anterior.");
   let nl=0,ni=0,om=0;
   for(const o of data.lotes){
    if(!o||!o.id||!Array.isArray(o.products)){om++;continue}
    let nombre=String(o.id).slice(0,60),k=1;while(LT.some(x=>norm(x.nombre)===norm(nombre)))nombre=String(o.id).slice(0,52)+" ("+(++k)+")";
    let fecha=ymd(new Date());const dt=new Date(o.date);if(!isNaN(dt)&&dt.getFullYear()>2000)fecha=ymd(dt);else{const m=String(o.date||"").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)fecha=`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`}
    const {data:nuevo,error}=await db.from("cot_lotes").insert({nombre,fecha,envio_proveedor:Math.max(0,+o.vendorShipping||0),envio_traslado:Math.max(0,+o.shipping||0),impuestos:Math.max(0,+o.taxes||0),reparto:"producto",estado:"cerrado",notas:"Importado de la cotización anterior"}).select("id").single();
    if(error)throw falta(error);nl++;LT.push({nombre,id:nuevo.id});
    const filas=[];let ord=0;
    for(const p of o.products){const u=Math.max(1,parseInt(p.units,10)||1),c=+p.unitCost||0;if(!(c>0))continue;
     let url=null,path=null;if(typeof p.image==="string"&&p.image.startsWith("data:image")){try{const b=await (await fetch(p.image)).blob();const s=await subirFoto(await comprimir(new File([b],"f.jpg",{type:b.type})));url=s.url;path=s.path}catch(e){}}
     const vend=Math.max(0,Math.min(u,parseInt(p.unitsSold,10)||0)),dev=Math.max(0,Math.min(vend,parseInt(p.unitsReturned,10)||0)),pr=+p.actualUnitPrice;
     filas.push({lote_id:nuevo.id,nombre:String(p.name||"Producto").slice(0,200),imagen_url:url,imagen_path:path,unidades:u,costo:r2(c),precio:Math.max(0,r2(+p.unitPrice||0)),vendidas:vend,devueltas:dev,precio_real:Number.isFinite(pr)&&p.actualUnitPrice!=null&&Math.abs(pr-(+p.unitPrice||0))>.001?Math.max(0,r2(pr)):null,orden:ord++})}
    if(filas.length){const e2=await db.from("cot_items").insert(filas);if(e2.error)throw new Error(e2.error.message);ni+=filas.length}}
   return {nl,ni,om}},"Importando…");
  if(res){toast(`Importado: ${res.nl} lote${res.nl===1?"":"s"} y ${res.ni} productos`);await recargar()}};
 inp.click()}
function mas(){
 const d=modal("Más opciones",`<div class="cmn">
  <button class="btn g" data-o="his">Historial y comparación de lotes</button>
  <button class="btn g" data-o="pdf" ${sel?"":"disabled"}>Exportar este lote a PDF / imprimir</button>
  <button class="btn g" data-o="xls" ${sel?"":"disabled"}>Exportar este lote a Excel</button>
  <button class="btn g" data-o="dup" ${sel?"":"disabled"}>Duplicar este lote (con sus productos)</button>
  <button class="btn g" data-o="imp">Importar lotes de la cotización anterior (.zip)</button></div>`,{foot:'<button class="btn g" data-x>Cerrar</button>'});
 d.el.addEventListener("click",e=>{const b=e.target.closest("[data-o]");if(!b)return;d.close();const o=b.dataset.o;
  if(o==="his")historial();else if(o==="pdf")pdf();else if(o==="xls")excel();else if(o==="dup")formLote(lote(),true);else if(o==="imp")importar()})}
/* ---------- eventos ---------- */
$("cNew").onclick=()=>formLote();$("cMas").onclick=mas;
$("cEye").onclick=()=>{priv=!priv;LS("dms_cot_priv",priv?"1":"0");pintar()};
$("cL").onchange=()=>{sel=$("cL").value;LS("dms_cot_sel",sel);bus="";pintar()};
$("cB").addEventListener("input",e=>{if(e.target.id==="cQ"){bus=e.target.value;const p=e.target.selectionStart;clearTimeout(pintar.t);pintar.t=setTimeout(()=>{pintar();const q=$("cQ");if(q){q.focus();q.setSelectionRange(p,p)}},180)}});
$("cB").addEventListener("click",e=>{
 const v=e.target.closest("[data-v]");if(v){vista=v.dataset.v;LS("dms_cot_vista",vista);pintar();return}
 const im=e.target.closest("[data-img]");if(im){modal("Foto",`<img class="rimg" src="${esc(im.src)}" alt="">`,{big:true});return}
 const a=e.target.closest("[data-a]");if(!a)return;const k=a.dataset.a;
 if(k==="lote")return formLote(lote());if(k==="add")return formItem();if(k==="inv")return desdeInventario();
 const row=e.target.closest("[data-id]");const i=row&&IT.find(x=>x.id===row.dataset.id);if(!i)return;
 if(k==="edit")formItem(i);else if(k==="del")quitarItem(i);else if(k==="dup")formItem(null,{nombre:i.nombre,imagen_url:i.imagen_url,unidades:i.unidades,costo:i.costo,precio:i.precio,producto_id:i.producto_id})});
try{await espera(async()=>{await cargar();pintar();return true},"Cargando…")}catch(e){$("cB").innerHTML=`<div class="empty card">${esc(falta(e).message)}</div>`}
})();
