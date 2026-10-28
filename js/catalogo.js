/* DAYMAR-SHOP · Catálogo de productos (pantalla, PDF, Excel y CSV para Wix) · Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,fetchAll,espera,modal,norm,deb,lib,confirmar}=UI;
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"catalogo",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
let P=[],lim=48,barras=LS("dms_cat_bc")==="1";
const ini=n=>(n||"?").trim().charAt(0).toUpperCase()||"?";
/* ---------- precio en letras ---------- */
const U=["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve","veinte","veintiuno","veintidós","veintitrés","veinticuatro","veinticinco","veintiséis","veintisiete","veintiocho","veintinueve"];
const D=["","","veinte","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"],C=["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"];
function letras(n){n=Math.max(0,Math.floor(n||0));
 if(n<30)return U[n];
 if(n<100){const d=Math.floor(n/10),u=n%10;return u?`${D[d]} y ${U[u]}`:D[d]}
 if(n<1000){if(n===100)return "cien";const c=Math.floor(n/100),r=n%100;return r?`${C[c]} ${letras(r)}`:C[c]}
 if(n<1e6){const m=Math.floor(n/1000),r=n%1000,p=m===1?"mil":`${letras(m)} mil`;return r?`${p} ${letras(r)}`:p}
 return String(n)}
function enLetras(v){const t=Math.max(0,Math.round((+v||0)*100)),e=Math.floor(t/100),c=t%100;
 let s=letras(e);if(e===1)s="un";else s=s.replace(/veintiuno$/,"veintiún").replace(/ y uno$/," y un").replace(/ uno$/," un");
 return `${s} ${e===1?"dólar":"dólares"} con ${String(c).padStart(2,"0")} centavos`}
/* ---------- datos ---------- */
async function cargar(){
 const [pr,im,va]=await Promise.all([
  fetchAll(()=>db.from("productos").select("id,codigo,codigo_barras,nombre,descripcion,precio_venta,precio_costo,descuento_pct,stock,foto_url,created_at,categorias(nombre)").eq("activo",true).order("nombre")),
  fetchAll(()=>db.from("producto_imagenes").select("producto_id,url,thumb_url,orden").order("orden")),
  fetchAll(()=>db.from("producto_variantes").select("producto_id,nombre,codigo_barras,stock,orden").order("orden"))]);
 const M={},V={};im.forEach(x=>{if(x.url)(M[x.producto_id]=M[x.producto_id]||[]).push({url:x.url,th:x.thumb_url||x.url})});
 va.forEach(x=>(V[x.producto_id]=V[x.producto_id]||[]).push(x));
 P=pr.map(p=>{const f=M[p.id]||(p.foto_url?[{url:p.foto_url,th:p.foto_url}]:[]),vs=V[p.id]||[],d=+p.descuento_pct||0,base=+p.precio_venta||0,fin=r2(base*(1-d/100));
  return {...p,cat:(p.categorias&&p.categorias.nombre)||"Sin categoría",fotos:f,vars:vs,desc:d,base,fin,stk:vs.length?vs.reduce((s,v)=>s+(+v.stock||0),0):(+p.stock||0)}})}
function filtrados(){
 const q=norm($("kQ").value),c=$("kC").value,s=$("kS").value,o=$("kO").value;
 let L=P.filter(p=>(!c||p.cat===c)&&(!q||norm([p.nombre,p.codigo,p.codigo_barras].join(" ")).includes(q))&&(!s||(s==="con"?p.stk>0:s==="sin"?p.stk<=0:s==="foto"?p.fotos.length:!p.fotos.length)));
 if(o==="nombre")L.sort((a,b)=>a.nombre.localeCompare(b.nombre));else if(o==="menor")L.sort((a,b)=>a.fin-b.fin);else if(o==="mayor")L.sort((a,b)=>b.fin-a.fin);else if(o==="nuevo")L.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 else L.sort((a,b)=>a.cat.localeCompare(b.cat)||a.nombre.localeCompare(b.nombre));
 return L}
