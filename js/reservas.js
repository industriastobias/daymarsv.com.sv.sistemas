/* DAYMAR-SHOP · Reservas (apartados con abonos) · conectado a Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,fdate,deb,fetchAll,espera,modal,confirmar,norm}=UI;
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin",BUCKET="productos";
mountSide($("side"),"reservas",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
let R=[],estado="",priv=LS("dms_res_priv")==="1",lim=30;
const ini=n=>(n||"?").trim().charAt(0).toUpperCase()||"?";
const saldo=r=>r2(+r.precio_total-+r.monto_pagado);
const M=v=>priv?'<span class="hv">$00.00</span>':$$(v);
async function cargar(){R=await fetchAll(()=>db.from("reservas").select("*").order("created_at",{ascending:false}))}
function filtradas(){
 const q=norm($("rQ").value),c=$("rC").value,d=$("rD").value,h=$("rH").value,o=$("rO").value;
 let L=R.filter(r=>(!estado||r.estado===estado)&&(!c||(r.categorias||[]).includes(c))&&(!d||r.fecha>=d)&&(!h||r.fecha<=h)&&(!q||norm([r.cliente_nombre,r.telefono,r.producto,r.notas,r.numero].join(" ")).includes(q)));
 if(o==="fecha")L=L.slice().sort((a,b)=>b.fecha.localeCompare(a.fecha));else if(o==="saldo")L=L.slice().sort((a,b)=>saldo(b)-saldo(a));else if(o==="nombre")L=L.slice().sort((a,b)=>a.cliente_nombre.localeCompare(b.cliente_nombre));
 return L}
function pintar(){
 const pe=R.filter(r=>r.estado==="pendiente"),co=R.length-pe.length,rec=R.reduce((s,r)=>s+ +r.monto_pagado,0),cob=pe.reduce((s,r)=>s+saldo(r),0);
 $("rK").innerHTML=`<div><span>Reservas</span><b>${R.length}</b></div><div><span>Pendientes</span><b>${pe.length}</b></div><div><span>Completadas</span><b>${co}</b></div><div><span>Recaudado</span><b class="pos">${M(rec)}</b></div><div><span>Por cobrar</span><b class="${cob>0?"neg":""}">${M(cob)}</b></div><div><span>Total general</span><b>${M(rec+cob)}</b></div>`;
 $("rSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.e===estado));
 const cats=[...new Set(R.flatMap(r=>r.categorias||[]))].sort(),cur=$("rC").value;
 $("rC").innerHTML='<option value="">Todas</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");$("rC").value=cats.includes(cur)?cur:"";
 $("rEye").textContent=priv?"Mostrar montos":"Ocultar montos";$("rEye").setAttribute("aria-pressed",priv);
 const L=filtradas(),V=L.slice(0,lim);
 $("rL").innerHTML=V.length?V.map(fila).join(""):`<div class="empty card">${R.length?"Ninguna reserva coincide con los filtros.":"Aún no hay reservas. Toca “Nueva reserva” para crear la primera."}</div>`;
 $("rMas").classList.toggle("hidden",L.length<=lim);$("rMas").textContent=`Ver más (${L.length-lim})`}
function fila(r){
 const s=saldo(r),pct=Math.min(100,Math.round(+r.monto_pagado/+r.precio_total*100)),ok=r.estado==="completado";
 return `<div class="rs ${ok?"ok":"pe"}" data-id="${r.id}">
  ${r.imagen_url?`<img class="im" src="${esc(r.imagen_url)}" alt="" loading="lazy" data-img>`:`<div class="im ph0">${esc(ini(r.cliente_nombre))}</div>`}
  <div class="rtp"><div class="rnm"><b>${esc(r.cliente_nombre)}</b><small>${esc(r.producto)}</small><small>${esc([r.telefono,fdate(r.fecha)].filter(Boolean).join(" · "))} · #${r.numero}</small>${(r.categorias||[]).length?`<div class="rtg">${r.categorias.map(c=>`<span class="tag">${esc(c)}</span>`).join("")}</div>`:""}</div>
   <div class="rmt"><b>${M(r.precio_total)}</b><span class="bd ${ok?"ok":"wa"}">${ok?"Completada":"Pendiente"}</span></div></div>
  <div class="rpr"><div class="bar2"><i style="width:${pct}%"></i></div><div class="rpl"><span>Pagado <b>${M(r.monto_pagado)}</b> (${pct}%)</span><span>${ok?"Sin saldo":`Resta <b>${M(s)}</b>`}</span></div></div>
  ${r.notas?`<div class="rnt">${esc(r.notas)}</div>`:""}
  <div class="ac2">${ok?"":`<button class="btn" data-a="abono">Abonar</button>`}${r.telefono?`<button class="btn g" data-a="wa">WhatsApp</button>`:""}<button class="btn g" data-a="edit">Editar</button><button class="btn g" data-a="dup">Duplicar</button>${ADM?`<button class="btn g" data-a="del" style="color:var(--bad)">Eliminar</button>`:""}</div></div>`}
/* ---------- imagen ---------- */
async function comprimir(file,max=1200,q=.8){
 let src,w,h;const bmp=await createImageBitmap(file).catch(()=>null);
 if(bmp){src=bmp;w=bmp.width;h=bmp.height}else{src=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=URL.createObjectURL(file)});w=src.width;h=src.height}
 const s=Math.min(1,max/Math.max(w,h)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));
 const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(src,0,0,c.width,c.height);
 return new Promise(r=>c.toBlob(r,"image/jpeg",q))}
