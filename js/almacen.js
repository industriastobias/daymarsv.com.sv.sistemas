/* DAYMAR-SHOP · Almacenamiento (punto de venta) · conectado a Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,toggleTheme,mountSide,logout,requireSession}=DAY;
const $=id=>document.getElementById(id);
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
let EMAIL="";try{EMAIL=(await db.auth.getSession()).data.session.user.email}catch(e){}
mountSide($("side"),"almacenamiento",me.rol);
$("app").classList.remove("hidden");

/* ---------- utilidades ---------- */
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
const r2=x=>Math.round((Number(x)+Number.EPSILON)*100)/100;
const cents=x=>Math.round((Number(x)+Number.EPSILON)*100);
const fin=p=>r2(p.precio_venta*(1-(p.descuento_pct||0)/100));
const ic=d=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const IC={box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"/>',
 rec:'<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
 fac:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
 scan:'<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16"/>'};
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const lev=(a,b)=>{const m=[];for(let i=0;i<=b.length;i++)m[i]=[i];for(let j=0;j<=a.length;j++)m[0][j]=j;
 for(let i=1;i<=b.length;i++)for(let j=1;j<=a.length;j++)m[i][j]=b[i-1]===a[j-1]?m[i-1][j-1]:Math.min(m[i-1][j-1]+1,m[i][j-1]+1,m[i-1][j]+1);return m[b.length][a.length]};
const fuzzy=(text,q)=>{if(!text||!q)return false;text=norm(text);q=norm(q);if(text.includes(q))return true;
 const tw=text.split(/\s+/);return q.split(/\s+/).every(qw=>tw.some(w=>lev(qw,w)<=Math.max(1,Math.floor(qw.length*.3))))};
const hl=(t,q)=>{t=String(t||"");if(!q)return esc(t);const re=new RegExp("("+q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","gi");
 return t.split(re).map((x,i)=>i%2?"<mark>"+esc(x)+"</mark>":esc(x)).join("")};
const dkey=v=>{const d=new Date(v);return isNaN(d)?"":ymd(d)};
const fdate=v=>{if(!v)return"—";const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);if(m)return m[3]+"/"+m[2]+"/"+m[1];return new Date(v).toLocaleDateString("es-SV",{day:"2-digit",month:"2-digit",year:"numeric"})};
const ftime=v=>v?new Date(v).toLocaleTimeString("es-SV",{hour:"2-digit",minute:"2-digit"}):"";
const inicial=n=>esc((String(n||"?").trim()[0]||"?").toUpperCase());
const TIPO={inmediata:["Inmediata",""],cod:["Contra entrega","wa"],entrega_pendiente:["Pend. entrega","pu"],cobro_pendiente:["Pend. cobro","or"]};
const tipoBd=t=>`<span class="bd ${(TIPO[t]||TIPO.inmediata)[1]}">${(TIPO[t]||TIPO.inmediata)[0]}</span>`;
const pagoBd=m=>`<span class="bd ${m==="Transferencia"?"pu":"ok"}">${esc(m||"Efectivo")}</span>`;

/* ---------- sonidos (opcionales, nunca bloquean) ---------- */
let AC=null;
const snd=k=>{try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();const seq={beep:[[800,.08]],ok:[[600,.12],[800,.12]],err:[[220,.18],[180,.18]]}[k]||[];let t=AC.currentTime;
 seq.forEach(([f,d])=>{const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;o.type="sine";o.connect(g);g.connect(AC.destination);g.gain.setValueAtTime(.25,t);g.gain.exponentialRampToValueAtTime(.01,t+d);o.start(t);o.stop(t+d);t+=d})}catch(e){}};

/* ---------- códigos de barras ---------- */
const bcc=new Map();
const bcUrl=code=>{if(!code)return"";if(bcc.has(code))return bcc.get(code);let u="";
 try{const c=document.createElement("canvas");JsBarcode(c,String(code),{format:"CODE128",width:2,height:40,displayValue:false});u=c.toDataURL("image/png")}catch(e){}
 if(bcc.size>500)bcc.delete(bcc.keys().next().value);bcc.set(code,u);return u};

/* ---------- acceso a datos ---------- */
const fetchAll=async mk=>{let out=[],from=0;for(;;){const {data,error}=await mk().range(from,from+999);if(error)throw error;out=out.concat(data);if(data.length<1000)break;from+=1000}return out};
const rpc=async(fn,args)=>{const {data,error}=await db.rpc(fn,args);if(error)throw new Error(error.message);return data};
const espera=async(fn,txt)=>{$("ovT").textContent=txt||"Procesando…";$("ov").classList.add("on");
 try{return await fn()}catch(e){console.error(e);toast(e.message||"Ocurrió un error");snd("err");return undefined}finally{$("ov").classList.remove("on")}};
const lib=url=>lib.c[url]||(lib.c[url]=new Promise((ok,ko)=>{const s=document.createElement("script");s.src=url;s.onload=ok;s.onerror=()=>ko(new Error("No se pudo cargar una librería. Revisa tu conexión."));document.head.appendChild(s)}));lib.c={};

const S={prods:[],byId:new Map(),filt:[],page:1,size:1000,view:LS("dms_vw")||(matchMedia("(min-width:800px)").matches?"table":"cards"),
 multi:false,sel:new Map(),usb:false,tab:"inv",pt:"cod",pend:[],ventas:[],vShown:100,stamp:0,hist:[]};
try{S.hist=JSON.parse(LS("dms_hist2")||"[]")}catch(e){}

async function cargarProductos(){
 const rows=await fetchAll(()=>db.from("productos").select("id,codigo,nombre,precio_venta,precio_costo,descuento_pct,stock,stock_minimo,foto_url,codigo_barras,descripcion,fecha_compra,created_at,categorias(nombre)").eq("activo",true).order("nombre"));
 let vs=[];try{vs=await fetchAll(()=>db.from("producto_variantes").select("id,producto_id,nombre,codigo_barras,stock,orden").order("orden").order("nombre"))}catch(e){}
 const VB={};vs.forEach(v=>(VB[v.producto_id]=VB[v.producto_id]||[]).push(v));
 S.prods=[];S.all=[];S.byId=new Map();rows.forEach(p=>{p.cat=p.categorias?p.categorias.nombre:"";p.fin=fin(p);p.dia=p.fecha_compra||dkey(p.created_at);
  S.prods.push(p);S.byId.set(p.id,p);const L=VB[p.id];if(!L){S.all.push(p);return}
  /* un producto con colores es UNO solo en la lista; al vender se elige el color */
  p.vars=[];let suma=0;
  L.forEach(v=>{suma+=v.stock;const e=Object.assign({},p,{id:p.id+"~"+v.id,real:p.id,vid:v.id,vnom:v.nombre,base:p,vars:null,nombre:p.nombre+" – "+v.nombre,stock:v.stock,codigo_barras:v.codigo_barras||p.codigo_barras});p.vars.push(e);S.byId.set(e.id,e);S.all.push(e)});
  if(p.stock>suma){const e=Object.assign({},p,{id:p.id+"~0",real:p.id,vnom:"Sin color",base:p,vars:null,nombre:p.nombre+" – sin color",stock:p.stock-suma});p.vars.push(e);S.byId.set(e.id,e);S.all.push(e)}
  S.all.push(p)});
 S.stamp=Date.now();
 const cats=[...new Set(S.prods.map(p=>p.cat).filter(Boolean))].sort(),cur=$("fCat").value;
 $("fCat").innerHTML='<option value="">Todas</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");$("fCat").value=cur;
 stats()}
function stats(){
 const v=S.prods.reduce((s,p)=>s+p.fin*(p.stock||0),0);$("totalAmount").textContent=$$(v);
 $("nTotal").textContent=new Set(S.prods.map(p=>p.real||p.id)).size}
const SEL_ITEMS="id,cantidad,precio_unit,precio_original,descuento_pct,nombre,codigo,codigo_barras,producto_id,es_libre,productos(foto_url,nombre,codigo,codigo_barras)";
async function cargarPend(){
 S.pend=await fetchAll(()=>db.from("ventas").select(`*,profiles(nombre),venta_items(${SEL_ITEMS})`)
  .or("estado.eq.pendiente,and(estado.eq.completada,tipo.in.(entrega_pendiente,cobro_pendiente),oculto_pendientes.eq.false)").order("created_at",{ascending:false}));
 badges()}
async function badges(){
 const pe=S.pend.filter(v=>v.estado==="pendiente");
 const n=t=>pe.filter(v=>v.tipo===t).length;
 $("nCod").textContent=n("cod");$("nEnt").textContent=n("entrega_pendiente");$("nCob").textContent=n("cobro_pendiente");
 const d0=new Date();d0.setHours(0,0,0,0);
 const {count}=await db.from("ventas").select("id",{count:"exact",head:true}).eq("estado","completada").gte("created_at",d0.toISOString());
 navBadge("pend",pe.length);navBadge("hoy",count||0)}
function navBadge(k,n){const b=document.querySelector(`#bnav [data-p="${k}"] .nb`);if(!b)return;b.textContent=n;b.classList.toggle("hidden",!n)}

/* ---------- diálogos ---------- */
function modal(title,html,o){o=o||{};
 const d=document.createElement("dialog");if(o.big)d.className="big";
 d.innerHTML=`<div class="dh"><h2>${title}</h2><button class="x" type="button" data-x aria-label="Cerrar">×</button></div><div class="db">${html}</div>${o.foot?`<div class="df">${o.foot}</div>`:""}`;
 document.body.appendChild(d);
 const api={el:d,q:s=>d.querySelector(s),close:()=>{try{d.close()}catch(e){}d.remove();o.onclose&&o.onclose()}};
 let sucio=false;
 d.addEventListener("input",()=>{sucio=true});d.addEventListener("change",()=>{sucio=true});
 /* tocar fuera de la ventana la cierra, salvo que ya hayas escrito o cambiado algo (para no perderlo por accidente) */
 d.addEventListener("click",e=>{if(e.target.closest("[data-x]")){api.close();return}
  if(e.target===d&&!sucio&&!o.fijo){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)api.close()}});
 d.addEventListener("cancel",e=>{e.preventDefault();api.close()});
 d.showModal();return api}
function confirmar(texto,o){o=o||{};return new Promise(ok=>{let r=false;
 const m=modal(esc(o.titulo||"Confirmar"),`<div>${texto}</div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn ${o.peligro?"dg":""}" id="cfOk">${esc(o.ok||"Confirmar")}</button>`,onclose:()=>ok(r)});
 m.q("#cfOk").onclick=()=>{r=true;m.close()};setTimeout(()=>m.q("#cfOk").focus(),50)})}
/* Pide la contraseña de la cuenta (protege precios, stock y borrados) */
function pedirClave(motivo){return new Promise(ok=>{let r=false;
 const m=modal("Acceso restringido",`<p class="pw">${esc(motivo)} Ingresa tu contraseña para continuar:</p><input id="pwI" type="password" autocomplete="current-password" placeholder="Contraseña"><div class="err2" id="pwE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="pwOk">Continuar</button>`,onclose:()=>ok(r)});
 const go=async()=>{const b=m.q("#pwOk");b.disabled=true;m.q("#pwE").textContent="";
  const {error}=await db.auth.signInWithPassword({email:EMAIL,password:m.q("#pwI").value});b.disabled=false;
  if(error){m.q("#pwE").textContent="Contraseña incorrecta.";m.q("#pwI").value="";snd("err");return}r=true;m.close()};
 m.q("#pwOk").onclick=go;m.q("#pwI").addEventListener("keydown",e=>{if(e.key==="Enter")go()});setTimeout(()=>m.q("#pwI").focus(),50)})}
const soloAdmin=()=>{if(ADM)return true;toast("Esta acción es solo para el administrador.");return false};
function verImagen(src){if(!src)return;const m=modal("Imagen",`<img class="big2" src="${esc(src)}" alt="">`,{foot:""})}
function verBarras(code){const u=bcUrl(code);if(!u)return;modal("Código de barras",`<img class="bcbig" src="${u}" alt=""><p style="text-align:center;font:700 20px monospace;letter-spacing:2px">${esc(code)}</p>`,{foot:""})}

/* ---------- inventario: filtros y lista ---------- */
function addHist(q){q=q.trim();if(q.length<2)return;S.hist=[q].concat(S.hist.filter(h=>h!==q)).slice(0,8);LS("dms_hist2",JSON.stringify(S.hist));drawHist()}
function drawHist(){const h=$("hist");if(!S.hist.length){h.classList.remove("on");h.innerHTML="";return}
 h.classList.add("on");h.innerHTML="<span>Historial:</span>"+S.hist.map(x=>`<button type="button" data-h="${esc(x)}">${esc(x)}</button>`).join("")+'<button type="button" class="clr" data-clr>Limpiar</button>'}
function filtrar(keep){
 const q=$("fSearch").value.trim(),cat=$("fCat").value,mn=parseFloat($("fMin").value)||0,mx=parseFloat($("fMax").value)||Infinity,
  bc=$("fBar").value.trim().toLowerCase(),dt=$("fDate").value,low=$("fLow").checked,ql=norm(q);
 S.filt=S.prods.filter(p=>(!q||fuzzy(p.nombre,q)||norm(p.codigo).includes(ql))&&(!cat||p.cat===cat)&&p.fin>=mn&&p.fin<=mx&&
  (!bc||(p.codigo_barras||"").toLowerCase().includes(bc))&&(!dt||p.dia===dt)&&(!low||p.stock<=0));
 S.filt.sort((a,b)=>b.stock-a.stock||a.nombre.localeCompare(b.nombre));
 if(!keep)S.page=1;
 const nf=[cat,mn,mx<Infinity,bc,dt,low].filter(Boolean).length;$("fTog").textContent=nf?"Filtros ("+nf+")":"Filtros";
 pintarInv()}
const sIcon=p=>p.stock<=0?"zero":"";
const thumb=(p,cls)=>p.foto_url?`<img class="${cls||"im"}" src="${esc(cls==="ph"?DAY.grande(p.foto_url):p.foto_url)}" ${cls==="ph"?`onerror="this.onerror=null;this.src='${esc(p.foto_url)}'" `:""}alt="" loading="lazy" data-img="${esc(p.foto_url)}">`:`<div class="ph ${cls==="im"?"s":""}">${inicial(p.nombre)}</div>`;
const cols=p=>p.vars?`<small class="colv" style="display:block;color:var(--mute)">${p.vars.map(v=>DAY.colorDot(v.vnom)+esc(v.vnom)+" "+v.stock).join(" · ")}</small>`:"";
const selQ=p=>p.vars?p.vars.reduce((s,v)=>s+(S.sel.get(v.id)||0),0):(S.sel.get(p.id)||0);
function chk(p){return S.multi?`<label class="mchk"><input type="checkbox" data-a="sel" data-id="${p.id}" ${selQ(p)?"checked":""} ${p.stock<1?"disabled":""}> Vender${selQ(p)?` <b data-qs="${p.id}" class="qb">×${selQ(p)}</b>`:""}</label>`:""}
function btns(p){return `<button class="btn sm" data-a="sell" data-id="${p.id}" title="Vender">Vender</button>`+(ADM?`<button class="btn g sm" data-a="price" data-id="${p.id}" title="Editar precio">Precio</button><button class="btn g sm" data-a="stock" data-id="${p.id}" title="Editar stock">Stock</button>`:"")}
function pintarInv(){
 const q=$("fSearch").value.trim(),tot=Math.max(1,Math.ceil(S.filt.length/S.size));if(S.page>tot)S.page=tot;
 const a=(S.page-1)*S.size,items=S.filt.slice(a,a+S.size);
 $("nShown").textContent=S.filt.length;
 document.querySelectorAll("#vt button").forEach(b=>b.classList.toggle("on",b.dataset.v===S.view));
 if(!items.length){$("invList").innerHTML=`<div class="empty card">${S.prods.length?"No hay productos con esos filtros.":"Aún no hay productos. Regístralos en Compra."}</div>`}
 else if(S.view==="table"){
  $("invList").innerHTML=`<div class="tw"><table class="tbl"><thead><tr><th>#</th><th>Imagen</th><th>Producto</th><th>Barras</th><th>Precio</th><th>Desc.</th><th>Final</th><th>Fecha</th><th>Stock</th><th>Categoría</th><th></th></tr></thead><tbody>`+
  items.map((p,i)=>`<tr data-id="${p.id}" id="row-${a+i+1}"><td>${chk(p)}${a+i+1}</td><td>${thumb(p,"im")}</td><td>${hl(p.nombre,q)}<br><small style="color:var(--mute)">${esc(p.codigo||"")}</small>${cols(p)}</td>
   <td>${p.codigo_barras?`<img class="bc" src="${bcUrl(p.codigo_barras)}" alt="" data-bar="${esc(p.codigo_barras)}">`:"—"}</td>
   <td>${$$(p.precio_venta)}</td><td>${p.descuento_pct>0?`<span class="dsc">${p.descuento_pct}%</span>`:"—"}</td><td><b>${$$(p.fin)}</b></td><td>${fdate(p.dia)}</td>
   <td class="${sIcon(p)}">${p.stock}</td><td>${esc(p.cat||"—")}</td><td><div class="ac">${btns(p)}</div></td></tr>`).join("")+`</tbody></table></div>`}
 else{
  $("invList").innerHTML=`<div class="pg">`+items.map((p,i)=>`<div class="pc" data-id="${p.id}" id="card-${a+i+1}">${thumb(p,"ph")}
   <div class="pb">${chk(p)}<b class="n">${hl(p.nombre,q)}</b>${cols(p)}${p.descuento_pct>0?`<span class="dsc">${p.descuento_pct}% de descuento</span>`:""}
   <div class="mt"><small>${esc(p.codigo||"")} · ${esc(p.cat||"Sin categoría")}</small><small class="${sIcon(p)}">Stock: ${p.stock}</small></div>
   ${p.codigo_barras?`<img class="bc" src="${bcUrl(p.codigo_barras)}" alt="" data-bar="${esc(p.codigo_barras)}">`:""}
   <div class="pr">${$$(p.fin)}</div><div class="ac">${btns(p)}</div></div></div>`).join("")+`</div>`;
}
 const pgH=tot>1?`<button class="btn g sm" data-pg="-1" ${S.page<=1?"disabled":""}>‹ Anterior</button><span>Página ${S.page} de ${tot}</span><button class="btn g sm" data-pg="1" ${S.page>=tot?"disabled":""}>Siguiente ›</button>`:"";$("pagerTop").innerHTML=pgH;
 $("pager").innerHTML=tot>1?`<button class="btn g sm" data-pg="-1" ${S.page<=1?"disabled":""}>‹ Anterior</button><span>Página ${S.page} de ${tot}</span><button class="btn g sm" data-pg="1" ${S.page>=tot?"disabled":""}>Siguiente ›</button>`:"";
 resumenMulti()}

