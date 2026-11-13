/* DAYMAR-SHOP · Reseñas de la tienda (conectado a Supabase) */
(async()=>{
"use strict";
const {db,esc,toast,mountSide,requireSession}=DAY;
const {$,modal,confirmar,fdate}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"resenas",me.rol);$("app").classList.remove("hidden");
let L=[];
const est=n=>"★".repeat(n)+"☆".repeat(5-n);
async function cargar(){const {data,error}=await db.from("resenas_tienda").select("*").order("created_at",{ascending:false});
 if(error){$("rsL").innerHTML='<p class="hint">No se pudo cargar. Si es la primera vez, espera a que se aplique la migración 081.</p>';return}
 L=data||[];pintar()}
function pintar(){
 $("rsL").innerHTML=L.length?L.map(r=>`<div class="card" style="margin-bottom:10px;${r.visible?"":"opacity:.55"}">
  <div style="display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap">
   <div style="min-width:0"><b>${esc(r.nombre)}</b> <span style="color:#b8860b;letter-spacing:2px">${est(r.estrellas)}</span>${r.producto?` <small>· ${esc(r.producto)}</small>`:""}<br><small>${fdate(r.created_at)}${r.visible?"":" · oculta"}</small></div>
   <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn g sm" data-vis="${r.id}" type="button">${r.visible?"Ocultar":"Mostrar"}</button><button class="btn g sm" data-ed="${r.id}" type="button">Editar</button><button class="btn dg sm" data-del="${r.id}" type="button">Borrar</button></div>
  </div><p style="margin:8px 0 0">${esc(r.texto)}</p></div>`).join(""):'<p class="hint">Aún no hay reseñas. Toca “Nueva reseña”.</p>'}
function form(r){return new Promise(ok=>{let res=null;
 const m=modal(r?"Editar reseña":"Nueva reseña",`<label>Nombre de la clienta</label><input id="rsN" maxlength="40" value="${esc(r?r.nombre:"")}" placeholder="Ej. María G.">
  <label>Estrellas</label><select id="rsE">${[5,4,3,2,1].map(n=>`<option value="${n}" ${(r?r.estrellas:5)===n?"selected":""}>${est(n)}</option>`).join("")}</select>
  <label>Producto (opcional)</label><input id="rsP" maxlength="60" value="${esc(r&&r.producto||"")}" placeholder="Ej. Anillo de plata 925">
  <label>Lo que dijo</label><textarea id="rsT" rows="4" maxlength="280" placeholder="Máximo 280 letras">${esc(r?r.texto:"")}</textarea><div class="err2" id="rsX" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="rsOk">Guardar</button>`,onclose:()=>ok(res)});
 m.q("#rsOk").onclick=()=>{const nombre=m.q("#rsN").value.trim(),texto=m.q("#rsT").value.trim();
  if(!nombre||texto.length<5){m.q("#rsX").textContent="Escribe el nombre y lo que dijo.";return}
  res={nombre,texto,estrellas:+m.q("#rsE").value,producto:m.q("#rsP").value.trim()||null};m.close()};
 setTimeout(()=>m.q("#rsN").focus(),50)})}
$("rsNew").onclick=async()=>{const v=await form();if(!v)return;const {error}=await db.from("resenas_tienda").insert(v);if(error){toast("No se pudo guardar: "+error.message);return}toast("Reseña agregada");cargar()};
$("rsL").addEventListener("click",async e=>{
 const b=e.target.closest("[data-vis],[data-ed],[data-del]");if(!b)return;
 const id=b.dataset.vis||b.dataset.ed||b.dataset.del,r=L.find(x=>x.id===id);if(!r)return;
 if(b.dataset.vis){const {error}=await db.from("resenas_tienda").update({visible:!r.visible}).eq("id",id);if(error)toast("Error: "+error.message);else cargar();return}
 if(b.dataset.ed){const v=await form(r);if(!v)return;const {error}=await db.from("resenas_tienda").update(v).eq("id",id);if(error)toast("Error: "+error.message);else{toast("Guardada");cargar()}return}
 if(b.dataset.del){if(!await confirmar("¿Borrar la reseña de <b>"+esc(r.nombre)+"</b>? No se puede deshacer.",{titulo:"Borrar reseña",ok:"Borrar",peligro:true}))return;
  const {error}=await db.from("resenas_tienda").delete().eq("id",id);if(error)toast("Error: "+error.message);else{toast("Borrada");cargar()}}});
cargar();
})();
