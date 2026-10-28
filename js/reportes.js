/* DAYMAR-SHOP · Inventario: reportes, catálogo PDF y etiquetas de código de barras */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,norm,fdate,ic,deb,fetchAll,lib,espera,modal,confirmar,pestanas,excel}=UI;
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"inventario",me.rol);$("app").classList.remove("hidden");
const IC={sum:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',cat:'<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',top:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>'};
const mini=p=>Math.max(0,+p.stock_minimo||0),crit=p=>Math.max(1,Math.floor(mini(p)/2));
let P=[],NP=0;
const fin=p=>r2(p.precio_venta*(1-(+p.descuento_pct||0)/100));
async function cargar(){
 const rows=await fetchAll(()=>db.from("productos").select("id,codigo,nombre,precio_venta,precio_costo,descuento_pct,stock,stock_minimo,foto_url,codigo_barras,descripcion,categorias(nombre)").eq("activo",true).order("nombre"));
 let vs=[];try{vs=await fetchAll(()=>db.from("producto_variantes").select("id,producto_id,nombre,codigo_barras,stock,orden").order("orden").order("nombre"))}catch(e){}
 const VB={};vs.forEach(v=>(VB[v.producto_id]=VB[v.producto_id]||[]).push(v));NP=rows.length;P=[];
 rows.forEach(p=>{const b={...p,cat:p.categorias?p.categorias.nombre:"Sin categoría",fin:fin(p)},L=VB[p.id];
  if(!L){b.val=b.fin*b.stock;P.push(b);return}
  /* un producto con colores se lista una vez por color, cada uno con su stock y su código de barras */
  let suma=0;L.forEach(v=>{suma+=v.stock;const c={...b,base:p.nombre,color:v.nombre,nombre:p.nombre+" – "+v.nombre,stock:v.stock,codigo_barras:v.codigo_barras||"",codigo:p.codigo};c.val=c.fin*c.stock;P.push(c)});
  if(p.stock>suma){const c={...b,base:p.nombre,color:"Sin color",nombre:p.nombre+" – sin color",stock:p.stock-suma,codigo_barras:p.codigo_barras};c.val=c.fin*c.stock;P.push(c)}})}
const sum=(L,f)=>L.reduce((s,p)=>s+f(p),0);
function datos(){
 const unidades=sum(P,p=>p.stock),valor=sum(P,p=>p.val),agot=P.filter(p=>p.stock===0),bajo=P.filter(p=>p.stock>0&&p.stock<=mini(p)),sano=P.filter(p=>p.stock>mini(p));
 const cats={};P.forEach(p=>{const c=cats[p.cat]=cats[p.cat]||{n:0,u:0,v:0,costo:0};c.n++;c.u+=p.stock;c.v+=p.val;c.costo+=p.precio_costo*p.stock});
 const top=[...P].sort((a,b)=>b.val-a.val).slice(0,10),aten=P.filter(p=>p.stock<=crit(p)).sort((a,b)=>a.stock-b.stock||a.nombre.localeCompare(b.nombre));
 const costo=sum(P,p=>p.precio_costo*p.stock);
 return {unidades,valor,agot,bajo,sano,cats,top,aten,costo,ncat:Object.keys(cats).length,prom:unidades?valor/unidades:0}}