/* ---------- detalle del producto ---------- */
async function detalle(p){
 const cost=p.precio_costo||0,gan=cost?p.fin-cost:null,mg=cost&&p.fin?gan/p.fin*100:null;
 const filas=[["Categoría",p.cat||"N/A"],["Stock",p.stock+" unid."+(p.stock_minimo?` (mínimo ${p.stock_minimo})`:"")],["Precio",$$(p.precio_venta)],["Descuento",(p.descuento_pct||0)+"%"],["Precio final",$$(p.fin)]]
  .concat(ADM?[["Costo",cost?$$(cost):"-"],["Ganancia por unidad",gan===null?"-":$$(gan)],["Margen",mg===null?"-":mg.toFixed(1)+"%"]]:[])
  .concat([["Valor del stock (precio final)",$$(p.fin*p.stock)],["Fecha",fdate(p.dia)],["Código de barras",p.codigo_barras||"N/A"]]);
 const m=modal(esc(p.nombre),`<div class="dgal"><div><img class="main" id="dgM" src="${esc(p.foto_url||"")}" alt=""><div class="th" id="dgT"></div></div>
  <div><small style="color:var(--mute)">SKU: ${esc(p.codigo||"")}</small><table class="dt">${filas.map(f=>`<tr><td>${esc(f[0])}</td><td>${esc(f[1])}</td></tr>`).join("")}</table>
  ${p.codigo_barras?`<img class="bcs" src="${bcUrl(p.codigo_barras)}" alt="" data-bar="${esc(p.codigo_barras)}" style="height:40px;margin-top:8px;cursor:pointer">`:""}</div></div>
  <p style="white-space:pre-line">${esc(p.descripcion||"Sin descripción disponible.")}</p>`,
  {foot:`<button class="btn g" data-x>Cerrar</button><button class="btn" id="dgSell">Vender</button>`});
 m.q("#dgSell").onclick=()=>{m.close();abrirVenta(p)};
 m.el.addEventListener("click",e=>{const b=e.target.closest("[data-bar]");if(b)verBarras(b.dataset.bar);const t=e.target.closest("#dgT img");if(t)m.q("#dgM").src=t.src;if(e.target.id==="dgM")verImagen(e.target.src)});
 try{const {data}=await db.from("producto_imagenes").select("url,thumb_url").eq("producto_id",p.real||p.id).order("orden");
  if(data&&data.length){m.q("#dgM").src=data[0].url;if(data.length>1)m.q("#dgT").innerHTML=data.map(i=>`<img src="${esc(i.thumb_url||i.url)}" data-full="${esc(i.url)}" alt="">`).join("");
   m.q("#dgT").addEventListener("click",e=>{const i=e.target.closest("img");if(i)m.q("#dgM").src=i.dataset.full})}
  if(!p.foto_url&&!(data&&data.length))m.q("#dgM").remove()}catch(e){}}

/* ---------- editar precio / stock (administrador + contraseña) ---------- */
async function editarPrecio(p){
 if(!soloAdmin())return;if(!await pedirClave("Vas a cambiar el precio de este producto."))return;
 const m=modal("Editar precio",`<label>Producto</label><input value="${esc(p.nombre)}" readonly><label>Precio actual</label><input value="${$$(p.precio_venta)}" readonly>
  <label for="npP">Nuevo precio de venta</label><div class="ig"><span>$</span><input id="npP" type="number" step="0.01" min="0" value="${p.precio_venta}"></div>
  ${p.descuento_pct>0?`<small class="h" style="color:var(--mute)">El descuento de ${p.descuento_pct}% se aplica sobre este precio.</small>`:""}<div class="err2" id="npE"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="npOk">Guardar</button>`});
 m.q("#npOk").onclick=async()=>{const v=parseFloat(m.q("#npP").value);if(isNaN(v)||v<0){m.q("#npE").textContent="Precio inválido";return}
  const ok=await espera(async()=>{const {error}=await db.from("productos").update({precio_venta:r2(v)}).eq("id",p.real||p.id);if(error)throw error;return true});
  if(ok){S.all.forEach(x=>{if((x.real||x.id)===(p.real||p.id)){x.precio_venta=r2(v);x.fin=fin(x)}});m.close();filtrar(true);stats();toast("Precio actualizado");snd("ok")}}}
async function editarStock(p){
 if(p.vars){toast("Este producto tiene colores: edita el stock de cada color en Compra → Inventario → Editar.");return}
 if(!soloAdmin())return;if(!await pedirClave("Vas a cambiar la cantidad en stock de este producto."))return;
 const m=modal("Editar stock",`<label>Producto</label><input value="${esc(p.nombre)}" readonly><label>Stock actual</label><input value="${p.stock}" readonly>
  <label for="nsS">Nuevo stock</label><input id="nsS" type="number" min="0" step="1" value="${p.stock}"><div class="err2" id="nsE"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="nsOk">Guardar</button>`});
 m.q("#nsOk").onclick=async()=>{const v=parseInt(m.q("#nsS").value,10);if(isNaN(v)||v<0){m.q("#nsE").textContent="Stock inválido";return}
  const ok=await espera(async()=>{await ajustarStock(p,v,"Ajuste manual desde Almacenamiento");return true});
  if(ok){m.close();filtrar(true);stats();toast("Stock actualizado");snd("ok")}}}
async function ajustarStock(p,nuevo,nota){const d=nuevo-p.stock;if(!d)return;
 await rpc("registrar_movimiento",{p_producto:p.real||p.id,p_tipo:d>0?"entrada":"salida",p_cantidad:Math.abs(d),p_nota:nota});
 if(p.vid){const {error}=await db.from("producto_variantes").update({stock:nuevo}).eq("id",p.vid);if(error)throw new Error(error.message)}p.stock=nuevo}

/* clientes guardados para autocompletar */
(async()=>{try{const{data}=await DAY.db.from("clientes").select("nombre").order("nombre").limit(500);
 if(data&&data.length){const d=document.createElement("datalist");d.id="dlCli";d.innerHTML=data.map(c=>`<option value="${esc(c.nombre)}">`).join("");document.body.appendChild(d)}}catch(e){}})();
/* ---------- formulario de tipo de venta (compartido por venta, rápida y múltiple) ---------- */
const INP=(n,ph,extra)=>`<div class="ig"><span>$</span><input name="${n}" type="number" min="0" step="0.01" placeholder="${ph||"0.00"}" ${extra||""}></div>`;
function optHTML(){return `
 <div class="tp" data-g="ty"><button type="button" data-ty="inmediata" class="on">Inmediata</button><button type="button" data-ty="cod">Contra entrega</button><button type="button" data-ty="entrega_pendiente">Pend. entrega</button><button type="button" data-ty="cobro_pendiente">Pend. cobro</button></div>
 <div class="tp pm"><button type="button" data-pm="Efectivo" class="on">Efectivo</button><button type="button" data-pm="Transferencia">Transferencia</button></div>
 <div class="cfg" data-cfg="cash"><div class="fg"><div class="full"><label>Efectivo recibido (opcional)</label>${INP("recibe")}<div class="qc"><button type="button" data-qc="x">Exacto</button><button type="button" data-qc="5">$5</button><button type="button" data-qc="10">$10</button><button type="button" data-qc="20">$20</button><button type="button" data-qc="50">$50</button><button type="button" data-qc="100">$100</button></div></div><div class="full cambio" data-cambio></div></div></div>
 <div class="cfg hidden" data-cfg="cod"><div class="fg">
  <div class="full"><label>¿Quién paga la comisión?</label><div class="tp"><button type="button" data-who="client" class="on">El cliente</button><button type="button" data-who="we">Nosotros</button></div></div>
  <div><label>Envío</label>${INP("envio")}</div><div><label>Seguro</label>${INP("seguro")}</div>
  <div><label>Tipo de comisión</label><select name="ctipo"><option value="percentage">Porcentaje (%)</option><option value="fixed">Monto fijo ($)</option></select></div>
  <div><label data-clab>Comisión (%)</label><input name="cval" type="number" min="0" step="0.01" placeholder="0"></div></div></div>
 <div class="cfg hidden" data-cfg="entrega_pendiente"><div class="fg"><div><label>Envío</label>${INP("envio2")}</div><div><label>Comisión (%)</label><input name="cval2" type="number" min="0" max="100" step="0.01" placeholder="0"></div></div></div>
 <div class="cfg hidden" data-cfg="cobro_pendiente"><div class="fg"><div class="full"><label>Monto abonado</label>${INP("abono")}</div></div></div>
 <div class="cli0"><label data-clil>Cliente (opcional)</label><input name="cli" maxlength="80" list="dlCli" autocomplete="off" placeholder="Para guardar la compra en su ficha"></div>
 <div class="calc" data-calc></div><div class="err2" data-err role="alert"></div>`}
function optForm(root,getSub,onChange){
 const st={ty:"inmediata",pm:"Efectivo",who:"client"},q=s=>root.querySelector(s);
 const val=n=>{const v=q(`[name=${n}]`).value.trim(),x=v===""?0:Number(v);if(!isFinite(x)||x<0)throw new Error("Revisa los importes: deben ser números válidos y no negativos.");return x};
 function read(){
  const o={tipo:st.ty,metodo:st.pm,envio:0,comision_tipo:"percentage",comision_valor:0,quien_paga:"client",seguro:0,cliente:"",abonado:0};
  if(st.ty==="cod"){o.envio=val("envio");o.seguro=val("seguro");o.comision_tipo=q("[name=ctipo]").value;o.comision_valor=val("cval");o.quien_paga=st.who}
  else if(st.ty==="entrega_pendiente"){o.envio=val("envio2");o.comision_valor=val("cval2")}
  else if(st.ty==="cobro_pendiente"){o.abonado=val("abono")}
  o.cliente=q("[name=cli]").value.trim();
  if(o.comision_tipo==="percentage"&&o.comision_valor>100)throw new Error("La comisión porcentual no puede superar el 100%.");
  return o}
 const tot=(subC,o)=>{const env=cents(o.envio),seg=cents(o.seguro);let com=0;
  if(o.tipo==="cod"||o.tipo==="entrega_pendiente")com=o.comision_tipo==="fixed"?cents(o.comision_valor):Math.round(subC*o.comision_valor/100);
  let total=subC;if(o.tipo==="cod")total=subC+env+seg+(o.quien_paga==="we"?-com:com);else if(o.tipo==="entrega_pendiente")total=subC+env+com;
  return {env,seg,com,total,paid:cents(o.abonado),pend:Math.max(0,subC-cents(o.abonado))}};
 function check(){const o=read(),s=getSub(),t=tot(s,o);
  if(t.total<0)throw new Error("La comisión no puede producir un total negativo.");
  if(o.tipo==="cobro_pendiente"){if(!o.cliente)throw new Error("Debes ingresar el nombre del cliente.");if(t.paid>=s)throw new Error("El abono debe ser mayor o igual a cero y menor que el total.")}
  return {o,t}}
 function calc(){const box=q("[data-calc]"),er=q("[data-err]");
  try{const o=read(),s=getSub(),t=tot(s,o),m=c=>$$(c/100),rows=[["Subtotal",m(s)]];
   if(o.tipo==="cod"||o.tipo==="entrega_pendiente"){rows.push(["Envío",m(t.env)]);rows.push(["Comisión"+(o.tipo==="cod"&&o.quien_paga==="we"?" (se descuenta)":""),m(t.com)])}
   if(o.tipo==="cod")rows.push(["Seguro",m(t.seg)]);
   if(o.tipo==="cobro_pendiente"){rows.push(["Abonado",m(t.paid)]);rows.push(["Pendiente por cobrar",m(t.pend)])}
   const lab=o.tipo==="cod"||o.tipo==="entrega_pendiente"?"Total a cobrar":"Total";
   box.innerHTML=rows.map(r=>`<div><span>${r[0]}</span><span>${r[1]}</span></div>`).join("")+`<div class="t"><span>${lab}</span><b>${m(t.total)}</b></div>`;er.textContent="";
   const cb=q("[data-cambio]");if(cb){const rc=cents(+q("[name=recibe]").value||0);cb.innerHTML=o.tipo==="inmediata"&&o.metodo==="Efectivo"&&rc>0?(rc>=t.total?`Cambio a devolver: <b style="color:var(--ok)">${m(rc-t.total)}</b>`:`<b style="color:var(--bad,#b3261e)">Faltan ${m(t.total-rc)}</b>`):""}
   q("[data-clab]").textContent=o.comision_tipo==="fixed"?"Comisión ($)":"Comisión (%)";
   onChange&&onChange(t,o,true);return {o,t}}
  catch(e){er.textContent=e.message;box.innerHTML="";onChange&&onChange(null,null,false);return null}}
 const cfgVis=()=>{const L=q("[data-clil]");if(L)L.textContent=st.ty==="cobro_pendiente"?"Nombre del cliente *":"Cliente (opcional)";root.querySelectorAll("[data-cfg]").forEach(c=>c.classList.toggle("hidden",c.dataset.cfg==="cash"?!(st.ty==="inmediata"&&st.pm==="Efectivo"):c.dataset.cfg!==st.ty))};
 root.addEventListener("click",e=>{
  const qc=e.target.closest("[data-qc]");
  if(qc){const inp=q("[name=recibe]");if(qc.dataset.qc==="x"){const r=calc();if(r)inp.value=(r.t.total/100).toFixed(2)}else inp.value=qc.dataset.qc;calc();return}
  const ty=e.target.closest("[data-ty]"),pm=e.target.closest("[data-pm]"),wh=e.target.closest("[data-who]");
  if(ty){st.ty=ty.dataset.ty;root.querySelectorAll("[data-ty]").forEach(b=>b.classList.toggle("on",b===ty));
   cfgVis();calc()}
  if(pm){st.pm=pm.dataset.pm;root.querySelectorAll("[data-pm]").forEach(b=>b.classList.toggle("on",b===pm));cfgVis();calc()}
  if(wh){st.who=wh.dataset.who;wh.parentNode.querySelectorAll("[data-who]").forEach(b=>b.classList.toggle("on",b===wh));calc()}});
 root.addEventListener("input",calc);root.addEventListener("change",calc);
 cfgVis();calc();return {read,check,calc,st}}
const MSG=(o,t,extra)=>o.tipo==="cod"?"Pedido contra entrega guardado. Total a cobrar: "+$$(t.total/100):
 o.tipo==="entrega_pendiente"?"Venta pendiente de entrega registrada. Total: "+$$(t.total/100):
 o.tipo==="cobro_pendiente"?`Venta pendiente de cobro registrada. Cliente: ${o.cliente}. Abonado: ${$$(t.paid/100)}. Debe: ${$$(t.pend/100)}`:
 `Venta registrada (${o.metodo})`+(extra||"");
/* ---------- ticket de venta ---------- */
function imprimir(html){const f=document.createElement("iframe");f.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0";document.body.appendChild(f);
 const d=f.contentWindow.document;d.open();d.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>@page{margin:6mm}html,body{margin:0;background:#fff}</style></head><body>${html}</body></html>`);d.close();
 setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast("No se pudo abrir la impresión")}setTimeout(()=>f.remove(),120000)},350)}
const TK_SEL="*,profiles(nombre),venta_items(cantidad,precio_unit,nombre,productos(nombre))";
function ticketData(v,cf){const L=(v.venta_items||[]).map(i=>({q:i.cantidad,n:itName(i),p:+i.precio_unit}));
 const f=new Date(v.created_at),fh=f.toLocaleDateString("es-SV")+" "+f.toLocaleTimeString("es-SV",{hour:"2-digit",minute:"2-digit"});
 const tipo={cod:"Contra entrega",entrega_pendiente:"Pendiente de entrega",cobro_pendiente:"Pendiente de cobro"}[v.tipo]||"";
 return {L,fh,tipo,neg:cf.nombre||"DAYMAR-SHOP",pie:cf.pie||"¡Gracias por tu compra!",tel:cf.telefono||""}}
function ticketHTML(v,cf){const d=ticketData(v,cf);
 return `<div class="tkt" style="font-family:'Courier New',monospace;background:#fff;color:#111;width:300px;max-width:100%;margin:0 auto;padding:16px 14px;font-size:13px;line-height:1.4">
 <div style="text-align:center"><b style="font-size:16px">${esc(d.neg)}</b>${d.tel?`<br>${esc(d.tel)}`:""}<br>Ticket de venta #${v.numero}<br>${esc(d.fh)}</div>
 <hr style="border:0;border-top:1px dashed #999;margin:10px 0">
 ${d.L.map(i=>`<div style="display:flex;justify-content:space-between;gap:8px"><span>${i.q}× ${esc(i.n)}</span><span>${$$(i.q*i.p)}</span></div>${i.q>1?`<div style="color:#666;font-size:11px">&nbsp;&nbsp;${$$(i.p)} c/u</div>`:""}`).join("")}
 <hr style="border:0;border-top:1px dashed #999;margin:10px 0">
 <div style="display:flex;justify-content:space-between;font-size:16px"><b>TOTAL</b><b>${$$(v.total)}</b></div>
 <div style="margin-top:4px">Pago: ${esc(v.metodo_pago||"")}${d.tipo?" · "+d.tipo:""}</div>
 ${v.cliente_nombre?`<div>Cliente: ${esc(v.cliente_nombre)}</div>`:""}${v.profiles?`<div>Atendió: ${esc(v.profiles.nombre)}</div>`:""}
 <div style="text-align:center;margin-top:12px">${esc(d.pie)}</div></div>`}
function ticketTexto(v,cf){const d=ticketData(v,cf);
 return [d.neg,"Ticket de venta #"+v.numero,d.fh,"",...d.L.map(i=>`${i.q}× ${i.n} — ${$$(i.q*i.p)}`),"",`TOTAL: ${$$(v.total)}`,`Pago: ${v.metodo_pago||""}${d.tipo?" ("+d.tipo+")":""}`,"",d.pie].join("\n")}
