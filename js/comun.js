/* DAYMAR-SHOP · utilidades de interfaz compartidas por las páginas nuevas (ventanas, avisos, PDF, Excel) */
(function(){
const {db,esc,$$,ymd,toast}=DAY;
const $=id=>document.getElementById(id);
const r2=x=>Math.round((Number(x)+Number.EPSILON)*100)/100;
const cents=x=>Math.round((Number(x)+Number.EPSILON)*100);
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const fdate=v=>{if(!v)return"—";const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);if(m)return m[3]+"/"+m[2]+"/"+m[1];return new Date(v).toLocaleDateString("es-SV",{day:"2-digit",month:"2-digit",year:"numeric"})};
const ftime=v=>v?new Date(v).toLocaleTimeString("es-SV",{hour:"2-digit",minute:"2-digit"}):"";
const money=n=>"$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const ic=d=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const deb=(f,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};
const rpc=async(fn,args)=>{const {data,error}=await db.rpc(fn,args);if(error)throw new Error(error.message);return data};
const fetchAll=async mk=>{let out=[],from=0;for(;;){const {data,error}=await mk().range(from,from+999);if(error)throw new Error(error.message);out=out.concat(data);if(data.length<1000)break;from+=1000}return out};
const lib=url=>lib.c[url]||(lib.c[url]=new Promise((ok,ko)=>{const s=document.createElement("script");s.src=url;s.onload=ok;s.onerror=()=>{delete lib.c[url];ko(new Error("No se pudo cargar una librería. Revisa tu conexión."))};document.head.appendChild(s)}));lib.c={};
const espera=async(fn,txt)=>{const o=$("ov");if(o){$("ovT").textContent=txt||"Procesando…";o.classList.add("on")}
 try{return await fn()}catch(e){console.error(e);toast(e.message||"Ocurrió un error");return undefined}finally{if(o)o.classList.remove("on")}};
function modal(title,html,o){o=o||{};
 const d=document.createElement("dialog");if(o.big)d.className="big";
 d.innerHTML=`<div class="dh"><h2>${title}</h2><button class="x" type="button" data-x aria-label="Cerrar">×</button></div><div class="db">${html}</div>${o.foot?`<div class="df">${o.foot}</div>`:""}`;
 document.body.appendChild(d);
 const api={el:d,q:s=>d.querySelector(s),close:()=>{try{d.close()}catch(e){}d.remove();o.onclose&&o.onclose()}};
 d.addEventListener("click",e=>{if(e.target.closest("[data-x]"))api.close()});
 d.addEventListener("cancel",e=>{e.preventDefault();api.close()});
 d.showModal();return api}
function confirmar(texto,o){o=o||{};return new Promise(ok=>{let r=false;
 const m=modal(esc(o.titulo||"Confirmar"),`<div>${texto}</div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn ${o.peligro?"dg":""}" id="cfOk">${esc(o.ok||"Confirmar")}</button>`,onclose:()=>ok(r)});
 m.q("#cfOk").onclick=()=>{r=true;m.close()};setTimeout(()=>m.q("#cfOk").focus(),50)})}
/* Pide la contraseña de la cuenta antes de acciones delicadas */
function pedirClave(motivo){return new Promise(async ok=>{let r=false,email="";
 try{email=(await db.auth.getSession()).data.session.user.email}catch(e){}
 const m=modal("Acceso restringido",`<p class="pw">${esc(motivo)} Ingresa tu contraseña para continuar:</p><input id="pwI" type="password" autocomplete="current-password" placeholder="Contraseña"><div class="err2" id="pwE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="pwOk">Continuar</button>`,onclose:()=>ok(r)});
 const go=async()=>{const b=m.q("#pwOk");b.disabled=true;m.q("#pwE").textContent="";
  const {error}=await db.auth.signInWithPassword({email,password:m.q("#pwI").value});b.disabled=false;
  if(error){m.q("#pwE").textContent="Contraseña incorrecta.";m.q("#pwI").value="";return}r=true;m.close()};
 m.q("#pwOk").onclick=go;m.q("#pwI").addEventListener("keydown",e=>{if(e.key==="Enter")go()});setTimeout(()=>m.q("#pwI").focus(),50)})}
/* Barra inferior de pestañas (celular) / pestañas superiores (escritorio) */
function pestanas(tabs,onTab,inicial){
 const nav=$("bnav");nav.innerHTML=tabs.map(t=>`<button type="button" data-p="${t[0]}">${ic(t[2])}<span>${t[1]}</span></button>`).join("");
 let cur=null;
 const go=k=>{if(!tabs.some(t=>t[0]===k))k=tabs[0][0];cur=k;nav.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.p===k));
  tabs.forEach(t=>{const s=$("p-"+t[0]);if(s)s.classList.toggle("hidden",t[0]!==k)});try{history.replaceState(null,"","#"+k)}catch(e){}onTab(k)};
 nav.addEventListener("click",e=>{const b=e.target.closest("[data-p]");if(b)go(b.dataset.p)});
 addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(h&&h!==cur&&tabs.some(t=>t[0]===h))go(h)});
 const h0=location.hash.slice(1);go(tabs.some(t=>t[0]===h0)?h0:inicial||tabs[0][0]);return go}
