/* DAYMARSV · Búsqueda por foto: compara una foto con las fotos de los productos y muestra los más parecidos.
   Todo corre en el dispositivo (TensorFlow.js + MobileNet); las fotos no se envían a ningún servidor de análisis. */
(()=>{
"use strict";
const LIBS=["https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js","https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js"];
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cargarJs=u=>new Promise((ok,ko)=>{if(document.querySelector(`script[data-fb="${u}"]`))return ok();const s=document.createElement("script");s.src=u;s.dataset.fb=u;s.onload=ok;s.onerror=()=>ko(new Error("No se pudo cargar el módulo de imágenes. Revisa tu conexión."));document.head.appendChild(s)});

/* Pequeña base local (IndexedDB) para no recalcular las huellas de las fotos cada vez */
const DB="dms_fotobusq3",ST="huellas";   /* v3: modelo ligero; huella = foto completa + centro recortado */
try{indexedDB.deleteDatabase("dms_fotobusq");indexedDB.deleteDatabase("dms_fotobusq2")}catch(e){}
const abrirDB=()=>new Promise(res=>{try{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(ST);r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(e){res(null)}});
const leerTodo=db=>new Promise(res=>{if(!db)return res(new Map());try{const m=new Map(),c=db.transaction(ST).objectStore(ST).openCursor();c.onsuccess=()=>{const k=c.result;if(k){m.set(k.key,k.value);k.continue()}else res(m)};c.onerror=()=>res(m)}catch(e){res(new Map())}});
const guardar=(db,id,v)=>{try{if(db)db.transaction(ST,"readwrite").objectStore(ST).put(v,id)}catch(e){}};
const borrar=(db,id)=>{try{if(db)db.transaction(ST,"readwrite").objectStore(ST).delete(id)}catch(e){}};

let modelo=null,promLibs=null;
async function prepararModelo(){
 if(modelo)return modelo;
 if(!promLibs)promLibs=(async()=>{for(const u of LIBS)await cargarJs(u);await tf.ready();modelo=await mobilenet.load({version:2,alpha:0.5});return modelo})().catch(e=>{promLibs=null;throw e});
 return promLibs}

async function huella(fuente){
 return tf.tidy(()=>{const t=tf.browser.fromPixels(fuente),e=modelo.infer(t,true),n=e.div(e.norm());return n.flatten()}).data()}
const aF32=a=>a instanceof Float32Array?a:new Float32Array(a);
const coseno=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s};

function cargarImg(url){return new Promise((ok,ko)=>{const im=new Image();im.crossOrigin="anonymous";im.onload=()=>ok(im);im.onerror=()=>ko(new Error("foto"));im.src=url})}
/* Recorte del centro (quita bordes, medidas y texto de las fotos de catálogo) */
async function aCentro(fuente,frac,w){const c=document.createElement("canvas");c.width=w;c.height=w;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,w,w);
 const sw=fuente.naturalWidth||fuente.width,sh=fuente.naturalHeight||fuente.height,m=Math.min(sw,sh)*frac;x.drawImage(fuente,(sw-m)/2,(sh-m)/2,m,m,0,0,w,w);return c}
/* Huella combinada: promedio de la foto completa y del centro, normalizado */
/* Las dos versiones (completa y centro) se analizan juntas en una sola pasada del modelo */
async function huellaDoble(im){const c1=await aCanvas(im,224,224),c2=await aCentro(im,.68,224);
 const d=await tf.tidy(()=>{const b=tf.stack([tf.browser.fromPixels(c1),tf.browser.fromPixels(c2)]),e=modelo.infer(b,true),n=e.div(e.norm("euclidean",1,true)),s=n.sum(0);return s.div(s.norm())}).data();
 return aF32(d)}
async function aCanvas(fuente,w,h){const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,w,h);
 const sw=fuente.naturalWidth||fuente.width,sh=fuente.naturalHeight||fuente.height,k=Math.min(w/sw,h/sh);x.drawImage(fuente,(w-sw*k)/2,(h-sh*k)/2,sw*k,sh*k);return c}