async function abrirTicket(v,nuevo){
 const cf=await ensureCfg(),html=ticketHTML(v,cf);
 const m=modal(nuevo?"Venta registrada · #"+v.numero:"Ticket · venta #"+v.numero,`<div id="tkB" style="background:#eee;border-radius:12px;padding:10px">${html}</div>
  <label class="chk" style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px"><input type="checkbox" id="tkPref" ${LS("dms_ticket")!=="0"?"checked":""} style="width:18px;height:18px"> Mostrar el ticket al terminar cada venta</label>`,
  {foot:`<button class="btn g" data-x>Cerrar</button><button class="btn g" id="tkP">Imprimir</button><button class="btn" id="tkW">Enviar PDF por WhatsApp</button>`});
 m.q("#tkPref").onchange=e=>LS("dms_ticket",e.target.checked?"1":"0");
 m.q("#tkP").onclick=()=>imprimir(html);
 m.q("#tkW").onclick=async()=>{
  let cli=null;try{const {data}=await db.from("clientes").select("nombre,telefono");const n=norm(v.cliente_nombre||"").trim();cli=n?(data||[]).find(x=>norm(x.nombre).trim()===n):null}catch(e){}
  const t=await DAY.input("Número de WhatsApp del cliente (8 dígitos de El Salvador o con código de país):",(cli&&cli.telefono)||"");if(t===null)return;
  const dig=t.replace(/\D/g,""),tel=dig.length===8?"503"+dig:dig;if(tel.length<10||tel.length>15){await DAY.say("Ese número no es válido.");return}
  const f=await espera(async()=>{await lib("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");await lib("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
   const c=await DAY.h2c(m.q(".tkt"),{backgroundColor:"#ffffff",scale:3,logging:false}),W=80,H=Math.max(40,c.height*W/c.width),{jsPDF}=window.jspdf,p=new jsPDF({unit:"mm",format:[W,H]});
   p.addImage(c.toDataURL("image/jpeg",.95),"JPEG",0,0,W,c.height*W/c.width);
   return new File([p.output("blob")],"ticket-"+v.numero+".pdf",{type:"application/pdf"})},"Preparando PDF…");
  if(!f)return;
  if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:"Ticket #"+v.numero,text:"Ticket de tu compra en "+(cf.nombre||"DAYMAR-SHOP")});return}catch(e){if(e&&e.name==="AbortError")return}}
  const a=document.createElement("a");a.download=f.name;a.href=URL.createObjectURL(f);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  window.open("https://wa.me/"+tel+"?text="+encodeURIComponent("Hola, te comparto el ticket de tu compra en DAYMARSV (venta #"+v.numero+"). Adjunto el PDF."),"_blank");
  toast("PDF descargado: adjúntalo en el chat de WhatsApp")}}
async function ticketUltima(){if(LS("dms_ticket")==="0")return;
 try{const {data}=await db.from("ventas").select(TK_SEL).eq("usuario_id",me.id).order("created_at",{ascending:false}).limit(1);if(data&&data[0])abrirTicket(data[0],true)}catch(e){}}
async function tras(o,t,lines){ /* refresco local tras una venta */
 (lines||[]).forEach(l=>{const p=S.byId.get(l.id);if(p){p.stock-=l.q;if(p.base)p.base.stock-=l.q}});
 filtrar(true);stats();toast(MSG(o,t));snd("ok");
 if(o.tipo!=="inmediata")cargarPend().catch(()=>{});else badges().catch(()=>{});
 ticketUltima()}

/* ---------- venta de un producto ---------- */
function elegirColor(p,cb){
 const m=modal("Elige el color",`<p style="margin:0 0 8px"><b>${esc(p.nombre)}</b></p><div id="clL">${p.vars.map((v,i)=>`<button type="button" class="sv" data-c="${i}" ${v.stock<1?"disabled":""} style="width:100%;text-align:left;cursor:pointer;${v.stock<1?"opacity:.5":""}"><div class="ti"><b>${DAY.colorDot(v.vnom)}${esc(v.vnom)}</b><small>${v.stock<1?"Agotado":"Disponibles: "+v.stock}</small></div></button>`).join("")}</div>`,{foot:`<button class="btn g" data-x>Cancelar</button>`});
 m.q("#clL").addEventListener("click",e=>{const b=e.target.closest("[data-c]");if(!b||b.disabled)return;const v=p.vars[+b.dataset.c];m.close();cb(v)})}
function abrirVenta(p){if(p.vars){elegirColor(p,abrirVenta);return}
 if(S.multi){addSel(p.id);return}
 snd("beep");let unl=false;
 const m=modal("Vender producto",`
  <div class="sp">${p.foto_url?`<img class="sim" src="${esc(p.foto_url)}" alt="" data-img="${esc(p.foto_url)}">`:`<div class="ph">${inicial(p.nombre)}</div>`}
   <div><b>${esc(p.nombre)}</b><small>${esc(p.codigo||"")}</small>${p.codigo_barras?`<img class="bcs" src="${bcUrl(p.codigo_barras)}" alt="" data-bar="${esc(p.codigo_barras)}">`:""}</div></div>
  <div class="kv"><div><span>Precio ${p.descuento_pct>0?`<span class="dsc">${p.descuento_pct}% desc.</span>`:""}</span><b id="sPr">${$$(p.fin)}</b></div><div><span>Stock disponible</span><b id="sSt">${p.stock}</b></div></div>
  <div class="fg"><div><label>Cantidad</label><div class="stp"><button type="button" data-d="-1" aria-label="Menos">−</button><input id="sQty" class="lk" type="number" min="1" step="1" value="1" readonly><button type="button" data-d="1" aria-label="Más">+</button></div></div>
   <div><label>Precio de venta</label><div class="ig"><span>$</span><input id="sPrice" class="lk" type="number" min="0" step="0.01" value="${p.fin.toFixed(2)}" readonly></div></div>
   <div class="full hidden" id="sStockRow"><label>Stock en inventario (editable)</label><input id="sStock" type="number" min="0" step="1" value="${p.stock}"></div></div>
  ${ADM?`<button type="button" class="lockbtn" id="sLock">Desbloquear precio, cantidad y stock</button>`:""}
  <div id="sOpts">${optHTML()}</div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><span id="sFt1"><button class="btn" id="sGo">Vender</button></span><span id="sFt2" class="hidden" style="display:flex;gap:8px"><button class="btn g" id="sSave">Guardar cambios sin vender</button><button class="btn" id="sGo2">Vender</button></span>`});
 const qty=()=>parseInt(m.q("#sQty").value,10)||0,price=()=>parseFloat(m.q("#sPrice").value),stockEf=()=>unl?(parseInt(m.q("#sStock").value,10)):p.stock;
 const _cerrar=m.close;m.close=()=>{S.venta=null;_cerrar()};
 S.venta={p,inc:()=>{const n=qty()+1;if(n>stockEf()){snd("err");toast("Ya tienes todo el stock de "+p.nombre);return}m.q("#sQty").value=n;syncBtns();snd("beep");toast("Cantidad: "+n+" · "+p.nombre)}};
 const of=optForm(m.q("#sOpts"),()=>cents(isNaN(price())?0:price())*Math.max(0,qty()),null);
 const syncBtns=()=>{const q=qty(),mx=stockEf();m.q('[data-d="-1"]').disabled=q<=1;m.q('[data-d="1"]').disabled=!(q<mx);m.q("#sSt").textContent=isNaN(mx)?"—":mx;of.calc()};
 m.el.addEventListener("click",e=>{const d=e.target.closest("[data-d]");if(d){const n=Math.min(Math.max(1,qty()+(+d.dataset.d)),Math.max(1,stockEf()));m.q("#sQty").value=n;syncBtns()}
  if(e.target.closest("[data-bar]"))verBarras(e.target.closest("[data-bar]").dataset.bar);if(e.target.closest("[data-img]"))verImagen(e.target.closest("[data-img]").dataset.img)});
 ["#sQty","#sPrice","#sStock"].forEach(s=>m.q(s).addEventListener("input",()=>{if(s==="#sPrice"){const v=price();if(!isNaN(v)&&v>=0)m.q("#sPr").textContent=$$(v)}syncBtns()}));
 if(ADM)m.q("#sLock").onclick=async()=>{if(!await pedirClave("Vas a poder editar el precio, la cantidad y el stock de esta venta."))return;
  unl=true;["#sQty","#sPrice"].forEach(s=>{m.q(s).readOnly=false;m.q(s).classList.remove("lk")});m.q("#sStockRow").classList.remove("hidden");
  m.q("#sLock").remove();m.q("#sFt1").classList.add("hidden");m.q("#sFt2").classList.remove("hidden");toast("Campos desbloqueados");syncBtns()};
 syncBtns();
 const aplicarCambios=async()=>{ /* stock y precio editados se guardan en el inventario (como en la página original) */
  const ns=parseInt(m.q("#sStock").value,10);if(isNaN(ns)||ns<0)throw new Error("Stock inválido");
  await ajustarStock(p,ns,"Ajuste manual desde la venta");
  const np=price();if(isNaN(np)||np<0)throw new Error("Precio inválido");
  if(Math.abs(np-p.fin)>.004){const base=p.descuento_pct>=100?np:np/(1-p.descuento_pct/100);
   const {error}=await db.from("productos").update({precio_venta:r2(base)}).eq("id",p.real||p.id);if(error)throw error;S.all.forEach(x=>{if((x.real||x.id)===(p.real||p.id)){x.precio_venta=r2(base);x.fin=fin(x)}})}};
 m.q("#sSave").onclick=async()=>{const ok=await espera(async()=>{await aplicarCambios();return true});if(ok){m.close();filtrar(true);stats();toast("Cambios guardados en el inventario (sin venta)");snd("ok")}};
 const vender=async()=>{
  const q=qty(),pr=price();let r;
  try{if(!Number.isInteger(q)||q<1)throw new Error("La cantidad debe ser un entero mayor o igual a 1.");if(isNaN(pr)||pr<0)throw new Error("Precio inválido.");
   if(q>stockEf())throw new Error("Stock insuficiente");r=of.check()}catch(e){m.q("[data-err]").textContent=e.message;snd("err");return}
  const ok=await espera(async()=>{
   if(unl)await aplicarCambios();
   const it={producto_id:p.real||p.id,cantidad:q};if(p.vid)it.variante_id=p.vid;if(unl)it.precio=pr;
   await rpc("registrar_pedido",{p_items:[it],p_opts:r.o});return true},"Registrando venta…");
  if(ok){m.close();await tras(r.o,r.t,[{id:p.id,q}])}else await cargarProductos().then(()=>filtrar(true)).catch(()=>{})};
 m.q("#sGo").onclick=vender;m.q("#sGo2").onclick=vender;
 m.el.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.tagName==="INPUT"&&e.target.id==="sQty"&&!unl)vender()})}

/* ---------- venta rápida (producto que no está en el inventario) ---------- */
function ventaRapida(){
 const m=modal("Venta rápida",`
  <div class="fg"><div class="full"><label>Nombre del producto *</label><input id="fqN" maxlength="120" placeholder="Ej: Pulsera sin registrar"></div>
   <div><label>Precio unitario *</label><div class="ig"><span>$</span><input id="fqP" type="number" min="0" step="0.01" placeholder="0.00"></div></div>
   <div><label>Cantidad *</label><input id="fqQ" type="number" min="1" step="1" value="1"></div>
   <div><label>Categoría</label><input id="fqC" placeholder="Venta rápida"></div>
   <div><label>Código de barras</label><div class="bcg"><input id="fqB" placeholder="Opcional"><button type="button" class="btn g" id="fqG">Generar</button></div></div>
   <div class="full"><label>Descripción</label><textarea id="fqD" rows="2" maxlength="300"></textarea></div></div>
  <div id="fqO">${optHTML()}</div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="fqGo">Registrar venta</button>`});
 const sub=()=>cents(parseFloat(m.q("#fqP").value)||0)*(parseInt(m.q("#fqQ").value,10)||0);
 const of=optForm(m.q("#fqO"),sub,null);
 ["#fqP","#fqQ"].forEach(s=>m.q(s).addEventListener("input",of.calc));
 m.q("#fqG").onclick=()=>{m.q("#fqB").value=String(Math.floor(1e7+Math.random()*9e7))};
 m.q("#fqGo").onclick=async()=>{
  const n=m.q("#fqN").value.trim(),pr=parseFloat(m.q("#fqP").value),q=parseInt(m.q("#fqQ").value,10);let r;
  try{if(!n)throw new Error("El nombre del producto es obligatorio.");if(!(pr>0))throw new Error("El precio debe ser mayor a cero.");if(!Number.isInteger(q)||q<1)throw new Error("La cantidad debe ser un entero mayor o igual a 1.");r=of.check()}
  catch(e){m.q("[data-err]").textContent=e.message;snd("err");return}
  const ok=await espera(async()=>{await rpc("registrar_pedido",{p_items:[{libre:true,nombre:n,precio:pr,cantidad:q,categoria:m.q("#fqC").value,descripcion:m.q("#fqD").value,codigo_barras:m.q("#fqB").value}],p_opts:r.o});return true},"Registrando venta…");
  if(ok){m.close();await tras(r.o,r.t,[])}}}

/* ---------- venta múltiple ---------- */
function addSel(id,n){const p=S.byId.get(id);if(!p)return;if(p.vars){elegirColor(p,e=>addSel(e.id,n));return}if(p.stock<1){toast("Sin stock: "+p.nombre);snd("err");return}
 const c=S.sel.get(id)||0;if(c>=p.stock){toast("Ya tienes todo el stock de "+p.nombre);snd("err");return}
 S.sel.set(id,c+(n||1));snd("beep");toast((c?"+1 ":"Agregado: ")+p.nombre);
 document.querySelectorAll(`[data-a="sel"][data-id="${id}"]`).forEach(c=>c.checked=true);resumenMulti();if(S.mlDraw)S.mlDraw();
 pintarInv()}
function togSel(id,on){const p=S.byId.get(id);if(!p)return;if(p.vars){if(on)elegirColor(p,e=>{addSel(e.id)});else{p.vars.forEach(v=>S.sel.delete(v.id));resumenMulti();pintarInv()}return}if(on&&p.stock>=1){if(!S.sel.has(id))S.sel.set(id,1)}else S.sel.delete(id);
 document.querySelectorAll(`[data-a="sel"][data-id="${id}"]`).forEach(c=>c.checked=S.sel.has(id));resumenMulti()}
function lineasMulti(){return [...S.sel].map(([id,q])=>({p:S.byId.get(id),q})).filter(l=>l.p)}
function resumenMulti(){
 $("mBar").classList.toggle("hidden",!S.multi);try{if(S.multi&&S.sel.size)sessionStorage.setItem("dms_cart",JSON.stringify([...S.sel]));else if(!S.multi||!S.sel.size)sessionStorage.removeItem("dms_cart")}catch(e){}if(!S.multi)return;
 const L=lineasMulti(),u=L.reduce((s,l)=>s+(l.q>0?l.q:0),0),sub=L.reduce((s,l)=>s+cents(l.p.fin)*(l.q>0?l.q:0),0);
 $("mCount").textContent=L.length;$("mUnits").textContent=u;$("mSub").textContent=$$(sub/100);$("mGo").disabled=!L.length}
function modoMulti(on){S.multi=on===undefined?!S.multi:on;if(!S.multi)S.sel.clear();
 $("bMulti").classList.toggle("on",S.multi);$("bMulti").setAttribute("aria-pressed",String(S.multi));
 if(S.tab!=="inv")tab("inv");pintarInv()}
