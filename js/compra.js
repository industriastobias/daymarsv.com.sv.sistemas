/* DAYMAR-SHOP · Compra: registro de productos, lotes, papelera, importar/exportar (conectado a Supabase) */
(async()=>{
const {db,esc,$$,ymd,toast,logout,requireSession,toggleTheme,mountSide}=DAY;
const $=i=>document.getElementById(i);
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
$("app").classList.remove("hidden");mountSide($("side"),"compra",me.rol);

const LIMITE=0,DIAS=30,BUCKET="productos",hoy=ymd(new Date());
const CATS_BASE=["Accesorios para el cabello","Anillos","Aritos","Billeteras","Carteras","Case audifonos","Case telefonos","Chokers","Collares","General","Lentes de sol","Otros","Pulseras","Relojes"];
let inv=[],trash=[],cats=[],edit=null,esLote=false,loteTemp=[],imgsTemp=[],regenMode="mixed",zero=[],prevUrls=[],loteUrls=[];

/* ---------- utilidades ---------- */
const ERR=[[/productos_codigo_barras_uq/,"Ese código de barras ya lo tiene otro producto."],[/productos_codigo_key/,"Ese código SKU ya existe."]];
const ok=async p=>{const r=await p;if(r.error){const m=ERR.find(e=>e[0].test(r.error.message));toast(m?m[1]:r.error.message);throw r.error}return r.data};
const busy=(on,t)=>{$("ov").classList.toggle("on",on);if(t)$("ovText").textContent=t};
const beep=()=>{try{const c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.value=.05;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.12)}catch(e){}};
const num=v=>Number(v)||0;
const catName=id=>(cats.find(c=>c.id===id)||{}).nombre||"";
const pub=path=>db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
async function pool(items,n,fn){let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;await fn(items[k],k)}}))}
async function fetchAll(mk){const out=[];for(let f=0;;f+=1000){const r=await mk().range(f,f+999);if(r.error){toast(r.error.message);throw r.error}out.push(...r.data);if(r.data.length<1000)break}return out}
function openDlg(id){const d=$(id);if(!d.open)d.showModal()}
document.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>$(b.dataset.x).close());
["dgTrash","dgStock0","dgDet","dgKeys"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id))$(id).close()}));

/* ---------- carga de datos ---------- */
async function load(){
 const [c,p]=await Promise.all([ok(db.from("categorias").select("*").order("nombre")),fetchAll(()=>db.from("productos").select("*").order("created_at",{ascending:false}))]);
 cats=c;inv=p.filter(x=>x.activo);trash=p.filter(x=>!x.activo&&x.eliminado_en)}
function renderCats(){
 const sel=(id,first)=>{const el=$(id),cur=el.value;el.innerHTML=`<option value="">${first}</option>`+cats.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join("");if(cur&&cats.some(c=>c.id===cur))el.value=cur};
 sel("category","Sin categoría (General)");sel("categoryFilter","Todas las categorías")}
function calcTotal(){
 $("totalAmount").textContent=$$(inv.reduce((s,p)=>s+num(p.precio_venta)*(1-num(p.descuento_pct)/100)*num(p.stock),0));
 $("countBadge").textContent=`${inv.length} producto${inv.length===1?"":"s"}`;$("cnt2").textContent=inv.length}
async function refresh(){await load();renderCats();renderInv();calcTotal()}

/* ---------- búsqueda difusa e historial ---------- */
function lev(a,b){const t=Array.from({length:b.length+1},()=>Array(a.length+1).fill(0));for(let i=0;i<=a.length;i++)t[0][i]=i;for(let j=0;j<=b.length;j++)t[j][0]=j;
 for(let j=1;j<=b.length;j++)for(let i=1;i<=a.length;i++)t[j][i]=Math.min(t[j][i-1]+1,t[j-1][i]+1,t[j-1][i-1]+(a[i-1]===b[j-1]?0:1));return t[b.length][a.length]}
function fuzzy(text,q){text=String(text||"").toLowerCase();q=q.toLowerCase();if(text.includes(q))return true;
 if(q.length<=3)return text.split(/\s+/).some(w=>Math.abs(w.length-q.length)<=2&&lev(w,q)<=1);
 return q.split(/\s+/).every(qw=>text.split(/\s+/).some(w=>lev(w.slice(0,qw.length),qw)<=1||w.includes(qw)))}
const histGet=()=>{try{return JSON.parse(localStorage.getItem("dms_hist")||"[]")}catch(e){return[]}};
function histAdd(q){if(!q||q.length<2)return;let h=histGet().filter(x=>x!==q);h.unshift(q);try{localStorage.setItem("dms_hist",JSON.stringify(h.slice(0,5)))}catch(e){}renderHist()}
function renderHist(){const h=histGet(),el=$("hist");el.classList.toggle("on",!!h.length);el.querySelectorAll(".tg").forEach(x=>x.remove());
 h.forEach(t=>{const b=document.createElement("button");b.type="button";b.className="tg";b.textContent=t;b.onclick=()=>{$("searchBox").value=t;renderInv()};el.insertBefore(b,$("histClr"))})}
$("histClr").onclick=()=>{try{localStorage.removeItem("dms_hist")}catch(e){}renderHist();toast("Historial limpiado")};

/* ---------- inventario ---------- */
const stT=p=>p.stock<=0?["out","Agotado"]:p.stock<=LIMITE?["low","Stock bajo"]:["ok","Disponible"];
const pic=(p,c)=>p.foto_url?`<img class="${c}" src="${esc(p.foto_url)}" alt="${esc(p.nombre)}" loading="lazy">`:`<div class="${c}">${esc((p.nombre||"?").charAt(0).toUpperCase())}</div>`;
function filtrar(){const q=$("searchBox").value.trim(),cat=$("categoryFilter").value,min=parseFloat($("precioMin").value)||0,max=parseFloat($("precioMax").value)||Infinity,solo=$("stockBajo").checked;
 return inv.filter(p=>{const pr=num(p.precio_venta);if(cat&&p.categoria_id!==cat)return false;if(pr<min||pr>max)return false;if(solo&&p.stock>LIMITE)return false;
  if(q)return fuzzy(p.nombre,q)||fuzzy(p.codigo,q)||String(p.codigo_barras||"").includes(q)||fuzzy(catName(p.categoria_id),q);return true})}
function renderInv(){const l=filtrar();
 $("inventoryList").innerHTML=l.length?l.map(p=>{const s=stT(p);return`<div class="pc" data-i="${p.id}">${pic(p,"ph")}<div class="pb"><b class="n">${esc(p.nombre)}</b><small>${esc(p.codigo)}${catName(p.categoria_id)?" · "+esc(catName(p.categoria_id)):""}</small><span class="pr">${$$(p.precio_venta)}</span><span class="tag ${s[0]}">${s[1]}: ${p.stock}</span><small>Código de barras: ${esc(p.codigo_barras||"—")}</small><div class="ac"><button class="btn sm" data-a="e" data-i="${p.id}">Editar</button><button class="btn g sm" data-a="d" data-i="${p.id}" aria-label="Enviar a la papelera">Papelera</button></div></div></div>`}).join("")
  :`<div class="empty">${inv.length?"No se encontraron productos con esos filtros.":"Aún no hay productos. Registra el primero con el formulario."}</div>`}
["searchBox","precioMin","precioMax"].forEach(i=>$(i).addEventListener("input",renderInv));$("categoryFilter").onchange=renderInv;$("stockBajo").onchange=renderInv;
$("searchBox").addEventListener("blur",()=>histAdd($("searchBox").value.trim()));
$("inventoryList").onclick=e=>{const b=e.target.closest("button"),c=e.target.closest(".pc");if(!c)return;const id=c.dataset.i;
 if(b&&b.dataset.a==="e")startEdit(id);else if(b&&b.dataset.a==="d")toTrash(id);else if(!b)openDetail(id)};

/* ---------- código de barras ---------- */
function genCode(mode="mixed"){const len=mode==="mixed"?4+Math.floor(Math.random()*5):parseInt(mode),min=10**(len-1),max=10**len-1;return String(Math.floor(Math.random()*(max-min+1))+min)}
function genUnico(extra=[]){const u=new Set([...inv,...trash].map(p=>p.codigo_barras).filter(Boolean));extra.forEach(c=>u.add(c));let c,i=0;do{c=genCode();i++}while(u.has(c)&&i<300);return c}
function drawBarcode(el,v,o={}){try{JsBarcode(el,String(v),Object.assign({format:"CODE128",lineColor:"#000",width:2,height:50,displayValue:true,fontSize:12,margin:5},o))}catch(e){}}
function showBarcode(v){const c=$("barcodeCanvas");if(!v||!v.trim()){c.style.display="none";return}c.style.display="block";drawBarcode(c,v)}
$("bAuto").onclick=()=>{const c=genUnico();$("barcode").value=c;showBarcode(c);toast("Código generado: "+c)};
$("barcode").addEventListener("input",()=>showBarcode($("barcode").value.trim()));

