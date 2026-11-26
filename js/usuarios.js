/* DAYMAR-SHOP · Usuarios: cuentas del equipo (diseño «3 · Tarjetas del equipo»), invitaciones y roles.
   Solo el administrador principal (o el dueño) puede cambiar algo. */
(async()=>{
"use strict";
const {db,esc,toast,mountSide,requireSession}=DAY;
const {$,fdate,rpc,espera,confirmar,pedirClave,modal}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
const PRINCIPAL="aehtobias@gmail.com",DOM="@daymarjewelry.com";
let EMAIL="";try{EMAIL=(await db.auth.getSession()).data.session.user.email.toLowerCase()}catch(e){}
const DUENO=DAY.dueno===true||EMAIL===PRINCIPAL;/* solo el dueño nombra o quita principales */
const ESP=DUENO||(me.rol==="admin"&&me.principal===true);
mountSide($("side"),"usuarios",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
$("inv").classList.add("hidden");/* la invitación por correo se abre desde «+ Nueva cuenta» */
let U=[],I=[];
async function cargar(){
 const [a,b]=await Promise.all([db.from("profiles").select("*").order("created_at"),db.from("invitaciones").select("*").eq("usada",false).order("created_at",{ascending:false})]);
 if(a.error)throw new Error(a.error.message);U=a.data||[];I=b.data||[]}
const esDueno=u=>(u.email||"").toLowerCase()===PRINCIPAL;
const otroPri=u=>u.principal&&u.rol==="admin";
const puede=u=>ESP&&!esDueno(u)&&(DUENO||!otroPri(u));
/* contraseña al azar fácil de dictar: sin letras que se confunden (l/1, O/0) */
function genClave(){const L="abcdefghjkmnpqrstuvwxyz",N="23456789",a=new Uint32Array(8);crypto.getRandomValues(a);
 const p=i=>(i%2?N:L)[a[i]%(i%2?N.length:L.length)];return p(0).toUpperCase()+p(2)+p(4)+p(1)+p(3)+"-"+p(6)+p(5)+p(7)+p(3)}
function pintar(){
 const ad=U.filter(u=>u.rol==="admin"&&u.activo).length,ve=U.filter(u=>u.rol==="vendedor"&&u.activo).length;
 $("uKpi").innerHTML=`<div><span>Administradores</span><b>${ad}</b></div><div><span>Vendedores</span><b>${ve}</b></div><div><span>Invitaciones pendientes</span><b>${I.length}</b></div>`;
 $("iWrap").classList.toggle("hidden",!I.length);
 $("iList").innerHTML=I.map(i=>`<div class="rw"><div class="th ph">✉</div><div class="ti"><b>${esc(i.email)}</b><small>${i.rol==="admin"?"Administrador":"Vendedor"}${i.nombre?" · "+esc(i.nombre):""} · invitado ${fdate(i.created_at)}</small></div><span class="bd or">Esperando registro</span>${ESP?`<button class="btn g sm" data-qi="${esc(i.email)}" style="color:var(--bad)">Quitar</button>`:""}</div>`).join("");
 $("uList").innerHTML=U.map(u=>{const pr=esDueno(u),ok=puede(u),yo=u.id===me.id;
  const bdg=pr?'<span class="bd ok">Dueño</span>':otroPri(u)?'<span class="bd ok">Principal</span>':"";
  const rol=`<span class="bd ${u.rol==="admin"?"pu":"bl2"}">${u.rol==="admin"?"Administrador":"Vendedor"}</span>`;
  const est=u.activo?"":' <span class="bd mu">Desactivada</span>';
  const btns=[];
  if(ok&&!yo)btns.push(`<button class="btn g" data-pw="${u.id}">Contraseña</button>`);
  if(ok&&u.rol!=="admin")btns.push(`<button class="btn g" data-perm="${u.id}">Permisos${Array.isArray(u.modulos_ocultos)&&u.modulos_ocultos.length?" ("+u.modulos_ocultos.length+")":""}</button>`);
  if(ESP&&!pr&&!yo)btns.push(`<button class="btn g" data-mas="${u.id}" aria-label="Más opciones de ${esc(u.nombre)}">•••</button>`);
  return `<div class="uc${u.activo?"":" off"}"><div class="av">${u.avatar?`<img src="${esc(u.avatar)}" alt="">`:esc((u.nombre||"?")[0].toUpperCase())}</div>
   <div><b>${esc(u.nombre)}</b> ${bdg}${rol}${est}<small>${esc(u.email||"sin correo")} · desde ${fdate(u.created_at)}</small></div>
   ${btns.length?`<div class="ab">${btns.join("")}</div>`:""}</div>`}).join("")}
/* ---- + Nueva cuenta (sin correo real) ---- */
if(ESP){
 $("nCta").innerHTML=`<details class="ncta" id="nDet"><summary>+ Nueva cuenta <small>para tu equipo</small></summary>
  <p class="hint" style="margin:8px 0 0">Entran con el usuario y la contraseña que tú les das. No necesitan correo real.</p>
  <label for="nNom">Nombre</label><input id="nNom" maxlength="60" autocomplete="off" placeholder="Ej.: Carla Pérez">
  <label for="nUsr">Usuario</label><div class="uem"><input id="nUsr" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="vendedor1"><span>${DOM}</span></div>
  <div class="n2"><div><label for="nRol">Rol</label><select id="nRol"><option value="vendedor">Vendedor</option><option value="admin">Administrador</option></select></div>
  <div><label for="nPw">Contraseña</label><div class="pwx"><input id="nPw" autocomplete="new-password" autocapitalize="none" spellcheck="false" maxlength="72"><button type="button" class="gen" id="nGen">Generar</button></div></div></div>
  <button class="btn" id="nAdd" type="button" style="width:100%;margin-top:14px">Crear cuenta</button>
  <button type="button" class="ninv" id="nInv">¿Tiene correo real? Invitar por correo</button></details>`;
 $("nPw").value=genClave();$("nGen").onclick=()=>{$("nPw").value=genClave()};
 $("nUsr").addEventListener("input",e=>{const v=e.target.value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/@.*$/,"").replace(/[^a-z0-9._-]/g,"");if(v!==e.target.value)e.target.value=v});
 $("nInv").onclick=()=>{$("inv").classList.toggle("hidden");if(!$("inv").classList.contains("hidden"))$("inv").scrollIntoView({behavior:"smooth",block:"start"})};
 $("nAdd").onclick=async()=>{const nom=$("nNom").value.trim(),usr=$("nUsr").value.trim(),rol=$("nRol").value,pw=$("nPw").value;
  if(!nom){toast("Escribe el nombre de la persona");$("nNom").focus();return}
  if(!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(usr)){toast("El usuario debe tener de 2 a 30 letras o números, sin espacios");$("nUsr").focus();return}
  if(pw.length<8){toast("La contraseña debe tener al menos 8 caracteres");$("nPw").focus();return}
  const ok=await espera(async()=>{await rpc("crear_cuenta_equipo",{p_nombre:nom,p_usuario:usr,p_rol:rol,p_clave:pw});return true});
  if(!ok)return;
  $("nNom").value="";$("nUsr").value="";$("nPw").value=genClave();$("nDet").open=false;
  await cargar();pintar();tarjetaAcceso(nom,usr+DOM,pw,"Cuenta creada ✓")};
}
/* Tarjeta con los datos para entrar: copiar o mandar por WhatsApp */
function tarjetaAcceso(nom,mail,pw,titulo){
 const txt=`Hola ${nom}, estos son tus datos para entrar al sistema DAYMARSV:\nUsuario: ${mail}\nContraseña: ${pw}\nEntra aquí: ${new URL("index.html",location.href).href}`;
 const m=modal(esc(titulo),`<p class="hint" style="margin:0 0 10px">Dale estos datos a <b>${esc(nom)}</b>. Por seguridad, no se vuelven a mostrar.</p>
  <div class="acard"><small>Usuario</small><div>${esc(mail)}</div><small>Contraseña</small><div style="letter-spacing:.04em">${esc(pw)}</div></div>`,
  {foot:`<button class="btn g" id="aCp">Copiar</button><button class="btn g" id="aWa">WhatsApp</button><button class="btn" data-x>Listo</button>`,fijo:true});
 m.q("#aCp").onclick=async()=>{try{await navigator.clipboard.writeText(txt);toast("Datos copiados")}catch(e){toast("No se pudo copiar")}};
 m.q("#aWa").onclick=()=>{window.open("https://wa.me/?text="+encodeURIComponent(txt),"_blank","noopener")}}
/* ---- invitaciones por correo (como antes) ---- */
$("iAdd").onclick=async()=>{const em=$("iEm").value.trim().toLowerCase(),rol=$("iRol").value;
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){toast("Escribe un correo válido");return}
 const ok=await espera(async()=>{await rpc("invitar_usuario",{p_email:em,p_rol:rol,p_nombre:$("iNom").value.trim()||null});return true});
 if(ok){$("iEm").value="";$("iNom").value="";toast("Invitación creada. Ya puede crear su cuenta con ese correo.");await cargar();pintar()}};
$("iList").addEventListener("click",async e=>{const b=e.target.closest("[data-qi]");if(!b)return;
 if(!await confirmar("Se quitará la invitación de <b>"+esc(b.dataset.qi)+"</b>. Ya no podrá crear su cuenta.",{titulo:"Quitar invitación",ok:"Quitar",peligro:true}))return;
 const ok=await espera(async()=>{await rpc("quitar_invitacion",{p_email:b.dataset.qi});return true});if(ok){await cargar();pintar()}});
/* ---- acciones de cada persona ---- */
async function accion(tipo,u){
 if(tipo==="pri"){const si=!u.principal;
  if(!await confirmar(si?`<b>${esc(u.nombre)}</b> tendrá tus mismos poderes: Finanzas, borrar Actividad y facturas, Conteo físico, usuarios, roles, permisos y cerrar sesiones.<p class="pw">Solo tú podrás quitarle el principal. Nadie podrá cambiar tu cuenta.</p>`:`<b>${esc(u.nombre)}</b> seguirá siendo administrador, pero ya no tendrá los poderes del principal.`,{titulo:si?"Nombrar principal":"Quitar principal",ok:si?"Nombrar principal":"Quitar principal",peligro:!si}))return;
  if(si&&!await pedirClave("Vas a darle a "+u.nombre+" los poderes del administrador principal."))return;
  const ok=await espera(async()=>{await rpc("marcar_principal",{p_id:u.id,p_si:si});return true});
  if(ok){toast(si?u.nombre+" ahora es principal. Se aplica cuando recargue el sistema.":"Ya no es principal");await cargar();pintar()}return}
 if(tipo==="perm"){const oc=new Set(Array.isArray(u.modulos_ocultos)?u.modulos_ocultos:[]);
  const mods=DAY.GRUPOS.flatMap(g=>g.m.filter(m=>!m.adm&&!m.pri).map(m=>({...m,g:g.t})));
  const d=document.createElement("dialog");d.style.cssText="border:0;border-radius:16px;padding:0;width:min(460px,94vw);max-height:88vh;background:var(--card);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)";
  d.innerHTML=`<style>dialog::backdrop{background:rgba(0,0,0,.55)}</style><form method="dialog" style="padding:18px;display:grid;gap:10px"><h3 style="margin:0">Permisos de ${esc(u.nombre)}</h3><p class="hint" style="margin:0">Marca lo que esta persona puede ver y abrir. Los módulos solo para administradores no aparecen aquí: ya están bloqueados para vendedores.</p><div style="max-height:50vh;overflow:auto;display:grid;gap:4px">${mods.map(m=>`<label style="display:flex;gap:10px;align-items:center;padding:6px 4px"><input type="checkbox" data-k="${m.k}" ${oc.has(m.k)?"":"checked"}> <span>${esc(m.n)} <small style="color:var(--mute)">· ${esc(m.g)}</small></span></label>`).join("")}</div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn g" value="x">Cancelar</button><button class="btn" id="pOk" value="ok">Guardar</button></div></form>`;
  document.body.appendChild(d);d.showModal();d.addEventListener("close",()=>d.remove());
  d.querySelector("#pOk").onclick=async ev=>{ev.preventDefault();const ocultos=[...d.querySelectorAll("input[data-k]")].filter(x=>!x.checked).map(x=>x.dataset.k);
   const ok=await espera(async()=>{await rpc("guardar_modulos_usuario",{p_id:u.id,p_ocultos:ocultos});return true});
   if(ok){d.close();toast("Permisos guardados. Se aplican la próxima vez que "+u.nombre+" abra o recargue el sistema.");await cargar();pintar()}};return}
 if(tipo==="pw"){
  const m=modal("Contraseña de "+esc(u.nombre),`<p class="hint" style="margin:0 0 10px">Ponle una contraseña nueva a <b>${esc(u.nombre)}</b>. Se cerrará su sesión en todos sus dispositivos y entrará con la nueva.</p>
   <label for="cPw" style="display:block;font-size:13px;color:var(--mute);margin-bottom:4px">Contraseña nueva</label><div class="pwx"><input id="cPw" autocomplete="new-password" autocapitalize="none" spellcheck="false" maxlength="72" style="width:100%;box-sizing:border-box"><button type="button" class="gen" id="cGen">Generar</button></div>`,
   {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="cOk">Cambiar contraseña</button>`});
  m.q("#cPw").value=genClave();m.q("#cGen").onclick=()=>{m.q("#cPw").value=genClave()};
  m.q("#cOk").onclick=async()=>{const pw=m.q("#cPw").value;if(pw.length<8){toast("La contraseña debe tener al menos 8 caracteres");return}
   m.close();if(!await pedirClave("Vas a cambiar la contraseña de "+u.nombre+"."))return;
   const ok=await espera(async()=>{await rpc("cambiar_clave_equipo",{p_id:u.id,p_clave:pw});return true});
   if(ok){toast("Contraseña cambiada");tarjetaAcceso(u.nombre,u.email||"",pw,"Contraseña nueva ✓")}};return}
 if(tipo==="ses"){
  if(!await confirmar(`Se cerrará la sesión de <b>${esc(u.nombre)}</b> en todos sus dispositivos. Podrá volver a entrar con su clave.`,{titulo:"Cerrar sesión",ok:"Cerrar sesión",peligro:true}))return;
  const ok=await espera(async()=>{await rpc("cerrar_sesion_usuario",{p_id:u.id});return true});if(ok)toast("Sesión de "+u.nombre+" cerrada");return}
 if(tipo==="rol"){const nr=u.rol==="admin"?"vendedor":"admin";
  if(!await pedirClave("Vas a cambiar el rol de "+u.nombre+" a "+(nr==="admin"?"administrador":"vendedor")+"."))return;
  const ok=await espera(async()=>{await rpc("cambiar_rol_usuario",{p_id:u.id,p_rol:nr});return true});if(ok){toast("Rol actualizado");await cargar();pintar()}return}
 if(tipo==="act"){
  if(!await confirmar(u.activo?`<b>${esc(u.nombre)}</b> ya no podrá entrar al sistema. Sus ventas se conservan.`:`<b>${esc(u.nombre)}</b> podrá volver a entrar.`,{titulo:u.activo?"Desactivar cuenta":"Activar cuenta",ok:u.activo?"Desactivar":"Activar",peligro:u.activo}))return;
  const ok=await espera(async()=>{await rpc("activar_usuario",{p_id:u.id,p_activo:!u.activo});return true});if(ok){toast(u.activo?"Cuenta desactivada":"Cuenta activada");await cargar();pintar()}}}
/* ••• : el resto de opciones en una ventanita */
function masOpciones(u){const ok=puede(u),op=[];
 if(DUENO&&u.rol==="admin"&&u.activo)op.push(["pri",otroPri(u)?"Quitar principal":"Nombrar principal"]);
 if(ok)op.push(["rol","Hacer "+(u.rol==="admin"?"vendedor":"administrador")]);
 op.push(["ses","Cerrar sesión"]);
 if(ok)op.push(["act",u.activo?"Desactivar cuenta":"Activar cuenta"]);
 const m=modal(esc(u.nombre),`<div class="mlist">${op.map(([k,t])=>`<button class="btn g" data-op="${k}"${k==="act"&&u.activo?' style="color:var(--bad)"':""}>${esc(t)}</button>`).join("")}</div>`);
 m.el.addEventListener("click",e=>{const b=e.target.closest("[data-op]");if(!b)return;m.close();accion(b.dataset.op,u)})}
$("uList").addEventListener("click",e=>{const b=e.target.closest("[data-pw],[data-perm],[data-mas]");if(!b)return;
 const id=b.dataset.pw||b.dataset.perm||b.dataset.mas,u=U.find(x=>x.id===id);if(!u)return;
 if(b.dataset.mas)masOpciones(u);else accion(b.dataset.pw?"pw":"perm",u)});
if(ESP){const bt=document.createElement("button");bt.className="btn g sm";bt.id="cTodas";bt.style.cssText="color:var(--bad);margin:0 0 10px";bt.textContent="Cerrar la sesión de todos los demás";$("nCta").parentNode.insertBefore(bt,$("nCta"));
 bt.onclick=async()=>{if(!await confirmar("Se cerrará la sesión de <b>todas las demás personas</b> en todos sus dispositivos. La tuya no se cierra.",{titulo:"Cerrar todas las sesiones",ok:"Cerrar todas",peligro:true}))return;
  const ok=await espera(async()=>{await rpc("cerrar_todas_sesiones");return true});if(ok)toast("Sesiones cerradas")}}
await espera(async()=>{await cargar()},"Cargando usuarios…");pintar();
})();