async function subirFoto(blob){const path="reservas/"+crypto.randomUUID()+".jpg";
 const {error}=await db.storage.from(BUCKET).upload(path,blob,{contentType:"image/jpeg"});if(error)throw new Error(error.message);
 return {path,url:db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}}
const quitarFoto=async(p,url)=>{if(p&&!R.some(x=>x.imagen_url&&x.imagen_url===url&&x.imagen_path!==p))try{await db.storage.from(BUCKET).remove([p])}catch(e){}};
/* ---------- formulario ---------- */
let clientes=[];
(async()=>{try{clientes=await fetchAll(()=>db.from("clientes").select("nombre,telefono").order("nombre"))}catch(e){}})();
function form(r,dup){
 r=r||{};const nuevo=!r.id;let blob=null,borrar=false,prev=r.imagen_url||"";
 const d=modal(nuevo?(dup?"Duplicar reserva":"Nueva reserva"):"Editar reserva",`<div class="fg">
  <div class="full"><label>Cliente *</label><input name="n" list="rCl" maxlength="100" autocomplete="off" value="${esc(r.cliente_nombre||"")}"><datalist id="rCl">${clientes.map(c=>`<option value="${esc(c.nombre)}">`).join("")}</datalist></div>
  <div><label>Teléfono *</label><input name="t" type="tel" inputmode="tel" maxlength="30" value="${esc(r.telefono||"")}"></div>
  <div><label>Fecha *</label><input name="f" type="date" value="${esc(r.fecha||ymd(new Date()))}"></div>
  <div class="full"><label>Producto *</label><input name="p" maxlength="200" placeholder="Descripción del producto" value="${esc(r.producto||"")}"></div>
  <div class="full"><label>Categorías <small>(separadas por coma)</small></label><input name="c" maxlength="120" placeholder="Ej: Aretes, Regalo" value="${esc((r.categorias||[]).join(", "))}"></div>
  <div class="full"><label>Foto del producto <small>(opcional)</small></label><div class="rup" id="rUp" tabindex="0" role="button"><img id="rPv" class="${prev?"":"hidden"}" src="${esc(prev)}" alt=""><span id="rUt">${prev?"Toca para cambiar la foto":"Toca para subir una foto, o pégala con Ctrl+V"}</span><input type="file" id="rFile" accept="image/*" hidden></div><button type="button" class="btn g s ${prev?"":"hidden"}" id="rQuit" style="margin-top:6px">Quitar foto</button></div>
  <div><label>Precio total *</label><input name="pt" type="number" min="0.01" step="0.01" inputmode="decimal" value="${r.precio_total??""}"></div>
  <div><label>Monto pagado *</label><input name="mp" type="number" min="0" step="0.01" inputmode="decimal" value="${r.monto_pagado??0}"></div>
  <div class="full"><label>Notas <small>(opcional)</small></label><input name="o" maxlength="500" value="${esc(r.notas||"")}"></div></div>
  <div class="rcalc"><span>Saldo pendiente</span><b id="rRes">$0.00</b><span class="bd wa" id="rEst">Pendiente</span></div><div class="err2" id="fE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="fOk">Guardar reserva</button>`});
 const g=n=>d.q(`[name=${n}]`).value.trim(),num=n=>parseFloat(d.q(`[name=${n}]`).value)||0;
 const calc=()=>{const s=r2(num("pt")-num("mp"));d.q("#rRes").textContent=$$(Math.max(0,s));const ok=num("pt")>0&&s<=0;d.q("#rEst").textContent=ok?"Completada":"Pendiente";d.q("#rEst").className="bd "+(ok?"ok":"wa")};
 d.el.addEventListener("input",calc);calc();
 d.q("[name=n]").addEventListener("change",()=>{const c=clientes.find(x=>norm(x.nombre)===norm(g("n")));if(c&&c.telefono&&!g("t"))d.q("[name=t]").value=c.telefono});
 const poner=async f=>{if(!f||!f.type.startsWith("image/"))return;try{blob=await comprimir(f);borrar=false;const u=URL.createObjectURL(blob);d.q("#rPv").src=u;d.q("#rPv").classList.remove("hidden");d.q("#rUt").textContent="Toca para cambiar la foto";d.q("#rQuit").classList.remove("hidden")}catch(e){d.q("#fE").textContent="No se pudo leer esa imagen."}};
 d.q("#rUp").onclick=()=>d.q("#rFile").click();d.q("#rFile").onchange=e=>poner(e.target.files[0]);
 d.q("#rQuit").onclick=()=>{blob=null;borrar=true;d.q("#rPv").classList.add("hidden");d.q("#rUt").textContent="Toca para subir una foto, o pégala con Ctrl+V";d.q("#rQuit").classList.add("hidden")};
 const pegar=e=>{const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/"));if(it){poner(it.getAsFile());e.preventDefault()}};
 document.addEventListener("paste",pegar);const cl=d.el;new MutationObserver(()=>{if(!document.body.contains(cl))document.removeEventListener("paste",pegar)}).observe(document.body,{childList:true});
 setTimeout(()=>d.q("[name=n]").focus(),60);
 d.q("#fOk").onclick=async()=>{const E=t=>{d.q("#fE").textContent=t};
  if(!g("n"))return E("Escribe el nombre del cliente.");if(!g("t"))return E("Escribe el teléfono.");if(!g("f"))return E("Elige la fecha.");if(!g("p"))return E("Escribe el producto.");
  const pt=num("pt"),mp=num("mp");if(pt<=0)return E("El precio total debe ser mayor a cero.");if(mp<0)return E("El monto pagado no puede ser negativo.");if(mp>pt)return E("El monto pagado no puede ser mayor al precio total.");
  const row={cliente_nombre:g("n"),telefono:g("t"),fecha:g("f"),producto:g("p"),categorias:g("c").split(",").map(x=>x.trim()).filter(Boolean),precio_total:r2(pt),monto_pagado:r2(mp),notas:g("o")||null};
  const ok=await espera(async()=>{
   let nueva=null;if(blob)nueva=await subirFoto(blob);
   if(nueva){row.imagen_url=nueva.url;row.imagen_path=nueva.path}else if(borrar){row.imagen_url=null;row.imagen_path=null}else if(dup&&r.imagen_url){row.imagen_url=r.imagen_url;row.imagen_path=null}
   const {error}=nuevo||dup?await db.from("reservas").insert(row):await db.from("reservas").update(row).eq("id",r.id);
   if(error){if(nueva)await quitarFoto(nueva.path);throw new Error(/relation|reservas/.test(error.message)&&/exist/.test(error.message)?"Falta aplicar la migración de reservas (011_reservas.sql).":error.message)}
   if(!nuevo&&!dup&&(nueva||borrar))await quitarFoto(r.imagen_path,r.imagen_url);
   return true},"Guardando…");
  if(ok){d.close();toast("Reserva guardada");await recargar()}}}
