/* DAYMARSV · Historial de correos enviados (solo administradores) */
(async()=>{
"use strict";
const {esc,toast,mountSide,requireSession}=DAY;
const {$,fdate,ftime,deb,rpc,espera,modal}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"correos",me.rol);$("app").classList.remove("hidden");
const TIPO={factura:"Factura",recordatorio:"Recordatorio de pago",cierre:"Cierre de caja",anulacion:"Aviso de anulación",otro:"Otro"};
const EST={enviado:["ok","Enviado"],pendiente:["wa","En proceso"],error:["or","Con error"]};
let L=[];
async function cargar(){const d=await espera(()=>rpc("historial_correos",{p_limit:300}),"Cargando correos…");if(d){L=d;pintar()}}
function pintar(){
 const q=($("kQ").value||"").toLowerCase().trim(),t=$("kT").value,e=$("kE").value;
 const F=L.filter(x=>(!t||x.tipo===t)&&(!e||x.estado===e)&&(!q||[x.para,x.asunto,x.ref,x.usuario_nombre].join(" ").toLowerCase().includes(q)));
 const hoy=new Date().toDateString();
 $("kK").innerHTML=`<div><span>Enviados en total</span><b>${L.length}</b></div><div><span>Hoy</span><b>${L.filter(x=>new Date(x.created_at).toDateString()===hoy).length}</b></div><div><span>Con error</span><b class="${L.some(x=>x.estado==="error")?"neg":""}">${L.filter(x=>x.estado==="error").length}</b></div>`;
 $("kL").innerHTML=F.length?F.map(x=>{const es=EST[x.estado]||EST.pendiente;return `<div class="rw" data-k="${x.id}" style="cursor:pointer"><div class="ti"><b>${esc(x.asunto||TIPO[x.tipo]||"Correo")}</b><small>${esc(x.para)} · ${fdate(x.created_at)} ${ftime(x.created_at)}${x.usuario_nombre?" · "+esc(x.usuario_nombre):""}</small><br><span class="bd">${esc(TIPO[x.tipo]||x.tipo)}</span> ${x.ref?`<span class="bd">${esc(x.ref)}</span> `:""}${x.con_pdf?'<span class="bd">PDF adjunto</span> ':""}${x.copia?'<span class="bd">Con copia</span>':""}</div><div class="am2"><span class="bd ${es[0]}">${es[1]}</span></div></div>`}).join(""):`<div class="empty card">${L.length?"No hay correos con estos filtros.":"Todavía no se ha enviado ningún correo desde el sistema."}</div>`}
$("kL").addEventListener("click",ev=>{const r=ev.target.closest("[data-k]");if(!r)return;const x=L.find(z=>z.id===r.dataset.k);if(!x)return;const es=EST[x.estado]||EST.pendiente;
 modal("Detalle del correo",`<div class="ti" style="line-height:1.7"><div><b>Asunto:</b> ${esc(x.asunto||"")}</div><div><b>Para:</b> ${esc(x.para)}</div>${x.copia?`<div><b>Copia a:</b> ${esc(x.copia)}</div>`:""}<div><b>Tipo:</b> ${esc(TIPO[x.tipo]||x.tipo)}${x.ref?" · "+esc(x.ref):""}</div><div><b>Enviado:</b> ${fdate(x.created_at)} ${ftime(x.created_at)}${x.usuario_nombre?" por "+esc(x.usuario_nombre):""}</div><div><b>Estado:</b> <span class="bd ${es[0]}">${es[1]}</span></div>${x.detalle?`<div style="margin-top:6px;color:var(--bad)"><b>Motivo del error:</b> ${esc(x.detalle)}</div>`:""}</div>`,{foot:'<button class="btn g" data-x>Cerrar</button>'})});
$("kQ").addEventListener("input",deb(pintar,200));$("kT").onchange=pintar;$("kE").onchange=pintar;
await cargar();
})();
