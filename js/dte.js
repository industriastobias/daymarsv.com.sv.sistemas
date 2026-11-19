/* DAYMARSV · Factura electrónica (DTE) — MODO PRUEBA.
   Arma, con ventas reales del sistema y datos ficticios del emisor, el documento en el formato de la Factura (tipo 01)
   de Hacienda (esquema v1) y su representación gráfica. NO se firma ni se envía a Hacienda: no tiene validez fiscal. */
(async()=>{
"use strict";
const {db,esc,toast,mountSide,requireSession}=DAY;
const {modal,vistaDoc,espera,lib,fetchAll}=UI;
const $=i=>document.getElementById(i);
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"dte",me.rol);$("app").classList.remove("hidden");

const r2=n=>Math.round((Number(n)||0)*100)/100;
const money=n=>"$"+r2(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const pad=(n,l)=>String(n).padStart(l,"0");

/* Datos FICTICIOS del emisor (se guardan solo en este dispositivo) */
const EMK="dms_dte_emisor_prueba";
const EM0={nombre:"DAYMARSV (PRUEBA)",nombreComercial:"DAYMARSV",nit:"00000000000000",nrc:"0000000",codActividad:"47734",descActividad:"Venta al por menor de joyería, bisutería y accesorios",
 departamento:"06",municipio:"14",complemento:"San Salvador, El Salvador",telefono:"00000000",correo:"prueba@ejemplo.com",codEstableMH:"M001",codPuntoVentaMH:"P001"};
const leerEm=()=>{try{return {...EM0,...JSON.parse(localStorage.getItem(EMK)||"{}")}}catch(e){return {...EM0}}};
const guardarEm=v=>{try{localStorage.setItem(EMK,JSON.stringify(v))}catch(e){}};

/* Total en letras (español, dólares) */
function letras(n){
 const U=["","UNO","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE","DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE","DIECIOCHO","DIECINUEVE","VEINTE","VEINTIUNO","VEINTIDÓS","VEINTITRÉS","VEINTICUATRO","VEINTICINCO","VEINTISÉIS","VEINTISIETE","VEINTIOCHO","VEINTINUEVE"];
 const D=["","","","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA","OCHENTA","NOVENTA"],C=["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS","SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"];
 const c99=x=>x<30?U[x]:D[Math.floor(x/10)]+(x%10?" Y "+U[x%10]:"");
 const c999=x=>x===100?"CIEN":(C[Math.floor(x/100)]+(x%100?(x>=100?" ":"")+c99(x%100):"")).trim();
 const ent=Math.floor(n),cen=Math.round((n-ent)*100);
 const mil=Math.floor(ent/1000),resto=ent%1000,mill=Math.floor(ent/1e6);
 let t="";if(mill)t+=(mill===1?"UN MILLÓN":c999(mill)+" MILLONES")+" ";
 const m2=Math.floor((ent%1e6)/1000);if(m2)t+=(m2===1?"MIL":c999(m2)+" MIL")+" ";
 t+=resto?c999(resto):(ent?"":"CERO");void mil;
 return (t.trim().replace(/UNO$/,"UN")+" "+pad(cen,2)+"/100 USD").replace(/\s+/g," ")}

const PAGO={efectivo:"01",tarjeta:"03",transferencia:"05",bitcoin:"11"};
const DPAGO={"01":"Billetes y monedas","02":"Tarjeta débito","03":"Tarjeta crédito","05":"Transferencia","11":"Bitcoin","99":"Otros"};
function uuid(){return (crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16)})).toUpperCase()}