function abrirMulti(){
 const L=lineasMulti();if(!L.length){toast("Marca al menos un producto");return}
 const m=modal("Venta múltiple",`<div class="mlt" id="mlT"></div><div class="mladd"><input id="mlS" type="search" autocomplete="off" placeholder="Agregar otro producto: nombre, código o barras"><div id="mlR" class="mlr hidden"></div></div><div class="ml" id="mlL"></div><div style="text-align:right;margin-top:6px"><button class="btn g sm" id="mlClr" type="button">Vaciar</button></div><div id="mlO" style="margin-top:12px">${optHTML()}</div>`,{big:false,foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="mlGo">Confirmar venta</button>`,onclose:resumenMulti});
 const sub=()=>lineasMulti().reduce((s,l)=>s+(Number.isInteger(l.q)&&l.q>0?cents(l.p.fin)*l.q:0),0);
 const of=optForm(m.q("#mlO"),sub,null);
 const draw=()=>{const L=lineasMulti();
  m.q("#mlL").innerHTML=L.length?L.map(l=>`<div class="mi" data-id="${l.p.id}">${l.p.foto_url?`<img src="${esc(l.p.foto_url)}" alt="">`:`<div class="ph">${inicial(l.p.nombre)}</div>`}
   <div><b>${esc(l.p.nombre)}</b><br><small>${$$(l.p.fin)} / unidad · Stock: ${l.p.stock} · ${esc(l.p.codigo_barras||l.p.codigo||"")}</small></div>
   <button class="btn g sm mrm" data-rm="${l.p.id}" aria-label="Quitar ${esc(l.p.nombre)}" title="Quitar">✕</button>
   <div class="q"><div class="stp"><button type="button" data-st="-1" data-id="${l.p.id}">−</button><input type="number" min="1" max="${l.p.stock}" step="1" value="${l.q}" data-q="${l.p.id}"><button type="button" data-st="1" data-id="${l.p.id}">+</button></div><b data-sub="${l.p.id}">${$$(l.p.fin*l.q)}</b></div></div>`).join(""):`<div class="empty">Tu selección está vacía.</div>`;
  const U=L.reduce((a,l)=>a+(Number.isInteger(l.q)&&l.q>0?l.q:0),0),SB=L.reduce((a,l)=>a+(Number.isInteger(l.q)&&l.q>0?cents(l.p.fin)*l.q:0),0);
  m.q("#mlT").innerHTML=L.length?`<span><b>${L.length}</b> producto${L.length===1?"":"s"} · <b>${U}</b> unidad${U===1?"":"es"}</span><b class="mtt">${$$(SB/100)}</b>`:"";m.q("#mlGo").textContent=L.length?"Confirmar venta · "+$$(SB/100):"Confirmar venta";
  of.calc();resumenMulti()};
 m.q("#mlL").addEventListener("click",e=>{const rm=e.target.closest("[data-rm]"),st=e.target.closest("[data-st]");
  if(rm){togSel(rm.dataset.rm,false);draw()}
  if(st){const id=st.dataset.id,p=S.byId.get(id),n=Math.min(p.stock,Math.max(1,(S.sel.get(id)||1)+(+st.dataset.st)));S.sel.set(id,n);draw()}});
 m.q("#mlL").addEventListener("input",e=>{const i=e.target.closest("[data-q]");if(!i)return;const id=i.dataset.q,p=S.byId.get(id),n=parseInt(i.value,10);
  S.sel.set(id,n);const sb=m.q(`[data-sub="${id}"]`);if(sb)sb.textContent=Number.isInteger(n)&&n>0?$$(p.fin*n):"—";const L2=lineasMulti(),U2=L2.reduce((a,l)=>a+(Number.isInteger(l.q)&&l.q>0?l.q:0),0),S2=sub();m.q("#mlT").innerHTML=`<span><b>${L2.length}</b> producto${L2.length===1?"":"s"} · <b>${U2}</b> unidad${U2===1?"":"es"}</span><b class="mtt">${$$(S2/100)}</b>`;m.q("#mlGo").textContent="Confirmar venta · "+$$(S2/100);of.calc();resumenMulti()});
 const bs=m.q("#mlS"),br=m.q("#mlR");
 bs.addEventListener("input",()=>{const q=norm(bs.value.trim());if(!q){br.classList.add("hidden");return}
  const R=S.prods.filter(p=>p.stock>=1&&norm((p.nombre||"")+" "+(p.codigo||"")+" "+(p.codigo_barras||"")).includes(q)).slice(0,6);
  br.innerHTML=R.length?R.map(p=>`<button type="button" data-add="${p.id}">${p.foto_url?`<img src="${esc(p.foto_url)}" alt="">`:`<i class="ph">${inicial(p.nombre)}</i>`}<span>${esc(p.nombre)}</span><small>${$$(p.fin)} · Stock ${p.stock}</small></button>`).join(""):`<div class="empty">Sin resultados</div>`;br.classList.remove("hidden")});
 const addP=id=>{const p=S.byId.get(id);if(!p)return;if(p.vars){elegirColor(p,e=>addP(e.id));return}const c=S.sel.get(id)||0;if(c>=p.stock){toast("Ya tienes todo el stock");return}S.sel.set(id,c+1);bs.value="";br.classList.add("hidden");draw();bs.focus()};
 br.addEventListener("click",e=>{const b=e.target.closest("[data-add]");if(b)addP(b.dataset.add)});
 bs.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const q=bs.value.trim(),x=S.all.find(p=>p.codigo_barras&&p.codigo_barras===q)||(br.querySelector("[data-add]")&&S.byId.get(br.querySelector("[data-add]").dataset.add));if(x)addP(x.id)}});
 m.q("#mlClr").onclick=async()=>{if(!S.sel.size)return;if(await confirmar("Se quitarán todos los productos de esta venta.",{titulo:"Vaciar venta",ok:"Vaciar",peligro:true})){S.sel.clear();draw()}};
 draw();S.mlDraw=draw;const _mc=m.close;m.close=()=>{S.mlDraw=null;_mc()};if(matchMedia("(pointer:fine)").matches)setTimeout(()=>bs.focus(),50);
 m.q("#mlGo").onclick=async()=>{let r;const L=lineasMulti();
  try{if(!L.length)throw new Error("Selecciona al menos un producto.");
   L.forEach(l=>{if(!Number.isInteger(l.q)||l.q<1)throw new Error("La cantidad debe ser un entero mayor o igual a 1.");if(l.q>l.p.stock)throw new Error("Stock insuficiente: "+l.p.nombre)});r=of.check()}
  catch(e){m.q("[data-err]").textContent=e.message;snd("err");return}
  const ok=await espera(async()=>{await rpc("registrar_pedido",{p_items:L.map(l=>{const it={producto_id:l.p.real||l.p.id,cantidad:l.q};if(l.p.vid)it.variante_id=l.p.vid;return it}),p_opts:r.o});return true},"Registrando venta…");
  if(ok){S.sel.clear();m.close();await tras(r.o,r.t,L.map(l=>({id:l.p.id,q:l.q})));toast("Venta múltiple registrada: "+L.length+" productos en un solo pedido.")}
  else await cargarProductos().then(()=>filtrar(true)).catch(()=>{})}}

/* ---------- líneas de un pedido (se usan en pendientes, hoy e historial) ---------- */
const itName=i=>i.nombre||(i.productos&&i.productos.nombre)||"Producto";
const itImg=i=>(i.productos&&i.productos.foto_url)||"";
const itBar=i=>i.codigo_barras||(i.productos&&i.productos.codigo_barras)||"";
const itCode=i=>i.codigo||(i.productos&&i.productos.codigo)||"";
const lineas=v=>(v.venta_items||[]).map(i=>`<div class="ln">${itImg(i)?`<img src="${esc(itImg(i))}" alt="" loading="lazy" data-img="${esc(itImg(i))}">`:`<div class="ph">${inicial(itName(i))}</div>`}
 <div class="ti"><b>${esc(itName(i))}</b><small>${esc(itCode(i))}</small>${itBar(i)?`<img class="bcm" src="${bcUrl(itBar(i))}" alt="" data-bar="${esc(itBar(i))}">`:""}</div>
 <div class="qy">${i.cantidad} × ${$$(i.precio_unit)}<br><b>${$$(i.cantidad*i.precio_unit)}</b></div></div>`).join("");
const resumenItems=v=>(v.venta_items||[]).map(i=>`${i.cantidad}× ${esc(itName(i))}`).join(" · ");

/* ---------- pendientes ---------- */
const COMPLETADO={cod:"Cobrado",entrega_pendiente:"Entregado",cobro_pendiente:"Pagado"};
function pintarPend(){
 const t=S.pt,all=S.pend.filter(v=>v.tipo===t),pe=all.filter(v=>v.estado==="pendiente");
 document.querySelectorAll("#segPend button").forEach(b=>b.classList.toggle("on",b.dataset.s===t));
 const sum=k=>pe.reduce((s,v)=>s+(+v[k]||0),0);
 $("pendStats").innerHTML=t==="cobro_pendiente"?
  `<div><b>${$$(sum("subtotal"))}</b><span>Total en productos</span></div><div><b>${$$(sum("abonado"))}</b><span>Abonado</span></div><div><b>${$$(sum("pendiente_monto"))}</b><span>Por cobrar</span></div><div><b>${pe.length}</b><span>Clientes con saldo</span></div>`:
  `<div><b>${$$(sum("subtotal"))}</b><span>Productos</span></div><div><b>${$$(sum("envio"))}</b><span>Envíos</span></div><div><b>${$$(sum("comision_monto"))}</b><span>Comisiones</span></div><div><b>${$$(sum("total"))}</b><span>Total a cobrar</span></div>`;
 $("bClean").classList.toggle("hidden",!(ADM&&t!=="cod"&&all.some(v=>v.estado==="completada")));
 $("bImp").classList.toggle("hidden",!(DAY.principal&&t==="cobro_pendiente"));
 $("pendList").innerHTML=all.length?all.map(cardPend).join(""):`<div class="empty card">${{cod:"No hay pedidos contra entrega pendientes",entrega_pendiente:"No hay ventas pendientes de entrega",cobro_pendiente:"No hay ventas pendientes de cobro"}[t]}</div>`}
function cardPend(v){
 const pen=v.estado==="pendiente",t=v.tipo;let am="",bt="";
 if(t==="cobro_pendiente")am=`<div><span>Cliente</span><b>${esc(v.cliente_nombre||"")}</b></div><div><span>Precio original</span><b>${$$(v.subtotal)}</b></div><div><span>Abonado</span><b style="color:var(--ok)">${$$(v.abonado)}</b></div><div class="o"><span>Pendiente</span><b>${$$(v.pendiente_monto)}</b></div>`;
 else{am=`<div><span>Productos</span><b>${$$(v.subtotal)}</b></div><div><span>Envío</span><b>${$$(v.envio)}</b></div><div><span>Comisión${t==="cod"?(v.quien_paga==="client"?" · paga cliente":" · pagamos nosotros"):""}</span><b>${$$(v.comision_monto)}</b></div>`+
  (t==="cod"?`<div><span>Seguro</span><b>${$$(v.seguro)}</b></div>`:"")+`<div class="k"><span>Total a cobrar</span><b>${$$(v.total)}</b></div>`}
 if(pen){
  if(t==="cobro_pendiente")bt=`<button class="btn g" data-a="rem" data-v="${v.id}">Recordatorio</button><button class="btn" data-a="ok" data-v="${v.id}">Confirmar pago completo</button>`;
  else bt=`<button class="btn g" data-a="edit" data-v="${v.id}">Editar</button><button class="btn" data-a="ok" data-v="${v.id}">${t==="cod"?"Confirmar cobro":"Confirmar entrega"}</button>`;
  if(ADM)bt=`<button class="btn g" style="color:var(--bad)" data-a="del" data-v="${v.id}">Eliminar</button>`+bt}
 else bt=`<span class="bd ok">${COMPLETADO[t]}</span>`;
 return `<div class="po"><div class="ph1"><span>${fdate(v.created_at)} ${ftime(v.created_at)}</span>${pagoBd(v.metodo_pago)}<span class="grow"></span><span class="bd ${pen?"wa":"ok"}">${pen?"Pendiente":COMPLETADO[t]}</span></div>
  ${lineas(v)}<div class="am">${am}</div><div class="bt">${bt}</div></div>`}

async function accionPend(a,id){
 const v=S.pend.find(x=>x.id===id);if(!v){toast("Pedido no encontrado");return}
 if(a==="rem")return recordatorio(v);
 if(a==="edit")return editarPedido(v);
 if(a==="ok"){
  const txt={cod:["Confirmar cobro","Se registrará el pedido como cobrado."],entrega_pendiente:["Confirmar entrega","Se registrará la entrega y la venta."],cobro_pendiente:["Confirmar pago completo","El cliente "+esc(v.cliente_nombre||"")+" termina de pagar su saldo."]}[v.tipo];
  const monto=v.tipo==="cobro_pendiente"?`<div class="am"><div><span>Saldo pendiente</span><b>${$$(v.pendiente_monto)}</b></div><div class="k"><span>Total de la venta</span><b>${$$(v.subtotal)}</b></div></div>`:`<div class="am"><div class="k"><span>Total a cobrar</span><b>${$$(v.total)}</b></div></div>`;
  if(!await confirmar(lineas(v)+monto+`<p>${txt[1]}</p>`,{titulo:txt[0],ok:txt[0]}))return;
  const ok=await espera(async()=>{await rpc("completar_pedido",{p_venta:id});return true});
  if(ok){snd("ok");toast(v.tipo==="cod"?"Pedido cobrado: "+$$(v.total):v.tipo==="entrega_pendiente"?"Entrega confirmada y venta registrada":"Pago completado. Cliente: "+(v.cliente_nombre||"")+". Total: "+$$(v.subtotal));await cargarPend();pintarPend()}
  return}
 if(a==="del"){
  if(!soloAdmin())return;if(!await pedirClave("Vas a eliminar este pedido pendiente."))return;
  if(!await confirmar(lineas(v)+`<p>Se eliminará el pedido y <b>se devolverá el stock</b> al inventario.</p>`,{titulo:"Eliminar pedido",ok:"Eliminar",peligro:true}))return;
  const ok=await espera(async()=>{await rpc("anular_venta",{p_venta:id});return true});
  if(ok){toast("Pedido eliminado y stock devuelto");snd("ok");await Promise.all([cargarPend(),cargarProductos()]);pintarPend();filtrar(true)}}}

/* Imagen del recordatorio dibujada directamente (sin html2canvas): funciona igual en iPhone, Android y computadora */
async function recordatorioPNG(v,fecha){
 const L=v.venta_items||[],W=640,K=2,P=22,fam='"DM Sans",Arial,sans-serif';
 const cargar=u=>new Promise(ok=>{if(!u)return ok(null);const im=new Image();im.crossOrigin="anonymous";const t=setTimeout(()=>ok(null),4000);im.onload=()=>{clearTimeout(t);ok(im)};im.onerror=()=>{clearTimeout(t);ok(null)};im.src=u});
 const imgs=await Promise.all(L.map(i=>cargar(itImg(i))));
 const H=P*2+34+L.length*84+18+176+34,c=document.createElement("canvas");c.width=W*K;c.height=H*K;const x=c.getContext("2d");x.scale(K,K);
 x.fillStyle="#fff";x.fillRect(0,0,W,H);
 const rr=(a,b,w,h,r,f)=>{x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();x.fillStyle=f;x.fill()};
 const cut=(t,mw)=>{t=String(t);if(x.measureText(t).width<=mw)return t;while(t.length>1&&x.measureText(t+"…").width>mw)t=t.slice(0,-1);return t+"…"};
 let y=P;x.textBaseline="alphabetic";
 x.fillStyle="#6B2D3E";x.font="700 20px "+fam;x.fillText("Recordatorio de pago pendiente",P,y+20);y+=34;
 L.forEach((i,k)=>{const top=y;rr(P,top,W-P*2,72,12,"#f6f1f2");
  const im=imgs[k];if(im){x.save();x.beginPath();x.rect(P+8,top+8,56,56);x.clip();const r=Math.max(56/im.width,56/im.height);x.drawImage(im,P+8+(56-im.width*r)/2,top+8+(56-im.height*r)/2,im.width*r,im.height*r);x.restore()}
  else{rr(P+8,top+8,56,56,10,"#8a3a4f");x.fillStyle="#fff";x.font="700 24px "+fam;x.textAlign="center";x.fillText(String(itName(i)).trim().charAt(0).toUpperCase(),P+36,top+46);x.textAlign="left"}
  const tx=P+76,mw=W-P*2-76-120;
  x.fillStyle="#222";x.font="700 15px "+fam;x.fillText(cut(itName(i),mw),tx,top+30);
  x.fillStyle="#777";x.font="400 12px "+fam;x.fillText(cut(itCode(i),mw),tx,top+50);
  x.textAlign="right";x.fillStyle="#222";x.font="700 15px "+fam;x.fillText($$(i.cantidad*i.precio_unit),W-P-12,top+30);
  x.fillStyle="#777";x.font="400 12px "+fam;x.fillText(i.cantidad+" × "+$$(i.precio_unit),W-P-12,top+50);x.textAlign="left";y+=84});
 y+=6;const bw=(W-P*2-12)/2,bh=78,caja=(a,b,t,val,col,bg)=>{rr(a,b,bw,bh,12,bg);x.fillStyle="#777";x.font="400 12px "+fam;x.fillText(t,a+14,b+24);x.fillStyle=col;x.font="700 20px "+fam;x.fillText(cut(val,bw-28),a+14,b+55)};
 caja(P,y,"Cliente",v.cliente_nombre||"","#222","#f6f1f2");caja(P+bw+12,y,"Precio original",$$(v.subtotal),"#222","#f6f1f2");
 caja(P,y+bh+10,"Abonado",$$(v.abonado),"#1f8a4c","#eef7f1");caja(P+bw+12,y+bh+10,"Saldo pendiente",$$(v.pendiente_monto),"#c05621","#fff2e8");
 y+=bh*2+10+26;x.fillStyle="#666";x.font="400 12px "+fam;x.fillText("Pendiente desde: "+fecha,P,y);
 return new Promise(ok=>c.toBlob(ok,"image/png"))}
/* Recordatorio de cobro pendiente: copiar texto o imagen */
function recordatorio(v){
 const fecha=new Date(v.created_at).toLocaleString("es-SV",{dateStyle:"medium",timeStyle:"short"});
 const txt=["RECORDATORIO DE PAGO PENDIENTE","",...(v.venta_items||[]).map(i=>`Producto: ${itName(i)}\nCódigo: ${itCode(i)}\nCantidad: ${i.cantidad}`),`Cliente: ${v.cliente_nombre||""}`,`Precio original: ${$$(v.subtotal)}`,`Abonado: ${$$(v.abonado)}`,`Saldo pendiente: ${$$(v.pendiente_monto)}`,`Pendiente desde: ${fecha}`].join("\n");
 const m=modal("Recordatorio de pago pendiente",`<div id="rmC" style="background:#fff;color:#222;border-radius:12px;padding:12px">${lineas(v).replace(/class="ln"/g,'class="ln" style="color:#222"')}
  <div class="am"><div><span>Cliente</span><b>${esc(v.cliente_nombre||"")}</b></div><div><span>Precio original</span><b>${$$(v.subtotal)}</b></div><div><span>Abonado</span><b>${$$(v.abonado)}</b></div><div class="o"><span>Saldo pendiente</span><b>${$$(v.pendiente_monto)}</b></div></div>
  <small style="color:#666">Pendiente desde: ${esc(fecha)}</small></div>`,
  {foot:`<button class="btn g" data-x>Cerrar</button><button class="btn g" id="rmT">Copiar texto</button><button class="btn" id="rmI">Copiar imagen</button>`});
 m.q("#rmT").onclick=async()=>{try{await navigator.clipboard.writeText(txt);toast("Datos del recordatorio copiados")}catch(e){const a=document.createElement("textarea");a.value=txt;document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand("copy")}catch(e2){}a.remove();toast(ok?"Datos del recordatorio copiados":"No se pudo copiar")}};
 m.q("#rmI").onclick=async()=>{
  /* la imagen se prepara mientras se pide copiar: Safari (iPhone) solo deja copiar si la copia se pide al tocar el botón */
  const gen=(async()=>{const b=await recordatorioPNG(v,fecha);if(!b)throw new Error("No se pudo generar la imagen");return b})();
  gen.catch(()=>{});
  await espera(async()=>{
   let copiado=false;
   if(navigator.clipboard&&window.ClipboardItem&&isSecureContext){
    try{await Promise.race([navigator.clipboard.write([new ClipboardItem({"image/png":gen})]),new Promise((_,ko)=>setTimeout(()=>ko(new Error("tiempo")),10000))]);copiado=true}catch(e){console.warn("copiar imagen:",e)}}
   if(copiado){toast("Imagen del recordatorio copiada");return}
   const b=await Promise.race([gen,new Promise((_,ko)=>setTimeout(()=>ko(new Error("No se pudo generar la imagen. Intenta de nuevo.")),20000))]);
   const f=new File([b],"recordatorio-pago-pendiente.png",{type:"image/png"});
   try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f]});toast("Imagen lista para compartir");return}}catch(e){if(e&&e.name==="AbortError")return}
   const a=document.createElement("a");a.download="recordatorio-pago-pendiente.png";a.href=URL.createObjectURL(b);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("La imagen fue descargada; puedes compartirla")},"Generando imagen…")}}

/* Editar un pedido contra entrega o de entrega pendiente */
function editarPedido(v){
 const L=v.venta_items||[],cod=v.tipo==="cod";
 const m=modal(cod?"Editar pedido contra entrega":"Editar entrega pendiente",
  `<div id="epL">${L.map(i=>`<div class="ln">${itImg(i)?`<img src="${esc(itImg(i))}" alt="">`:`<div class="ph">${inicial(itName(i))}</div>`}<div class="ti"><b>${esc(itName(i))}</b><small>${$$(i.precio_unit)} / unidad</small></div>
   <div class="stp"><button type="button" data-st="-1" data-i="${i.id}">−</button><input type="number" min="1" step="1" value="${i.cantidad}" data-q="${i.id}" style="min-width:56px"><button type="button" data-st="1" data-i="${i.id}">+</button></div></div>`).join("")}</div>
  <div class="cfg" style="margin-top:12px"><div class="fg">
   ${cod?`<div class="full"><label>¿Quién paga la comisión?</label><div class="tp"><button type="button" data-who="client" class="${v.quien_paga==="client"?"on":""}">El cliente</button><button type="button" data-who="we" class="${v.quien_paga==="we"?"on":""}">Nosotros</button></div></div>`:
    `<div class="full"><label>Método de pago</label><div class="tp pm"><button type="button" data-pm="Efectivo" class="${v.metodo_pago==="Efectivo"?"on":""}">Efectivo</button><button type="button" data-pm="Transferencia" class="${v.metodo_pago==="Transferencia"?"on":""}">Transferencia</button></div></div>`}
   <div><label>Envío</label>${INP("envio","0.00",`value="${v.envio}"`)}</div>
   ${cod?`<div><label>Seguro</label>${INP("seguro","0.00",`value="${v.seguro}"`)}</div><div><label>Tipo de comisión</label><select name="ctipo"><option value="percentage" ${v.comision_tipo==="percentage"?"selected":""}>Porcentaje (%)</option><option value="fixed" ${v.comision_tipo==="fixed"?"selected":""}>Monto fijo ($)</option></select></div>`:""}
   <div><label>${cod?"Comisión":"Comisión (%)"}</label><input name="cval" type="number" min="0" step="0.01" value="${v.comision_valor}"></div></div></div>
  <div class="calc" id="epC"></div><div class="err2" id="epE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="epOk">Guardar cambios</button>`});
 let who=v.quien_paga,pm=v.metodo_pago;
 const qv=n=>{const e=m.q(`[name=${n}]`);if(!e)return 0;const x=e.value.trim()===""?0:Number(e.value);if(!isFinite(x)||x<0)throw new Error("Revisa los importes: deben ser números válidos y no negativos.");return x};
 const cant=()=>L.map(i=>({item_id:i.id,cantidad:parseInt(m.q(`[data-q="${i.id}"]`).value,10)}));
 const opts=()=>{const o={envio:qv("envio"),comision_valor:qv("cval"),metodo:pm};if(cod){o.seguro=qv("seguro");o.comision_tipo=m.q("[name=ctipo]").value;o.quien_paga=who}
  if(o.comision_tipo==="percentage"||!cod){if(o.comision_valor>100)throw new Error("La comisión porcentual no puede superar el 100%.")}return o};
 const calc=()=>{try{const o=opts(),C=cant();let sub=0;L.forEach((i,k)=>{if(!Number.isInteger(C[k].cantidad)||C[k].cantidad<1)throw new Error("La cantidad debe ser un entero mayor que cero");sub+=cents(i.precio_unit)*C[k].cantidad});
   const env=cents(o.envio),seg=cents(o.seguro||0);const fixed=cod&&o.comision_tipo==="fixed";const com=fixed?cents(o.comision_valor):Math.round(sub*o.comision_valor/100);
   const total=cod?sub+env+seg+(who==="we"?-com:com):sub+env+com;if(total<0)throw new Error("La comisión no puede ser mayor que el precio");
   const net=cod?(sub-(who==="we"?com:0)):null;
   m.q("#epC").innerHTML=`<div><span>Productos</span><span>${$$(sub/100)}</span></div><div><span>Envío</span><span>${$$(env/100)}</span></div><div><span>Comisión</span><span>${$$(com/100)}</span></div>${cod?`<div><span>Seguro</span><span>${$$(seg/100)}</span></div>`:""}<div class="t"><span>Total a cobrar</span><b>${$$(total/100)}</b></div>${cod?`<div><span>Ganancia neta</span><span>${$$(net/100)}</span></div>`:""}`;
   m.q("#epE").textContent="";return {o,C}}catch(e){m.q("#epE").textContent=e.message;m.q("#epC").innerHTML="";return null}};
 m.el.addEventListener("click",e=>{const s=e.target.closest("[data-st]"),w=e.target.closest("[data-who]"),p=e.target.closest("[data-pm]");
  if(s){const i=m.q(`[data-q="${s.dataset.i}"]`);i.value=Math.max(1,(parseInt(i.value,10)||1)+(+s.dataset.st))}
  if(w){who=w.dataset.who;w.parentNode.querySelectorAll("[data-who]").forEach(b=>b.classList.toggle("on",b===w))}
  if(p){pm=p.dataset.pm;p.parentNode.querySelectorAll("[data-pm]").forEach(b=>b.classList.toggle("on",b===p))}calc()});
 m.el.addEventListener("input",calc);calc();
 m.q("#epOk").onclick=async()=>{const r=calc();if(!r)return;
  const ok=await espera(async()=>{await rpc("editar_pedido",{p_venta:v.id,p_opts:r.o,p_cantidades:r.C});return true});
  if(ok){m.close();toast("Pedido actualizado");snd("ok");await Promise.all([cargarPend(),cargarProductos()]);pintarPend();filtrar(true)}}}

/* ---------- ventas del día e historial ---------- */
const dayRange=(a,b)=>{const [y1,m1,d1]=a.split("-").map(Number),[y2,m2,d2]=b.split("-").map(Number);
 return [new Date(y1,m1-1,d1,0,0,0).toISOString(),new Date(y2,m2-1,d2+1,0,0,0).toISOString()]};
async function ventasRango(desde,hasta){
 return fetchAll(()=>{let q=db.from("ventas").select(`*,profiles(nombre),venta_items(${SEL_ITEMS})`).eq("estado","completada").order("created_at",{ascending:false});
  if(desde&&hasta){const r=dayRange(desde,hasta);q=q.gte("created_at",r[0]).lt("created_at",r[1])}return q})}
const filaVenta=v=>`<div class="sv2"><div class="sv2h"><div class="th">${(v.venta_items||[]).slice(0,3).map(i=>itImg(i)?`<img src="${esc(itImg(i))}" alt="" loading="lazy">`:`<div class="ph">${inicial(itName(i))}</div>`).join("")}</div>
 <div class="sv2t"><b>${resumenItems(v)}</b><small>${fdate(v.created_at)} · ${ftime(v.created_at)}</small></div><b class="sv2p">${$$(v.total)}</b></div>
 <div class="sv2m">${tipoBd(v.tipo)} ${pagoBd(v.metodo_pago)}${v.cliente_nombre?`<span class="sv2c">👤 ${esc(v.cliente_nombre)}</span>`:""}${v.profiles?`<span class="sv2c">Vendió: ${esc(v.profiles.nombre)}</span>`:""}</div>
 <div class="sv2a"><button class="btn g sm" data-tk="${v.id}">Ticket</button><button class="btn g sm" data-fa="${v.id}">Facturar</button>${ADM?`<a class="btn g sm" href="devoluciones.html#v=${v.id}">Devolver</a><button class="btn g sm dn" data-an="${v.id}">Anular</button><button class="btn g sm dn" data-el="${v.id}">Eliminar</button>`:""}</div></div>`;
async function anular(id,after){
 if(!soloAdmin())return;if(!await pedirClave("Vas a anular esta venta."))return;
 const v=[...S.ventas,...S.pend].find(x=>x.id===id);
 if(!await confirmar((v?lineas(v)+`<p>Total: <b>${$$(v.total)}</b></p>`:"")+`<p>La venta se anulará y <b>se devolverá el stock</b> al inventario.</p>`,{titulo:"Anular venta",ok:"Anular",peligro:true}))return;
 const ok=await espera(async()=>{await rpc("anular_venta",{p_venta:id});return true});
 if(ok){toast("Venta anulada y stock devuelto");snd("ok");await cargarProductos();filtrar(true);await after()}}
async function eliminarVenta(id,after){
 if(!soloAdmin())return;if(!await pedirClave("Vas a eliminar esta venta."))return;
 const v=[...S.ventas,...S.pend].find(x=>x.id===id);
 const m=modal("Eliminar venta",(v?lineas(v)+`<p>Total: <b>${$$(v.total)}</b>${v.profiles?" · Vendió: "+esc(v.profiles.nombre):""}</p>`:"")+
  `<p class="pw">La venta desaparece por completo de ventas, reportes y cierres futuros. <b>No se puede deshacer.</b> Elige qué pasa con el stock:</p>
  <label class="cf-c"><input type="radio" name="evd" value="1" checked> Devolver los productos al stock</label>
  <label class="cf-c"><input type="radio" name="evd" value="0"> No devolver (el stock se queda como está)</label>
  <p class="hint">Si solo quieres corregir un error y dejar constancia, usa <b>Anular</b>: la venta queda en el historial.</p>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn dg" id="evOk">Eliminar</button>`});
 m.q("#evOk").onclick=async()=>{const dev=m.q("[name=evd]:checked").value==="1";
  const ok=await espera(async()=>{await rpc("eliminar_venta",{p_venta:id,p_devolver:dev});return true});
  if(ok){m.close();toast(dev?"Venta eliminada y stock devuelto":"Venta eliminada");snd("ok");await cargarProductos();filtrar(true);await after()}}}
async function pintarHoy(){
 const d=$("hDate").value||ymd(new Date());$("hDate").value=d;
 const L=await espera(()=>ventasRango(d,d));if(!L)return;S.ventas=L;
 const g={ef:[0,0],tr:[0,0],ent:[0,0],cod:[0,0],cob:[0,0]};
 L.forEach(v=>{const k=v.tipo==="entrega_pendiente"?"ent":v.tipo==="cod"?"cod":v.tipo==="cobro_pendiente"?"cob":v.metodo_pago==="Transferencia"?"tr":"ef";g[k][0]+=+v.total;g[k][1]++});
 const kp=(n,k)=>`<div><span>${n}</span><b>${$$(g[k][0])}</b><small>${g[k][1]} ventas</small></div>`;
 $("hKpi").innerHTML=kp("Efectivo","ef")+kp("Transferencia","tr")+kp("Pend. entrega","ent")+kp("Contra entrega","cod")+kp("Pend. cobro","cob");
 $("hList").innerHTML=L.length?L.map(filaVenta).join(""):`<div class="empty card">No hay ventas para esta fecha</div>`;
 navBadge("hoy",d===ymd(new Date())?L.length:+document.querySelector('#bnav [data-p="hoy"] .nb').textContent||0)}
function aplicarQuick(){
 const q=$("vQuick").value;if(q==="all"||q==="custom")return;const t=new Date();let a;
 if(q==="yest"){const y=new Date(t.getFullYear(),t.getMonth(),t.getDate()-1);$("vFrom").value=ymd(y);$("vTo").value=ymd(y);return}
 if(q==="today")a=new Date(t.getFullYear(),t.getMonth(),t.getDate());
 else if(q==="week"){const dw=t.getDay();a=new Date(t.getFullYear(),t.getMonth(),t.getDate()-(dw===0?6:dw-1))}
 else if(q==="month")a=new Date(t.getFullYear(),t.getMonth(),1);else a=new Date(t.getFullYear(),0,1);
 $("vFrom").value=ymd(a);$("vTo").value=ymd(t)}
async function pintarVentas(){
 aplicarQuick();const a=$("vFrom").value,b=$("vTo").value,all=$("vQuick").value==="all"&&!a&&!b;
 const L=await espera(()=>ventasRango(all?null:a||null,all?null:b||null));if(!L)return;
 const ty=$("vType").value,pm=$("vPay").value;
 const qs=norm($("vSearch").value);
 S.ventas=L.filter(v=>(ty==="all"||v.tipo===ty)&&(pm==="all"||v.metodo_pago===pm)&&(!qs||norm("#"+v.numero+" "+(v.cliente_nombre||"")+" "+(v.venta_items||[]).map(itName).join(" ")).includes(qs)));
 const tot=S.ventas.reduce((s,v)=>s+ +v.total,0),ef=S.ventas.filter(v=>v.metodo_pago!=="Transferencia"),tr=S.ventas.filter(v=>v.metodo_pago==="Transferencia");
 const sm=l=>l.reduce((s,v)=>s+ +v.total,0);
 $("vKpi").innerHTML=`<div><span>Total vendido</span><b>${$$(tot)}</b></div><div><span>Efectivo</span><b>${$$(sm(ef))}</b><small>${ef.length} transacciones</small></div><div><span>Transferencia</span><b>${$$(sm(tr))}</b><small>${tr.length} transacciones</small></div><div><span>Ventas</span><b>${S.ventas.length}</b></div><div><span>Promedio por venta</span><b>${$$(S.ventas.length?tot/S.ventas.length:0)}</b></div>`;
 S.vShown=100;listaVentas()}
function listaVentas(){
 const L=S.ventas;$("vList").innerHTML=L.length?L.slice(0,S.vShown).map(filaVenta).join(""):`<div class="empty card">No hay ventas en el periodo seleccionado</div>`;
 $("vMore").classList.toggle("hidden",L.length<=S.vShown)}

/* ---------- escáner (cámara y lector USB) ---------- */
let QR=null,lastScan="",lastScanT=0,lastSeenT=0,usbBuf="",usbT=0;
function escaneado(code,fromCam){
 code=String(code||"").trim();if(!code)return;
 if(S.venta){if((S.venta.p.codigo_barras||"").trim()===code)S.venta.inc();else{snd("err");toast("Termina o cancela la venta que tienes abierta")}return}
 const p=S.all.find(x=>x.codigo_barras&&x.codigo_barras.trim()===code);
 if(!p){snd("err");toast("Producto no existente");return}
 snd("ok");
 if(S.multi){addSel(p.id);return}
 if(S.tab!=="inv")tab("inv");
 $("fBar").value=code;filtrar();
 if(fromCam&&document.querySelector("dialog[open]"))return;
 requestAnimationFrame(()=>{const el=document.getElementById("row-1")||document.getElementById("card-1");if(el){el.classList.add("hl");el.scrollIntoView({behavior:"smooth",block:"center"})}});
 setTimeout(()=>{if(!document.querySelector("dialog[open]"))abrirVenta(p)},350);toast("Producto encontrado: "+p.nombre)}
function camara(){
 if(QR)return;
 if(typeof Html5Qrcode==="undefined"){toast("No se pudo cargar el escáner. Revisa tu conexión.");return}
 const box=document.createElement("div");box.className="scan";box.id="scanBox";
 box.innerHTML=`<div class="sh"><strong>Escanear código</strong><button class="btn g sm" type="button" id="scX">Cancelar</button></div><div id="rdr"></div>`;document.body.appendChild(box);
 const hd=box.querySelector(".sh");let drag=null;
 hd.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;const r=box.getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top};box.style.left=r.left+"px";box.style.top=r.top+"px";box.style.transform="none";hd.setPointerCapture(e.pointerId)});
 hd.addEventListener("pointermove",e=>{if(!drag)return;box.style.left=Math.max(8,Math.min(innerWidth-box.offsetWidth-8,e.clientX-drag.x))+"px";box.style.top=Math.max(8,Math.min(innerHeight-box.offsetHeight-8,e.clientY-drag.y))+"px"});
 hd.addEventListener("pointerup",()=>{drag=null});
 box.querySelector("#scX").onclick=pararCamara;
 QR=new Html5Qrcode("rdr");lastScan="";
 QR.start({facingMode:"environment"},{fps:12,aspectRatio:1.6,qrbox:(w,h)=>({width:Math.max(120,Math.floor(w*.86)),height:Math.max(70,Math.floor(h*.62))})},txt=>{
  const c=txt.trim(),now=Date.now(),hueco=now-lastSeenT;lastSeenT=now;
  /* el mismo código seguido, sin haberlo quitado de la cámara, es la misma lectura; si lo apartas y lo vuelves a pasar, cuenta otra vez */
  if(c===lastScan&&hueco<700)return;
  if(!S.multi&&!S.venta&&document.querySelector("dialog[open]"))return;
  lastScan=c;lastScanT=now;escaneado(c,true)},()=>{}).catch(e=>{toast("No se pudo abrir la cámara: "+(e&&e.message||e));pararCamara()})}