/* ---------- formulario ---------- */
function calcSug(){$("sugerenciaVenta").value=(num($("valorReal").value)*(1+(parseFloat($("porcentajeGanancia").value)||60)/100)).toFixed(2)}
$("valorReal").addEventListener("input",calcSug);$("porcentajeGanancia").addEventListener("input",calcSug);
function lotStock(){const a=Math.max(0,Math.trunc(num($("lotQuantity").value))),b=Math.max(0,Math.trunc(num($("unitsPerLot").value)));if(!edit)$("quantity").value=a>0&&b>0?a*b:""}
$("lotQuantity").addEventListener("input",lotStock);$("unitsPerLot").addEventListener("input",lotStock);
/* ---------- colores / variantes ---------- */
let VARS=[],VARS_DB=[];
function varRender(){const on=VARS.length>0;$("varPanel").classList.toggle("hidden",!on);$("varTog").classList.toggle("hidden",on);
 $("varRows").innerHTML=VARS.map((v,i)=>`<div class="vr" data-i="${i}"><span class="vn">${DAY.colorDot(v.nombre)}<input data-f="nombre" placeholder="Color (ej. Rosado)" maxlength="40" value="${esc(v.nombre||"")}"></span><input data-f="cantidad" type="number" min="0" step="1" inputmode="numeric" placeholder="Cant." value="${v.cantidad===""||v.cantidad==null?"":v.cantidad}"><input class="vb" data-f="codigo_barras" placeholder="Código de barras (automático si lo dejas vacío)" value="${esc(v.codigo_barras||"")}"><button type="button" class="btn g" data-x="${i}" aria-label="Quitar color">×</button></div>`).join("");
 varSuma()}
function varSuma(){if(!VARS.length){$("quantity").readOnly=esLote&&!edit;$("quantity").required=true;return}
 $("quantity").value=VARS.reduce((s,v)=>s+Math.max(0,Math.trunc(num(v.cantidad))),0);$("quantity").readOnly=true;$("quantity").required=false}
function varSet(L){VARS=L.map(v=>({...v}));varRender()}
$("varTog").onclick=()=>{VARS=[{nombre:"",cantidad:""},{nombre:"",cantidad:""}];varRender();$("varRows").querySelector("input").focus()};
$("varAdd").onclick=()=>{VARS.push({nombre:"",cantidad:""});varRender();const r=$("varRows").querySelectorAll(".vr");r[r.length-1].querySelector("input").focus()};
$("varRows").addEventListener("input",e=>{const r=e.target.closest(".vr");if(!r)return;VARS[+r.dataset.i][e.target.dataset.f]=e.target.value;if(e.target.dataset.f==="nombre"){const w=e.target.parentNode,d=DAY.colorDot(e.target.value),o=w.querySelector(".cdot");if(o)o.remove();if(d)w.insertAdjacentHTML("afterbegin",d)}varSuma()});
$("varRows").addEventListener("click",e=>{const b=e.target.closest("[data-x]");if(!b)return;VARS.splice(+b.dataset.x,1);varRender()});
function setTab(t){esLote=t==="lote";document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
 $("lotQuantityGroup").classList.toggle("hidden",!esLote);$("unitsPerLotGroup").classList.toggle("hidden",!esLote);
 $("lotQuantity").required=esLote&&!edit;$("unitsPerLot").required=esLote&&!edit;$("quantity").readOnly=esLote&&!edit;
 $("quantityLabel").textContent=esLote&&!edit?"Stock total calculado *":edit?"Stock actual *":"Stock inicial *";
 $("quantityHelp").textContent=esLote&&!edit?"Lotes × unidades por lote.":edit?"Si lo cambias, queda registrado en el historial como ajuste.":"Unidades disponibles.";
 if(esLote)lotStock();else if(!edit){$("lotQuantity").value="";$("unitsPerLot").value=""}}
DAY.selectBonito($("categoryFilter"));DAY.selectBonito($("category"));
$("tabs").onclick=e=>{const b=e.target.closest("button");if(b)setTab(b.dataset.t)};

/* imágenes del formulario */
async function abrirImg(file){
 const bmp=await createImageBitmap(file).catch(()=>null);
 if(bmp)return {src:bmp,w:bmp.width,h:bmp.height};
 const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)});return {src:im,w:im.width,h:im.height}}
function recomprimir(o,max,q){
 const s=Math.min(1,max/Math.max(o.w,o.h)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(o.w*s));c.height=Math.max(1,Math.round(o.h*s));
 const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(o.src,0,0,c.width,c.height);
 return new Promise(r=>c.toBlob(r,"image/jpeg",q))}
async function comprimir(file,max,q){return recomprimir(await abrirImg(file),max,q)}
/* una sola foto por imagen (1000 px): sirve para las tarjetas y para verla en grande */
const par=async f=>{const o=await abrirImg(f);const m=await recomprimir(o,1000,.82);if(o.src.close)o.src.close();return {main:m,thumb:m}};
function renderPrevs(urls){prevUrls.forEach(u=>u.startsWith("blob:")&&URL.revokeObjectURL(u));prevUrls=urls;$("prevs").innerHTML=urls.map((u,i)=>`<img src="${u}" alt="Vista previa ${i+1}">`).join("")}
async function addImgs(files,acumular){const fs=[...files||[]].filter(f=>f&&f.type&&f.type.startsWith("image/"));if(!fs.length)return false;
 busy(true,"Preparando imágenes…");try{const n=[];for(const f of fs)n.push(await par(f));imgsTemp=acumular?imgsTemp.concat(n):n;renderPrevs(imgsTemp.map(i=>URL.createObjectURL(i.thumb)))}catch(e){toast("No se pudo procesar una imagen")}busy(false);return true}
$("upArea").onclick=e=>{if(e.target.id!=="imageFile")$("imageFile").click()};
$("upArea").onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("imageFile").click()}};
$("imageFile").onchange=e=>addImgs(e.target.files,false);
/* pegar imágenes: funciona en toda la página (no solo con el recuadro enfocado) y también con imágenes copiadas desde otra página */
async function imagenesPegadas(cd){
 const fs=[...(cd&&cd.files||[])].filter(f=>f.type.startsWith("image/"));
 if(fs.length)return fs;
 const it=[...(cd&&cd.items||[])].filter(i=>i.kind==="file"&&i.type.startsWith("image/")).map(i=>i.getAsFile()).filter(Boolean);
 if(it.length)return it;
 const h=cd&&cd.getData&&cd.getData("text/html"),m=h&&/<img[^>]+src=["']([^"']+)["']/i.exec(h);
 if(m){try{const r=await fetch(m[1]);const b=await r.blob();if(b.type.startsWith("image/"))return [new File([b],"pegada."+(b.type.split("/")[1]||"jpg"),{type:b.type})]}catch(e){toast("Esa página no deja copiar la imagen. Guárdala y súbela con «Toca para subir imágenes».")}}
 return []}
document.addEventListener("paste",async e=>{
 const t=e.target;if(t&&t!==$("upArea")&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable))return;
 if(document.querySelector("dialog[open]"))return;
 const fs=await imagenesPegadas(e.clipboardData);if(!fs.length)return;e.preventDefault();if(await addImgs(fs,true))toast(fs.length+" imagen(es) pegada(s)")});

/* subir imágenes de un producto a Storage */
async function subirImagenes(id,list,reemplazar){
 if(reemplazar){const old=await ok(db.from("producto_imagenes").select("id,path,thumb_path").eq("producto_id",id));
  const paths=old.flatMap(o=>[o.path,o.thumb_path]).filter(Boolean);if(paths.length)await db.storage.from(BUCKET).remove(paths);
  if(old.length)await ok(db.from("producto_imagenes").delete().eq("producto_id",id))}
 const rows=await Promise.all(list.map(async(im,i)=>{const base=`${id}/${crypto.randomUUID()}`,p1=base+".jpg",una=!im.thumb||im.thumb===im.main,p2=una?p1:base+"_t.jpg";
  await Promise.all([ok(db.storage.from(BUCKET).upload(p1,im.main,{contentType:"image/jpeg"})),...(una?[]:[ok(db.storage.from(BUCKET).upload(p2,im.thumb,{contentType:"image/jpeg"}))])]);
  return {producto_id:id,url:pub(p1),thumb_url:pub(p2),path:p1,thumb_path:p2,orden:i}}));
 if(rows.length){await ok(db.from("producto_imagenes").insert(rows));await ok(db.from("productos").update({foto_url:rows[0].thumb_url}).eq("id",id))}}