/* ---------- pantalla ---------- */
function pintar(){
 const cats=[...new Set(P.map(p=>p.cat))].sort(),cur=$("kC").value;
 $("kC").innerHTML='<option value="">Todas</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");$("kC").value=cats.includes(cur)?cur:"";
 $("kB").checked=barras;
 const L=filtrados(),V=L.slice(0,lim);
 $("kK").innerHTML=`<div><span>Productos</span><b>${P.length}</b></div><div><span>Con stock</span><b>${P.filter(p=>p.stk>0).length}</b></div><div><span>Con foto</span><b>${P.filter(p=>p.fotos.length).length}</b></div><div><span>Categorías</span><b>${cats.length}</b></div><div><span>En esta vista</span><b>${L.length}</b></div>`;
 $("kL").innerHTML=V.length?V.map(tarjeta).join(""):`<div class="empty card" style="grid-column:1/-1">${P.length?"Ningún producto coincide con los filtros.":"Aún no hay productos en el inventario."}</div>`;
 $("kMas").classList.toggle("hidden",L.length<=lim);$("kMas").textContent=`Ver más (${L.length-lim})`;
 if(barras&&window.JsBarcode)$("kL").querySelectorAll("svg.bc").forEach(s=>{try{JsBarcode(s,s.dataset.c,{format:"CODE128",width:1.4,height:34,displayValue:true,fontSize:11,margin:0})}catch(e){s.remove()}})}
function tarjeta(p){
 const f=p.fotos[0];
 return `<div class="kc" data-id="${p.id}"><div class="ph ${f?"":"ph0"}" ${f?"data-g":""}>${f?`<img src="${esc(f.th)}" alt="" loading="lazy">`:esc(ini(p.nombre))}${p.fotos.length>1?`<span class="nf">${p.fotos.length} fotos</span>`:""}${p.desc>0?`<span class="of">-${p.desc}%</span>`:""}</div>
 <div class="kb"><span class="ct">${esc(p.cat)}</span><h3>${esc(p.nombre)}</h3>
 <div class="pr">${$$(p.fin)}${p.desc>0?`<s>${$$(p.base)}</s>`:""}</div><div class="pl">${esc(enLetras(p.fin))}</div>
 <div class="st"><span class="bd ${p.stk>0?(p.stk<=3?"wa":"ok"):"or"}">${p.stk>0?"Stock "+p.stk:"Agotado"}</span>${p.codigo_barras?`<small style="color:var(--mute)">${esc(p.codigo_barras)}</small>`:""}</div>
 ${p.vars.length?`<div class="cl">${p.vars.map(v=>`<span>${esc(v.nombre)}${+v.stock>0?"":" (0)"}</span>`).join("")}</div>`:""}
 ${barras&&p.codigo_barras?`<svg class="bc" data-c="${esc(p.codigo_barras)}"></svg>`:""}</div></div>`}
function galeria(p){
 const m=modal(esc(p.nombre),`<div class="kgal"><img class="main" id="gM" src="${esc(p.fotos[0].url)}" alt=""><div class="th">${p.fotos.map((f,i)=>`<img src="${esc(f.th)}" data-u="${esc(f.url)}" class="${i?"":"on"}" alt="">`).join("")}</div><div><b>${$$(p.fin)}</b> · ${esc(enLetras(p.fin))}${p.descripcion?`<br><small>${esc(p.descripcion)}</small>`:""}</div></div>`,{big:true,foot:'<button class="btn g" data-x>Cerrar</button>'});
 m.el.addEventListener("click",e=>{const t=e.target.closest("[data-u]");if(!t)return;m.q("#gM").src=t.dataset.u;m.el.querySelectorAll(".th img").forEach(i=>i.classList.toggle("on",i===t))})}
/* ---------- descargas ---------- */
const nombreNeg=async()=>{try{const {data}=await db.from("config_negocio").select("nombre").eq("id",1).maybeSingle();return (data&&data.nombre)||"DAYMAR-SHOP"}catch(e){return "DAYMAR-SHOP"}};
const bajar=(blob,nombre)=>{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};
function excel(L){
 UI.excel("catalogo",[{n:"Catálogo",c:[["Código",14],["Código de barras",18],["Producto",36],["Categoría",20],["Descripción",40],["Precio",11,"money"],["Descuento %",11],["Precio final",12,"money"],["Stock",9],["Colores",28],...(ADM?[["Costo",11,"money"]]:[]),["Foto principal",44]],
  f:L.map(p=>[p.codigo||"",p.codigo_barras||"",p.nombre,p.cat,p.descripcion||"",p.base,p.desc,p.fin,p.stk,p.vars.map(v=>`${v.nombre} (${v.stock})`).join(", "),...(ADM?[+p.precio_costo||0]:[]),(p.fotos[0]||{}).url||""])}])}