function pararCamara(){const q=QR;QR=null;const rm=()=>{const b=document.getElementById("scanBox");if(b)b.remove()};
 if(q){q.stop().then(rm).catch(rm)}else rm()}
function usb(on){S.usb=on===undefined?!S.usb:on;$("bUsb").classList.toggle("on",S.usb);$("bUsb").setAttribute("aria-pressed",String(S.usb));
 if(S.usb){tab("inv");$("fBar").focus();toast("Lector USB activado")}else toast("Lector USB desactivado")}
document.addEventListener("keydown",e=>{
 if(S.usb&&(!document.querySelector("dialog[open]")||S.venta)){
  if(e.key==="Enter"){if(usbBuf){const c=usbBuf;usbBuf="";escaneado(c,false);e.preventDefault()}}
  else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){const n=Date.now();if(n-usbT>100)usbBuf="";usbT=n;usbBuf+=e.key}}
 if(e.ctrlKey&&e.key.toLowerCase()==="b"){e.preventDefault();tab("inv");$("fBar").focus()}
 if(e.key==="Escape"&&QR)pararCamara()});

/* ---------- exportar inventario a Excel (con imágenes) ---------- */
async function excel(){
 if(!S.prods.length){toast("No hay productos en el inventario para exportar.");return}
 await espera(async()=>{await lib("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
  const toJpeg=async url=>{const b=await(await fetch(url)).blob(),bmp=await createImageBitmap(b),k=Math.min(1,120/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*k)),h=Math.max(1,Math.round(bmp.height*k));
   const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(bmp,0,0,w,h);return {base64:c.toDataURL("image/jpeg",.85),w,h}};
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Inventario");
  ws.columns=[["Imagen",20],["Producto",34],["Código",16],["Código de barras",20],["Categoría",18],["Cantidad en stock",18],["Precio unitario",16],["Descuento %",12],["Precio final",12],["Descripción",40]].map(c=>({header:c[0],width:c[1]}));
  const h=ws.getRow(1);h.font={bold:true,color:{argb:"FFFFFFFF"}};h.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF6B2D3E"}};h.alignment={vertical:"middle",horizontal:"center"};h.height=24;
  const L=S.prods.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
  for(let i=0;i<L.length;i++){const p=L[i];
   const r=ws.addRow(["",p.nombre,p.codigo||"",p.codigo_barras||"",p.cat||"",p.stock,+p.precio_venta,+p.descuento_pct||0,p.fin,p.descripcion||""]);
   r.height=95;r.alignment={vertical:"middle",wrapText:true};[7,9].forEach(c=>r.getCell(c).numFmt='"$"#,##0.00');
   if(p.foto_url){try{const im=await toJpeg(p.foto_url),id=wb.addImage({base64:im.base64,extension:"jpeg"});ws.addImage(id,{tl:{col:.1,row:i+1.1},ext:{width:im.w*.75,height:im.h*.75}})}catch(e){}}}
  ws.views=[{state:"frozen",ySplit:1}];
  const buf=await wb.xlsx.writeBuffer(),a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  a.download="inventario-daymar-shop-"+ymd(new Date())+".xlsx";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  toast("Inventario exportado a Excel.")},"Generando Excel…")}

/* ---------- navegación entre secciones ---------- */
const TABS=[["inv","Inventario",IC.box],["pend","Pendientes",IC.clock],["hoy","Hoy",IC.cal],["ven","Ventas",IC.rec],["fac","Facturas",IC.fac]];
$("bnav").innerHTML=TABS.map(t=>`<button type="button" data-p="${t[0]}">${ic(t[2])}<span>${t[1]}</span><span class="nb hidden">0</span></button>`).join("");
$("bScan").innerHTML=ic(IC.scan)+"Escanear";
async function tab(k){
 S.tab=k;document.querySelectorAll("#bnav button").forEach(b=>b.classList.toggle("on",b.dataset.p===k));
 TABS.forEach(t=>$("p-"+t[0]).classList.toggle("hidden",t[0]!==k));
 if(k==="pend"){if(!S.pend.length)await cargarPend().catch(e=>toast(e.message));pintarPend()}
 if(k==="hoy")pintarHoy();
 if(k==="ven")pintarVentas();
 if(k==="fac")pintarFacturas()}