/* Documentos (informes) para imprimir o guardar en PDF */
const DOC_CSS=`.fx{font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;box-sizing:border-box;font-size:13px;line-height:1.35;width:794px;padding:44px 48px}
.fx *{box-sizing:border-box}.fx h1{margin:0;font-size:24px;color:#6B2D3E}.fx h2{font-size:15px;color:#6B2D3E;margin:18px 0 6px;border-bottom:2px solid #C9973F;padding-bottom:3px}
.fx .sl{color:#C9973F;font-weight:700;font-size:12px}.fx small{color:#666}.fx .top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #6B2D3E;padding-bottom:12px;margin-bottom:12px}
.fx .no{text-align:right}.fx table{width:100%;border-collapse:collapse;margin-top:4px}.fx th{background:#6B2D3E;color:#fff;text-align:left;font-size:12px;padding:6px 8px}
.fx td{padding:6px 8px;border-bottom:1px solid #e6dde0;vertical-align:top}.fx .r{text-align:right;white-space:nowrap}.fx tr.t td{font-weight:700;background:#f7f2f3;border-top:2px solid #6B2D3E}
.fx .k{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}.fx .k div{flex:1;min-width:130px;background:#f7f2f3;border-radius:8px;padding:8px 10px}.fx .k b{display:block;font-size:17px;color:#6B2D3E}.fx .k span{font-size:11px;color:#666}
.fx .ok{color:#2f7d4f}.fx .bad{color:#b3261e}`;
function imprimir(html){
 const f=document.createElement("iframe");f.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0";document.body.appendChild(f);
 const d=f.contentWindow.document;d.open();d.write(`<!doctype html><html><head><meta charset="utf-8"><title>DAYMAR-SHOP</title><style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}</style></head><body>${html}</body></html>`);d.close();
 setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast("No se pudo abrir la impresión")}setTimeout(()=>f.remove(),120000)},350)}
async function descargarPdf(html,nombre){
 await espera(async()=>{
  await lib("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");await lib("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  const host=document.createElement("div");host.style.cssText="position:fixed;left:-10000px;top:0;background:#fff";host.innerHTML=html;document.body.appendChild(host);
  await new Promise(r=>setTimeout(r,150));
  const c=await html2canvas(host.firstElementChild,{backgroundColor:"#ffffff",scale:2,useCORS:true,logging:false});host.remove();
  const {jsPDF}=window.jspdf,p=new jsPDF("p","mm","a4"),W=210,H=297,pageH=Math.floor(c.width*H/W);
  for(let y=0;y<c.height;y+=pageH){const s=document.createElement("canvas");s.width=c.width;s.height=Math.min(pageH,c.height-y);const x=s.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,s.width,s.height);x.drawImage(c,0,y,c.width,s.height,0,0,c.width,s.height);
   if(y)p.addPage();p.addImage(s.toDataURL("image/jpeg",.95),"JPEG",0,0,W,s.height*W/c.width)}
  p.save(nombre);toast("PDF generado")},"Generando PDF…")}
async function vistaDoc(titulo,html,nombre){
 const m=modal(esc(titulo),`<div class="docv" id="dvB"><div class="dvz">${html}</div></div>`,{big:true,foot:`<button class="btn g" data-x>Cerrar</button><button class="btn g" id="dvP">Imprimir</button><button class="btn" id="dvD">Descargar PDF</button>`});
 const box=m.q("#dvB"),z=Math.min(1,(box.clientWidth-8)/794);box.firstElementChild.style.zoom=z>0?z:1;
 m.q("#dvP").onclick=()=>imprimir(html);m.q("#dvD").onclick=()=>descargarPdf(html,nombre+".pdf");return m}
/* Excel con encabezado de color. hojas=[{n:"Hoja",c:[["Columna",ancho,"money?"]],f:[[...]]}] */
async function excel(nombre,hojas){
 await espera(async()=>{await lib("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
  const wb=new ExcelJS.Workbook();
  hojas.forEach(h=>{const ws=wb.addWorksheet(h.n);ws.columns=h.c.map(c=>({header:c[0],width:c[1]||16}));
   const hr=ws.getRow(1);hr.font={bold:true,color:{argb:"FFFFFFFF"}};hr.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF6B2D3E"}};hr.height=22;hr.alignment={vertical:"middle"};
   h.f.forEach(r=>ws.addRow(r));h.c.forEach((c,i)=>{if(c[2]==="money")ws.getColumn(i+1).numFmt='"$"#,##0.00'});ws.views=[{state:"frozen",ySplit:1}]});
  const buf=await wb.xlsx.writeBuffer(),a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  a.download=nombre+"-"+ymd(new Date())+".xlsx";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast("Excel generado")},"Generando Excel…")}
/* Periodo rápido → [desde, hasta] como YYYY-MM-DD */
function rango(q){const t=new Date(),y=t.getFullYear(),m=t.getMonth(),d=t.getDate();
 if(q==="today")return[ymd(t),ymd(t)];
 if(q==="month")return[ymd(new Date(y,m,1)),ymd(t)];
 if(q==="prev")return[ymd(new Date(y,m-1,1)),ymd(new Date(y,m,0))];
 if(q==="3m")return[ymd(new Date(y,m-2,1)),ymd(t)];
 if(q==="year")return[ymd(new Date(y,0,1)),ymd(t)];
 return["2000-01-01",ymd(t)]}
window.UI={$,r2,cents,norm,fdate,ftime,money,ic,deb,rpc,fetchAll,lib,espera,modal,confirmar,pedirClave,pestanas,DOC_CSS,imprimir,descargarPdf,vistaDoc,excel,rango};
})();
