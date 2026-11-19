/* DAYMARSV · Centro de notificaciones: una campana con lo que necesita atención (pedidos, cobros, tareas, stock) */
(()=>{
"use strict";
const {db,esc}=DAY;
const hoy=()=>{const x=new Date();return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0")};
const permitido=k=>{const m=DAY.me;if(!m)return false;if(m.rol==="admin")return true;return !(Array.isArray(m.modulos_ocultos)&&m.modulos_ocultos.includes(k))};
const ICO={campana:'<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
 pedido:'<path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5"/>',cobro:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
 tarea:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM8.5 13l2 2 4-4.5"/>',reloj:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
 caja:'<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',ok:'<path d="M5 12l4 4 10-10"/>'};
const svg=(k,s)=>`<svg viewBox="0 0 24 24" width="${s||20}" height="${s||20}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;
const cuenta=async q=>{try{const {count,error}=await q;return error?0:(count||0)}catch(e){return 0}};

/* Lo que se revisa. urgente=true suma al número rojo de la campana */
async function revisar(){
 const me=DAY.me;if(!me)return [];const H=hoy(),adm=me.rol==="admin",L=[];
 const [pn,cb,ce,mt,mv,tv,ag,sb]=await Promise.all([
  permitido("pedidos")?cuenta(db.from("pedidos_linea").select("id",{count:"exact",head:true}).eq("estado","nuevo")):0,
  permitido("pendientes")?cuenta(db.from("ventas").select("id",{count:"exact",head:true}).eq("estado","pendiente").eq("tipo","cobro_pendiente")):0,
  permitido("pendientes")?cuenta(db.from("ventas").select("id",{count:"exact",head:true}).eq("estado","pendiente").neq("tipo","cobro_pendiente")):0,
  cuenta(db.from("tareas").select("id",{count:"exact",head:true}).eq("asignado_a",me.id).neq("estado","hecha")),
  cuenta(db.from("tareas").select("id",{count:"exact",head:true}).eq("asignado_a",me.id).neq("estado","hecha").lt("vence",H)),
  adm?cuenta(db.from("tareas").select("id",{count:"exact",head:true}).neq("estado","hecha").lt("vence",H)):0,
  cuenta(db.from("productos").select("id",{count:"exact",head:true}).eq("activo",true).lte("stock",0)),
  cuenta(db.from("productos").select("id",{count:"exact",head:true}).eq("activo",true).gt("stock",0).lte("stock",2))]);
 if(pn)L.push({i:"pedido",t:`${pn} pedido${pn===1?"":"s"} en línea por aceptar`,h:"pedidos.html",u:pn,c:"var(--bad,#b3261e)"});
 if(mv)L.push({i:"reloj",t:`${mv} tarea${mv===1?"":"s"} tuya${mv===1?"":"s"} vencida${mv===1?"":"s"}`,h:"equipo.html",u:0,c:"var(--bad,#b3261e)"});
 if(mt)L.push({i:"tarea",t:`${mt} tarea${mt===1?"":"s"} asignada${mt===1?"":"s"} a ti`,h:"equipo.html",u:mt,c:"var(--wine,#6B2D3E)"});
 if(adm&&tv&&tv!==mv)L.push({i:"reloj",t:`${tv} tarea${tv===1?"":"s"} del equipo vencida${tv===1?"":"s"}`,h:"equipo.html",u:0,c:"var(--warn,#b26a00)"});
 if(cb)L.push({i:"cobro",t:`${cb} venta${cb===1?"":"s"} pendiente${cb===1?"":"s"} de cobro`,h:"pendientes.html",u:0,c:"var(--warn,#b26a00)"});
 if(ce)L.push({i:"caja",t:`${ce} entrega${ce===1?"":"s"} o contra entrega pendiente${ce===1?"":"s"}`,h:"pendientes.html",u:0,c:"var(--warn,#b26a00)"});
 if(ag)L.push({i:"caja",t:`${ag} producto${ag===1?"":"s"} agotado${ag===1?"":"s"}`,h:"reportes.html",u:0,c:"var(--mute,#7b6a70)"});
 if(sb)L.push({i:"caja",t:`${sb} producto${sb===1?"":"s"} con stock bajo (1–2)`,h:"reportes.html",u:0,c:"var(--mute,#7b6a70)"});
 return L}

let ultimo=[];
function pintarNumero(L){const n=L.reduce((s,x)=>s+(x.u||0),0);document.querySelectorAll("[data-nfc]").forEach(e=>{e.textContent=n>99?"99+":n;e.style.display=n?"grid":"none"})}
async function actualizar(){try{ultimo=await revisar();pintarNumero(ultimo)}catch(e){}}

async function abrir(){
 if(document.getElementById("nfDlg"))return;
 const d=document.createElement("dialog");d.id="nfDlg";
 d.style.cssText="border:0;border-radius:16px;padding:0;margin:8vh auto auto;width:min(440px,94vw);max-height:84vh;background:var(--card,#fff);color:var(--ink,#2a1a1f);box-shadow:0 20px 60px rgba(0,0,0,.35)";
 d.innerHTML=`<style>#nfDlg::backdrop{background:rgba(0,0,0,.55)}#nfDlg .nfi{display:flex;gap:12px;align-items:center;width:100%;padding:12px;border:0;border-radius:12px;background:none;color:inherit;font:inherit;font-size:15px;text-align:left;cursor:pointer;text-decoration:none}#nfDlg .nfi:hover,#nfDlg .nfi:focus{background:var(--chip,#f0e6e9);outline:0}#nfDlg .nfc{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--chip,#f0e6e9)}</style>
 <div style="padding:14px 14px 8px;display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;font-size:18px">Notificaciones</h3><button type="button" id="nfX" aria-label="Cerrar" style="width:40px;height:40px;border:1px solid var(--line,#e6dde0);border-radius:12px;background:var(--card,#fff);color:inherit;font-size:18px;cursor:pointer">✕</button></div>
 <div id="nfL" style="padding:0 8px 12px;max-height:68vh;overflow:auto"><p style="color:var(--mute,#7b6a70);padding:8px 10px;margin:0">Revisando…</p></div>`;
 document.body.appendChild(d);d.showModal();d.addEventListener("close",()=>d.remove());
 d.querySelector("#nfX").onclick=()=>d.close();d.addEventListener("click",e=>{if(e.target===d)d.close()});
 const L=await revisar();ultimo=L;pintarNumero(L);
 d.querySelector("#nfL").innerHTML=L.length?L.map(x=>`<a class="nfi" href="${x.h}"><span class="nfc" style="color:${x.c}">${svg(x.i)}</span><span style="flex:1">${esc(x.t)}</span><span style="color:var(--mute,#7b6a70)">›</span></a>`).join("")
  :`<div style="text-align:center;padding:26px 10px;color:var(--mute,#7b6a70)"><div style="display:inline-grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--chip,#f0e6e9);color:var(--ok,#2f7d4f);margin-bottom:8px">${svg("ok",24)}</div><br>Todo al día. No hay nada pendiente.</div>`}
DAY.notificaciones=abrir;

/* Campana en el menú lateral (escritorio) y en la barra superior del menú principal (celular) */
const BADGE='<em data-nfc style="display:none;position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#c62828;color:#fff;font:700 11px/18px sans-serif;font-style:normal;place-items:center;box-sizing:border-box">0</em>';
let n=0;const t=setInterval(()=>{n++;
 const gs1=document.getElementById("gs1");
 if(gs1&&!document.getElementById("nf1")){const b=document.createElement("button");b.type="button";b.id="nf1";b.title="Notificaciones";b.style.cssText=gs1.style.cssText+";position:relative";b.innerHTML=svg("campana",18)+'<span style="flex:1;text-align:left">Notificaciones</span>'+BADGE.replace("top:-4px;right:-4px","top:50%;right:10px;transform:translateY(-50%)");b.onclick=abrir;gs1.after(b)}
 const gs2=document.getElementById("gs2");
 if(gs2&&!document.getElementById("nf2")){const b=document.createElement("button");b.type="button";b.id="nf2";b.className=gs2.className;b.setAttribute("aria-label","Notificaciones");b.title="Notificaciones";b.innerHTML=svg("campana",20)+BADGE;b.onclick=abrir;gs2.after(b)}
 if(DAY.me&&(document.getElementById("nf1")||document.getElementById("nf2"))&&!window.__nfIni){window.__nfIni=1;actualizar();setInterval(()=>{if(document.visibilityState==="visible")actualizar()},60000)}
 if(n>80)clearInterval(t)},250);
})();