/* guardar producto */
const sinTilde=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function autoSku(catNombre,usados=[]){const pre=(sinTilde(catNombre).replace(/[^A-Za-z]/g,"").toUpperCase().slice(0,3)||"PRD").padEnd(3,"X"),re=new RegExp("^"+pre+"-(\\d+)$");
 let mx=0;[...inv,...trash].map(p=>p.codigo).concat(usados).forEach(c=>{const m=re.exec(c||"");if(m)mx=Math.max(mx,+m[1])});
 let c;do{mx++;c=pre+"-"+String(mx).padStart(3,"0")}while(!codeLibre(c)||usados.includes(c));return c}
async function validar(it){if(it.precio_costo&&it.precio_venta&&it.precio_costo>it.precio_venta&&!await DAY.ask("⚠️ El costo es mayor que el precio de venta. ¿Continuar?"))return false;
 if(it.fecha_compra>hoy){await DAY.say("La fecha de compra no puede ser futura.");return false}return true}
$("purchaseForm").addEventListener("submit",async e=>{e.preventDefault();
 const lq=esLote?Math.max(0,Math.trunc(num($("lotQuantity").value))):0,upl=esLote?Math.max(0,Math.trunc(num($("unitsPerLot").value))):0,uq=Math.max(0,Math.trunc(num($("quantity").value)));
 const vl=VARS.map(v=>({id:v.id,nombre:String(v.nombre||"").trim(),cantidad:Math.max(0,Math.trunc(num(v.cantidad))),codigo_barras:String(v.codigo_barras||"").trim()}));
 if(vl.some(v=>!v.nombre))return toast("Escribe el nombre de cada color o quita las filas vacías");
 if(new Set(vl.map(v=>v.nombre.toLowerCase())).size<vl.length)return toast("Hay dos colores con el mismo nombre");
 if(esLote&&vl.length)return toast("Los colores no se pueden combinar con compra por lote");
 const stock=vl.length?vl.reduce((s,v)=>s+v.cantidad,0):esLote&&!edit?lq*upl:uq;
 if(esLote&&!edit&&(lq<1||upl<1))return toast("Indica la cantidad de lotes y las unidades por lote");
 if(!edit&&stock<1)return toast("La cantidad de unidades debe ser mayor que cero");
 const catN=catName($("category").value)||"General";
 const it={codigo:$("code").value.trim()||(edit?"":autoSku(catN)),nombre:$("name").value.trim(),codigo_barras:$("barcode").value.trim()||genUnico(),categoria:catN,
  precio_venta:num($("price").value),precio_costo:num($("valorReal").value),fecha_compra:$("fechaCompra").value||hoy,descuento_pct:num($("discount").value),cantidad:stock,
  tipo_compra:esLote?"lote":"normal",lotes:lq,unidades_por_lote:upl,descripcion:$("description").value.trim()};
 if(vl.length){const us=[it.codigo_barras,...vl.map(v=>v.codigo_barras).filter(Boolean)];
  if(new Set(us).size<us.length){toast("Hay códigos de barras repetidos entre los colores");return}
  const aj=inv.concat(trash).find(p=>vl.some(v=>v.codigo_barras&&v.codigo_barras===p.codigo_barras&&p.id!==edit));if(aj){await DAY.say(`El código de barras de un color ya lo tiene “${aj.nombre}”.`);return}
  for(const v of vl)if(!v.codigo_barras){v.codigo_barras=genUnico(us);us.push(v.codigo_barras)}}
 if(vl.length&&!edit)it.variantes=vl.map(v=>({nombre:v.nombre,cantidad:v.cantidad,codigo_barras:v.codigo_barras}));
 if(!await validar(it))return;
 const otro=inv.concat(trash).find(p=>p.codigo_barras&&p.codigo_barras===it.codigo_barras&&p.id!==edit);if(otro){await DAY.say(`Ese código de barras ya lo tiene “${otro.nombre}”.`);return}
 $("bSave").disabled=true;busy(true,"Guardando en el sistema…");
 try{
  let id;
  if(edit){const prev=inv.find(p=>p.id===edit);id=edit;
   await ok(db.from("productos").update({nombre:it.nombre,codigo_barras:it.codigo_barras||null,categoria_id:$("category").value||(cats.find(c=>c.nombre==="General")||{}).id||null,precio_venta:it.precio_venta,precio_costo:it.precio_costo,fecha_compra:it.fecha_compra||null,descuento_pct:it.descuento_pct,descripcion:it.descripcion,tipo_compra:it.tipo_compra,lotes:lq,unidades_por_lote:upl}).eq("id",edit));
   const keep=new Set(vl.filter(v=>v.id).map(v=>v.id));
   for(const o of VARS_DB)if(!keep.has(o.id))await ok(db.from("producto_variantes").delete().eq("id",o.id));
   for(let i=0;i<vl.length;i++){const v=vl[i],row={nombre:v.nombre,stock:v.cantidad,codigo_barras:v.codigo_barras||null,orden:i};
    if(v.id)await ok(db.from("producto_variantes").update(row).eq("id",v.id));else await ok(db.from("producto_variantes").insert({...row,producto_id:edit}))}
   const d=stock-prev.stock;if(d!==0)await ok(db.rpc("registrar_movimiento",{p_producto:edit,p_tipo:d>0?"entrada":"salida",p_cantidad:Math.abs(d),p_nota:"Ajuste al editar"}))}
  else{const ex=inv.find(p=>p.codigo===it.codigo);
   if(trash.some(p=>p.codigo===it.codigo)){await DAY.say("Ese código está en la papelera. Restáuralo o elimínalo definitivamente.");busy(false);$("bSave").disabled=false;return}
   if(ex){if(await DAY.ask("Ese código ya existe. ¿Quieres sumar este stock al producto existente?"))it.sumar=true;else it.codigo=it.codigo+"_"+Date.now().toString().slice(-4)}
   const r=await ok(db.rpc("registrar_compra",{p_items:[it]}));id=r[0].id}
  if(imgsTemp.length)await subirImagenes(id,imgsTemp,true);
  await refresh();resetForm(true);beep();toast("Producto guardado")
 }catch(x){}finally{busy(false);$("bSave").disabled=false}});

function resetForm(guardado){
 $("purchaseForm").reset();edit=null;VARS_DB=[];varSet([]);imgsTemp=[];renderPrevs([]);$("barcodeCanvas").style.display="none";
 $("fechaCompra").value=hoy;$("porcentajeGanancia").value=60;$("discount").value=0;$("code").readOnly=false;$("code").style.background="";
 $("editFlag").classList.remove("on");$("bCancelEdit2").classList.add("hidden");$("formTitle").textContent="Nuevo producto";$("bSave").textContent="Guardar producto";
 $("moreOpts").open=false;setTab("normal");calcSug();$("recBanner").classList.remove("on");if(guardado!==undefined)draftClear()}
$("bReset").onclick=()=>resetForm();
function cancelEdit(){if(!edit)return;resetForm();toast("Edición cancelada. No se guardó ningún cambio")}
$("bCancelEdit1").onclick=cancelEdit;$("bCancelEdit2").onclick=cancelEdit;
async function startEdit(id){const p=inv.find(x=>x.id===id);if(!p)return;
 edit=id;$("name").value=p.nombre;$("code").value=p.codigo;$("code").readOnly=true;$("code").style.background="var(--bg)";$("barcode").value=p.codigo_barras||"";
 $("price").value=p.precio_venta;$("valorReal").value=p.precio_costo||"";$("fechaCompra").value=p.fecha_compra||"";$("discount").value=p.descuento_pct||0;
 $("quantity").value=p.stock;$("description").value=p.descripcion||"";$("category").value=p.categoria_id||"";
 const lote=p.tipo_compra==="lote"&&num(p.lotes)>0;setTab(lote?"lote":"normal");
 if(lote){$("lotQuantity").value=p.lotes;$("unitsPerLot").value=p.unidades_por_lote}
 $("moreOpts").open=true;calcSug();showBarcode(p.codigo_barras);imgsTemp=[];VARS_DB=[];varSet([]);
 ok(db.from("producto_variantes").select("id,nombre,stock,codigo_barras").eq("producto_id",id).order("orden").order("nombre")).then(L=>{if(edit!==id||!L.length)return;VARS_DB=L;
  varSet(L.map(v=>({id:v.id,nombre:v.nombre,cantidad:v.stock,codigo_barras:v.codigo_barras||""})));
  const s=L.reduce((a,v)=>a+v.stock,0);if(p.stock>s)toast("Hay "+(p.stock-s)+" unidades sin color; al guardar el total se ajusta a la suma de los colores.")}).catch(()=>{});
 $("formTitle").textContent="Editar producto";$("bSave").textContent="Actualizar producto";$("editFlag").classList.add("on");$("bCancelEdit2").classList.remove("hidden");
 setPane("f");scrollTo({top:0,behavior:"smooth"});
 try{const im=await ok(db.from("producto_imagenes").select("thumb_url,url,orden").eq("producto_id",id).order("orden"));if(edit===id)renderPrevs(im.map(i=>i.thumb_url||i.url))}catch(e){}}