function pintar(){
 const d=datos();
 $("rKpi").innerHTML=`<div><span>Productos</span><b>${NP}</b></div><div><span>Unidades en stock</span><b>${d.unidades}</b></div><div><span>Valor del inventario</span><b>${$$(d.valor)}</b></div><div><span>Valor promedio por unidad</span><b>${$$(d.prom)}</b></div>${ADM?`<div><span>Utilidad potencial</span><b>${$$(d.valor-d.costo)}</b><small>a precio de venta vs costo</small></div>`:`<div><span>Categorías</span><b>${d.ncat}</b></div>`}`;
 $("rSalud").innerHTML=`<div><span>Stock saludable (sobre su mínimo)</span><b class="pos">${d.sano.length}</b></div><div><span>Stock bajo (hasta su mínimo)</span><b style="color:var(--warn)">${d.bajo.length}</b></div><div><span>Agotados</span><b class="neg">${d.agot.length}</b></div>`;
 $("rAlert").innerHTML=(d.agot.length?`<div class="alert bad"><div><b>${d.agot.length} producto(s) agotado(s)</b>Repón pronto para no perder ventas.</div></div>`:"")+(d.bajo.length?`<div class="alert warn"><div><b>${d.bajo.length} producto(s) con stock bajo</b>Considera reabastecer.</div></div>`:"")+(!P.length?`<div class="alert"><div><b>Inventario vacío</b>Aún no hay productos registrados.</div></div>`:"");
 const cs=Object.entries(d.cats).sort((a,b)=>b[1].v-a[1].v);
 $("cTab").innerHTML=cs.map(([n,c])=>{const pc=d.valor?c.v/d.valor*100:0,avg=c.n?c.u/c.n:0;
  return `<tr><td><b>${esc(n)}</b></td><td class="r">${c.n}</td><td class="r">${c.u}</td><td class="r">${$$(c.v)}</td><td class="r">${avg.toFixed(1)}</td><td style="min-width:110px"><div class="bar"><i style="width:${pc.toFixed(1)}%"></i></div><small>${pc.toFixed(1)}%</small></td><td>${c.u===0?'<span class="bd or">Agotado</span>':avg<=2?'<span class="bd wa">Bajo</span>':'<span class="bd ok">OK</span>'}</td></tr>`}).join("")||`<tr><td colspan="7" class="empty">Sin datos</td></tr>`;
 $("tTab").innerHTML=d.top.map((p,i)=>`<tr><td><span class="bd bl2">#${i+1}</span></td><td><b>${esc(p.nombre)}</b><br><small>${esc(p.codigo||"")}</small></td><td>${esc(p.cat)}</td><td class="r">${p.stock}</td><td class="r">${$$(p.fin)}</td><td class="r"><b>${$$(p.val)}</b></td><td class="r">${d.valor?(p.val/d.valor*100).toFixed(1):0}%</td></tr>`).join("")||`<tr><td colspan="7" class="empty">Sin datos</td></tr>`;
 $("aList").innerHTML=d.aten.length?d.aten.map(p=>`<div class="rw"><div class="ti"><b>${esc(p.nombre)} <span class="bd ${p.stock===0?"or":"wa"}">${p.stock===0?"AGOTADO":"CRÍTICO"}</span></b><small>${esc(p.codigo||"")} · ${esc(p.cat)} · Stock ${p.stock}</small></div><div class="am2"><b>${$$(p.fin)}</b><br><small>precio unitario</small></div></div>`).join("")
  :`<div class="empty card">Ningún producto en estado crítico. ¡Buen trabajo!</div>`;
 const cats=Object.keys(d.cats).sort();
 ["dCat","dCat2"].forEach(i=>{const cur=$(i).value;$(i).innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)} (${d.cats[c].n})</option>`).join("");$(i).value=cur});
 const enCat=c=>P.filter(p=>!c||p.cat===c);
 const ne=P.filter(p=>p.codigo_barras&&p.stock>0);
 $("dInfo").innerHTML=`${P.length} productos · ${ne.length} con código de barras y stock (${sum(ne,p=>p.stock)} etiquetas)`}

/* ---------- PDF ---------- */
async function pdfLibs(){await lib("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");await lib("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js")}
const WINE=[107,45,62],GOLD=[201,151,63],INK=[42,26,31],MUTE=[123,106,112];
async function reportePdf(){
 if(!P.length){toast("No hay productos para el reporte");return}
 await espera(async()=>{await pdfLibs();const {jsPDF}=window.jspdf,pdf=new jsPDF("p","mm","a4"),W=210,m=14,d=datos();
  pdf.setFillColor(...WINE);pdf.rect(0,0,W,26,"F");pdf.setTextColor(255);pdf.setFont(undefined,"bold");pdf.setFontSize(18);pdf.text("DAYMAR-SHOP",m,13);pdf.setFontSize(10);pdf.setFont(undefined,"normal");pdf.text("Reporte de inventario",m,20);
  pdf.text(new Date().toLocaleDateString("es-SV",{day:"numeric",month:"long",year:"numeric"}),W-m,13,{align:"right"});
  const k=[["Productos",NP],["Unidades",d.unidades],["Valor del inventario",$$(d.valor)],["Agotados",d.agot.length],["Stock bajo",d.bajo.length]];
  const bw=(W-2*m-4*3)/5;k.forEach((x,i)=>{const bx=m+i*(bw+3);pdf.setFillColor(247,242,243);pdf.roundedRect(bx,32,bw,17,2,2,"F");pdf.setTextColor(...MUTE);pdf.setFontSize(7.5);pdf.text(String(x[0]),bx+3,38);pdf.setTextColor(...WINE);pdf.setFont(undefined,"bold");pdf.setFontSize(11);pdf.text(String(x[1]),bx+3,45);pdf.setFont(undefined,"normal")});
  let y=56;const T=(t,head,body,opt)=>{pdf.setTextColor(...WINE);pdf.setFont(undefined,"bold");pdf.setFontSize(12);pdf.text(t,m,y);pdf.setFont(undefined,"normal");
   pdf.autoTable(Object.assign({startY:y+3,head:[head],body,margin:{left:m,right:m},theme:"striped",styles:{fontSize:8.5,cellPadding:1.8,textColor:INK},headStyles:{fillColor:WINE,textColor:255},alternateRowStyles:{fillColor:[247,242,243]}},opt||{}));y=pdf.lastAutoTable.finalY+9};
  T("Análisis por categoría",["Categoría","Productos","Unidades","Valor","% del total"],Object.entries(d.cats).sort((a,b)=>b[1].v-a[1].v).map(([n,c])=>[n,c.n,c.u,$$(c.v),(d.valor?c.v/d.valor*100:0).toFixed(1)+"%"]),{columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"}}});
  T("Top 10 productos por valor",["#","Producto","Categoría","Stock","Precio","Valor"],d.top.map((p,i)=>[i+1,p.nombre,p.cat,p.stock,$$(p.fin),$$(p.val)]),{columnStyles:{3:{halign:"right"},4:{halign:"right"},5:{halign:"right"}}});
  if(d.aten.length)T("Productos que requieren atención",["Código","Producto","Categoría","Stock","Estado"],d.aten.map(p=>[p.codigo||"",p.nombre,p.cat,p.stock,p.stock===0?"AGOTADO":"CRÍTICO"]),{headStyles:{fillColor:[179,38,30],textColor:255}});
  pdf.addPage();y=16;T("Inventario completo",["Código","Producto","Categoría","Stock","Desc.","Precio","Valor"],[...P].sort((a,b)=>a.cat.localeCompare(b.cat)||a.nombre.localeCompare(b.nombre)).map(p=>[p.codigo||"",p.nombre,p.cat,p.stock,+p.descuento_pct?(+p.descuento_pct)+"%":"",$$(p.fin),$$(p.val)]),{columnStyles:{3:{halign:"right"},4:{halign:"right"},5:{halign:"right"},6:{halign:"right"}}});
  const n=pdf.getNumberOfPages();for(let i=1;i<=n;i++){pdf.setPage(i);pdf.setFontSize(8);pdf.setTextColor(...MUTE);pdf.text("Página "+i+" de "+n,W/2,291,{align:"center"})}
  pdf.save("reporte-inventario-"+ymd(new Date())+".pdf");toast("Reporte generado")},"Generando reporte…")}

async function fotoDataUrl(url){try{const b=await(await fetch(url)).blob(),bmp=await createImageBitmap(b),k=Math.min(1,360/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*k)),h=Math.max(1,Math.round(bmp.height*k));
 const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(bmp,0,0,w,h);return {d:c.toDataURL("image/jpeg",.82),w,h}}catch(e){return null}}
async function catalogoPdf(){
 const cat=$("dCat").value,L=P.filter(p=>!cat||p.cat===cat).filter(p=>$("dSoloStock").checked?p.stock>0:true).sort((a,b)=>a.cat.localeCompare(b.cat)||a.nombre.localeCompare(b.nombre));
 if(!L.length){toast("No hay productos para el catálogo");return}
 await espera(async()=>{await pdfLibs();const {jsPDF}=window.jspdf,pdf=new jsPDF("p","mm","a4"),W=210,H=297,m=12;
  pdf.setFillColor(...WINE);pdf.rect(0,0,W,H,"F");pdf.setTextColor(255);pdf.setFont(undefined,"bold");pdf.setFontSize(34);pdf.text("CATÁLOGO",W/2,H/2-14,{align:"center"});pdf.setTextColor(...GOLD);pdf.text("DAYMAR-SHOP",W/2,H/2+4,{align:"center"});
  pdf.setTextColor(255);pdf.setFont(undefined,"normal");pdf.setFontSize(12);pdf.text(cat||"Todos los productos",W/2,H/2+20,{align:"center"});pdf.text(new Date().toLocaleDateString("es-SV",{day:"numeric",month:"long",year:"numeric"})+" · "+L.length+" productos",W/2,H/2+28,{align:"center"});
  const conFoto=$("dFotos").checked,imgs=new Map();
  if(conFoto){const urls=[...new Set(L.map(p=>p.foto_url).filter(Boolean))];for(let i=0;i<urls.length;i+=6){await Promise.all(urls.slice(i,i+6).map(async u=>imgs.set(u,await fotoDataUrl(u))));$("ovT").textContent=`Preparando imágenes ${Math.min(i+6,urls.length)}/${urls.length}…`}}
  const cw=(W-2*m-6)/2,ch=78,perPage=6;let n=0,cur="";
  L.forEach(p=>{if(n%perPage===0||p.cat!==cur&&false){pdf.addPage();pdf.setFillColor(...WINE);pdf.rect(0,0,W,11,"F");pdf.setTextColor(255);pdf.setFont(undefined,"bold");pdf.setFontSize(9);pdf.text("DAYMAR-SHOP · Catálogo",m,7.2);}
   const pos=n%perPage,x=m+(pos%2)*(cw+6),y=18+Math.floor(pos/2)*(ch+4);n++;
   pdf.setDrawColor(230,221,224);pdf.setFillColor(255);pdf.roundedRect(x,y,cw,ch,2,2,"FD");
   const im=conFoto&&p.foto_url?imgs.get(p.foto_url):null;
   if(im){const s=Math.min(cw-8,44)/Math.max(im.w,im.h)*Math.max(im.w,im.h);const k=Math.min((cw-8)/im.w,44/im.h);pdf.addImage(im.d,"JPEG",x+(cw-im.w*k)/2,y+3,im.w*k,im.h*k)}
   else{pdf.setFillColor(247,242,243);pdf.rect(x+4,y+3,cw-8,44,"F");pdf.setTextColor(...MUTE);pdf.setFontSize(20);pdf.text((p.nombre[0]||"?").toUpperCase(),x+cw/2,y+28,{align:"center"})}
   pdf.setTextColor(...INK);pdf.setFont(undefined,"bold");pdf.setFontSize(9.5);const nm=pdf.splitTextToSize(p.nombre,cw-8).slice(0,2);pdf.text(nm,x+4,y+54);
   pdf.setFont(undefined,"normal");pdf.setFontSize(7.5);pdf.setTextColor(...MUTE);pdf.text((p.codigo||"")+(p.codigo?" · ":"")+p.cat,x+4,y+54+nm.length*4+1);
   pdf.setFont(undefined,"bold");pdf.setFontSize(13);pdf.setTextColor(...WINE);
   if(+p.descuento_pct>0){pdf.setFontSize(8);pdf.setTextColor(...MUTE);pdf.setFont(undefined,"normal");const old=$$(p.precio_venta);pdf.text(old,x+4,y+ch-8);pdf.line(x+4,y+ch-9.2,x+4+pdf.getTextWidth(old),y+ch-9.2);pdf.setFont(undefined,"bold");pdf.setFontSize(13);pdf.setTextColor(...WINE);pdf.text($$(p.fin),x+4,y+ch-3)}
   else pdf.text($$(p.fin),x+4,y+ch-3);
   pdf.setFontSize(8);pdf.setFont(undefined,"bold");pdf.setTextColor(...(p.stock>0?[47,125,79]:[179,38,30]));pdf.text(p.stock>0?"Disponible":"Agotado",x+cw-4,y+ch-3,{align:"right"})});
  pdf.save("catalogo-daymar-"+ymd(new Date())+".pdf");toast("Catálogo generado")},"Preparando catálogo…")}

/* ---------- Etiquetas de código de barras (hoja de 4 × 10, una por unidad en stock) ---------- */
const LW=45,LH=27,LC=4,LR=10,GX=3,GY=2;
function wrapL(pdf,text,maxW,fs){pdf.setFontSize(fs);const ws=String(text||"Producto").split(/\s+/),out=[];let cur="";ws.forEach(w=>{const c=cur?cur+" "+w:w;if(pdf.getTextWidth(c)<=maxW)cur=c;else{if(cur)out.push(cur);cur=w}});if(cur)out.push(cur);return out}
function etiqueta(pdf,p,x,y){
 pdf.setDrawColor(190,196,203);pdf.setLineWidth(.2);pdf.roundedRect(x,y,LW,LH,1,1,"S");
 const L=["D","A","Y","M","A","R"],fs=7,step=3.1,cap=fs*.353*.72,blk=(L.length-1)*step+cap,y0=y+(LH-blk)/2+cap;
 pdf.setFont(undefined,"bold");pdf.setFontSize(fs);pdf.setTextColor(102,45,66);L.forEach((c,i)=>pdf.text(c,x+2.2,y0+i*step));
 pdf.setDrawColor(165,171,179);pdf.line(x+7.5,y+2,x+7.5,y+LH-2);
 const tx=x+9,tw=LW-11;const nm=p.color?p.base:p.nombre;let f=6,ls=wrapL(pdf,nm,tw,f);if(ls.length>2){f=5;ls=wrapL(pdf,nm,tw,f)}if(ls.length>2){ls=ls.slice(0,2);ls[1]=ls[1].slice(0,19)+"…"}
 pdf.setFontSize(f);pdf.setFont(undefined,"normal");pdf.setTextColor(35,45,57);ls.forEach((l,i)=>pdf.text(l,tx,y+4.5+i*2.4));
 pdf.setFontSize(8);pdf.setFont(undefined,"bold");pdf.setTextColor(16,32,50);pdf.text($$(p.fin),tx,y+11.4);
 if(p.color){const pw=pdf.getTextWidth($$(p.fin)),hx=DAY.colorHex(p.color);let cx=tx+pw+2;
  if(hx&&hx[0]==="#"){pdf.setFillColor(parseInt(hx.slice(1,3),16),parseInt(hx.slice(3,5),16),parseInt(hx.slice(5,7),16));pdf.setDrawColor(90);pdf.setLineWidth(.15);pdf.circle(cx+1.1,y+10.6,1.1,"FD");cx+=3}
  pdf.setFontSize(5.5);pdf.setFont(undefined,"normal");pdf.setTextColor(60);pdf.text(String(p.color).slice(0,14),cx,y+11.3)}
 try{const c=document.createElement("canvas");JsBarcode(c,String(p.codigo_barras),{format:"CODE128",width:1.1,height:36,displayValue:false,margin:0});pdf.addImage(c.toDataURL("image/png"),"PNG",tx,y+13.4,tw,7.2);
  pdf.setFontSize(5);pdf.setFont(undefined,"normal");pdf.setTextColor(70);pdf.text(String(p.codigo_barras),tx+tw/2,y+24,{align:"center"})}catch(e){}}
async function etiquetas(){
 const cat=$("dCat2").value,q=norm($("dEtqQ").value),uno=$("dEtqM").value==="uno",L=P.filter(p=>(!cat||p.cat===cat)&&p.codigo_barras&&(uno||p.stock>0)&&(!q||norm(p.nombre).includes(q)));
 if(!L.length){toast("No hay productos con código de barras y stock"+(cat?" en esa categoría":""));return}
 const cn=p=>uno?1:p.stock,tot=sum(L,cn);
 if(!await confirmar(`Se generarán <b>${tot}</b> etiquetas (${uno?"una por cada producto o color":"una por cada unidad en stock"}) de <b>${L.length}</b> producto(s).`,{titulo:"Etiquetas de código de barras",ok:"Generar PDF"}))return;
 await espera(async()=>{await lib("https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js");await lib("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  const {jsPDF}=window.jspdf,pdf=new jsPDF("p","mm","a4"),per=LC*LR,gx=(210-(LC*LW+(LC-1)*GX))/2,gy=(297-(LR*LH+(LR-1)*GY))/2;let n=0;
  L.forEach(p=>{for(let u=0;u<cn(p);u++){if(n>0&&n%per===0)pdf.addPage();const pos=n%per;etiqueta(pdf,p,gx+(pos%LC)*(LW+GX),gy+Math.floor(pos/LC)*(LH+GY));n++}});
  pdf.save("etiquetas-"+(cat?norm(cat).replace(/[^a-z0-9]+/g,"_"):"todas")+"-"+ymd(new Date())+".pdf");toast(tot+" etiquetas generadas")},"Generando etiquetas…")}
async function excelInv(){
 if(!P.length){toast("No hay productos para exportar");return}
 await excel("inventario-daymar",[{n:"Inventario",c:[["Código",14],["Producto",34],["Categoría",18],["Código de barras",20],["Stock",9],["Stock mínimo",12],["Precio",12,"money"],["Descuento %",12],["Precio final",12,"money"],["Valor en stock",14,"money"]].concat(ADM?[["Costo",12,"money"]]:[]),
  f:P.map(p=>[p.codigo||"",p.nombre,p.cat,p.codigo_barras||"",p.stock,p.stock_minimo,+p.precio_venta,+p.descuento_pct||0,p.fin,r2(p.val)].concat(ADM?[+p.precio_costo]:[]))}])}
$("bPdf").onclick=reportePdf;$("bCat").onclick=catalogoPdf;$("bEtq").onclick=etiquetas;$("bXls").onclick=excelInv;$("bRef").onclick=async()=>{await espera(cargar,"Actualizando…");pintar();toast("Datos actualizados")};
pestanas([["res","Resumen",IC.sum],["cat","Categorías",IC.cat],["top","Productos",IC.top],["doc","Documentos",IC.doc]],()=>{});
await espera(cargar,"Cargando inventario…");pintar();
})();