/* ---------- documentos imprimibles (facturas y cierre de caja) ---------- */
let CFG=null;
async function ensureCfg(){
 if(CFG)return CFG;
 const {data}=await db.from("config_negocio").select("*").eq("id",1).maybeSingle();
 CFG=data||{nombre:"DAYMAR-SHOP",eslogan:"A Family Company",iva_pct:13,pie:"¡Gracias por su compra!"};return CFG}
const fnum=n=>"F-"+String(n).padStart(6,"0");
const DOC_CSS=`.fx{font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;box-sizing:border-box;position:relative;font-size:13px;line-height:1.35}
.fx *{box-sizing:border-box}.fx-a4{width:794px;padding:44px 48px}.fx-t80{width:302px;padding:14px 12px;font-size:12px}
.fx h1{margin:0;font-size:24px;color:#6B2D3E;letter-spacing:.5px}.fx-t80 h1{font-size:19px;text-align:center}
.fx .sl{color:#C9973F;font-weight:700;font-size:12px}.fx small{color:#666}
.fx .top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #6B2D3E;padding-bottom:14px;margin-bottom:14px}
.fx-t80 .top{display:block;text-align:center;border-bottom:1px dashed #888;padding-bottom:8px}
.fx .no{text-align:right}.fx-t80 .no{text-align:center;margin-top:6px}
.fx .no b{display:block;font-size:20px;color:#6B2D3E}.fx-t80 .no b{font-size:16px}
.fx .cl{background:#f7f2f3;border-radius:8px;padding:10px 12px;margin-bottom:14px}.fx-t80 .cl{background:none;padding:6px 0;border-bottom:1px dashed #888;border-radius:0}
.fx table{width:100%;border-collapse:collapse}.fx th{background:#6B2D3E;color:#fff;text-align:left;font-size:12px;padding:7px 8px}
.fx td{padding:7px 8px;border-bottom:1px solid #e6dde0;vertical-align:top}.fx tr{page-break-inside:avoid}
.fx .r{text-align:right;white-space:nowrap}.fx-t80 th{background:none;color:#000;border-bottom:1px solid #000;padding:4px 2px}.fx-t80 td{padding:4px 2px;border-bottom:1px dotted #aaa}
.fx .tt{margin-left:auto;width:290px;margin-top:12px}.fx-t80 .tt{width:100%}
.fx .tt div{display:flex;justify-content:space-between;padding:3px 0}.fx .tt .g{font-size:18px;font-weight:700;color:#6B2D3E;border-top:2px solid #6B2D3E;margin-top:4px;padding-top:7px}
.fx .ft{display:flex;gap:16px;align-items:center;margin-top:22px;border-top:1px solid #e6dde0;padding-top:12px}.fx-t80 .ft{display:block;text-align:center;margin-top:12px}
.fx .qr{width:84px;height:84px;flex:none}.fx-t80 .qr{margin:0 auto 6px}.fx .qr svg{width:100%;height:100%}
.fx .an{position:absolute;left:0;right:0;top:38%;text-align:center;font-size:84px;font-weight:700;color:rgba(179,38,30,.16);transform:rotate(-18deg);pointer-events:none}.fx-t80 .an{font-size:46px}
.fx .nt{margin-top:10px;color:#555}`;
const money=n=>"$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
async function qrSvg(txt){try{await lib("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js");const q=qrcode(0,"M");q.addData(txt);q.make();return q.createSvgTag({cellSize:4,margin:0,scalable:true})}catch(e){return""}}
async function facHTML(f,fmt){
 const c=await ensureCfg(),its=f.factura_items||[],iv=f.iva_modo;
 const qr=await qrSvg(["FACTURA",fnum(f.numero),f.codigo,f.fecha,f.total].join("|"));
 const fila=i=>fmt==="t80"?`<tr><td colspan="3">${esc(i.nombre)}</td></tr><tr><td>${i.cantidad} × ${money(i.precio_unit)}</td><td></td><td class="r">${money(i.total)}</td></tr>`
  :`<tr><td>${i.cantidad}</td><td>${esc(i.nombre)}${i.codigo?` <small>(${esc(i.codigo)})</small>`:""}</td><td class="r">${money(i.precio_unit)}</td><td class="r">${money(i.total)}</td></tr>`;
 const dato=(l,v)=>v?`<div><small>${l}</small> ${esc(v)}</div>`:"";
 return `<div class="fx fx-${fmt}"><style>${DOC_CSS}</style>${f.estado==="anulada"?'<div class="an">ANULADA</div>':""}
 <div class="top"><div><h1>${esc(c.nombre||"DAYMAR-SHOP")}</h1><div class="sl">${esc(c.eslogan||"")}</div>
  ${c.razon_social?`<div>${esc(c.razon_social)}</div>`:""}${dato("NIT",c.nit)}${dato("NRC",c.nrc)}${c.giro?`<div>${esc(c.giro)}</div>`:""}${c.direccion?`<div>${esc(c.direccion)}</div>`:""}${dato("Tel.",c.telefono)}${c.correo?`<div>${esc(c.correo)}</div>`:""}</div>
  <div class="no"><span class="sl">FACTURA</span><b>${fnum(f.numero)}</b><div>${fdate(f.fecha)}</div><small>Pago: ${esc(f.metodo_pago)}</small></div></div>
 <div class="cl"><b>${esc(f.cliente_nombre||"Consumidor final")}</b>${dato("NIT/DUI:",f.cliente_doc)}${dato("Dirección:",f.cliente_direccion)}${dato("Tel.:",f.cliente_telefono)}</div>
 <table>${fmt==="t80"?"":'<thead><tr><th style="width:52px">Cant.</th><th>Descripción</th><th class="r">P. unit.</th><th class="r">Total</th></tr></thead>'}<tbody>${its.map(fila).join("")}</tbody></table>
 <div class="tt"><div><span>Subtotal</span><span>${money(f.subtotal)}</span></div>
  ${+f.descuento_monto?`<div><span>Descuento</span><span>-${money(f.descuento_monto)}</span></div>`:""}${+f.envio?`<div><span>Envío</span><span>${money(f.envio)}</span></div>`:""}
  ${iv!=="ninguno"?`<div><span>IVA ${+f.iva_pct}%${iv==="incluido"?" (incluido)":""}</span><span>${money(f.iva_monto)}</span></div>`:""}
  <div class="g"><span>TOTAL</span><span>${money(f.total)}</span></div>
  ${f.efectivo!=null?`<div><span>Efectivo recibido</span><span>${money(f.efectivo)}</span></div><div><span>Cambio</span><span>${money(f.cambio)}</span></div>`:""}</div>
 ${f.nota?`<div class="nt">${esc(f.nota)}</div>`:""}
 <div class="ft">${qr?`<div class="qr">${qr}</div>`:""}<div><b>${esc(c.pie||"")}</b><br><small>Código de validación: ${esc(f.codigo)}</small></div></div></div>`}
async function cierreHTML(c,fmt){
 const cf=await ensureCfg(),R=c.resumen||{};
 const N={ef:"Efectivo",tr:"Transferencia",ent:"Pend. de entrega (completadas)",cod:"Contra entrega (completadas)",cob:"Pend. de cobro (completadas)",dev:"Devoluciones y cambios (neto)"};
 const rows=Object.keys(N).filter(k=>k!=="dev"||R.dev).map(k=>`<tr><td>${N[k]}</td><td class="r">${(R[k]||{}).n||0}</td><td class="r">${money((R[k]||{}).total||0)}</td></tr>`).join("");
 const util=+c.total_ventas-+c.costo_total;
 return `<div class="fx fx-${fmt}"><style>${DOC_CSS}</style>
 <div class="top"><div><h1>${esc(cf.nombre||"DAYMAR-SHOP")}</h1><div class="sl">Cierre de caja</div></div>
 <div class="no"><b>${rangoTxt(c.fecha,c.fecha_hasta)}</b><small>Cerrado ${fdate(c.created_at)} ${ftime(c.created_at)}${c.profiles?" · "+esc(c.profiles.nombre):""}</small></div></div>
 <table><thead><tr><th>Concepto</th><th class="r">Ventas</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
 <div class="tt"><div class="g"><span>Total vendido</span><span>${money(c.total_ventas)}</span></div>
  <div><span>Ventas completadas</span><span>${c.n_ventas}</span></div><div><span>Ventas anuladas</span><span>${c.n_anuladas}</span></div>
  ${ADM?`<div><span>Costo de lo vendido</span><span>${money(c.costo_total)}</span></div><div><span>Utilidad bruta</span><span>${money(util)}</span></div>`:""}
  <div><span>Efectivo esperado</span><span>${money(c.esperado_efectivo)}</span></div>
  ${c.efectivo_contado!=null?`<div><span>Efectivo contado</span><span>${money(c.efectivo_contado)}</span></div><div><b>Diferencia</b><b style="color:${+c.diferencia===0?"#2f7d4f":"#b3261e"}">${money(c.diferencia)}</b></div>`:""}</div>
 ${c.nota?`<div class="nt"><b>Nota:</b> ${esc(c.nota)}</div>`:""}</div>`}

/* Imprimir (diálogo del navegador) o guardar como PDF */
function imprimir(html,fmt){
 const f=document.createElement("iframe");f.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0";document.body.appendChild(f);
 const d=f.contentWindow.document;d.open();
 d.write(`<!doctype html><html><head><meta charset="utf-8"><title>DAYMAR-SHOP</title><style>@page{size:${fmt==="t80"?"80mm auto":"A4"};margin:0}html,body{margin:0;background:#fff}.fx{box-shadow:none!important}</style></head><body>${html}</body></html>`);d.close();
 setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast("No se pudo abrir la impresión")}setTimeout(()=>f.remove(),120000)},350)}
async function descargarPdf(html,fmt,nombre){
 await espera(async()=>{
  await lib("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");await lib("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  const host=document.createElement("div");host.style.cssText="position:fixed;left:-10000px;top:0;background:#fff";host.innerHTML=html;document.body.appendChild(host);
  await new Promise(r=>setTimeout(r,150));
  const c=await DAY.h2c(host.firstElementChild,{backgroundColor:"#ffffff",scale:2,useCORS:true,logging:false});host.remove();
  const {jsPDF}=window.jspdf;
  if(fmt==="t80"){const w=80,h=c.height*w/c.width,p=new jsPDF({unit:"mm",format:[w,Math.max(h,40)]});p.addImage(c.toDataURL("image/jpeg",.95),"JPEG",0,0,w,h);p.save(nombre)}
  else{const p=new jsPDF("p","mm","a4"),W=210,H=297,pageH=Math.floor(c.width*H/W);
   for(let y=0;y<c.height;y+=pageH){const s=document.createElement("canvas");s.width=c.width;s.height=Math.min(pageH,c.height-y);const x=s.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,s.width,s.height);x.drawImage(c,0,y,c.width,s.height,0,0,c.width,s.height);
    if(y)p.addPage();p.addImage(s.toDataURL("image/jpeg",.95),"JPEG",0,0,W,s.height*W/c.width)}
   p.save(nombre)}
  toast("PDF generado")},"Generando PDF…")}
/* Vista previa con botones de impresión y PDF */
async function vistaDoc(titulo,build,nombre,extra){
 const fmtSaved=LS("dms_fmt")||"a4";let fmt=fmtSaved;
 const m=modal(esc(titulo),`<div class="tp" id="dfF"><button type="button" data-f="a4">Carta / A4</button><button type="button" data-f="t80">Ticket 80 mm</button></div><div class="docv" id="dvB"></div>`,
  {big:true,foot:`${extra||""}<button class="btn g" data-x>Cerrar</button><button class="btn g" id="dvP">Imprimir</button><button class="btn" id="dvD">Descargar PDF</button>`});
 let html="";
 const draw=async()=>{m.el.querySelectorAll("#dfF button").forEach(b=>b.classList.toggle("on",b.dataset.f===fmt));
  html=await build(fmt);const box=m.q("#dvB");box.innerHTML=`<div class="dvz">${html}</div>`;
  const w=fmt==="t80"?302:794,z=Math.min(1,(box.clientWidth-8)/w);box.firstElementChild.style.zoom=z>0?z:1};
 m.q("#dfF").addEventListener("click",e=>{const b=e.target.closest("[data-f]");if(!b)return;fmt=b.dataset.f;LS("dms_fmt",fmt);draw()});
 m.q("#dvP").onclick=()=>imprimir(html,fmt);m.q("#dvD").onclick=()=>descargarPdf(html,fmt,nombre+(fmt==="t80"?"-ticket":"")+".pdf");
 await draw();return m}

/* ---------- FACTURAS ---------- */
const hoyD=()=>ymd(new Date());
const IVAN={incluido:"IVA incluido en los precios",agregado:"Agregar IVA al total",ninguno:"Sin IVA"};
async function cargarFactura(id){
 const {data,error}=await db.from("facturas").select("*,factura_items(*)").eq("id",id).single();
 if(error)throw new Error(error.message);data.factura_items.sort((a,b)=>a.orden-b.orden);return data}
function quickFac(){
 const q=$("fcQuick").value;if(q==="all"||q==="custom")return;const t=new Date();let a=new Date(t.getFullYear(),t.getMonth(),t.getDate()),b=t;
 if(q==="yest"){a=new Date(t.getFullYear(),t.getMonth(),t.getDate()-1);b=a}
 else if(q==="week"){const dw=t.getDay();a=new Date(t.getFullYear(),t.getMonth(),t.getDate()-(dw===0?6:dw-1))}
 else if(q==="month")a=new Date(t.getFullYear(),t.getMonth(),1);else if(q==="year")a=new Date(t.getFullYear(),0,1);
 $("fcFrom").value=ymd(a);$("fcTo").value=ymd(b)}
async function pintarFacturas(){
 quickFac();const a=$("fcFrom").value,b=$("fcTo").value,es=$("fcEst").value,q=norm($("fcQ").value);
 const L=await espera(()=>fetchAll(()=>{let r=db.from("facturas").select("*,factura_items(nombre)").order("numero",{ascending:false});
  if(a)r=r.gte("fecha",a);if(b)r=r.lte("fecha",b);if(es!=="all")r=r.eq("estado",es);return r}),"Cargando facturas…");if(!L)return;
 S.fac=L.filter(f=>!q||norm(fnum(f.numero)+" "+f.numero+" "+(f.cliente_nombre||"")+" "+f.codigo+" "+(f.cliente_doc||"")+" "+f.factura_items.map(i=>i.nombre).join(" ")).includes(q));
 const em=S.fac.filter(f=>f.estado==="emitida"),sm=k=>em.reduce((s,f)=>s+ +f[k],0);
 $("fcKpi").innerHTML=`<div><span>Facturado</span><b>${$$(sm("total"))}</b><small>${em.length} emitidas</small></div><div><span>IVA</span><b>${$$(sm("iva_monto"))}</b></div><div><span>Descuentos</span><b>${$$(sm("descuento_monto"))}</b></div><div><span>Anuladas</span><b>${S.fac.length-em.length}</b></div><div><span>Ticket promedio</span><b>${$$(em.length?sm("total")/em.length:0)}</b></div>`;
 $("fcList").innerHTML=S.fac.length?S.fac.slice(0,300).map(f=>`<div class="sv" data-fid="${f.id}"><div class="ti"><b>${fnum(f.numero)} · ${esc(f.cliente_nombre||"Consumidor final")}</b><small>${fdate(f.fecha)} · ${f.factura_items.length} línea${f.factura_items.length===1?"":"s"}</small><br>${pagoBd(f.metodo_pago)} ${f.estado==="anulada"?'<span class="bd or">Anulada</span>':""}</div>
  <div class="am2"><b style="${f.estado==="anulada"?"text-decoration:line-through;color:var(--mute)":""}">${$$(f.total)}</b><div class="fac-ac"><button class="btn g sm" data-fa="ver">Ver</button><button class="btn g sm" data-fa="print">Imprimir</button><button class="btn g sm" data-fa="pdf">PDF</button></div></div></div>`).join("")
  :`<div class="empty card">No hay facturas con estos filtros.<br><button class="btn" id="fcNew2" style="margin-top:10px">Crear la primera factura</button></div>`;
 const n2=$("fcNew2");if(n2)n2.onclick=()=>nuevaFactura()}
$("fcList").addEventListener("click",async e=>{
 const b=e.target.closest("[data-fa]"),r=e.target.closest("[data-fid]");if(!r)return;const id=r.dataset.fid;
 try{
  if(!b||b.dataset.fa==="ver"){const f=await espera(()=>cargarFactura(id));if(f)abrirFactura(f)}
  else if(b.dataset.fa==="print"){const f=await espera(()=>cargarFactura(id));if(f)imprimir(await facHTML(f,LS("dms_fmt")||"a4"),LS("dms_fmt")||"a4")}
  else if(b.dataset.fa==="pdf"){const f=await espera(()=>cargarFactura(id));if(f){const fm=LS("dms_fmt")||"a4";descargarPdf(await facHTML(f,fm),fm,fnum(f.numero)+(fm==="t80"?"-ticket":"")+".pdf")}}
 }catch(err){toast(err.message)}});
async function abrirFactura(f){
 const anu=ADM&&f.estado==="emitida"?`<button class="btn g" id="dvA" style="color:var(--bad)">Anular factura</button>`:"";
 const m=await vistaDoc("Factura "+fnum(f.numero),fm=>facHTML(f,fm),fnum(f.numero),anu);
 const a=m.q("#dvA");if(a)a.onclick=async()=>{
  if(!await pedirClave("Vas a anular la factura "+fnum(f.numero)+"."))return;
  if(!await confirmar("La factura quedará marcada como <b>ANULADA</b>. No se modifica el stock ni las ventas.",{titulo:"Anular factura",ok:"Anular",peligro:true}))return;
  const ok=await espera(async()=>{await rpc("anular_factura",{p_id:f.id});return true});
  if(ok){toast("Factura anulada");m.close();pintarFacturas()}}}

/* Selector de producto del inventario */
function pickProducto(cb){
 const m=modal("Agregar producto",`<input id="pkQ" type="search" placeholder="Buscar por nombre o código" autocomplete="off"><div id="pkL" style="margin-top:8px"></div>`,{});
 const draw=()=>{const q=m.q("#pkQ").value.trim();const L=(q?S.prods.filter(p=>fuzzy(p.nombre,q)||norm(p.codigo).includes(norm(q))||(p.codigo_barras||"")===q):S.prods).slice(0,40);
  m.q("#pkL").innerHTML=L.length?L.map(p=>`<div class="sv" data-pk="${p.id}" style="cursor:pointer"><div class="ti"><b>${esc(p.nombre)}</b><small>${esc(p.codigo||"")} · Stock ${p.stock}</small></div><div class="am2"><b>${$$(p.fin)}</b></div></div>`).join(""):`<div class="empty">Sin resultados</div>`};
 m.q("#pkQ").addEventListener("input",draw);draw();setTimeout(()=>m.q("#pkQ").focus(),60);
 m.q("#pkL").addEventListener("click",e=>{const r=e.target.closest("[data-pk]");if(!r)return;const p=S.byId.get(r.dataset.pk);m.close();cb(p)})}
