/* DAYMAR-SHOP · Actividad: quién hizo qué (solo administradores) */
(async()=>{
"use strict";
const {db,esc,ymd,mountSide,requireSession}=DAY;
const {$,fdate,ftime,deb,espera,norm}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"actividad",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
const TB={cot_lotes:"Lote de cotización",ventas:"Venta",productos:"Producto",clientes:"Cliente",proveedores:"Proveedor",categorias:"Categoría",fin_movimientos:"Movimiento financiero",fin_cuentas:"Cuenta",facturas:"Factura",promo_codigos:"Código promo",cierres_caja:"Cierre de caja",config_negocio:"Datos del negocio",capital_movs:"Capital",reservas:"Reserva",reserva_abonos:"Abono de reserva",profiles:"Usuario"};
const AC={crear:["Creó","ok"],editar:["Editó","wa"],eliminar:["Eliminó","or"],anular:["Anuló","or"],eliminar_venta:["Eliminó una venta","or"]};
const CAMPO={nombre:"Nombre",precio_costo:"Costo",precio_venta:"Precio",stock_minimo:"Stock mínimo",activo:"Activo",descuento_pct:"Descuento %",estado:"Estado",rol:"Rol",monto:"Monto",total:"Total",categoria_id:"Categoría",proveedor_id:"Proveedor"};
let U=[],L=[],ult=[],lim=100,fin=false;
const v=x=>x===null||x===undefined?"—":typeof x==="boolean"?(x?"Sí":"No"):String(x);
const OCULTOS=["eliminado_en","updated_at","created_at"];
const corto=s=>s.length>70?s.slice(0,67)+"…":s;
function cambios(c){if(!c)return"";return Object.keys(c).filter(k=>!OCULTOS.includes(k)).map(k=>k==="foto_url"?`<div class="df2"><span>Foto</span> <b>actualizada</b></div>`:`<div class="df2"><span>${esc(CAMPO[k]||k)}</span> <s>${esc(corto(v(c[k].antes)))}</s> → <b>${esc(corto(v(c[k].despues)))}</b></div>`).join("")}
function fila(b){const a=AC[b.accion]||[b.accion,"mu"];
 return `<div class="rw"><div class="th ph">${esc((b.usuario_nombre||"?")[0].toUpperCase())}</div><div class="ti"><b>${esc(b.usuario_nombre||"Sistema")}</b> <span class="bd ${a[1]}">${a[0]}</span> ${b.accion==="eliminar_venta"?"":esc(TB[b.tabla]||b.tabla)}
 <small>${b.resumen?esc(b.resumen)+" · ":""}${fdate(b.created_at)} ${ftime(b.created_at)}</small>${cambios(b.cambios)}</div></div>`}
async function cargar(){
 const u=$("aU").value,t=$("aT").value,d=$("aD").value,h=$("aH").value;
 let q=db.from("bitacora").select("*").order("created_at",{ascending:false}).limit(lim+1);
 if(u)q=q.eq("usuario_id",u);if(t)q=q.eq("tabla",t);
 if(d)q=q.gte("created_at",new Date(d+"T00:00:00").toISOString());
 if(h){const x=new Date(h+"T00:00:00");x.setDate(x.getDate()+1);q=q.lt("created_at",x.toISOString())}
 const {data,error}=await q;if(error)throw new Error(error.message);
 fin=data.length>lim;L=data.slice(0,lim)}
function pintar(){
 const s=norm($("aQ").value),R=s?L.filter(b=>norm((b.resumen||"")+" "+(b.usuario_nombre||"")+" "+(TB[b.tabla]||"")).includes(s)):L;
 $("aL").innerHTML=R.length?R.map(fila).join(""):`<div class="empty card">No hay actividad con esos filtros.</div>`;
 $("aMas").classList.toggle("hidden",!fin)}
function pintarUlt(){
 const vs=ult.filter(b=>b.tabla==="ventas"&&b.accion==="crear");
 const k=(t,b)=>b?`<div><span>${t}</span><b>${esc(b.usuario_nombre||"—")}</b><small>${fdate(b.created_at)} ${ftime(b.created_at)}${b.resumen?" · "+esc(b.resumen):""}</small></div>`:`<div><span>${t}</span><b>—</b></div>`;
 const hoy=ymd(new Date());
 $("aK").innerHTML=k("Última venta",vs[0])+k("Venta anterior",vs[1])+`<div><span>Movimientos hoy</span><b>${ult.filter(b=>ymd(new Date(b.created_at))===hoy).length}</b></div>`}
async function todo(){const ok=await espera(async()=>{
  const [a,b]=await Promise.all([db.from("profiles").select("id,nombre,rol").order("nombre"),db.from("bitacora").select("*").order("created_at",{ascending:false}).limit(300)]);
  if(a.error)throw new Error(a.error.message);if(b.error)throw new Error(b.error.message);U=a.data;ult=b.data;await cargar();return true});
 if(ok){if($("aU").options.length<2)$("aU").innerHTML=`<option value="">Todos los usuarios</option>`+U.map(u=>`<option value="${u.id}">${esc(u.nombre)} (${u.rol==="admin"?"admin":"vendedor"})</option>`).join("");pintarUlt();pintar()}}
$("aT").innerHTML=`<option value="">Todo</option>`+Object.keys(TB).map(k=>`<option value="${k}">${TB[k]}</option>`).join("");
const rec=async()=>{lim=100;const ok=await espera(async()=>{await cargar();return true});if(ok)pintar()};
["aU","aT","aD","aH"].forEach(i=>$(i).addEventListener("change",rec));
$("aQ").addEventListener("input",deb(pintar,150));
$("aMas").onclick=async()=>{lim+=200;const ok=await espera(async()=>{await cargar();return true});if(ok)pintar()};
/* ---------- inicios de sesión ---------- */
let AC2=[];
const ICO={Celular:"📱",Tablet:"📲",Computadora:"💻"};
function pintarAcc(){const u=$("aU").value;
 const R=AC2.filter(x=>!u||x.usuario_id===u);
 const nuevos=AC2.filter(x=>x.nuevo&&x.exito&&Date.now()-new Date(x.created_at)<7*864e5),fall=AC2.filter(x=>!x.exito&&Date.now()-new Date(x.created_at)<864e5);
 $("aAl").innerHTML=(nuevos.length?`<div class="alert warn"><div><b>${nuevos.length} inicio(s) desde un dispositivo nuevo esta semana</b>${nuevos.slice(0,3).map(x=>esc(x.nombre||x.email)+" ("+esc(x.dispositivo)+" · "+esc(x.navegador)+")").join(", ")}${nuevos.length>3?"…":""}. Si no los reconoces, cambia la contraseña de esa cuenta.</div></div>`:"")+(fall.length>=3?`<div class="alert bad"><div><b>${fall.length} intentos fallidos en las últimas 24 horas</b>Revisa la lista de abajo.</div></div>`:"");
 $("aAcc").innerHTML=R.length?R.map(x=>`<div class="rw"><div class="th ph">${ICO[x.dispositivo]||"💻"}</div><div class="ti"><b>${esc(x.nombre||x.email||"—")}</b> ${x.exito?"":'<span class="bd or">Intento fallido</span>'} ${x.nuevo&&x.exito?'<span class="bd wa">Dispositivo nuevo</span>':""}
  <small style="display:block">${esc(x.dispositivo||"")} · ${esc(x.sistema||"")} · ${esc(x.navegador||"")}</small><small style="display:block">${fdate(x.created_at)} ${ftime(x.created_at)}${x.ip?" · IP "+esc(x.ip):""}</small></div></div>`).join(""):`<div class="empty card">Aún no hay inicios de sesión registrados. Se irán anotando desde ahora.</div>`;
 const nb=$("aNb"),n=nuevos.length;nb.textContent=n;nb.classList.toggle("hidden",!n)}
async function cargarAcc(){const {data,error}=await db.from("accesos").select("*").order("created_at",{ascending:false}).limit(300);if(!error)AC2=data||[];pintarAcc()}
$("aSg").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(!b)return;
 $("aSg").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));const acc=b.dataset.t==="acc";
 $("pAct").classList.toggle("hidden",acc);$("pAcc").classList.toggle("hidden",!acc);$("aHint").classList.toggle("hidden",acc);
 if(acc){document.querySelector(".fl").classList.add("hidden");cargarAcc()}else document.querySelector(".fl").classList.remove("hidden")});
await todo();cargarAcc();
})();