/* ---------- acciones ---------- */
function abonar(r){
 const s=saldo(r);
 const d=modal("Registrar abono",`<p style="margin:0 0 8px"><b>${esc(r.cliente_nombre)}</b> · ${esc(r.producto)}<br><small>Total ${$$(r.precio_total)} · Pagado ${$$(r.monto_pagado)} · Resta <b>${$$(s)}</b></small></p>
  <label>Monto del abono</label><input id="aM" type="number" min="0.01" step="0.01" max="${s}" inputmode="decimal" placeholder="0.00"><div class="err2" id="fE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn g" id="aT">Liquidar ${$$(s)}</button><button class="btn" id="aOk">Abonar</button>`});
 setTimeout(()=>d.q("#aM").focus(),60);
 const go=async v=>{v=r2(v);if(!(v>0))return d.q("#fE").textContent="Escribe un monto mayor a cero.";if(v>s+.001)return d.q("#fE").textContent="El abono no puede ser mayor al saldo ("+$$(s)+").";
  const ok=await espera(async()=>{const {error}=await db.from("reservas").update({monto_pagado:r2(+r.monto_pagado+v)}).eq("id",r.id);if(error)throw new Error(error.message);return true});
  if(ok){d.close();toast(v>=s-.001?"Reserva completada":"Abono registrado");await recargar()}};
 d.q("#aOk").onclick=()=>go(parseFloat(d.q("#aM").value));d.q("#aT").onclick=()=>go(s);
 d.q("#aM").addEventListener("keydown",e=>{if(e.key==="Enter")go(parseFloat(d.q("#aM").value))})}