/* ---------- categorías ---------- */
$("bNewCat").onclick=async()=>{const n=(await DAY.input("Nombre de la nueva categoría:")||"").trim();if(!n)return;
 if(cats.some(c=>c.nombre.toLowerCase()===n.toLowerCase())){await DAY.say("Esa categoría ya existe");return}
 try{const c=await ok(db.from("categorias").insert({nombre:n}).select().single());cats.push(c);cats.sort((a,b)=>a.nombre.localeCompare(b.nombre));renderCats();$("category").value=c.id;toast(`Categoría “${n}” creada`)}catch(x){}};

/* ---------- papelera ---------- */
async function toTrash(id){const p=inv.find(x=>x.id===id);if(!p||!await DAY.ask(`¿Enviar “${p.nombre}” a la papelera?`))return;
 try{await ok(db.from("productos").update({activo:false,eliminado_en:new Date().toISOString()}).eq("id",id));await refresh();toast("Producto enviado a la papelera")}catch(x){}}
function renderTrash(){$("trashCount").textContent=trash.length+" items";
 $("trashBody").innerHTML=trash.length?trash.map(p=>{const d=Math.ceil(DIAS-(Date.now()-new Date(p.eliminado_en))/864e5);
  return`<div class="tr">${pic(p,"ph")}<div class="ti"><b>${esc(p.nombre)}</b><small>${esc(p.codigo)} · ${esc(catName(p.categoria_id)||"Sin categoría")} · ${$$(p.precio_venta)}</small><br><small class="${d<=5?"al":""}">Se elimina en ${Math.max(d,0)} días</small></div><div class="ta"><button class="btn sm" data-a="r" data-i="${p.id}">Restaurar</button><button class="btn dg sm" data-a="x" data-i="${p.id}" aria-label="Eliminar para siempre">Eliminar</button></div></div>`}).join(""):`<div class="empty">La papelera está vacía.</div>`}
async function borrarDef(p){const r=await ok(db.rpc("eliminar_producto_definitivo",{p_id:p.id}));
 if(r==="borrado"){const im=await db.from("producto_imagenes").select("path,thumb_path").eq("producto_id",p.id);const paths=(im.data||[]).flatMap(o=>[o.path,o.thumb_path]).filter(Boolean);if(paths.length)await db.storage.from(BUCKET).remove(paths)}return r}
$("trashBody").onclick=async e=>{const b=e.target.closest("button");if(!b)return;const p=trash.find(x=>x.id===b.dataset.i);if(!p)return;
 try{if(b.dataset.a==="r"){await ok(db.from("productos").update({activo:true,eliminado_en:null}).eq("id",p.id));await refresh();renderTrash();toast("Producto restaurado")}
  else if(await DAY.ask("¿Eliminar para siempre?")){const r=await borrarDef(p);await refresh();renderTrash();toast(r==="oculto"?"Tiene ventas registradas: se oculta para conservar el historial":"Eliminado para siempre")}}catch(x){}};
$("bTrashAll").onclick=async()=>{if(!trash.length||!await DAY.ask("¿Vaciar la papelera? No se puede deshacer."))return;busy(true,"Vaciando papelera…");
 try{for(const p of trash.slice())await borrarDef(p);await refresh();renderTrash();toast("Papelera vaciada")}catch(x){}busy(false)};
async function limpiarVieja(){const v=trash.filter(p=>Date.now()-new Date(p.eliminado_en)>DIAS*864e5);if(!v.length)return;try{for(const p of v)await borrarDef(p);await load();renderCats()}catch(x){}}

/* ---------- eliminar stock 0 ---------- */
function openStock0(){zero=inv.filter(p=>+p.stock===0);$("countStockZero").textContent=zero.length;$("valueStockZero").textContent=$$(zero.reduce((s,p)=>s+num(p.precio_venta),0));
 $("s0Empty").classList.toggle("hidden",!!zero.length);$("s0Content").classList.toggle("hidden",!zero.length);$("bStock0Go").classList.toggle("hidden",!zero.length);
 $("eliminarStockGrid").innerHTML=zero.map(p=>`<div class="tr">${pic(p,"ph")}<div class="ti"><b>${esc(p.nombre)}</b><small>${esc(p.codigo)} · ${$$(p.precio_venta)}</small></div></div>`).join("");
 $("passStock0").value="";$("errPass").textContent="";openDlg("dgStock0")}
$("bStock0Go").onclick=async()=>{const pw=$("passStock0").value;$("errPass").textContent="";if(!pw){$("errPass").textContent="Escribe tu contraseña para confirmar.";return}
 const {data:{session}}=await db.auth.getSession();const r=await db.auth.signInWithPassword({email:session.user.email,password:pw});
 if(r.error){$("errPass").textContent="Contraseña incorrecta. Verifica e intenta de nuevo.";$("passStock0").value="";return}
 busy(true,"Enviando a la papelera…");try{await ok(db.from("productos").update({activo:false,eliminado_en:new Date().toISOString()}).in("id",zero.map(p=>p.id)));$("dgStock0").close();await refresh();toast(`${zero.length} productos con stock 0 enviados a la papelera`)}catch(x){}busy(false)};
$("passStock0").addEventListener("keydown",e=>{if(e.key==="Enter")$("bStock0Go").click()});


/* ---------- detalle ---------- */
let detUrls=[];
async function openDetail(id){const p=inv.find(x=>x.id===id);if(!p)return;
 const precio=num(p.precio_venta),costo=num(p.precio_costo),desc=num(p.descuento_pct),qty=num(p.stock),fin=precio*(1-desc/100),gan=costo?fin-costo:null,mar=costo&&fin?gan/fin*100:null,lote=p.tipo_compra==="lote"&&num(p.lotes)>0;
 const f=[["Categoría",catName(p.categoria_id)||"-"],["Stock",qty+" unid."],["Precio de venta",$$(precio)],["Descuento",desc+"%"],["Precio final",$$(fin)],["Costo",costo?$$(costo):"-"],["Ganancia por unidad",gan===null?"-":$$(gan)],["Margen",mar===null?"-":mar.toFixed(1)+"%"],["Valor del stock (precio final)",$$(fin*qty)],["Inversión (costo × stock)",costo?$$(costo*qty):"-"],["Fecha de compra",p.fecha_compra||"-"],["Tipo de compra",lote?`Lote (${p.lotes} lotes × ${p.unidades_por_lote} unid.)`:"Unidad"],["Código de barras",p.codigo_barras||"-"],["Agregado",p.created_at?new Date(p.created_at).toLocaleString("es-SV"):"-"]];
 $("pmNombre").textContent=p.nombre;$("pmCodigo").textContent="SKU: "+p.codigo;$("pmTabla").innerHTML=f.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("");$("pmDesc").textContent=p.descripcion||"-";
 const bc=$("pmBarcode");bc.style.display=p.codigo_barras?"":"none";if(p.codigo_barras)drawBarcode(bc,p.codigo_barras,{height:50,margin:4});
 $("pmEditar").onclick=()=>{$("dgDet").close();startEdit(id)};const im=$("pmImagen");im.removeAttribute("src");$("pmMin").innerHTML="";if(p.foto_url)im.src=p.foto_url;openDlg("dgDet");
 try{const r=await ok(db.from("producto_imagenes").select("url,thumb_url,orden").eq("producto_id",id).order("orden"));if(r.length){im.src=r[0].url;if(r.length>1)r.forEach(x=>{const t=document.createElement("img");t.src=x.thumb_url||x.url;t.alt="Miniatura";t.onclick=()=>{im.src=x.url};$("pmMin").appendChild(t)})}}catch(e){}}

