/* DAYMARSV · Quitar el fondo de las fotos de productos.
   Todo corre en el celular o la computadora (gratis, sin cuentas): modelo U²-Netp (Apache-2.0, ver modelos/LEEME.txt)
   con ONNX Runtime Web. La primera vez descarga ~19 MB; después queda guardado en el navegador. */
(function(){
const ORT_VER="1.30.0",ORT_BASE="https://cdn.jsdelivr.net/npm/onnxruntime-web@"+ORT_VER+"/dist/";
const MODELO=(document.currentScript&&document.currentScript.src?document.currentScript.src.replace(/js\/fondo\.js.*$/,""):"")+"modelos/u2netp.onnx?v=1";
const LADO=320,MEAN=[.485,.456,.406],STD=[.229,.224,.225];
let sesion=null,cargando=null;

const script=src=>new Promise((ok,ko)=>{const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=()=>ko(new Error("No se pudo descargar la herramienta. Revisa tu internet."));document.head.appendChild(s)});

async function preparar(){
 if(sesion)return sesion;
 if(!cargando)cargando=(async()=>{
  if(!window.ort)await script(ORT_BASE+"ort.wasm.min.js");
  ort.env.wasm.wasmPaths=ORT_BASE;
  ort.env.wasm.numThreads=self.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||2):1;
  const r=await fetch(MODELO);if(!r.ok)throw new Error("No se pudo descargar el modelo ("+r.status+")");
  sesion=await ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()),{executionProviders:["wasm"]});
  return sesion})().catch(e=>{cargando=null;throw e});
 return cargando}

const aImagen=src=>new Promise((ok,ko)=>{const i=new Image();i.crossOrigin="anonymous";i.onload=()=>ok(i);i.onerror=()=>ko(new Error("No se pudo abrir la foto"));i.src=src});
async function cargarImagen(x){
 if(x instanceof HTMLImageElement||x instanceof HTMLCanvasElement)return x;
 if(x instanceof Blob){const u=URL.createObjectURL(x);try{return await aImagen(u)}finally{setTimeout(()=>URL.revokeObjectURL(u),2000)}}
 return aImagen(String(x))}
const lienzo=(w,h)=>{const c=document.createElement("canvas");c.width=w;c.height=h;return c};

/* Devuelve la máscara (0–255) del producto, del tamaño de la foto */
async function mascara(img){
 const s=await preparar();
 const W=img.naturalWidth||img.width,H=img.naturalHeight||img.height;
 const c=lienzo(LADO,LADO),x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0,LADO,LADO);
 const px=x.getImageData(0,0,LADO,LADO).data,N=LADO*LADO,inp=new Float32Array(3*N);
 let mx=1;for(let i=0;i<px.length;i+=4)mx=Math.max(mx,px[i],px[i+1],px[i+2]);
 for(let i=0;i<N;i++)for(let k=0;k<3;k++)inp[k*N+i]=(px[i*4+k]/mx-MEAN[k])/STD[k];
 const out=await s.run({[s.inputNames[0]]:new ort.Tensor("float32",inp,[1,3,LADO,LADO])});
 const d=out[s.outputNames[0]].data;let lo=Infinity,hi=-Infinity;for(let i=0;i<N;i++){if(d[i]<lo)lo=d[i];if(d[i]>hi)hi=d[i]}
 const m=lienzo(LADO,LADO),mc=m.getContext("2d"),md=mc.createImageData(LADO,LADO),r=hi-lo||1;
 for(let i=0;i<N;i++){let t=((d[i]-lo)/r-.12)/.5;t=t<0?0:t>1?1:t*t*(3-2*t);const v=Math.round(t*255);md.data[i*4]=md.data[i*4+1]=md.data[i*4+2]=255;md.data[i*4+3]=v}
 mc.putImageData(md,0,0);
 const g=lienzo(W,H),gc=g.getContext("2d");gc.imageSmoothingQuality="high";gc.drawImage(m,0,0,W,H);
 return g}

/* Producto recortado (PNG transparente) */
async function recortar(fuente){
 const img=await cargarImagen(fuente),W=img.naturalWidth||img.width,H=img.naturalHeight||img.height;
 const m=await mascara(img),c=lienzo(W,H),x=c.getContext("2d");
 x.drawImage(img,0,0,W,H);x.globalCompositeOperation="destination-in";x.drawImage(m,0,0);
 return c}

/* Pone el producto sobre un fondo: color sólido o degradado. centrar=true lo recorta y lo centra en un cuadro */
function componer(recorte,{fondo="#ffffff",fondo2=null,centrar=true,lado=1000,margen=.08,sombra=true}={}){
 let sx=0,sy=0,sw=recorte.width,sh=recorte.height;
 if(centrar){const d=recorte.getContext("2d",{willReadFrequently:true}).getImageData(0,0,sw,sh).data;let x0=sw,y0=sh,x1=-1,y1=-1;
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)if(d[(y*sw+x)*4+3]>40){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  if(x1>=x0&&y1>=y0){sx=x0;sy=y0;sw=x1-x0+1;sh=y1-y0+1}}
 const W=centrar?lado:Math.min(lado,recorte.width),H=centrar?lado:Math.round(W*recorte.height/recorte.width);
 const c=lienzo(W,H),x=c.getContext("2d");
 if(fondo2){const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,fondo);g.addColorStop(1,fondo2);x.fillStyle=g}else x.fillStyle=fondo;
 x.fillRect(0,0,W,H);
 const esc=centrar?Math.min(W*(1-2*margen)/sw,H*(1-2*margen)/sh):W/recorte.width,dw=sw*esc,dh=sh*esc,dx=(W-dw)/2,dy=(H-dh)/2;
 if(sombra){x.save();x.shadowColor="rgba(60,20,30,.18)";x.shadowBlur=Math.round(W*.025);x.shadowOffsetY=Math.round(W*.01)}
 x.imageSmoothingQuality="high";x.drawImage(recorte,sx,sy,sw,sh,dx,dy,dw,dh);if(sombra)x.restore();
 return c}

const aBlob=(c,tipo="image/jpeg",q=.86)=>new Promise((ok,ko)=>c.toBlob(b=>b?ok(b):ko(new Error("No se pudo crear la foto")),tipo,q));

window.FONDO={preparar,recortar,componer,aBlob,listo:()=>!!sesion,
 FONDOS:[{k:"blanco",n:"Blanco",c:"#ffffff"},{k:"rosado",n:"Rosado",c:"#fbeef1",c2:"#f6dfe5"},{k:"vino",n:"Vino suave",c:"#f3e6ea",c2:"#e7cdd5"},{k:"crema",n:"Crema",c:"#faf6ef"}]};
})();