/* Arma el DTE (Factura, tipo 01). En la factura de consumidor final los precios incluyen IVA. */
function armarDTE(v,em){
 const f=new Date(v.created_at),fecEmi=f.getFullYear()+"-"+pad(f.getMonth()+1,2)+"-"+pad(f.getDate(),2),horEmi=pad(f.getHours(),2)+":"+pad(f.getMinutes(),2)+":"+pad(f.getSeconds(),2);
 const items=(v.venta_items||[]).map((i,k)=>{const q=+i.cantidad||0,pu=r2(+i.precio_original>0&&+i.precio_original>+i.precio_unit?+i.precio_original:+i.precio_unit),desc=r2((pu-r2(+i.precio_unit))*q),grav=r2(pu*q-desc);
  return {numItem:k+1,tipoItem:1,numeroDocumento:null,cantidad:q,codigo:String(i.codigo_barras||i.codigo||"").slice(0,25)||null,codTributo:null,uniMedida:59,descripcion:String(i.nombre||"Producto").slice(0,1000),
   precioUni:pu,montoDescu:desc,ventaNoSuj:0,ventaExenta:0,ventaGravada:grav,tributos:null,psv:0,noGravado:0,ivaItem:r2(grav-grav/1.13)}});
 const sub=r2(items.reduce((t,x)=>t+x.ventaGravada,0)),extra=r2((+v.total||0)-sub);
 if(extra>0.004)items.push({numItem:items.length+1,tipoItem:2,numeroDocumento:null,cantidad:1,codigo:"ENVIO",codTributo:null,uniMedida:99,descripcion:"Envío",precioUni:extra,montoDescu:0,ventaNoSuj:0,ventaExenta:0,ventaGravada:extra,tributos:null,psv:0,noGravado:0,ivaItem:r2(extra-extra/1.13)});
 const tg=r2(items.reduce((t,x)=>t+x.ventaGravada,0)),td=r2(items.reduce((t,x)=>t+x.montoDescu,0)),iva=r2(items.reduce((t,x)=>t+x.ivaItem,0));
 const cp=PAGO[String(v.metodo_pago||"").toLowerCase()]||"99";
 return {identificacion:{version:1,ambiente:"00",tipoDte:"01",numeroControl:`DTE-01-${em.codEstableMH}${em.codPuntoVentaMH}-${pad(v.numero||1,15)}`,codigoGeneracion:uuid(),tipoModelo:1,tipoOperacion:1,tipoContingencia:null,motivoContin:null,fecEmi,horEmi,tipoMoneda:"USD"},
  documentoRelacionado:null,
  emisor:{nit:em.nit,nrc:em.nrc,nombre:em.nombre,codActividad:em.codActividad,descActividad:em.descActividad,nombreComercial:em.nombreComercial,tipoEstablecimiento:"01",
   direccion:{departamento:em.departamento,municipio:em.municipio,complemento:em.complemento},telefono:em.telefono,correo:em.correo,codEstableMH:em.codEstableMH,codEstable:null,codPuntoVentaMH:em.codPuntoVentaMH,codPuntoVenta:null},
  receptor:{tipoDocumento:null,numDocumento:null,nrc:null,nombre:v.cliente_nombre||"Clientes varios",codActividad:null,descActividad:null,direccion:null,telefono:null,correo:null},
  otrosDocumentos:null,ventaTercero:null,cuerpoDocumento:items,
  resumen:{totalNoSuj:0,totalExenta:0,totalGravada:tg,subTotalVentas:tg,descuNoSuj:0,descuExenta:0,descuGravada:0,porcentajeDescuento:0,totalDescu:td,tributos:null,subTotal:tg,ivaRete1:0,reteRenta:0,
   montoTotalOperacion:tg,totalNoGravado:0,totalPagar:tg,totalLetras:letras(tg),totalIva:iva,saldoFavor:0,condicionOperacion:1,pagos:[{codigo:cp,montoPago:tg,referencia:null,plazo:null,periodo:null}],numPagoElectronico:null},
  extension:null,apendice:[{campo:"aviso",etiqueta:"Aviso",valor:"SIMULACIÓN SIN VALIDEZ FISCAL"}]}}