/* PDF: cuadrícula de 3 columnas con foto reducida para que el archivo pese poco */
async function fotoPequena(url,max=360){
 try{const b=await (await fetch(url,{mode:"cors"})).blob(),bm=await createImageBitmap(b),s=Math.min(1,max/Math.max(bm.width,bm.height)),c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(bm.width*s));c.height=Math.max(1,Math.round(bm.height*s));const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(bm,0,0,c.width,c.height);
  return {d:c.toDataURL("image/jpeg",.72),w:c.width,h:c.height}}catch(e){return null}}
async function pdf(L,o){
 await lib("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
 const neg=await nombreNeg(),{jsPDF}=window.jspdf,doc=new jsPDF({unit:"pt",format:"a4"}),PW=595,PH=842,mg=28,gap=10,cols=3,cw=(PW-mg*2-gap*(cols-1))/cols;
 const ih=cw-16,ch=ih+8+30+18+(o.letras?20:0)+(o.barras?30:0)+(o.stock?12:0)+14;
 let y=mg+24,col=0,cat=null,pag=1;const T=$("ovT");
 const cab=()=>{doc.setFont("helvetica","bold");doc.setFontSize(15);doc.setTextColor(107,45,62);doc.text("CATÁLOGO · "+neg,mg,mg+4);doc.setDrawColor(201,151,63);doc.setLineWidth(1.2);doc.line(mg,mg+11,PW-mg,mg+11)};
 const pie=()=>{doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(140);doc.text("Página "+pag,PW-mg,PH-14,{align:"right"})};
 cab();pie();
 const nueva=()=>{doc.addPage();pag++;cab();pie();y=mg+24;col=0};
 const cache=new Map();let hecho=0;
 const pre=async lote=>{await Promise.all(lote.map(async p=>{const f=p.fotos[0];if(f&&!cache.has(f.th))cache.set(f.th,await fotoPequena(f.th))}))};
 for(let i=0;i<L.length;i++){
  if(i%6===0){if(T)T.textContent=`Generando PDF… ${i} de ${L.length}`;await pre(L.slice(i,i+6))}
  const p=L[i];
  if(o.agrupar&&p.cat!==cat){cat=p.cat;if(col>0){y+=ch+gap;col=0}if(y+24+ch>PH-mg)nueva();
   doc.setFillColor(107,45,62);doc.roundedRect(mg,y,PW-mg*2,18,4,4,"F");doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(255);doc.text(cat.toUpperCase(),mg+8,y+12.5);y+=26}
  if(col===0&&y+ch>PH-mg-12)nueva();
  const x=mg+col*(cw+gap);
  doc.setDrawColor(220);doc.setLineWidth(.7);doc.setFillColor(255);doc.roundedRect(x,y,cw,ch,6,6,"FD");
  const im=p.fotos[0]&&cache.get(p.fotos[0].th);
  if(im){const s=Math.min(ih/im.w,ih/im.h),w=im.w*s,h=im.h*s;try{doc.addImage(im.d,"JPEG",x+8+(ih-w)/2,y+8+(ih-h)/2,w,h)}catch(e){}}
  else{doc.setFillColor(243,240,241);doc.rect(x+8,y+8,ih,ih,"F");doc.setTextColor(150);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("Sin foto",x+cw/2,y+8+ih/2,{align:"center"})}
  let ty=y+8+ih+12;
  doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(30);
  doc.text(doc.splitTextToSize(p.nombre,cw-16).slice(0,2),x+8,ty);ty+=24;
  doc.setFontSize(13);doc.setTextColor(107,45,62);doc.text($$(p.fin),x+8,ty+2);
  if(p.desc>0){const w=doc.getTextWidth($$(p.fin));doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(140);doc.text($$(p.base),x+14+w,ty+2);doc.line(x+14+w,ty,x+14+w+doc.getTextWidth($$(p.base)),ty)}
  ty+=14;
  if(o.letras){doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(110);doc.text(doc.splitTextToSize(enLetras(p.fin),cw-16).slice(0,2),x+8,ty);ty+=18}
  if(o.stock){doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(p.stk>0?60:180);doc.text(p.stk>0?"Disponible: "+p.stk:"Agotado",x+8,ty);ty+=11}
  if(o.barras&&p.codigo_barras&&window.JsBarcode){try{const c=document.createElement("canvas");JsBarcode(c,String(p.codigo_barras),{format:"CODE128",width:1.4,height:30,displayValue:true,fontSize:12,margin:0});doc.addImage(c.toDataURL("image/png"),"PNG",x+8,ty-2,Math.min(cw-16,120),28)}catch(e){}}
  col++;if(col===cols){col=0;y+=ch+gap}}
 doc.save("catalogo-"+ymd(new Date())+".pdf")}
function descargar(){
 const L=filtrados();
 if(!L.length)return toast("No hay productos en esta vista");
 const sf=L.filter(p=>p.fotos.length).length;
 const m=modal("Descargar catálogo",`<p style="margin:0 0 8px">Se descargan los <b>${L.length}</b> productos de la vista actual (${sf} con foto). Cambia los filtros de la página para elegir otros.</p>
  <div class="kopt">
  <button class="ob" data-d="pdf"><div><b>PDF para clientes</b><small>Cuadrícula con foto, nombre y precio. Ideal para enviar por WhatsApp o imprimir.</small></div></button>
  <div class="kck" id="kOp"><b style="font-size:13px">Opciones del PDF</b><label><input type="checkbox" id="oA" checked> Separar por categoría</label><label><input type="checkbox" id="oL"> Precio en letras</label><label><input type="checkbox" id="oB"> Código de barras</label><label><input type="checkbox" id="oS"> Mostrar disponibilidad (stock)</label></div>
  <button class="ob" data-d="xls"><div><b>Excel</b><small>Todos los datos: códigos, precios, descuento, stock, colores${ADM?", costo":""} y enlace de la foto.</small></div></button>
  ${ADM?'<a class="ob" href="fotos.html" style="text-decoration:none"><div><b>Fotos en ZIP</b><small>Todas las fotos con el código de barras como nombre (página Fotos).</small></div></a>':""}</div>`,{foot:'<button class="btn g" data-x>Cerrar</button>'});
 m.el.addEventListener("click",async e=>{const b=e.target.closest("[data-d]");if(!b)return;const k=b.dataset.d;
  if(k==="xls"){m.close();excel(L)}
  else if(k==="pdf"){if(L.length>600&&!await confirmar(`Son ${L.length} productos: el PDF tardará varios minutos y pesará bastante. Conviene filtrar por categoría.`,{titulo:"PDF muy grande",ok:"Continuar"}))return;
   const o={agrupar:m.q("#oA").checked,letras:m.q("#oL").checked,barras:m.q("#oB").checked,stock:m.q("#oS").checked};m.close();
   await espera(()=>pdf(L,o),"Generando PDF…").catch(()=>{})}})}
/* ---------- eventos ---------- */
$("kDes").onclick=descargar;
$("kL").addEventListener("click",e=>{const c=e.target.closest(".kc");if(!c||!e.target.closest("[data-g]"))return;const p=P.find(x=>x.id===c.dataset.id);if(p&&p.fotos.length)galeria(p)});
["kC","kO","kS"].forEach(i=>$(i).addEventListener("change",()=>{lim=48;pintar()}));
$("kQ").addEventListener("input",deb(()=>{lim=48;pintar()},200));
$("kB").onchange=()=>{barras=$("kB").checked;LS("dms_cat_bc",barras?"1":"0");pintar()};
$("kMas").onclick=()=>{lim+=48;pintar()};
try{await espera(async()=>{await cargar();pintar();return true},"Cargando catálogo…")}catch(e){$("kL").innerHTML=`<div class="empty card" style="grid-column:1/-1">${esc(e.message)}</div>`}
})();