/* Ventas que todavía no tienen factura */
async function pickVentas(cb){
 const d1=new Date();d1.setDate(d1.getDate()-60);
 const [V,Fv]=await espera(async()=>Promise.all([ventasRango(ymd(d1),hoyD()),fetchAll(()=>db.from("facturas").select("venta_ids").eq("estado","emitida"))]),"Buscando ventas…")||[];if(!V)return;
 const usadas=new Set(Fv.flatMap(f=>f.venta_ids||[])),L=V.filter(v=>!usadas.has(v.id));
 const m=modal("Traer de ventas",L.length?`<p class="pw" style="margin-top:0">Ventas completadas de los últimos 60 días que aún no tienen factura. Marca las que quieres incluir.</p>`+L.map(v=>`<label class="sv" style="cursor:pointer"><input type="checkbox" data-vv="${v.id}" style="flex:none"><div class="ti"><b>${resumenItems(v)}</b><small>${fdate(v.created_at)} ${ftime(v.created_at)}${v.cliente_nombre?" · "+esc(v.cliente_nombre):""}</small></div><div class="am2"><b>${$$(v.total)}</b></div></label>`).join("")
  :`<div class="empty">No hay ventas pendientes de facturar.</div>`,{foot:`<button class="btn g" data-x>Cancelar</button>${L.length?'<button class="btn" id="pvOk">Agregar a la factura</button>':""}`});
 const ok=m.q("#pvOk");if(ok)ok.onclick=()=>{const ids=[...m.el.querySelectorAll("[data-vv]:checked")].map(x=>x.dataset.vv);if(!ids.length){toast("Marca al menos una venta");return}m.close();cb(L.filter(v=>ids.includes(v.id)))}}
const fromVentas=L=>({items:L.flatMap(v=>(v.venta_items||[]).map(i=>({nombre:itName(i),codigo:i.codigo||"",cantidad:i.cantidad,precio:+i.precio_unit}))),
 ventas:L.map(v=>v.id),cliente:(L.find(v=>v.cliente_nombre)||{}).cliente_nombre||"",metodo:L[0].metodo_pago,envio:r2(L.filter(v=>v.tipo==="cod"||v.tipo==="entrega_pendiente").reduce((s,v)=>s+ +v.envio,0))});

async function nuevaFactura(pre){
 pre=pre||{};await ensureCfg();
 const F={items:(pre.items||[]).map(x=>({...x})),ventas:(pre.ventas||[]).slice()};
 const m=modal("Nueva factura",`
 <div class="fg">
  <div><label>Cliente</label><input name="cn" maxlength="120" placeholder="Consumidor final" value="${esc(pre.cliente||"")}"></div>
  <div><label>NIT / DUI <small>(opcional)</small></label><input name="cd" maxlength="40"></div>
  <div><label>Dirección <small>(opcional)</small></label><input name="ca" maxlength="160"></div>
  <div><label>Teléfono <small>(opcional)</small></label><input name="ct" maxlength="30" inputmode="tel"></div>
 </div>
 <h3 style="margin:14px 0 6px;font-size:15px">Productos</h3>
 <div class="elh"><span>Descripción</span><span>Cant.</span><span>Precio</span><span>Total</span><span></span></div>
 <div id="fLines"></div>
 <div class="ctl"><button class="btn g sm" type="button" id="fAddP">+ Del inventario</button><button class="btn g sm" type="button" id="fAddM">+ Línea manual</button><button class="btn g sm" type="button" id="fAddV">Traer de ventas</button></div>
 <div class="fg" style="margin-top:6px">
  <div><label>IVA</label><select name="modo">${Object.keys(IVAN).map(k=>`<option value="${k}">${IVAN[k]}${k==="ninguno"?"":" ("+(+CFG.iva_pct)+"%)"}</option>`).join("")}</select></div>
  <div><label>Método de pago</label><select name="met"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></div>
  <div><label>Descuento</label><div style="display:flex;gap:6px"><select name="dt" style="width:76px"><option value="pct">%</option><option value="monto">$</option></select><input name="dv" type="number" min="0" step="0.01" placeholder="0" inputmode="decimal"></div></div>
  <div><label>Código promocional</label><div style="display:flex;gap:6px"><input name="promo" placeholder="Opcional" style="text-transform:uppercase"><button class="btn g" type="button" id="fPromo">Aplicar</button></div></div>
  <div><label>Envío</label><input name="env" type="number" min="0" step="0.01" placeholder="0" inputmode="decimal" value="${pre.envio?pre.envio:""}"></div>
  <div id="fEfW"><label>Efectivo recibido</label><input name="ef" type="number" min="0" step="0.01" placeholder="Opcional" inputmode="decimal"></div>
  <div class="full"><label>Nota <small>(opcional)</small></label><input name="nota" maxlength="200"></div>
 </div>
 <div class="calc" id="fCalc"></div><div class="err2" id="fErr" role="alert"></div>`,
 {big:true,foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="fcOk">Emitir factura</button>`});
 const q=s=>m.q(`[name=${s}]`),num=s=>{const v=q(s).value.trim();return v===""?0:Number(v)};
 q("modo").value=LS("dms_iva")||"incluido";if(pre.metodo&&["Efectivo","Transferencia","Tarjeta"].includes(pre.metodo))q("met").value=pre.metodo;
 const lineHTML=(i,x)=>`<div class="el" data-i="${x}"><input data-f="nombre" value="${esc(i.nombre)}" placeholder="Descripción" maxlength="160" aria-label="Descripción"><input data-f="cantidad" type="number" min="1" step="1" value="${i.cantidad}" inputmode="numeric" aria-label="Cantidad"><input data-f="precio" type="number" min="0" step="0.01" value="${i.precio}" inputmode="decimal" aria-label="Precio"><b data-t>${$$(i.cantidad*i.precio)}</b><button type="button" class="btn g sm" data-rm="${x}" aria-label="Quitar línea">×</button></div>`;
 const lines=()=>{m.q("#fLines").innerHTML=F.items.length?F.items.map(lineHTML).join(""):`<div class="empty" style="padding:16px">Agrega productos del inventario, una línea manual o trae ventas ya hechas.</div>`;calc()};
 function calc(){
  const subC=F.items.reduce((s,i)=>s+cents(i.precio||0)*(Math.floor(i.cantidad)||0),0),dv=num("dv");
  const desC=q("dt").value==="monto"?Math.min(cents(dv),subC):Math.round(subC*Math.min(Math.max(dv,0),100)/100),envC=cents(num("env")),netoC=subC-desC+envC,modo=q("modo").value,pct=modo==="ninguno"?0:+CFG.iva_pct;
  let iva=0,tot=netoC;if(modo==="agregado"){iva=Math.round(netoC*pct/100);tot=netoC+iva}else if(modo==="incluido")iva=netoC-Math.round(netoC/(1+pct/100));
  const ef=q("ef").value.trim();m.q("#fEfW").classList.toggle("hidden",q("met").value!=="Efectivo");
  m.q("#fCalc").innerHTML=`<div><span>Subtotal</span><b>${$$(subC/100)}</b></div>${desC?`<div><span>Descuento</span><b>-${$$(desC/100)}</b></div>`:""}${envC?`<div><span>Envío</span><b>${$$(envC/100)}</b></div>`:""}${modo!=="ninguno"?`<div><span>IVA ${pct}%${modo==="incluido"?" (incluido)":""}</span><b>${$$(iva/100)}</b></div>`:""}<div class="t"><span>Total</span><b>${$$(tot/100)}</b></div>${ef&&q("met").value==="Efectivo"?`<div><span>Cambio</span><b>${$$(Math.max(0,cents(ef)-tot)/100)}</b></div>`:""}`;
  return tot}
 m.q("#fLines").addEventListener("input",e=>{const r=e.target.closest("[data-i]"),f=e.target.dataset.f;if(!r||!f)return;const it=F.items[+r.dataset.i];it[f]=f==="nombre"?e.target.value:Number(e.target.value)||0;r.querySelector("[data-t]").textContent=$$(it.cantidad*it.precio);calc()});
 m.q("#fLines").addEventListener("click",e=>{const b=e.target.closest("[data-rm]");if(b){F.items.splice(+b.dataset.rm,1);lines()}});
 m.el.addEventListener("input",e=>{if(!e.target.closest("#fLines"))calc()});m.el.addEventListener("change",()=>calc());
 m.q("#fAddM").onclick=()=>{F.items.push({nombre:"",codigo:"",cantidad:1,precio:0});lines();const l=m.el.querySelectorAll("#fLines .el input[data-f=nombre]");l[l.length-1].focus()};
 m.q("#fAddP").onclick=()=>pickProducto(p=>{const ex=F.items.find(i=>i.codigo&&i.codigo===p.codigo&&i.precio===p.fin);if(ex)ex.cantidad++;else F.items.push({nombre:p.nombre,codigo:p.codigo||"",cantidad:1,precio:p.fin});lines()});
 m.q("#fAddV").onclick=()=>pickVentas(L=>{const x=fromVentas(L);F.items.push(...x.items);F.ventas=[...new Set([...F.ventas,...x.ventas])];
  if(x.cliente&&!q("cn").value.trim())q("cn").value=x.cliente;if(x.envio&&!num("env"))q("env").value=x.envio;q("met").value=x.metodo==="Transferencia"?"Transferencia":q("met").value;lines()});
 m.q("#fPromo").onclick=async()=>{const c=q("promo").value.trim().toUpperCase();if(!c)return;
  const {data}=await db.from("promo_codigos").select("pct").eq("codigo",c).eq("activo",true).maybeSingle();
  if(!data){toast("Código no válido o inactivo");return}q("dt").value="pct";q("dv").value=data.pct;toast("Descuento del "+(+data.pct)+"% aplicado");calc()};
 m.q("#fcOk").onclick=async()=>{
  const err=m.q("#fErr");err.textContent="";
  const its=F.items.map(i=>({nombre:String(i.nombre||"").trim(),codigo:i.codigo||"",cantidad:Math.floor(i.cantidad),precio:r2(i.precio)}));
  if(!its.length){err.textContent="Agrega al menos un producto.";return}
  if(its.some(i=>!i.nombre||!(i.cantidad>=1)||!(i.precio>=0))){err.textContent="Revisa las líneas: todas necesitan descripción, cantidad (1 o más) y precio válido.";return}
  const dv=num("dv");if(dv<0||(q("dt").value==="pct"&&dv>100)){err.textContent="Revisa el descuento.";return}
  const tot=calc()/100,ef=q("ef").value.trim();if(q("met").value==="Efectivo"&&ef!==""&&cents(ef)<cents(tot)){err.textContent="El efectivo recibido es menor al total.";return}
  const o={cliente_nombre:q("cn").value,cliente_doc:q("cd").value,cliente_direccion:q("ca").value,cliente_telefono:q("ct").value,metodo:q("met").value,iva_modo:q("modo").value,
   descuento_tipo:q("dt").value,descuento_valor:dv,envio:num("env"),efectivo:q("met").value==="Efectivo"&&ef!==""?Number(ef):null,nota:q("nota").value,venta_ids:F.ventas};
  const id=await espera(()=>rpc("crear_factura",{p_items:its,p_opts:o}),"Emitiendo factura…");if(!id)return;
  LS("dms_iva",o.iva_modo);m.close();toast("Factura emitida");snd("ok");
  if(S.tab==="fac")pintarFacturas();
  const f=await espera(()=>cargarFactura(id));if(f)abrirFactura(f)};
 lines()}
$("fcNew").onclick=()=>nuevaFactura();
["fcQ"].forEach(i=>$(i).addEventListener("input",(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(pintarFacturas,250)}})()));
$("fcQuick").onchange=()=>{if($("fcQuick").value==="all"){$("fcFrom").value="";$("fcTo").value=""}pintarFacturas()};
["fcFrom","fcTo"].forEach(i=>$(i).addEventListener("change",()=>{if(![...$("fcQuick").options].some(o=>o.value==="custom"))$("fcQuick").add(new Option("Personalizado","custom"));$("fcQuick").value="custom";pintarFacturas()}));
$("fcEst").onchange=()=>pintarFacturas();
/* Facturar desde el historial de ventas */
["hList","vList"].forEach(id=>$(id).addEventListener("click",e=>{const b=e.target.closest("[data-fa]");if(!b)return;
 const v=S.ventas.find(x=>x.id===b.dataset.fa);if(v)nuevaFactura(fromVentas([v]))}));

/* Datos del negocio (solo administrador) */
if(!ADM)$("fcCfg").classList.add("hidden");
$("fcCfg").onclick=async()=>{await ensureCfg();const c=CFG;const F=(n,l,v,x)=>`<div${x?` class="${x}"`:""}><label>${l}</label><input name="${n}" value="${esc(v||"")}" maxlength="160"></div>`;
 const m=modal("Datos del negocio",`<p class="pw" style="margin-top:0">Aparecen en el encabezado de las facturas y del cierre de caja.</p><div class="fg">${F("nombre","Nombre comercial",c.nombre)}${F("eslogan","Eslogan",c.eslogan)}${F("razon_social","Razón social",c.razon_social)}${F("giro","Giro",c.giro)}${F("nit","NIT",c.nit)}${F("nrc","NRC",c.nrc)}${F("direccion","Dirección",c.direccion,"full")}${F("telefono","Teléfono",c.telefono)}${F("correo","Correo",c.correo)}
  <div><label>IVA (%)</label><input name="iva" type="number" min="0" max="100" step="0.01" value="${+c.iva_pct}"></div>${F("pie","Mensaje al pie",c.pie)}</div><div class="err2" id="cgE"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="cgOk">Guardar</button>`});
 const g=n=>m.q(`[name=${n}]`).value.trim();
 m.q("#cgOk").onclick=async()=>{const iva=Number(g("iva"));if(!g("nombre")){m.q("#cgE").textContent="El nombre es obligatorio.";return}if(!(iva>=0&&iva<=100)){m.q("#cgE").textContent="IVA entre 0 y 100.";return}
  const r=await espera(async()=>{const {error}=await db.from("config_negocio").update({nombre:g("nombre"),eslogan:g("eslogan")||null,razon_social:g("razon_social")||null,giro:g("giro")||null,nit:g("nit")||null,nrc:g("nrc")||null,direccion:g("direccion")||null,telefono:g("telefono")||null,correo:g("correo")||null,iva_pct:iva,pie:g("pie")||null,updated_at:new Date().toISOString()}).eq("id",1);if(error)throw new Error(error.message);return true});
  if(r){CFG=null;m.close();toast("Datos guardados")}}};

/* ---------- CIERRE DE CAJA (guarda un registro; no borra ventas) ---------- */
const rangoTxt=(a,b)=>b&&b!==a?fdate(a)+" – "+fdate(b):fdate(a);
function periodo(k,base){const [y,mo,da]=base.split("-").map(Number),dt=new Date(y,mo-1,da),p=n=>ymd(n);
 if(k==="sem"){const s=new Date(dt);s.setDate(dt.getDate()-((dt.getDay()+6)%7));const e=new Date(s);e.setDate(s.getDate()+6);return [p(s),p(e)]}
 if(k==="mes")return [p(new Date(y,mo-1,1)),p(new Date(y,mo,0))];
 if(k==="ano")return [p(new Date(y,0,1)),p(new Date(y,11,31))];
 return [base,base]}
async function cerrarCaja(){
 const base=$("hDate").value||hoyD();
 const m0=modal("Cerrar caja",`<p class="pw" style="margin-top:0">¿Qué periodo quieres cerrar?</p>
  <div class="cpk" id="cpK"><button type="button" data-k="dia" class="on">Un día</button><button type="button" data-k="sem">Semana</button><button type="button" data-k="mes">Mes</button><button type="button" data-k="ano">Año</button><button type="button" data-k="rng">Otro rango</button></div>
  <div class="fg cpf"><div><label>Desde</label><input type="date" id="cpD" value="${base}"></div><div><label>Hasta</label><input type="date" id="cpH" value="${base}"></div></div>
  <p class="hint" id="cpT"></p><div class="err2" id="cpE"></div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="cpGo">Continuar</button>`});
 let k="dia";const D=m0.q("#cpD"),H=m0.q("#cpH"),T=m0.q("#cpT");
 const upd=()=>{T.textContent="Periodo: "+rangoTxt(D.value,H.value)};
 m0.q("#cpK").addEventListener("click",e=>{const b=e.target.closest("[data-k]");if(!b)return;k=b.dataset.k;
  m0.q("#cpK").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));
  if(k!=="rng"){const r=periodo(k,D.value||base);D.value=r[0];H.value=r[1]}upd()});
 [D,H].forEach(i=>i.addEventListener("change",()=>{if(k==="dia"&&i===D)H.value=D.value;else if(k!=="rng"&&i===D){const r=periodo(k,D.value);D.value=r[0];H.value=r[1]}upd()}));upd();
 m0.q("#cpGo").onclick=()=>{const d=D.value,h=H.value;
  if(!d||!h||h<d){m0.q("#cpE").textContent="Revisa las fechas: la final no puede ser anterior a la inicial.";return}
  if((new Date(h)-new Date(d))/864e5>366){m0.q("#cpE").textContent="El periodo no puede superar un año.";return}
  m0.close();cerrarPeriodo(d,h)}}
async function cerrarPeriodo(d,h){
 const L=await espera(()=>ventasRango(d,h));if(!L)return;const un=d===h,per=un?"del día":"del periodo";
 const g={ef:[0,0],tr:[0,0],ent:[0,0],cod:[0,0],cob:[0,0]};
 L.forEach(v=>{const k=v.tipo==="entrega_pendiente"?"ent":v.tipo==="cod"?"cod":v.tipo==="cobro_pendiente"?"cob":v.metodo_pago==="Transferencia"?"tr":"ef";g[k][0]+=+v.total;g[k][1]++});
 let dv={n:0,t:0,ef:0};try{const r=await db.from("devoluciones").select("diferencia,metodo,monto_devuelto,monto_nuevo").gte("fecha",d).lte("fecha",h);(r.data||[]).forEach(x=>{dv.n++;dv.t+=+x.monto_nuevo-+x.monto_devuelto;if(x.metodo==="Efectivo")dv.ef+=+x.diferencia})}catch(e){}
 g.ef[0]+=dv.ef;const tot=Object.values(g).reduce((s,x)=>s+x[0],0)-dv.ef+dv.t;
 const m=modal("Cerrar caja · "+rangoTxt(d,h),`<div class="stats"><div><span>Total vendido</span><b>${$$(tot)}</b></div><div><span>Ventas</span><b>${L.length}</b></div><div><span>Efectivo esperado</span><b>${$$(g.ef[0])}</b></div><div><span>Transferencias</span><b>${$$(g.tr[0])}</b></div></div>
  ${dv.n?`<p class="hint">Incluye ${dv.n} devolución(es) o cambio(s) ${per}: ${dv.t<0?"−":""}${$$(Math.abs(dv.t))} en ventas netas${dv.ef?` y ${dv.ef<0?"salieron":"entraron"} ${$$(Math.abs(dv.ef))} en efectivo`:""}.</p>`:""}<p class="pw">Cuenta el efectivo que hay en caja y escríbelo para ver la diferencia. Cerrar la caja <b>guarda un registro</b> ${un?"del día":"de todo el periodo"}; no borra ventas ni cambia el inventario.</p>
  <div class="fg"><div><label>Efectivo contado <small>(opcional)</small></label><input name="cc" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${g.ef[0].toFixed(2)}"></div><div><label>Nota <small>(opcional)</small></label><input name="cn" maxlength="200"></div></div><div class="err2" id="ccE"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="ccOk">Guardar cierre</button>`});
 m.q("#ccOk").onclick=async()=>{const v=m.q("[name=cc]").value.trim();if(v!==""&&!(Number(v)>=0)){m.q("#ccE").textContent="Efectivo no válido.";return}
  const id=await espera(()=>rpc("cerrar_caja",{p_fecha:d,p_hasta:un?null:h,p_contado:v===""?null:Number(v),p_nota:m.q("[name=cn]").value}),"Guardando cierre…");if(!id)return;
  m.close();toast("Cierre de caja guardado");snd("ok");await verCierre(id);if(ADM)liberarFotos()}}
/* Tras el cierre: quita las fotos grandes de productos agotados y deja una sola miniatura para reconocerlos */
async function liberarFotos(){
 try{const ids=S.prods.filter(p=>p.stock<=0).map(p=>p.id);if(!ids.length)return;
  let R=[];for(let i=0;i<ids.length;i+=100){const {data,error}=await db.from("producto_imagenes").select("id,producto_id,url,thumb_url,path,thumb_path,orden").in("producto_id",ids.slice(i,i+100)).order("orden");if(error)return;R=R.concat(data||[])}
  const by={};R.forEach(r=>(by[r.producto_id]=by[r.producto_id]||[]).push(r));
  const keep=[],drop=[];Object.values(by).forEach(a=>{const k=a[0];if(k.thumb_path&&k.thumb_path!==k.path)keep.push(k);a.slice(1).forEach(x=>drop.push(x))});
  const files=[...new Set([...keep.map(k=>k.path),...drop.flatMap(x=>[x.path,x.thumb_path])].filter(Boolean))];
  if(!files.length)return;
  if(!await confirmar(`Hay <b>${Object.keys(by).length}</b> productos agotados con fotos. Se borrarán <b>${files.length}</b> archivos y a cada producto le quedará <b>una miniatura</b> para reconocerlo. Las ventas y cierres no se tocan.<p class="pw">Si vuelves a surtirlos, puedes subir una foto nueva en Compra.</p>`,{titulo:"Liberar espacio de fotos",ok:"Liberar espacio"}))return;
  const ok=await espera(async()=>{
   for(let i=0;i<files.length;i+=50){const {error}=await db.storage.from("productos").remove(files.slice(i,i+50));if(error)throw new Error(error.message)}
   for(const k of keep){const {error}=await db.from("producto_imagenes").update({path:null,url:k.thumb_url||k.url}).eq("id",k.id);if(error)throw new Error(error.message)}
   for(let i=0;i<drop.length;i+=100){const {error}=await db.from("producto_imagenes").delete().in("id",drop.slice(i,i+100).map(x=>x.id));if(error)throw new Error(error.message)}
   return true},"Liberando espacio…");
  if(ok){toast("Espacio liberado: "+files.length+" fotos borradas");snd("ok")}
 }catch(e){}}
async function verCierre(id){
 const c=await espera(async()=>{const {data,error}=await db.from("cierres_caja").select("*,profiles(nombre)").eq("id",id).single();if(error)throw new Error(error.message);return data});
 if(c)vistaDoc("Cierre de caja "+rangoTxt(c.fecha,c.fecha_hasta),fm=>cierreHTML(c,fm),"cierre-caja-"+c.fecha+(c.fecha_hasta?"_a_"+c.fecha_hasta:""))}
async function historialCierres(){
 const L=await espera(async()=>{const {data,error}=await db.from("cierres_caja").select("id,fecha,fecha_hasta,total_ventas,n_ventas,diferencia,created_at").order("created_at",{ascending:false}).limit(60);if(error)throw new Error(error.message);return data});if(!L)return;
 const m=modal("Cierres de caja anteriores",L.length?L.map(c=>`<div class="sv" data-cc="${c.id}" style="cursor:pointer"><div class="ti"><b>${rangoTxt(c.fecha,c.fecha_hasta)}</b><small>Cerrado ${fdate(c.created_at)} ${ftime(c.created_at)} · ${c.n_ventas} ventas</small></div><div class="am2"><b>${$$(c.total_ventas)}</b>${c.diferencia!=null?`<small style="color:${+c.diferencia===0?"var(--ok)":"var(--bad)"}">dif. ${$$(c.diferencia)}</small>`:""}</div></div>`).join(""):`<div class="empty">Todavía no hay cierres guardados.</div>`,{});
 m.el.addEventListener("click",e=>{const r=e.target.closest("[data-cc]");if(r){m.close();verCierre(r.dataset.cc)}})}
$("hClose").onclick=cerrarCaja;$("hHist").onclick=historialCierres;


/* ---------- eventos ---------- */
const deb=(f,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};
const fdeb=deb(()=>filtrar(),150);
["fSearch","fMin","fMax","fBar"].forEach(i=>$(i).addEventListener("input",fdeb));
["fCat","fDate","fLow"].forEach(i=>$(i).addEventListener("change",()=>filtrar()));
$("fSearch").addEventListener("change",()=>addHist($("fSearch").value));
$("fSearch").addEventListener("keydown",e=>{if(e.key==="Enter")addHist($("fSearch").value)});
$("fTog").onclick=()=>$("fl").classList.toggle("open");
$("fClear").onclick=()=>{["fSearch","fMin","fMax","fBar","fDate","fGo"].forEach(i=>$(i).value="");$("fCat").value="";$("fLow").checked=false;filtrar()};
$("hist").addEventListener("click",e=>{const h=e.target.closest("[data-h]");if(h){$("fSearch").value=h.dataset.h;filtrar()}if(e.target.closest("[data-clr]")){S.hist=[];LS("dms_hist2","[]");drawHist()}});
$("vt").addEventListener("click",e=>{const b=e.target.closest("[data-v]");if(!b)return;S.view=b.dataset.v;LS("dms_vw",S.view);pintarInv()});
$("fGo").addEventListener("keydown",e=>{if(e.key!=="Enter")return;const n=parseInt($("fGo").value,10);if(!n||n<1||n>S.filt.length){toast("Fila fuera de rango");return}
 S.page=Math.ceil(n/S.size);pintarInv();setTimeout(()=>{const el=document.getElementById("row-"+n)||document.getElementById("card-"+n);if(el){el.classList.add("hl");el.scrollIntoView({behavior:"smooth",block:"center"})}},80)});
[$("pager"),$("pagerTop")].forEach(el=>el.addEventListener("click",e=>{const b=e.target.closest("[data-pg]");if(!b)return;S.page+=+b.dataset.pg;pintarInv();$("invList").scrollIntoView({behavior:"smooth"})}));

$("invList").addEventListener("click",e=>{
 const img=e.target.closest("[data-img]");if(img){verImagen(img.dataset.img);return}
 const bar=e.target.closest("[data-bar]");if(bar){verBarras(bar.dataset.bar);return}
 const sel=e.target.closest('[data-a="sel"]');if(sel){togSel(sel.dataset.id,sel.checked);pintarInv();return}
 if(e.target.closest(".mchk"))return;
 const a=e.target.closest("[data-a]"),row=e.target.closest("[data-id]");
 if(S.multi&&!a&&row&&!e.target.closest("button,a,input")){const pp=S.byId.get(row.dataset.id);if(pp&&pp.stock>=1){togSel(pp.id,pp.vars?true:!S.sel.has(pp.id));pintarInv()}return}const id=a?a.dataset.id:row&&row.dataset.id;const p=id&&S.byId.get(id);if(!p)return;
 if(a){if(a.dataset.a==="sell")abrirVenta(p);else if(a.dataset.a==="price")editarPrecio(p);else if(a.dataset.a==="stock")editarStock(p);return}
 if(S.multi)return;detalle(p)});

$("bnav").addEventListener("click",e=>{const b=e.target.closest("[data-p]");if(b)tab(b.dataset.p)});
$("segPend").addEventListener("click",e=>{const b=e.target.closest("[data-s]");if(b){S.pt=b.dataset.s;pintarPend()}});
$("pendList").addEventListener("click",e=>{
 const img=e.target.closest("[data-img]");if(img){verImagen(img.dataset.img);return}
 const bar=e.target.closest("[data-bar]");if(bar){verBarras(bar.dataset.bar);return}
 const a=e.target.closest("[data-a]");if(a)accionPend(a.dataset.a,a.dataset.v)});
/* ---------- importar pendientes de cobro del sistema anterior (solo administrador principal) ---------- */
function leerAntiguos(txt){
 let d=txt;for(let k=0;k<3&&typeof d==="string";k++){d=JSON.parse(d.trim())}
 if(d&&!Array.isArray(d))d=d.pendingPaymentInventory||d.pendientes||[];
 if(!Array.isArray(d))throw new Error("No encontré la lista de pendientes de cobro en ese texto");
 const G=new Map();let n=0;
 d.forEach(r=>{if(!r||r.paymentStatus==="paid")return;const pend=+r.pendingAmount;if(r.paymentStatus!=="partial"&&!(pend>0))return;
  const cli=String(r.clientName||"").trim()||"Cliente sin nombre",f=r.date?new Date(r.date).toISOString():"",k=cli+"|"+f;
  if(!G.has(k))G.set(k,{cliente:cli,fecha:f,metodo:r.paymentMethod,abonado:0,items:[]});const g=G.get(k);
  g.abonado+=+r.paidAmount||0;n++;
  g.items.push({codigo:r.code,nombre:r.name,barcode:r.barcode,cantidad:+r.quantity||1,precio:+r.finalPrice||+r.price||0,precio_original:+r.originalPrice||+r.price||0,descuento:+r.discount||0})});
 return {ventas:[...G.values()],lineas:n}}
$("bImp").onclick=()=>{
 if(!DAY.principal)return;
 const m=modal("Importar pendientes de cobro",`<p style="margin:0 0 8px">Trae las ventas pendientes de cobro de tu sistema anterior. <b>No cambia el stock</b> (esos productos ya habían salido del inventario).</p>
  <ol style="margin:0 0 10px;padding-left:20px;font-size:14px;color:var(--mute)"><li>Abre el sistema anterior en el navegador donde lo usabas.</li><li>Abre la consola (tecla F12) y pega: <code style="user-select:all">copy(localStorage.getItem('pendingPaymentInventory'))</code></li><li>Pega aquí abajo lo que se copió, o sube el archivo.</li></ol>
  <textarea id="imT" rows="5" placeholder="Pega aquí los datos copiados…" style="width:100%"></textarea>
  <div style="margin:8px 0"><input id="imF" type="file" accept=".json,.txt,application/json,text/plain"></div>
  <div id="imR" class="hint" style="margin:0"></div><div class="err2" id="imE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="imOk" disabled>Importar</button>`});
 let datos=null;
 const prev=()=>{datos=null;m.q("#imOk").disabled=true;m.q("#imE").textContent="";const t=m.q("#imT").value.trim();if(!t){m.q("#imR").textContent="";return}
  try{const r=leerAntiguos(t);if(!r.ventas.length){m.q("#imR").textContent="";m.q("#imE").textContent="No hay ventas pendientes de cobro en esos datos";return}
   datos=r.ventas;const tot=r.ventas.reduce((s,v)=>s+v.items.reduce((a,i)=>a+i.precio*i.cantidad,0),0),ab=r.ventas.reduce((s,v)=>s+v.abonado,0);
   m.q("#imR").innerHTML=`Encontré <b>${r.ventas.length}</b> ventas de <b>${new Set(r.ventas.map(v=>v.cliente)).size}</b> clientes (${r.lineas} productos). Total ${$$(tot)} · Abonado ${$$(ab)} · <b>Por cobrar ${$$(tot-ab)}</b>`;m.q("#imOk").disabled=false}
  catch(e){m.q("#imE").textContent="No pude leer esos datos: "+e.message}};
 m.q("#imT").addEventListener("input",prev);
 m.q("#imF").onchange=async e=>{const f=e.target.files[0];if(f){m.q("#imT").value=await f.text();prev()}};
 m.q("#imOk").onclick=async()=>{if(!datos)return;
  const r=await espera(()=>rpc("importar_pendientes_cobro",{p_ventas:datos}),"Importando pendientes…");
  if(r){m.close();toast(`${r.importadas} ventas importadas`+(r.omitidas?` · ${r.omitidas} ya estaban`:""));await cargarPend();pintarPend()}}};
$("bClean").onclick=async()=>{if(!soloAdmin())return;const t=S.pt;
 if(!await pedirClave("Vas a limpiar de esta lista los pedidos ya completados."))return;
 if(!await confirmar("Se quitarán de la lista los pedidos completados de <b>"+TIPO[t][0]+"</b>. No se modifican el stock ni las ventas registradas.",{titulo:"Limpiar completados",ok:"Limpiar",peligro:true}))return;
 const n=await espera(()=>rpc("ocultar_pendientes",{p_tipo:t}));if(n!==undefined){toast(n+" registros limpiados");await cargarPend();pintarPend()}};
["hList","vList"].forEach(id=>$(id).addEventListener("click",async e=>{const tk=e.target.closest("[data-tk]");if(tk){const {data}=await db.from("ventas").select(TK_SEL).eq("id",tk.dataset.tk).single();if(data)abrirTicket(data);return}const a=e.target.closest("[data-an]"),x=e.target.closest("[data-el]"),R=()=>id==="hList"?pintarHoy():pintarVentas();if(a)anular(a.dataset.an,R);if(x)eliminarVenta(x.dataset.el,R)}));
$("hDate").onchange=pintarHoy;$("hToday").onclick=()=>{$("hDate").value=ymd(new Date());pintarHoy()};
["vFrom","vTo"].forEach(i=>$(i).addEventListener("change",()=>{$("vQuick").value=$("vFrom").value||$("vTo").value?"custom":"all";if($("vQuick").value==="custom"&&![...$("vQuick").options].some(o=>o.value==="custom"))$("vQuick").add(new Option("Personalizado","custom"));$("vQuick").value="custom";pintarVentas()}));
$("vQuick").onchange=()=>{if($("vQuick").value==="all"){$("vFrom").value="";$("vTo").value=""}pintarVentas()};
["vType","vPay"].forEach(i=>$(i).onchange=()=>pintarVentas());
$("vSearch").addEventListener("input",(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(pintarVentas,250)}})());
$("vMore").onclick=()=>{S.vShown+=100;listaVentas()};

