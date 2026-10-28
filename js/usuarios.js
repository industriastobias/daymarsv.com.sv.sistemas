/* DAYMAR-SHOP · Usuarios (invitaciones y roles). Solo el administrador principal puede cambiar algo. */
(async()=>{
"use strict";
const {db,esc,toast,mountSide,requireSession}=DAY;
const {$,fdate,rpc,espera,confirmar,pedirClave}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
const PRINCIPAL="aehtobias@gmail.com";
let EMAIL="";try{EMAIL=(await db.auth.getSession()).data.session.user.email.toLowerCase()}catch(e){}
const ESP=EMAIL===PRINCIPAL;
mountSide($("side"),"usuarios",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
if(!ESP)$("inv").classList.add("hidden"),$("soloP").classList.remove("hidden");
let U=[],I=[];
async function cargar(){
 const [a,b]=await Promise.all([db.from("profiles").select("*").order("created_at"),db.from("invitaciones").select("*").eq("usada",false).order("created_at",{ascending:false})]);
 if(a.error)throw new Error(a.error.message);U=a.data||[];I=b.data||[]}
function pintar(){
 const ad=U.filter(u=>u.rol==="admin"&&u.activo).length,ve=U.filter(u=>u.rol==="vendedor"&&u.activo).length;
 $("uKpi").innerHTML=`<div><span>Administradores</span><b>${ad}</b></div><div><span>Vendedores</span><b>${ve}</b></div><div><span>Invitaciones pendientes</span><b>${I.length}</b></div>`;
 $("iList").innerHTML=I.length?I.map(i=>`<div class="rw"><div class="th ph">✉</div><div class="ti"><b>${esc(i.email)}</b><small>${i.rol==="admin"?"Administrador":"Vendedor"}${i.nombre?" · "+esc(i.nombre):""} · invitado ${fdate(i.created_at)}</small></div><span class="bd or">Esperando registro</span>${ESP?`<button class="btn g sm" data-qi="${esc(i.email)}" style="color:var(--bad)">Quitar</button>`:""}</div>`).join(""):`<div class="empty card">No hay invitaciones pendientes.</div>`;
 $("uList").innerHTML=U.map(u=>{const pr=(u.email||"").toLowerCase()===PRINCIPAL;
  return `<div class="rw"><div class="th ph">${esc((u.nombre||"?")[0].toUpperCase())}</div><div class="ti"><b>${esc(u.nombre)}${pr?' <span class="bd ok">Principal</span>':""}</b><small>${esc(u.email||"sin correo")} · desde ${fdate(u.created_at)}</small></div>
  <span class="bd ${u.rol==="admin"?"pu":"bl2"}">${u.rol==="admin"?"Administrador":"Vendedor"}</span>${u.activo?"":'<span class="bd mu">Desactivado</span>'}
  ${ESP&&!pr?`<button class="btn g sm" data-rol="${u.id}">Hacer ${u.rol==="admin"?"vendedor":"administrador"}</button><button class="btn g sm" data-act="${u.id}" ${u.activo?'style="color:var(--bad)"':""}>${u.activo?"Desactivar":"Activar"}</button>`:""}</div>`}).join("")}
$("iAdd").onclick=async()=>{const em=$("iEm").value.trim().toLowerCase(),rol=$("iRol").value;
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){toast("Escribe un correo válido");return}
 const ok=await espera(async()=>{await rpc("invitar_usuario",{p_email:em,p_rol:rol,p_nombre:$("iNom").value.trim()||null});return true});
 if(ok){$("iEm").value="";$("iNom").value="";toast("Invitación creada. Ya puede crear su cuenta con ese correo.");await cargar();pintar()}};
$("iList").addEventListener("click",async e=>{const b=e.target.closest("[data-qi]");if(!b)return;
 if(!await confirmar("Se quitará la invitación de <b>"+esc(b.dataset.qi)+"</b>. Ya no podrá crear su cuenta.",{titulo:"Quitar invitación",ok:"Quitar",peligro:true}))return;
 const ok=await espera(async()=>{await rpc("quitar_invitacion",{p_email:b.dataset.qi});return true});if(ok){await cargar();pintar()}});
$("uList").addEventListener("click",async e=>{
 const r=e.target.closest("[data-rol]"),a=e.target.closest("[data-act]");
 if(r){const u=U.find(x=>x.id===r.dataset.rol),nr=u.rol==="admin"?"vendedor":"admin";
  if(!await pedirClave("Vas a cambiar el rol de "+u.nombre+" a "+(nr==="admin"?"administrador":"vendedor")+"."))return;
  const ok=await espera(async()=>{await rpc("cambiar_rol_usuario",{p_id:u.id,p_rol:nr});return true});if(ok){toast("Rol actualizado");await cargar();pintar()}}
 if(a){const u=U.find(x=>x.id===a.dataset.act);
  if(!await confirmar(u.activo?`<b>${esc(u.nombre)}</b> ya no podrá entrar al sistema. Sus ventas se conservan.`:`<b>${esc(u.nombre)}</b> podrá volver a entrar.`,{titulo:u.activo?"Desactivar cuenta":"Activar cuenta",ok:u.activo?"Desactivar":"Activar",peligro:u.activo}))return;
  const ok=await espera(async()=>{await rpc("activar_usuario",{p_id:u.id,p_activo:!u.activo});return true});if(ok){toast(u.activo?"Cuenta desactivada":"Cuenta activada");await cargar();pintar()}}});
await espera(async()=>{await cargar()},"Cargando usuarios…");pintar();
})();