/* ---------- carga masiva por imágenes y editor de lote ---------- */
const LKEY="daymar_lote_pendiente";
const shortCode=(pre,i)=>`${pre}${Math.floor(1000+Math.random()*9000)}${String(i).padStart(2,"0")}`;
function codeLibre(c){return ![...inv,...trash].some(p=>p.codigo===c)}
function lotBadge(){const b=$("fabBadge");b.classList.toggle("hidden",!loteTemp.length);b.textContent=loteTemp.length}
$("bBulk").onclick=async()=>{$("pendAlert").classList.toggle("on",!!loteTemp.length);if(loteTemp.length)$("pendText").textContent=`Lote pendiente (${loteTemp.length} productos)`;openDlg("dgBulk")};
$("bPick").onclick=()=>$("loteFiles").click();
$("loteFiles").onchange=()=>{const n=$("loteFiles").files.length;$("loteFileCount").textContent=n?`${n} imagen(es) seleccionada(s)`:"Ninguna imagen seleccionada"};
$("bProc").onclick=async()=>{if(loteTemp.length&&!await DAY.ask("¿Reemplazar el lote actual?"))return;
 const files=[...$("loteFiles").files];if(!files.length)return await DAY.say("Selecciona imágenes");if(files.length>130)return await DAY.say("Máximo 130 imágenes");
 const pre=($("lotePrefix").value.trim()||"KLO").toUpperCase();if(pre.length>6)return await DAY.say("El prefijo admite máximo 6 caracteres");
 loteTemp=[];const pv=$("lotePreview");pv.innerHTML="";$("loteStatus").textContent="Procesando…";busy(true,"Procesando imágenes…");
 const usados=[];
 for(let i=0;i<files.length;i++){try{let code=shortCode(pre,i);while(!codeLibre(code)||loteTemp.some(x=>x.code===code))code=shortCode(pre,i);
   const bc=genUnico(usados);usados.push(bc);const im=await par(files[i]);const u=URL.createObjectURL(im.thumb);
   const d=document.createElement("div");d.innerHTML=`<img src="${u}" alt=""><div>${esc(code)}</div><div>BC ${esc(bc)}</div>`;pv.appendChild(d);
   loteTemp.push({code,barcode:bc,main:im.main,thumb:im.thumb});$("ovText").textContent=`Procesando imágenes… ${i+1}/${files.length}`}catch(e){console.error(e)}}
 busy(false);$("loteStatus").textContent=`${loteTemp.length} productos listos`;await localforage.removeItem(LKEY);showEditor()};
async function vaciarLote(){if(!await DAY.ask("¿Cancelar el lote?"))return;loteTemp=[];localforage.removeItem(LKEY);$("lotePreview").innerHTML="";$("loteStatus").textContent="";$("loteFiles").value="";$("loteFileCount").textContent="Ninguna imagen seleccionada";if($("dgLote").open)$("dgLote").close();$("pendAlert").classList.remove("on");lotBadge()}
$("bVaciaLote").onclick=vaciarLote;
const catOpts=`<option value="">Sin categoría (General)</option>`;
function showEditor(prev){const g=$("editLoteGrid");loteUrls.forEach(u=>URL.revokeObjectURL(u));loteUrls=[];
 $("editorTitle").textContent=`Editar lote (${loteTemp.length} productos)`;
 g.innerHTML=loteTemp.map((p,i)=>{const d=prev&&prev[i]||{},u=URL.createObjectURL(p.thumb);loteUrls.push(u);
  return`<div class="le"><img class="lim" src="${u}" id="loteImg${i}" alt="Foto del producto ${i+1}"><div style="padding:6px 10px 0"><button type="button" class="btn g sm" style="width:100%" data-img="${i}">Cambiar imagen</button><input type="file" accept="image/*" class="hidden" id="loteFile${i}"></div>
  <div class="lb"><div class="cd">${esc(p.code)}</div>
  <label for="loteName${i}">Nombre *</label><input id="loteName${i}" value="${esc(d.name||"")}">
  <div class="r2"><div><label for="lotePrice${i}">Precio *</label><input id="lotePrice${i}" type="number" step="0.01" value="${esc(d.price||"")}"></div><div><label for="loteQuantity${i}">Stock *</label><input id="loteQuantity${i}" type="number" value="${esc(d.quantity||"")}"></div></div>
  <label for="loteBarcode${i}">Código de barras</label><div class="bcg"><input id="loteBarcode${i}" value="${esc(d.barcode||p.barcode||"")}"><button type="button" class="btn g sm" data-bc="${i}" aria-label="Generar otro código">↻</button></div>
  <label for="loteValorReal${i}">Costo</label><input id="loteValorReal${i}" type="number" step="0.01" value="${esc(d.valorReal||"")}" data-sug="${i}">
  <div class="r2"><div><label for="lotePorcentaje${i}">% ganancia</label><input id="lotePorcentaje${i}" type="number" value="${esc(d.porcentaje||"60")}" data-sug="${i}"></div><div><label for="loteSug${i}">Sugerido</label><input id="loteSug${i}" readonly></div></div>
  <label for="loteFecha${i}">Fecha de compra</label><input id="loteFecha${i}" type="date" value="${esc(d.fechaCompra||hoy)}">
  <label for="loteDescription${i}">Descripción <small>(opcional)</small></label><textarea id="loteDescription${i}" rows="2">${esc(d.description||"")}</textarea>
  <label for="loteCategory${i}">Categoría <small>(opcional)</small></label><select id="loteCategory${i}">${catOpts}${cats.map(c=>`<option value="${esc(c.nombre)}">${esc(c.nombre)}</option>`).join("")}</select></div></div>`}).join("");
 loteTemp.forEach((p,i)=>{if(prev&&prev[i]&&prev[i].category)$("loteCategory"+i).value=prev[i].category;calcSugL(i)});
 $("pendAlert").classList.remove("on");openDlg("dgLote")}
function calcSugL(i){$("loteSug"+i).value=(num($("loteValorReal"+i).value)*(1+(parseFloat($("lotePorcentaje"+i).value)||60)/100)).toFixed(2)}
$("editLoteGrid").addEventListener("input",e=>{if(e.target.dataset.sug!==undefined)calcSugL(+e.target.dataset.sug)});
$("editLoteGrid").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
 if(b.dataset.bc!==undefined){const c=genUnico(loteTemp.map((_,k)=>$("loteBarcode"+k).value));$("loteBarcode"+b.dataset.bc).value=c;toast("Nuevo código: "+c)}
 else if(b.dataset.img!==undefined)$("loteFile"+b.dataset.img).click()});
$("editLoteGrid").addEventListener("change",async e=>{if(!e.target.id.startsWith("loteFile"))return;const i=+e.target.id.slice(8),f=e.target.files[0];if(!f||!f.type.startsWith("image/"))return toast("Selecciona una imagen");
 try{const im=await par(f);loteTemp[i].main=im.main;loteTemp[i].thumb=im.thumb;const u=URL.createObjectURL(im.thumb);loteUrls.push(u);$("loteImg"+i).src=u;toast("Imagen actualizada")}catch(x){toast("No se pudo cambiar la imagen")}e.target.value=""});
function datosEditor(){return loteTemp.map((_,i)=>({name:$("loteName"+i).value,price:$("lotePrice"+i).value,quantity:$("loteQuantity"+i).value,barcode:$("loteBarcode"+i).value,valorReal:$("loteValorReal"+i).value,porcentaje:$("lotePorcentaje"+i).value||"60",fechaCompra:$("loteFecha"+i).value||hoy,description:$("loteDescription"+i).value,category:$("loteCategory"+i).value}))}
async function pausar(){try{await localforage.setItem(LKEY,{items:loteTemp,datos:datosEditor()})}catch(e){toast("No se pudo guardar el lote pendiente")}lotBadge()}
async function pausarYVolver(){await pausar();$("dgLote").close();$("pendText").textContent=`Lote pendiente (${loteTemp.length} productos)`;$("pendAlert").classList.add("on")}
$("bLotePause").onclick=pausarYVolver;
$("dgLote").addEventListener("cancel",e=>{e.preventDefault();pausarYVolver()});
$("bPendGo").onclick=async()=>{const s=await localforage.getItem(LKEY);if(s){loteTemp=s.items||[];showEditor(s.datos)}};
$("bPendDel").onclick=async ()=>{if(!await DAY.ask("¿Descartar el lote pendiente?"))return;loteTemp=[];localforage.removeItem(LKEY);$("pendAlert").classList.remove("on");$("lotePreview").innerHTML="";$("loteStatus").textContent="";$("loteFiles").value="";lotBadge()};
$("bLoteSave").onclick=async()=>{
 const D=datosEditor();
 for(let i=0;i<D.length;i++){const d=D[i],q=Math.trunc(num(d.quantity)),pr=num(d.price),co=num(d.valorReal);
  if(!d.name.trim()||pr<=0||q<1){await DAY.say(`Completa nombre, precio y stock del producto ${i+1}.`);return}
  if(co>pr&&!await DAY.ask(`Producto ${i+1}: el costo es mayor que el precio. ¿Continuar?`))return;
  if(d.fechaCompra&&d.fechaCompra>hoy){await DAY.say(`Producto ${i+1}: la fecha no puede ser futura.`);return}
  const bc=d.barcode.trim();if(bc){
   if(D.findIndex(x=>x.barcode.trim()===bc)!==i){await DAY.say(`El código de barras del producto ${i+1} está repetido en el lote.`);return}
   const o=[...inv,...trash].find(p=>p.codigo_barras===bc);if(o){await DAY.say(`El código de barras del producto ${i+1} ya lo tiene “${o.nombre}”.`);return}}}
 if(!await DAY.ask(`¿Guardar ${D.length} productos?`))return;
 busy(true,"Guardando lote…");
 try{const usados=D.map(d=>d.barcode.trim()).filter(Boolean);
  const items=D.map((d,i)=>{let bc=d.barcode.trim();if(!bc){bc=genUnico(usados);usados.push(bc)}
   return {codigo:loteTemp[i].code,nombre:d.name.trim(),codigo_barras:bc,categoria:d.category||"General",precio_venta:num(d.price),precio_costo:num(d.valorReal),fecha_compra:d.fechaCompra||hoy,descuento_pct:0,cantidad:Math.trunc(num(d.quantity)),tipo_compra:"normal",lotes:0,unidades_por_lote:0,descripcion:d.description.trim()}});
  const ids=[];for(let k=0;k<items.length;k+=100){const r=await ok(db.rpc("registrar_compra",{p_items:items.slice(k,k+100)}));ids.push(...r)}
  let n=0;await pool(ids.map((r,i)=>[r.id,loteTemp[i]]),4,async([id,p])=>{await subirImagenes(id,[p],true);$("ovText").textContent=`Subiendo imágenes… ${++n}/${ids.length}`});
  await localforage.removeItem(LKEY);loteTemp=[];lotBadge();$("dgLote").close();$("dgBulk").close();$("lotePreview").innerHTML="";$("loteFiles").value="";$("loteStatus").textContent="";$("loteFileCount").textContent="Ninguna imagen seleccionada";
  await refresh();toast("Lote guardado")}catch(x){}busy(false)};