function whatsapp(r){
 let t=String(r.telefono||"").replace(/\D/g,"");if(t.length===8)t="503"+t;if(!t)return toast("Esta reserva no tiene teléfono");
 const s=saldo(r),msg=`Hola ${r.cliente_nombre}, te escribimos de DAYMAR-SHOP sobre tu reserva de ${r.producto}. Total ${$$(r.precio_total)}, abonado ${$$(r.monto_pagado)}`+(s>0?` y el saldo pendiente es ${$$(s)}.`:". ¡Ya está completamente pagada! Gracias por tu compra.");
 window.open("https://wa.me/"+t+"?text="+encodeURIComponent(msg),"_blank","noopener")}
async function eliminar(r){
 if(!await confirmar(`Se eliminará la reserva de <b>${esc(r.cliente_nombre)}</b> (${esc(r.producto)}). No se puede deshacer.`,{titulo:"Eliminar reserva",ok:"Eliminar",peligro:true}))return;
 const ok=await espera(async()=>{const {error}=await db.from("reservas").delete().eq("id",r.id);if(error)throw new Error(error.message);await quitarFoto(r.imagen_path,r.imagen_url);return true});
 if(ok){toast("Reserva eliminada");await recargar()}}
async function recargar(){await espera(async()=>{await cargar();pintar();return true},"Actualizando…")}
/* ---------- eventos ---------- */
$("rL").addEventListener("click",e=>{
 const im=e.target.closest("[data-img]");const row=e.target.closest(".rs");if(!row)return;const r=R.find(x=>x.id===row.dataset.id);if(!r)return;
 if(im){modal(esc(r.producto),`<img class="rimg" src="${esc(r.imagen_url)}" alt="">`,{big:true});return}
 const a=e.target.closest("[data-a]");if(!a)return;const k=a.dataset.a;
 if(k==="abono")abonar(r);else if(k==="wa")whatsapp(r);else if(k==="edit")form(r);else if(k==="dup")form({...r,id:null,monto_pagado:0,imagen_path:null},true);else if(k==="del")eliminar(r)});
$("rNew").onclick=()=>form();
$("rEye").onclick=()=>{priv=!priv;LS("dms_res_priv",priv?"1":"0");pintar()};
$("rSg").onclick=e=>{const b=e.target.closest("button");if(!b)return;estado=b.dataset.e;lim=30;pintar()};
["rC","rD","rH","rO"].forEach(i=>$(i).addEventListener("change",()=>{lim=30;pintar()}));
$("rQ").addEventListener("input",deb(()=>{lim=30;pintar()},200));
$("rMas").onclick=()=>{lim+=30;pintar()};
try{await espera(async()=>{await cargar();pintar();return true},"Cargando…")}catch(e){$("rL").innerHTML=`<div class="empty card">${esc(e.message)}</div>`}
})();
