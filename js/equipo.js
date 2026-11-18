/* DAYMARSV · Equipo y tareas: el administrador asigna tareas y ve a las personas y sus roles; cada persona avanza las suyas */
(async()=>{
"use strict";
const {db,esc,toast,mountSide,requireSession}=DAY;
const $=i=>document.getElementById(i);
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"equipo",me.rol);$("app").classList.remove("hidden");
const hoy=()=>{const x=new Date();return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0")};
const ES={pendiente:"Pendiente",en_curso:"En curso",hecha:"Hecha"},PR={alta:["Alta","pr-a"],media:["Media","pr-m"],baja:["Baja","pr-b"]};
let T=[],U=[],F={p:"",e:"abiertas"},TAB="tareas";
const nom=id=>{const u=U.find(x=>x.id===id);return u?u.nombre:(id===me.id?me.nombre:"Sin asignar")};
async function cargar(){
 const a=db.from("tareas").select("*").order("created_at",{ascending:false}).limit(500),b=ADM?db.from("profiles").select("id,nombre,rol,activo,modulos_ocultos,email").order("nombre"):Promise.resolve({data:[]});
 const [r1,r2]=await Promise.all([a,b]);if(r1.error)throw new Error(r1.error.message);T=r1.data||[];U=r2.data||[];if(!ADM)U=[{id:me.id,nombre:me.nombre}]}
const vencida=t=>t.estado!=="hecha"&&t.vence&&t.vence<hoy();
function tarjeta(t){
 const pr=PR[t.prioridad]||PR.media,sig=t.estado==="pendiente"?["en_curso","Empezar"]:t.estado==="en_curso"?["hecha","Marcar hecha"]:["pendiente","Reabrir"];
 return `<div class="tk${vencida(t)?" vc":""}"><b>${esc(t.titulo)}</b>${t.detalle?`<p>${esc(t.detalle)}</p>`:""}<div class="mt2"><span class="${pr[1]}">● ${pr[0]}</span>${t.vence?`<span>${vencida(t)?"Vencida: ":"Vence: "}${t.vence}</span>`:""}${ADM?`<span>→ ${esc(nom(t.asignado_a))}</span>`:""}</div>
 <div class="ac"><button class="btn sm" data-st="${t.id}" data-to="${sig[0]}">${sig[1]}</button>${t.estado==="en_curso"?`<button class="btn g sm" data-st="${t.id}" data-to="pendiente">Volver a pendiente</button>`:""}${ADM?`<button class="btn g sm" data-ed="${t.id}">Editar</button><button class="btn g sm" data-del="${t.id}" style="color:var(--bad)">Eliminar</button>`:""}</div></div>`}
function pintarTareas(){
 let L=T.filter(t=>(!F.p||t.asignado_a===F.p)&&(F.e==="todas"||(F.e==="abiertas"?t.estado!=="hecha":t.estado===F.e)));
 const k=e=>T.filter(t=>t.estado===e&&(!F.p||t.asignado_a===F.p)).length,vc=T.filter(t=>vencida(t)&&(!F.p||t.asignado_a===F.p)).length;
 const cols=["pendiente","en_curso","hecha"].map(e=>{const X=L.filter(t=>t.estado===e).sort((a,b)=>(a.vence||"9")<(b.vence||"9")?-1:1);return `<div class="cl"><h4><span>${ES[e]}</span><span>${X.length}</span></h4>${X.map(tarjeta).join("")||'<small style="color:var(--mute)">Nada aquí</small>'}</div>`}).join("");
 $("tc").innerHTML=`<div class="dbk"><div class="kc w"><span>Pendientes</span><b>${k("pendiente")}</b></div><div class="kc g"><span>En curso</span><b>${k("en_curso")}</b></div><div class="kc o"><span>Hechas</span><b>${k("hecha")}</b></div><div class="kc"><span>Vencidas</span><b style="color:${vc?"var(--bad)":"inherit"}">${vc}</b></div></div>
 <div class="tbc">${ADM?`<select id="fP"><option value="">Todo el equipo</option>${U.filter(u=>u.activo!==false).map(u=>`<option value="${u.id}"${F.p===u.id?" selected":""}>${esc(u.nombre)}</option>`).join("")}</select>`:""}<select id="fE"><option value="abiertas"${F.e==="abiertas"?" selected":""}>Abiertas</option><option value="todas"${F.e==="todas"?" selected":""}>Todas</option><option value="hecha"${F.e==="hecha"?" selected":""}>Solo hechas</option></select></div><div class="col">${cols}</div>`;
 if($("fP"))$("fP").onchange=e=>{F.p=e.target.value;pintarTareas()};$("fE").onchange=e=>{F.e=e.target.value;pintarTareas()}}
function pintarPersonas(){
 const ab={};T.filter(t=>t.estado!=="hecha").forEach(t=>ab[t.asignado_a]=(ab[t.asignado_a]||0)+1);
 $("tc").innerHTML=`<div class="pn s12"><div class="mhd"><h3>Personas y roles</h3><a class="btn" href="usuarios.html">Gestionar roles y permisos</a></div><p class="hint">Aquí ves a tu equipo y cuántas tareas abiertas tiene cada quien. Para invitar personas, cambiar su rol o decidir qué módulos pueden ver, usa "Gestionar roles y permisos" (solo el administrador principal puede cambiarlos).</p>
 ${U.map(u=>`<div class="pe"><div class="ti"><b>${esc(u.nombre)}</b><br><small>${esc(u.email||"")}</small></div><span class="bd ${u.rol==="admin"?"pu":"bl2"}">${u.rol==="admin"?"Administrador":"Vendedor"}</span>${u.activo===false?'<span class="bd mu">Desactivado</span>':""}${u.rol!=="admin"?`<small>${Array.isArray(u.modulos_ocultos)&&u.modulos_ocultos.length?u.modulos_ocultos.length+" módulos ocultos":"Todos los módulos"}</small>`:"<small>Ve todo</small>"}<span class="bd ${ab[u.id]?"w":"ok"}">${ab[u.id]||0} tarea${(ab[u.id]||0)===1?"":"s"} abierta${(ab[u.id]||0)===1?"":"s"}</span></div>`).join("")}</div>`}
function pintar(){
 $("dash").innerHTML=(ADM?`<div class="rb"><div class="seg2" id="tb"><button data-t="tareas" class="${TAB==="tareas"?"on":""}">Tareas</button><button data-t="personas" class="${TAB==="personas"?"on":""}">Personas y roles</button></div></div>`:`<p class="hint">Estas son las tareas que te asignaron. Avanza su estado cuando empieces o termines.</p>`)+'<div id="tc"></div>';
 if($("tb"))$("tb").onclick=e=>{const b=e.target.closest("[data-t]");if(b){TAB=b.dataset.t;pintar()}};
 TAB==="personas"&&ADM?pintarPersonas():pintarTareas()}
async function rpc(fn,args,ok){const r=await db.rpc(fn,args);if(r.error){toast("No se pudo: "+r.error.message);return false}if(ok)toast(ok);await cargar();pintar();return true}
function formulario(t){
 const d=document.createElement("dialog");d.style.cssText="border:0;border-radius:16px;padding:0;width:min(460px,94vw);max-height:92vh;background:var(--card);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)";
 const act=U.filter(u=>u.activo!==false);
 d.innerHTML=`<style>dialog::backdrop{background:rgba(0,0,0,.55)}</style><form method="dialog" class="eqf" style="display:flex;flex-direction:column;gap:12px;padding:18px;margin:0;width:auto;max-width:none"><h3 style="margin:0">${t?"Editar tarea":"Nueva tarea"}</h3>
 <label>Título<input id="xT" maxlength="120" value="${esc(t?t.titulo:"")}" placeholder="Ej. Contar el stock de aretes"></label>
 <label>Detalle (opcional)<textarea id="xD" rows="3" maxlength="600">${esc(t&&t.detalle||"")}</textarea></label>
 <label>Asignar a<select id="xA"><option value="">Sin asignar</option>${act.map(u=>`<option value="${u.id}"${t&&t.asignado_a===u.id?" selected":""}>${esc(u.nombre)}${u.rol==="admin"?" (admin)":""}</option>`).join("")}</select></label>
 <div class="eqr"><label>Prioridad<select id="xP">${["alta","media","baja"].map(p=>`<option value="${p}"${(t?t.prioridad:"media")===p?" selected":""}>${PR[p][0]}</option>`).join("")}</select></label><label>Fecha límite<input type="date" id="xV" value="${t&&t.vence||""}"></label></div>
 <div class="eqb"><button class="btn g" value="x">Cancelar</button><button class="btn" id="xOk" value="ok">Guardar</button></div></form>`;
 document.body.appendChild(d);d.showModal();d.addEventListener("close",()=>d.remove());
 d.querySelector("#xOk").onclick=async e=>{e.preventDefault();const tt=d.querySelector("#xT").value.trim();if(!tt){toast("Escribe un título");return}
  const a={p_titulo:tt,p_detalle:d.querySelector("#xD").value,p_asignado:d.querySelector("#xA").value||null,p_prioridad:d.querySelector("#xP").value,p_vence:d.querySelector("#xV").value||null};
  const ok=t?await rpc("editar_tarea",{p_id:t.id,...a},"Tarea actualizada"):await rpc("crear_tarea",a,"Tarea creada");if(ok)d.close()}}
$("dash").addEventListener("click",async e=>{
 const s=e.target.closest("[data-st]"),ed=e.target.closest("[data-ed]"),del=e.target.closest("[data-del]");
 if(s)await rpc("estado_tarea",{p_id:s.dataset.st,p_estado:s.dataset.to});
 else if(ed)formulario(T.find(x=>x.id===ed.dataset.ed));
 else if(del&&await DAY.ask("Se eliminará esta tarea. No se puede deshacer.",{titulo:"Eliminar tarea",ok:"Eliminar",peligro:true}))await rpc("eliminar_tarea",{p_id:del.dataset.del},"Tarea eliminada")});
if(ADM){$("bNew").classList.remove("hidden");$("bNew").onclick=()=>formulario(null)}
try{await cargar();pintar()}catch(e){$("dash").innerHTML='<div class="nod">No se pudieron cargar las tareas: '+esc(e.message||e)+'</div>'}
})();