/* Calcula (o recupera) la huella de cada producto con foto. Llama a prog(hechos,total). */
async function indexar(prods,prog){
 const db=await abrirDB(),cache=await leerTodo(db),lista=prods.filter(p=>p.foto_url),H=new Map();let hechos=0,fallos=0;
 const vivos=new Set(lista.map(p=>p.id));cache.forEach((v,k)=>{if(!vivos.has(k))borrar(db,k)});
 /* descarga las fotos por adelantado (varias a la vez) mientras el modelo analiza */
 const falta=lista.filter(p=>{const c=cache.get(p.id);return !(c&&c.url===p.foto_url&&c.v)}),cola=new Map();let ix=0;
 const llenar=()=>{while(cola.size<8&&ix<falta.length){const u=falta[ix++].foto_url;if(!cola.has(u))cola.set(u,(x=>(x.catch(()=>{}),x))(cargarImg(u)))}};
 const pre=u=>{llenar();const pr=cola.get(u)||cargarImg(u);cola.delete(u);llenar();return pr};
 llenar();
 for(const p of lista){
  const c=cache.get(p.id);
  if(c&&c.url===p.foto_url&&c.v){H.set(p.id,aF32(c.v))}
  else{try{const im=await pre(p.foto_url),v=await huellaDoble(im);H.set(p.id,v);guardar(db,p.id,{url:p.foto_url,v:v.buffer.slice(0)})}catch(e){fallos++}}
  hechos++;if(hechos%4===0||hechos===lista.length){prog(hechos,lista.length);await tf.nextFrame()}}
 return {H,fallos,total:lista.length,sinFoto:prods.length-lista.length}}