$("bScan").onclick=()=>QR?pararCamara():camara();
$("bUsb").onclick=()=>usb();
$("bMulti").onclick=()=>modoMulti();
$("bFast").onclick=ventaRapida;
$("mClear").onclick=()=>{S.sel.clear();pintarInv()};
$("mGo").onclick=abrirMulti;
const hid=LS("dms_hide")==="1";const setEye=h=>{$("totalAmount").classList.toggle("hid",h);$("bEye").textContent=h?"Mostrar":"Ocultar";LS("dms_hide",h?"1":"0")};setEye(hid);
$("bEye").onclick=()=>setEye(!$("totalAmount").classList.contains("hid"));

/* ---------- modo kiosco: pantalla simple y grande para vender; salir pide la contraseña ---------- */
const mm=$("mMore");$("bMore").onclick=e=>{e.stopPropagation();const on=mm.classList.toggle("on");$("bMore").setAttribute("aria-expanded",on)};
document.addEventListener("click",()=>{mm.classList.remove("on");$("bMore").setAttribute("aria-expanded","false")});
async function refrescar(){await espera(async()=>{await Promise.all([cargarProductos(),cargarPend()]);filtrar(true);if(S.tab==="pend")pintarPend();if(S.tab==="hoy")await pintarHoy();if(S.tab==="ven")await pintarVentas()},"Actualizando…");toast("Datos actualizados")}
mm.addEventListener("click",e=>{const b=e.target.closest("[data-m]");if(!b)return;const k=b.dataset.m;
 if(k==="kiosk")DAY.kiosco(true);else if(k==="refresh")refrescar();else if(k==="excel")excel();
 else if(k==="keys")modal("Atajos de teclado",`<div class="sk"><span>Enfocar código de barras</span><kbd>Ctrl</kbd></div><div class="sk"><span>Cerrar ventana / cámara</span><kbd>Esc</kbd></div><div class="sk"><span>Lector USB</span><span>Activa "Lector USB" y escanea</span></div>`.replace("<kbd>Ctrl</kbd>","<kbd>Ctrl + B</kbd>"),{foot:""})
 else if(k==="out"){DAY.salir()}});

/* Si vuelves a la página tras un rato (por ejemplo desde Compra), se actualizan los datos */
document.addEventListener("visibilitychange",async()=>{
 if(document.visibilityState!=="visible"||Date.now()-S.stamp<30000||document.querySelector("dialog[open]"))return;
 try{await Promise.all([cargarProductos(),cargarPend()]);filtrar(true);if(S.tab==="pend")pintarPend()}catch(e){}});

/* ---------- arranque ---------- */
drawHist();
await db.rpc("aplicar_programados");
await espera(async()=>{await Promise.all([cargarProductos(),cargarPend()])},"Cargando inventario…");
try{const c=JSON.parse(sessionStorage.getItem("dms_cart")||"[]"),ok=c.filter(([id,q])=>S.byId.has(id)&&q>0&&q<=S.byId.get(id).stock);if(ok.length){S.sel=new Map(ok);S.multi=true;$("bMulti").classList.add("on");$("bMulti").setAttribute("aria-pressed","true");toast("Recuperé tu venta múltiple en curso")}}catch(e){}
{const h0=(location.hash||"").slice(1);tab(["pend","hoy","ven","fac"].includes(h0)?h0:"inv")}filtrar();
addEventListener("hashchange",()=>{const h=(location.hash||"").slice(1);if(["inv","pend","hoy","ven","fac"].includes(h))tab(h)});
})();