/* ---------- importar PDF (lee la factura del proveedor) ---------- */
const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const REGEX_CODIGO = /[A-Z]{1,4}\d{5,}[A-Z0-9-]*/g;
function cargarPdfJs() {
  return new Promise((res, rej) => {
    if (window.pdfjsLib) return res();
    const s = document.createElement('script');
    s.src = PDFJS_SRC;
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; res(); };
    s.onerror = () => rej(new Error('No se pudo cargar pdf.js (revisa tu internet)'));
    document.head.appendChild(s);
  });
}
async function rectsImagenes(page) {
  const ops = await page.getOperatorList(), O = pdfjsLib.OPS;
  const mult = (A, B) => [A[0]*B[0]+A[1]*B[2], A[0]*B[1]+A[1]*B[3], A[2]*B[0]+A[3]*B[2],
    A[2]*B[1]+A[3]*B[3], A[4]*B[0]+A[5]*B[2]+B[4], A[4]*B[1]+A[5]*B[3]+B[5]];
  let ctm = [1, 0, 0, 1, 0, 0]; const st = [], out = [];
  ops.fnArray.forEach((fn, i) => {
    const a = ops.argsArray[i];
    if (fn === O.save) st.push(ctm.slice());
    else if (fn === O.restore) ctm = st.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === O.transform) ctm = mult(a, ctm);
    else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintJpegXObject) {
      const xs = [ctm[4], ctm[4]+ctm[0], ctm[4]+ctm[2], ctm[4]+ctm[0]+ctm[2]];
      const ys = [ctm[5], ctm[5]+ctm[1], ctm[5]+ctm[3], ctm[5]+ctm[1]+ctm[3]];
      out.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
  });
  return out.filter(r => (r.x1 - r.x0) > 20 && (r.y1 - r.y0) > 20).sort((a, b) => b.y1 - a.y1);
}
function categoriaPorTexto(t) {
  t = String(t || '').toLowerCase();
  if (/reloj|watch/.test(t)) return 'Relojes';
  if (/pulsera|bracelet/.test(t)) return 'Pulseras';
  if (/collar|necklace/.test(t)) return 'Collares';
  if (/anillo|\bring\b/.test(t)) return 'Anillos';
  if (/pendiente|arete|earring|piercing/.test(t)) return 'Aritos';
  if (/billetera|wallet/.test(t)) return 'Billeteras';
  if (/cartera|bolso|bag/.test(t)) return 'Carteras';
  if (/lente|gafa|sunglass/.test(t)) return 'Lentes de sol';
  if (/choker/.test(t)) return 'Chokers';
  return 'General';
}
function parsearFila(band, ignorar) {
  const s = [...band].sort((a, b) => a.x - b.x || b.y - a.y);
  let skuItem = null, code = null;
  for (const it of s) {
    const m = (it.s.match(REGEX_CODIGO) || []).find(c => !ignorar.has(c));
    if (m) { skuItem = it; code = m; break; }
  }
  if (!skuItem) return null;
  const variante = skuItem.s.includes('|') ? skuItem.s.split('|').slice(1).join(' ').trim() : '';
  let venta = 0, ventaItem = null, ventaNum = null;
  ventaItem = s.find(i => /^VENTA/i.test(i.s)) || null;
  if (ventaItem) {
    const m = ventaItem.s.match(/VENTA\s*:?\s*\$?\s*(\d[\d,]*\.?\d*)/i);
    if (m) venta = parseFloat(m[1].replace(/,/g, ''));
    else {
      ventaNum = s.filter(i => i !== ventaItem && /^\$?\s*\d[\d,]*\.\d{1,2}$/.test(i.s) && Math.abs(i.x - ventaItem.x) < 45)
                  .sort((a, b) => Math.abs(a.x - ventaItem.x) - Math.abs(b.x - ventaItem.x))[0] || null;
      if (ventaNum) venta = parseFloat(ventaNum.s.replace(/[$,\s]/g, ''));
    }
  }
  const montos = [];
  s.forEach(i => {
    if (i === ventaItem || i === ventaNum) return;
    const m = i.s.match(/^(?:USD|US\$|\$)?\s*(\d[\d,]*\.\d{1,2})$/);
    if (m) montos.push({ x: i.x, v: parseFloat(m[1].replace(/,/g, '')) });
  });
  montos.sort((a, b) => a.x - b.x);
  const costo = montos.length > 1 ? montos[1].v : (montos[0] ? montos[0].v : 0);
  const ints = s.filter(i => /^\d+$/.test(i.s)).sort((a, b) => a.x - b.x).map(i => parseInt(i.s, 10));
  const enviada = ints.length >= 3 ? ints[ints.length - 2] : (ints[0] || 0);
  const kSku = Math.round(skuItem.x / 6), cl = {};
  s.forEach(i => {
    if (i === ventaItem || i === ventaNum) return;
    if (/^\d+$/.test(i.s) || /^(USD|US\$|\$)?\s*[\d.,]*$/.test(i.s) || Math.round(i.x / 6) === kSku) return;
    const k = Math.round(i.x / 6);
    (cl[k] = cl[k] || []).push(i.s);
  });
  const desc = Object.values(cl).map(a => a.join(' ')).sort((a, b) => b.length - a.length)[0] || variante;
  return { code, nombre: (desc || code).slice(0, 80), desc: [desc, variante].filter(Boolean).join(' - ') || code, enviada, costo, venta };
}

$("bImpPdf").onclick=()=>$("pdfFile").click();
$("pdfFile").onchange=async evt=>{const file=evt.target.files[0];evt.target.value="";if(!file)return;
 if(loteTemp.length&&!await DAY.ask("¿Reemplazar el lote actual?"))return;
 const extra=parseFloat(await DAY.input("Costo extra TOTAL (envío + cargos) en USD para repartir entre los productos. Pon 0 si el PDF ya trae el costo real:","0"))||0;
 const omitir=(await DAY.input("Códigos a OMITIR (separados por coma), por ejemplo empaque o cajas. Deja vacío si ninguno:","")||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
 busy(true,"Leyendo el PDF…");
 try{await cargarPdfJs();const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,bandas=[];
  for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),vp=page.getViewport({scale:3}),canvas=document.createElement("canvas");canvas.width=vp.width;canvas.height=vp.height;
   await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;const rects=await rectsImagenes(page),tc=await page.getTextContent();
   const items=tc.items.filter(i=>i.str.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5]}));
   for(const r of rects){const [a,b,c,d]=vp.convertToViewportRectangle([r.x0,r.y0,r.x1,r.y1]),x=Math.min(a,c),y=Math.min(b,d),w=Math.abs(c-a),h=Math.abs(d-b),crop=document.createElement("canvas");crop.width=w;crop.height=h;crop.getContext("2d").drawImage(canvas,x,y,w,h,0,0,w,h);bandas.push({items:items.filter(i=>i.y>=r.y0&&i.y<=r.y1),crop})}}
  const freq={};bandas.forEach(bd=>{new Set(bd.items.flatMap(i=>i.s.match(REGEX_CODIGO)||[])).forEach(c=>{freq[c]=(freq[c]||0)+1})});
  const ignorar=new Set(bandas.length>=3?Object.keys(freq).filter(c=>freq[c]>=bandas.length*.5):[]),filas=[];
  for(const bd of bandas){const f=parsearFila(bd.items,ignorar);if(!f)continue;f.blob=await new Promise(r=>bd.crop.toBlob(r,"image/jpeg",.9));filas.push(f)}
  const utiles=filas.filter(f=>f.enviada>0&&!omitir.includes(f.code.toUpperCase())),totalCosto=utiles.reduce((s,f)=>s+f.costo*f.enviada,0)||1,factor=1+extra/totalCosto;
  loteTemp=[];const datos=[],usados=[];
  for(const f of utiles){let code=f.code;if(!codeLibre(code)||loteTemp.some(i=>i.code===code))code=code+"-"+Math.floor(100+Math.random()*900);
   const im=await par(f.blob),costo=+(f.costo*factor).toFixed(2),bc=genUnico(usados);usados.push(bc);const cat=categoriaPorTexto(f.nombre+" "+f.desc);
   loteTemp.push({code,barcode:bc,main:im.main,thumb:im.thumb});
   datos.push({name:f.nombre,price:f.venta||+(costo*1.6).toFixed(2),quantity:f.enviada,barcode:bc,valorReal:costo,porcentaje:60,fechaCompra:hoy,description:f.desc,category:cat})}
  busy(false);if(!loteTemp.length){toast("No se encontraron productos en el PDF");return}
  await localforage.removeItem(LKEY);toast(`${loteTemp.length} productos leídos. Revisa y edita antes de guardar`);showEditor(datos);lotBadge()
 }catch(e){console.error(e);busy(false);toast("Error leyendo el PDF: "+e.message)}};