function abrir(productos,alElegir){
 if(document.getElementById("fbDlg"))return;
 const d=document.createElement("dialog");d.id="fbDlg";
 d.style.cssText="border:0;border-radius:16px;padding:0;margin:auto;width:min(620px,95vw);max-height:92vh;background:var(--card,#fff);color:var(--ink,#2a1a1f);box-shadow:0 20px 60px rgba(0,0,0,.35)";
 d.innerHTML=`<style>#fbDlg::backdrop{background:rgba(0,0,0,.55)}#fbDlg .fbb{padding:10px 16px;border:1px solid var(--line,#e6dde0);border-radius:12px;background:var(--card,#fff);color:inherit;font:inherit;font-weight:600;cursor:pointer}#fbDlg .fbb:focus:not(:focus-visible){outline:none;box-shadow:none}#fbDlg .fbb.pr{background:var(--wine,#6B2D3E);color:#fff;border-color:transparent}#fbDlg .fbr{display:flex;gap:12px;align-items:center;width:100%;text-align:left;padding:8px;border:1px solid var(--line,#e6dde0);border-radius:12px;background:none;color:inherit;font:inherit;cursor:pointer;margin-bottom:8px}#fbDlg .fbr:hover{border-color:var(--wine,#6B2D3E)}#fbDlg .fbr img{width:64px;height:64px;object-fit:cover;border-radius:10px;background:var(--chip,#f0e6e9);flex:none}#fbDlg .fbsp{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--mute,#7b6a70)}#fbDlg .fbsp i{width:22px;height:22px;border-radius:50%;border:3px solid var(--chip,#f0e6e9);border-top-color:var(--wine,#6B2D3E);animation:fbgira .8s linear infinite;flex:none}@keyframes fbgira{to{transform:rotate(360deg)}}</style>
 <div style="padding:16px;display:grid;gap:12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">Buscar por foto</h3><button type="button" class="fbb" id="fbX">Cerrar</button></div>
 <div id="fbEst" style="font-size:13px;color:var(--mute,#7b6a70)"></div>
 <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="fbb pr" id="fbCam">Tomar foto</button><button type="button" class="fbb" id="fbGal">Elegir de la galería</button></div>
 <input type="file" id="fbF1" accept="image/*" capture="environment" hidden><input type="file" id="fbF2" accept="image/*" hidden>
 <div id="fbPv" style="display:none"><img id="fbIm" alt="" style="max-width:100%;max-height:180px;border-radius:12px;display:block"></div>
 <div id="fbRes" style="max-height:48vh;overflow:auto"></div>
</div>`;
 document.body.appendChild(d);d.showModal();d.addEventListener("close",()=>d.remove());try{document.activeElement&&document.activeElement.blur()}catch(e){}
 const $=s=>d.querySelector(s),est=(t,gira)=>{const e=$("#fbEst");if(gira){e.innerHTML=`<span class="fbsp"><i></i>${esc(t)}</span>`}else e.textContent=t};
 $("#fbX").onclick=()=>d.close();
 let listo=null;
 const preparar=()=>listo||(listo=(async()=>{
  await prepararModelo();
  const r=await indexar(productos,()=>{});
  est("");return r})().catch(e=>{listo=null;est("No se pudo preparar la búsqueda: "+(e.message||e));throw e}));
 preparar().catch(()=>{});
 async function analizar(file){
  if(!file)return;const url=URL.createObjectURL(file);$("#fbIm").src=url;$("#fbPv").style.display="block";$("#fbRes").innerHTML="";
  try{est("Cargando…",true);const r=await preparar();est("Buscando…",true);await new Promise(r=>setTimeout(r,30));
   const im=await cargarImg(url),v=await huellaDoble(im);
   const sc=[];r.H.forEach((h,id)=>sc.push([id,coseno(v,h)]));sc.sort((a,b)=>b[1]-a[1]);
   if(!sc.length){est("No hay productos con foto para comparar.");return}
   /* ¿Qué tanto se separa cada resultado del resto? Una coincidencia real sobresale; una foto sin relación da puntajes parecidos para todos */
   const media=sc.reduce((t,x)=>t+x[1],0)/sc.length,de=Math.sqrt(sc.reduce((t,x)=>t+(x[1]-media)**2,0)/sc.length)||1e-6;
   const todos=sc.slice(0,6).map(([id,s])=>({p:productos.find(x=>x.id===id),s,z:(s-media)/de})).filter(x=>x.p);
   const bueno=x=>x.s>=0.74||(x.s>=0.62&&x.z>=4.5);
   const nivel=x=>x.s>=0.82||(x.s>=0.7&&x.z>=6)?["Muy parecido","var(--ok,#2f7d4f)"]:x.s>=0.74||x.z>=5?["Parecido","var(--wine,#6B2D3E)"]:["Posible","var(--mute,#7b6a70)"];
   const fila=(x,i,tenue)=>{const n=nivel(x);return `<button type="button" class="fbr" data-i="${i}" style="${tenue?"opacity:.6":""}"><img src="${esc(x.p.foto_url)}" alt=""><span style="flex:1;min-width:0"><b style="display:block;font-size:14px">${esc(x.p.nombre)}</b><small style="color:var(--mute,#7b6a70)">${esc(x.p.codigo_barras||x.p.codigo||"")} · stock ${esc(x.p.stock)} · $${Number(x.p.fin!=null?x.p.fin:x.p.precio_venta||0).toFixed(2)}</small></span><b style="font-size:12px;color:${n[1]};white-space:nowrap">${n[0]}</b></button>`};
   let L=todos.filter(bueno).slice(0,5);
   if(L.length){est(L.length===1?"Encontré este producto:":"Productos parecidos:");$("#fbRes").innerHTML=L.map((x,i)=>fila(x,i)).join("")}
   else{L=todos.slice(0,4);est("No encontré ningún producto parecido.");
    $("#fbRes").innerHTML=`<div style="font-size:13px;color:var(--mute,#7b6a70);margin:0 0 10px;line-height:1.45">Prueba con otra foto: el producto solo, centrado, de cerca y con buena luz, sobre un fondo liso.</div><button type="button" class="fbb" id="fbVer" style="width:100%">Ver opciones de todas formas</button><div id="fbDud" style="display:none;margin-top:10px">${L.map((x,i)=>fila(x,i,true)).join("")}</div>`;
    $("#fbVer").onclick=()=>{$("#fbVer").style.display="none";$("#fbDud").style.display="block"}}
   $("#fbRes").onclick=e=>{const b=e.target.closest("[data-i]");if(!b)return;const p=L[+b.dataset.i].p;d.close();alElegir(p)}
  }catch(e){est("No se pudo analizar la foto: "+(e.message||e))}finally{setTimeout(()=>URL.revokeObjectURL(url),60000)}}
 $("#fbCam").onclick=()=>$("#fbF1").click();$("#fbGal").onclick=()=>$("#fbF2").click();
 ["#fbF1","#fbF2"].forEach(s=>$(s).addEventListener("change",e=>{analizar(e.target.files&&e.target.files[0]);e.target.value=""}))}
window.FotoBusq={abrir};
})();