/* Representación gráfica (lo que recibe el cliente), con marca de agua de prueba */
async function representacion(j){
 let qr="";try{await lib("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js");const q=qrcode(0,"M");q.addData("SIMULACION SIN VALIDEZ FISCAL | "+j.identificacion.codigoGeneracion);q.make();qr=q.createSvgTag({cellSize:3,margin:0,scalable:true})}catch(e){}
 const e=j.emisor,id=j.identificacion,r=j.resumen;
 const filas=j.cuerpoDocumento.map(x=>`<tr><td>${x.numItem}</td><td>${x.cantidad}</td><td>${esc(x.descripcion)}<br><small>${esc(x.codigo||"")}</small></td><td class="r">${money(x.precioUni)}</td><td class="r">${x.montoDescu?money(x.montoDescu):"—"}</td><td class="r">${money(x.ventaGravada)}</td></tr>`).join("");
 return `<div style="position:relative;width:794px;min-height:1000px;padding:36px 40px;box-sizing:border-box;background:#fff;color:#222;font:13px/1.45 Arial,Helvetica,sans-serif;overflow:hidden">
 <div style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none"><div style="transform:rotate(-30deg);font:900 64px Arial;color:rgba(179,38,30,.13);white-space:nowrap;letter-spacing:4px">SIMULACIÓN · SIN VALIDEZ FISCAL</div></div>
 <div style="background:#b3261e;color:#fff;text-align:center;font-weight:700;padding:7px;border-radius:6px;margin-bottom:14px;letter-spacing:1px">DOCUMENTO DE PRUEBA — NO FUE FIRMADO NI ENVIADO A HACIENDA — SIN VALIDEZ FISCAL</div>
 <div style="display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #6B2D3E;padding-bottom:12px">
  <div><div style="font:800 22px Arial;color:#6B2D3E">${esc(e.nombreComercial)}</div><div>${esc(e.nombre)}</div><div style="color:#555">NIT ${esc(e.nit)} · NRC ${esc(e.nrc)}</div><div style="color:#555">${esc(e.descActividad)}</div><div style="color:#555">${esc(e.direccion.complemento)} · Tel. ${esc(e.telefono)}</div></div>
  <div style="text-align:right"><div style="font:800 15px Arial;color:#6B2D3E">DOCUMENTO TRIBUTARIO ELECTRÓNICO</div><div style="font-weight:700">FACTURA</div><div style="margin-top:6px;width:96px;height:96px;margin-left:auto">${qr}</div></div></div>
 <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:12px">
  <tr><td style="padding:3px 0;color:#555;width:190px">Código de generación</td><td style="font-family:monospace">${id.codigoGeneracion}</td></tr>
  <tr><td style="padding:3px 0;color:#555">Número de control</td><td style="font-family:monospace">${id.numeroControl}</td></tr>
  <tr><td style="padding:3px 0;color:#555">Sello de recepción</td><td style="color:#b3261e;font-weight:700">— (no enviado: simulación)</td></tr>
  <tr><td style="padding:3px 0;color:#555">Fecha y hora</td><td>${id.fecEmi} ${id.horEmi}</td></tr>
  <tr><td style="padding:3px 0;color:#555">Ambiente</td><td>${id.ambiente} (pruebas) · Modelo previo · Transmisión normal</td></tr>
  <tr><td style="padding:3px 0;color:#555">Cliente</td><td>${esc(j.receptor.nombre)}</td></tr></table>
 <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#6B2D3E;color:#fff;font-size:12px"><th style="padding:6px;text-align:left">#</th><th style="padding:6px;text-align:left">Cant.</th><th style="padding:6px;text-align:left">Descripción</th><th style="padding:6px;text-align:right">Precio unit.</th><th style="padding:6px;text-align:right">Descuento</th><th style="padding:6px;text-align:right">Ventas gravadas</th></tr></thead>
 <tbody>${filas.replace(/<td/g,'<td style="padding:6px;border-bottom:1px solid #eee;vertical-align:top"').replace(/class="r"/g,'align="right"')}</tbody></table>
 <table style="width:300px;margin:12px 0 0 auto;border-collapse:collapse;font-size:13px">
  <tr><td style="padding:3px 0">Total gravado</td><td align="right">${money(r.totalGravada)}</td></tr>
  <tr><td style="padding:3px 0">Descuentos</td><td align="right">${money(r.totalDescu)}</td></tr>
  <tr><td style="padding:3px 0;color:#555">IVA incluido (13%)</td><td align="right" style="color:#555">${money(r.totalIva)}</td></tr>
  <tr><td style="padding:6px 0;font-weight:800;border-top:2px solid #6B2D3E">Total a pagar</td><td align="right" style="font-weight:800;border-top:2px solid #6B2D3E">${money(r.totalPagar)}</td></tr></table>
 <div style="margin-top:6px;font-size:12px;color:#555">${esc(r.totalLetras)} · Pago: ${esc(DPAGO[r.pagos[0].codigo]||"Otros")} · Condición: contado</div>
 <div style="margin-top:26px;font-size:11px;color:#888;border-top:1px solid #eee;padding-top:8px">Simulación generada por el sistema DAYMARSV con datos ficticios del emisor, para conocer cómo se vería una factura electrónica. Formato basado en el esquema de Factura (versión 1) de Hacienda; la versión real puede cambiar.</div></div>`}

function descargarJSON(j,nombre){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(j,null,2)],{type:"application/json"}));a.download=nombre+".json";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