/* ---------- exportar / importar ZIP ---------- */
const aViejo=(p,im)=>({id:p.id,name:p.nombre,code:p.codigo,barcode:p.codigo_barras||"",price:num(p.precio_venta),valorReal:num(p.precio_costo),fechaCompra:p.fecha_compra||"",discount:num(p.descuento_pct),quantity:p.stock,stockUnits:p.stock,unitType:p.tipo_compra==="lote"?"lote":"unidad",lotCount:p.lotes,unitsPerLot:p.unidades_por_lote,lotQuantity:p.lotes,description:p.descripcion||"",category:catName(p.categoria_id),addedAt:p.created_at,tipoCompra:p.tipo_compra});
$("bZip").onclick=async()=>{if(!inv.length)return toast("No hay productos para exportar");busy(true,"Preparando ZIP…");
 try{const zip=new JSZip();zip.file("inventory.json",JSON.stringify(inv.map(p=>aViejo(p)),null,2));const folder=zip.folder("images");
  const ims=await fetchAll(()=>db.from("producto_imagenes").select("producto_id,url,orden").order("orden"));const byId={};ims.forEach(i=>(byId[i.producto_id]=byId[i.producto_id]||[]).push(i));
  let n=0;await pool(inv,6,async p=>{const l=byId[p.id]||[];for(let k=0;k<l.length;k++){try{const r=await fetch(l[k].url);if(r.ok)folder.file(`${p.codigo}_${k+1}.jpg`,await r.blob())}catch(e){}}$("ovText").textContent=`Preparando ZIP… ${++n}/${inv.length}`});
  const blob=await zip.generateAsync({type:"blob"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`inventario_${hoy}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("Exportación ZIP completa")
 }catch(e){toast("Error exportando")}busy(false)};
/* fotos de un ZIP: images/CODIGO_1.jpg, CODIGO_2.png… se agrupan por código (una sola pasada) */
const nomSeguro=c=>String(c||"").replace(/[\\/:*?"<>|\s]/g,"-").toLowerCase();
function fotosDelZip(zip){
 const M=new Map();
 zip.forEach((rel,entry)=>{if(entry.dir||!/\.(jpg|jpeg|png|webp)$/i.test(rel))return;
  const f=rel.split("/").pop().replace(/\.[a-z]+$/i,""),m=/^(.*)_(\d+)$/.exec(f),cod=(m?m[1]:f).toLowerCase(),n=m?+m[2]:0;
  if(!M.has(cod))M.set(cod,[]);M.get(cod).push({n,entry,rel})});
 M.forEach(l=>l.sort((a,b)=>a.n-b.n));
 return {por:c=>M.get(String(c||"").toLowerCase())||M.get(nomSeguro(c))||[],total:[...M.values()].reduce((s,l)=>s+l.length,0)}}
/* pendientes de cobro del sistema anterior (pendientes.json dentro del ZIP) */
function pendientesDeZip(txt){
 let d=JSON.parse(txt);if(d&&!Array.isArray(d))d=d.pendingPaymentInventory||[];if(!Array.isArray(d))return [];
 const G=new Map();
 d.forEach(r=>{if(!r||r.paymentStatus==="paid")return;if(r.paymentStatus!=="partial"&&!(+r.pendingAmount>0))return;
  const cli=String(r.clientName||"").trim()||"Cliente sin nombre",f=r.date?new Date(r.date).toISOString():"",k=cli+"|"+f;
  if(!G.has(k))G.set(k,{cliente:cli,fecha:f,metodo:r.paymentMethod,abonado:0,items:[]});const g=G.get(k);g.abonado+=+r.paidAmount||0;
  g.items.push({codigo:r.code,nombre:r.name,barcode:r.barcode,cantidad:+r.quantity||1,precio:+r.finalPrice||+r.price||0,precio_original:+r.originalPrice||+r.price||0,descuento:+r.discount||0})});
 return [...G.values()]}
$("bImpZip").onclick=()=>$("importFile").click();
$("importFile").onchange=async evt=>{const file=evt.target.files[0];evt.target.value="";if(!file||!/\.zip$/i.test(file.name))return toast("Selecciona un archivo ZIP");
 busy(true,"Leyendo ZIP…");
 try{const zip=await JSZip.loadAsync(await file.arrayBuffer()),js=zip.file("inventory.json");if(!js){busy(false);return toast("ZIP no válido")}
  let lista=JSON.parse(await js.async("string"));if(!Array.isArray(lista))lista=[];
  const FZ=fotosDelZip(zip);
  const usados=new Set([...inv,...trash].map(p=>p.codigo_barras).filter(Boolean)),items=[],imgsPorCodigo={};
  for(const p of lista){const codigo=String(p.code||"").trim(),nombre=String(p.name||"").trim()||codigo;if(!codigo)continue;
   let bc=String(p.barcode||"").trim();const dueño=[...inv,...trash].find(x=>x.codigo_barras===bc);if(!bc||usados.has(bc)&&!(dueño&&dueño.codigo===codigo)){bc=genUnico([...usados])}usados.add(bc);
   const lote=p.unitType==="lote";items.push({codigo,nombre,codigo_barras:inv.some(x=>x.codigo===codigo)?"":bc,categoria:String(p.category||"").trim(),precio_venta:num(p.price),precio_costo:num(p.valorReal),fecha_compra:p.fechaCompra||null,descuento_pct:num(p.discount),cantidad:Math.max(0,Math.trunc(num(p.quantity))),tipo_compra:lote?"lote":"normal",lotes:lote?num(p.lotCount):0,unidades_por_lote:lote?num(p.unitsPerLot):0,descripcion:String(p.description||""),sumar:true});
   const en=FZ.por(codigo);if(en.length)imgsPorCodigo[codigo]=en.map(x=>x.entry)}
  if(!items.length){busy(false);return toast("El ZIP no trae productos")}
  const ids=[];for(let k=0;k<items.length;k+=100){$("ovText").textContent=`Importando productos… ${Math.min(k+100,items.length)}/${items.length}`;ids.push(...await ok(db.rpc("registrar_compra",{p_items:items.slice(k,k+100)})))}
  let n=0,fallos=0;const conImg=ids.filter(r=>imgsPorCodigo[r.codigo]);
  await pool(conImg,4,async r=>{const bl=[];
   for(const en of imgsPorCodigo[r.codigo]){try{bl.push(await par(await en.async("blob")))}catch(e){console.warn("Foto ilegible",r.codigo,e)}}
   try{if(bl.length)await subirImagenes(r.id,bl,true);else fallos++}catch(e){fallos++;console.warn("No se subió la foto de",r.codigo,e)}
   $("ovText").textContent=`Subiendo imágenes… ${++n}/${conImg.length}`});
  await refresh();$("dgBulk").close();
  let extra="";const pj=zip.file("pendientes.json");
  if(pj){try{const pr=pendientesDeZip(await pj.async("string"));
    if(pr.length){if(!DAY.principal)extra=" · Los pendientes de cobro solo los puede importar el administrador principal";
     else{const r=await ok(db.rpc("importar_pendientes_cobro",{p_ventas:pr}));extra=` · ${r.importadas} pendientes de cobro importados`+(r.omitidas?` (${r.omitidas} ya estaban)`:"")}}}
   catch(e){console.error(e);extra=" · No se pudieron importar los pendientes de cobro: "+(e.message||"")}}
  toast(`Importación completada (${ids.length} productos)${fallos?` · ${fallos} sin foto: usa «Completar fotos desde ZIP»`:""}${extra}`)
 }catch(e){console.error(e);toast("Error importando: "+(e.message||""))}busy(false)};

/* completar fotos: sube las fotos del ZIP a los productos que ya existen y no tienen foto */
$("bFotosZip").onclick=()=>$("fotosFile").click();
$("fotosFile").onchange=async evt=>{const file=evt.target.files[0];evt.target.value="";if(!file||!/\.zip$/i.test(file.name))return toast("Selecciona un archivo ZIP");
 busy(true,"Leyendo ZIP…");
 try{const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const FZ=fotosDelZip(zip);
  if(!FZ.total){busy(false);return toast("El ZIP no trae fotos")}
  const sin=inv.filter(p=>!p.foto_url);let falta=0,hechos=0,sinFoto=0;
  const trabajos=[];
  for(const p of sin){const en=FZ.por(p.codigo);if(!en.length){sinFoto++;continue}trabajos.push({p,en})}
  if(!trabajos.length){busy(false);return await DAY.say(`No encontré fotos para los productos sin foto. El ZIP trae ${FZ.total} fotos y hay ${sin.length} productos sin foto. Los nombres de las fotos deben empezar con el código del producto, por ejemplo CODIGO_1.jpg.`)}
  await pool(trabajos,4,async t=>{try{const bl=[];for(const a of t.en){try{bl.push(await par(await a.entry.async("blob")))}catch(e){console.warn("Foto ilegible",t.p.codigo,e)}}if(!bl.length)throw new Error("sin fotos legibles");await subirImagenes(t.p.id,bl,true);hechos++}catch(e){falta++}
   $("ovText").textContent=`Subiendo fotos… ${hechos+falta}/${trabajos.length}`});
  await refresh();toast(`Fotos completadas en ${hechos} productos`+(falta?` · ${falta} con error`:"")+(sinFoto?` · ${sinFoto} productos sin foto en el ZIP`:""))
 }catch(e){console.error(e);toast("Error: "+(e.message||""))}busy(false)};

/* ---------- exportar PDF / etiquetas / vaciar ---------- */
const aDataUrl=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)});
$("bPdf").onclick=async()=>{if(!inv.length)return toast("No hay productos para exportar");busy(true,"Generando PDF…");
 try{const {jsPDF}=window.jspdf,pdf=new jsPDF("p","mm","a4");let y=15;pdf.setFontSize(18);pdf.text("Inventario DAYMAR-SHOP",15,y);y+=10;let n=0;
  for(const p of inv){if(y>262){pdf.addPage();y=15}
   if(p.foto_url){try{const r=await fetch(p.foto_url);if(r.ok)pdf.addImage(await aDataUrl(await r.blob()),"JPEG",15,y,30,30)}catch(e){}}
   pdf.setFontSize(11);pdf.text(`${p.nombre} (${p.codigo})`,50,y+8);pdf.text(`Precio: ${$$(p.precio_venta)} | Stock: ${p.stock}`,50,y+15);pdf.text(`Cat: ${catName(p.categoria_id)||"-"}`,50,y+22);y+=35;$("ovText").textContent=`Generando PDF… ${++n}/${inv.length}`}
  pdf.save(`inventario_${hoy}.pdf`);toast("PDF generado")}catch(e){toast("Error generando el PDF")}busy(false)};
$("bLabels").onclick=async()=>{if(!inv.length)return toast("No hay productos");const a=$("labelPrintArea");
 let vs=[];try{vs=await ok(db.from("producto_variantes").select("producto_id,nombre,codigo_barras,stock,orden").order("orden").order("nombre"))}catch(e){}
 const VB={};(vs||[]).forEach(v=>(VB[v.producto_id]=VB[v.producto_id]||[]).push(v));
 const L=[];inv.forEach(p=>{const cs=VB[p.id];if(!cs||!cs.length)L.push({p,color:"",cb:p.codigo_barras});else cs.forEach(v=>L.push({p,color:v.nombre,cb:v.codigo_barras||p.codigo_barras}))});
 a.innerHTML=L.map((l,i)=>`<div class="label"><div style="font-weight:bold;margin-bottom:5px">${esc(l.p.nombre)}${l.color?`<div style="font-weight:600;font-size:.85em">${DAY.colorDot(l.color)}${esc(l.color)}</div>`:""}</div><div class="price">${$$(l.p.precio_venta)}</div><svg id="lb${i}"></svg><div class="code">${esc(l.p.codigo)}</div></div>`).join("");
 L.forEach((l,i)=>{if(l.cb)drawBarcode($("lb"+i),l.cb,{width:2,height:40,margin:2})});
 document.body.classList.add("print-labels");const fin=()=>{document.body.classList.remove("print-labels");removeEventListener("afterprint",fin)};addEventListener("afterprint",fin,{once:true});print();setTimeout(fin,1500)};
$("bVaciaInv").onclick=async()=>{if(!inv.length)return;if(!await DAY.ask(`¿Enviar TODO el inventario (${inv.length} productos) a la papelera?`)||!await DAY.ask("Última confirmación: podrás restaurarlos desde la papelera durante 30 días."))return;
 busy(true,"Enviando a la papelera…");try{await ok(db.from("productos").update({activo:false,eliminado_en:new Date().toISOString()}).eq("activo",true));$("dgBulk").close();await refresh();toast("Inventario enviado a la papelera")}catch(x){}busy(false)};

/* ---------- borrador automático ---------- */
const DK="dms_draft";
const draftClear=()=>{try{localStorage.removeItem(DK)}catch(e){}$("recBanner").classList.remove("on")};
function draftSave(){if(edit||!($("name").value||$("code").value))return;
 const b={name:$("name").value,code:$("code").value,barcode:$("barcode").value,price:$("price").value,valorReal:$("valorReal").value,fechaCompra:$("fechaCompra").value,discount:$("discount").value,quantity:$("quantity").value,lotQuantity:$("lotQuantity").value,unitsPerLot:$("unitsPerLot").value,lote:esLote,description:$("description").value,category:$("category").value};
 try{localStorage.setItem(DK,JSON.stringify(b))}catch(e){}$("autoInd").classList.add("on");setTimeout(()=>$("autoInd").classList.remove("on"),2000)}
let dt;$("purchaseForm").addEventListener("input",()=>{clearTimeout(dt);dt=setTimeout(draftSave,2000)});setInterval(draftSave,30000);
$("bRecover").onclick=()=>{let b;try{b=JSON.parse(localStorage.getItem(DK))}catch(e){}if(!b)return;
 $("name").value=b.name||"";$("code").value=b.code||"";$("barcode").value=b.barcode||"";$("price").value=b.price||"";$("valorReal").value=b.valorReal||"";$("fechaCompra").value=b.fechaCompra||hoy;$("discount").value=b.discount||0;
 setTab(b.lote?"lote":"normal");$("lotQuantity").value=b.lotQuantity||"";$("unitsPerLot").value=b.unitsPerLot||"";$("quantity").value=b.quantity||"";$("description").value=b.description||"";$("category").value=b.category||"";
 if(b.barcode)showBarcode(b.barcode);calcSug();$("recBanner").classList.remove("on");toast("Borrador recuperado")};
$("bDiscard").onclick=()=>{draftClear();toast("Borrador descartado")};

/* ---------- menú, pestañas del celular y atajos ---------- */
function setPane(p){$("cols").dataset.pane=p;document.querySelectorAll("#seg button").forEach(b=>b.classList.toggle("on",b.dataset.p===p))}
$("seg").onclick=e=>{const b=e.target.closest("button");if(b)setPane(b.dataset.p)};
const mm=$("mMore");$("bMore").onclick=e=>{e.stopPropagation();const on=mm.classList.toggle("on");$("bMore").setAttribute("aria-expanded",on)};
document.addEventListener("click",()=>{mm.classList.remove("on");$("bMore").setAttribute("aria-expanded","false")});
mm.onclick=e=>{const b=e.target.closest("button");if(!b)return;const m=b.dataset.m;
 if(m==="trash"){renderTrash();openDlg("dgTrash")}else if(m==="stock0")openStock0();else if(m==="keys")openDlg("dgKeys");else if(m==="theme")toggleTheme();else if(m==="out")DAY.salir()};
document.addEventListener("keydown",e=>{if(!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();
 if(k==="n"){e.preventDefault();resetForm();setPane("f");$("name").focus();toast("Nuevo producto")}
 else if(k==="b"){e.preventDefault();setPane("i");$("searchBox").focus()}
 else if(k==="s"){e.preventDefault();$("purchaseForm").requestSubmit()}
 else if(k==="m"){e.preventDefault();$("bBulk").click()}});

/* ---------- inicio ---------- */
$("fechaCompra").value=hoy;calcSug();setTab("normal");renderHist();
try{await load()}catch(e){toast("No se pudo cargar el inventario. ¿Ejecutaste migracion_compra.sql?")}
renderCats();renderInv();calcTotal();
try{const s=await localforage.getItem(LKEY);if(s&&s.items&&s.items.length){loteTemp=s.items;lotBadge()}}catch(e){}
try{if(localStorage.getItem(DK))$("recBanner").classList.add("on")}catch(e){}
limpiarVieja();
})();
