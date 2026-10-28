/* DAYMAR-SHOP · Fotos de productos y descarga en ZIP (solo administradores) */
(async()=>{
"use strict";
const {db,esc,mountSide,requireSession,toast}=DAY;
const {$,deb,espera,norm,fetchAll}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"fotos",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
let P=[];
const clave=p=>(p.codigo_barras||"").trim()||(p.codigo||"").trim();
const safe=s=>String(s).replace(/[\\/:*?"<>|\s]+/g,"_").slice(0,80);
async function cargar(){
 const [pr,im]=await Promise.all([
  fetchAll(()=>db.from("productos").select("id,codigo,nombre,codigo_barras,foto_url,activo").eq("activo",true).order("nombre")),
  fetchAll(()=>db.from("producto_imagenes").select("producto_id,url,orden").order("orden"))]);
 const M={};im.forEach(x=>{if(x.url)(M[x.producto_id]=M[x.producto_id]||[]).push(x.url)});
 P=pr.map(p=>{const f=M[p.id]||(p.foto_url?[p.foto_url]:[]);return {...p,fotos:f}})}
function pintar(){
 const s=norm($("fQ").value),f=$("fF").value;
 const R=P.filter(p=>(!s||norm((p.nombre||"")+" "+(p.codigo_barras||"")+" "+(p.codigo||"")).includes(s))&&(!f||(f==="con"?p.fotos.length:f==="sin"?!p.fotos.length:!(p.codigo_barras||"").trim())));
 const nf=P.reduce((a,p)=>a+p.fotos.length,0);
 $("fK").innerHTML=`<div><span>Productos</span><b>${P.length}</b></div><div><span>Fotos</span><b>${nf}</b></div><div><span>Sin foto</span><b>${P.filter(p=>!p.fotos.length).length}</b></div>`;
 $("fL").innerHTML=R.length?R.slice(0,300).map(p=>`<div class="rw"><div class="th">${p.fotos[0]?`<img src="${esc(p.fotos[0])}" alt="" loading="lazy">`:`<div class="ph">${esc((p.nombre||"?")[0].toUpperCase())}</div>`}</div><div class="ti"><b>${esc(p.nombre)}</b><small>${(p.codigo_barras||"").trim()?"Código de barras: "+esc(p.codigo_barras):`<span style="color:var(--bad)">Sin código de barras</span> · SKU ${esc(p.codigo||"—")}`} · ${p.fotos.length} foto${p.fotos.length===1?"":"s"}</small></div></div>`).join("")+(R.length>300?`<p class="hint">Mostrando 300 de ${R.length}. Usa el buscador.</p>`:""):`<p class="hint">No hay productos.</p>`}
const ext=(b,u)=>{const t=(b.type||"").split("/")[1];if(t)return t.replace("jpeg","jpg").replace(/\+.*/,"");const m=/\.([a-z0-9]{3,4})(\?|$)/i.exec(u);return m?m[1].toLowerCase():"jpg"};
async function descargar(){
 const L=P.filter(p=>p.fotos.length&&clave(p));
 if(!L.length){toast("No hay fotos para descargar");return}
 if(!window.JSZip)await new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=ok;s.onerror=()=>ko(new Error("No se pudo cargar la librería. Revisa tu conexión."));document.head.appendChild(s)});
 const ok=await espera(async()=>{
  const zip=new JSZip(),usados={},falló=[],sinBC=[];let n=0;
  for(const p of L){
   if(!(p.codigo_barras||"").trim())sinBC.push(p.nombre);
   for(let i=0;i<p.fotos.length;i++){
    try{const r=await fetch(p.fotos[i]);if(!r.ok)throw 0;const b=await r.blob();
     let base=safe(clave(p))+(i?"_"+(i+1):"");let nombre=base+"."+ext(b,p.fotos[i]);
     if(usados[nombre]){let k=2;while(usados[base+"_p"+k+"."+ext(b,p.fotos[i])])k++;nombre=base+"_p"+k+"."+ext(b,p.fotos[i])}
     usados[nombre]=1;zip.file(nombre,b);n++;$("ovT").textContent="Descargando fotos… "+n}catch(e){falló.push(p.nombre)}}}
  if(!n)throw new Error("No se pudo descargar ninguna foto.");
  const nota=[];if(sinBC.length)nota.push("Productos sin código de barras (se usó el SKU):\n- "+sinBC.join("\n- "));
  if(falló.length)nota.push("Fotos que no se pudieron descargar:\n- "+falló.join("\n- "));
  if(nota.length)zip.file("LEEME.txt",nota.join("\n\n")+"\n");
  const blob=await zip.generateAsync({type:"blob"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="fotos-productos-"+new Date().toISOString().slice(0,10)+".zip";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast(n+" fotos descargadas"+(falló.length?" · "+falló.length+" fallaron":""));return true},"Descargando fotos…");
 return ok}
$("fQ").oninput=deb(pintar,200);$("fF").onchange=pintar;$("fZip").onclick=()=>descargar().catch(e=>toast(e.message));
try{await espera(async()=>{await cargar();pintar();return true},"Cargando…")}catch(e){$("fL").innerHTML=`<p class="hint">${esc(e.message)}</p>`}
})();