async function simular(v){
 const j=armarDTE(v,leerEm()),nom="DTE-PRUEBA-venta-"+(v.numero||"");
 const m=modal("Factura electrónica · prueba",`<div class="pasos">
  <div class="paso"><b>1. Armar ✓</b><small>Venta convertida al formato de Hacienda.</small></div>
  <div class="paso no"><b>2. Firmar ✗</b><small>Necesita tu firma electrónica.</small></div>
  <div class="paso no"><b>3. Enviar ✗</b><small>Necesita usuario de Hacienda.</small></div>
  <div class="paso"><b>4. Entregar ✓</b><small>PDF para el cliente (de prueba).</small></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><button class="btn" id="sVer" type="button">Ver factura del cliente</button><button class="btn g" id="sJson" type="button">Descargar archivo (JSON)</button></div>
  <p style="margin:0 0 6px;font-size:13px;color:var(--mute)">Así se ve el archivo que se enviaría a Hacienda:</p><pre class="json" id="sPre"></pre>`,{big:true});
 m.q("#sPre").textContent=JSON.stringify(j,null,2);
 m.q("#sJson").onclick=()=>descargarJSON(j,nom);
 m.q("#sVer").onclick=async()=>{const html=await representacion(j);vistaDoc("Factura del cliente (prueba)",html,nom)}}

function editarEm(){
 const e=leerEm(),C=[["nombre","Nombre legal"],["nombreComercial","Nombre comercial"],["nit","NIT (ficticio)"],["nrc","NRC (ficticio)"],["codActividad","Código de actividad"],["descActividad","Actividad económica"],["complemento","Dirección"],["telefono","Teléfono"],["correo","Correo"],["codEstableMH","Código de establecimiento"],["codPuntoVentaMH","Código de punto de venta"]];
 const m=modal("Datos del emisor (prueba)",`<p style="margin:0 0 12px;color:var(--mute);font-size:13px">Son datos ficticios para la prueba y se guardan solo en este dispositivo. Cuando te registres en Hacienda, aquí irán tus datos reales.</p><div style="display:grid;gap:10px">${C.map(c=>`<label style="display:grid;gap:4px;font-size:13px;color:var(--mute)">${c[1]}<input data-k="${c[0]}" value="${esc(e[c[0]])}" style="padding:9px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit;font-size:16px"></label>`).join("")}</div>`,{foot:`<button class="btn g" id="eRes" type="button">Restablecer</button><button class="btn" id="eOk" type="button">Guardar</button>`});
 m.q("#eOk").onclick=()=>{const v={...e};m.el.querySelectorAll("[data-k]").forEach(i=>v[i.dataset.k]=i.value.trim());guardarEm(v);m.close();toast("Datos guardados")};
 m.q("#eRes").onclick=()=>{try{localStorage.removeItem(EMK)}catch(x){}m.close();toast("Se restablecieron los datos de ejemplo")}}
$("bEm").onclick=editarEm;

let V=[];
async function cargar(){
 V=await fetchAll(()=>db.from("ventas").select("id,numero,total,subtotal,created_at,cliente_nombre,metodo_pago,venta_items(cantidad,precio_unit,precio_original,nombre,codigo,codigo_barras)").eq("estado","completada").order("created_at",{ascending:false}).limit(60));
 V=V.slice(0,60)}
function pintar(){
 $("dash").innerHTML=`<div class="aviso"><b>Modo prueba.</b> Con tus ventas reales y datos ficticios del negocio, aquí ves cómo quedaría una factura electrónica de Hacienda. No se firma ni se envía, así que <b>no tiene validez fiscal</b> y no cuenta como factura.</div>
 <div class="pn s12"><div class="mhd"><h3>Elige una venta para simular su factura</h3></div>${V.length?V.map(v=>`<div class="vl"><div class="ti"><b>Venta #${v.numero}</b> · ${money(v.total)}<br><small>${new Date(v.created_at).toLocaleString("es-SV",{dateStyle:"medium",timeStyle:"short"})} · ${esc(v.cliente_nombre||"Clientes varios")} · ${(v.venta_items||[]).length} producto${(v.venta_items||[]).length===1?"":"s"}</small></div><button class="btn sm" data-v="${v.id}" type="button">Simular factura</button></div>`).join(""):'<div class="nod">No hay ventas completadas.</div>'}</div>`;
 $("dash").onclick=e=>{const b=e.target.closest("[data-v]");if(b)simular(V.find(x=>x.id===b.dataset.v))}}
try{await cargar();pintar()}catch(e){$("dash").innerHTML='<div class="nod">No se pudieron cargar las ventas: '+esc(e.message||e)+'</div>'}
})();
