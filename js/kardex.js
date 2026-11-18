/* DAYMARSV · Kardex: entradas, salidas, ventas y devoluciones de cada producto */
(async()=>{
"use strict";
const {db,esc,toast,mountSide,requireSession}=DAY;
const $=i=>document.getElementById(i);
const me=await requireSession();if(!me)return;if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"almacenamiento",me.rol);$("app").classList.remove("hidden");
const TIPO={entrada:["Entrada","ok"],salida:["Salida","b"],venta:["Venta","w"],devolucion:["Devolución","ok"]};
const dia=d=>{const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0")};
const fh=d=>{const x=new Date(d);return dia(x)+" "+String(x.getHours()).padStart(2,"0")+":"+String(x.getMinutes()).padStart(2,"0")};
const F={q:"",pid:"",pn:"",tipo:"",d:dia(Date.now()-29*864e5),h:dia(Date.now())};
let rows=[],fin=false,ids=null;
const PAGE=100;

async function idsProducto(){
 const q=F.q.trim();if(F.pid)return [F.pid];if(!q)return null;
 const t=q.replace(/[%,()]/g," ");
 const {data}=await db.from("productos").select("id").or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%,codigo_barras.ilike.%${t}%`).limit(200);
 return (data||[]).map(x=>x.id)}
function consulta(){
 let c=db.from("movimientos_stock").select("id,tipo,cantidad,stock_resultante,nota,created_at,producto_id,productos(nombre,codigo,codigo_barras),profiles(nombre)")
  .gte("created_at",new Date(F.d+"T00:00:00").toISOString()).lt("created_at",new Date(new Date(F.h+"T00:00:00").getTime()+864e5).toISOString()).order("created_at",{ascending:false});
 if(F.tipo)c=c.eq("tipo",F.tipo);if(ids)c=c.in("producto_id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]);return c}
async function cargar(mas){
 if(!mas){rows=[];fin=false;ids=await idsProducto()}
 const {data,error}=await consulta().range(rows.length,rows.length+PAGE-1);
 if(error)throw new Error(error.message);rows=rows.concat(data);if(data.length<PAGE)fin=true}
async function totales(){
 const out={entrada:0,salida:0,venta:0,devolucion:0};
 for(let f=0;f<20000;f+=1000){const {data,error}=await consulta().range(f,f+999);if(error)break;data.forEach(r=>{out[r.tipo]=(out[r.tipo]||0)+Math.abs(+r.cantidad||0)});if(data.length<1000)break}
 return out}
const nombre=r=>r.productos?r.productos.nombre:"(producto eliminado)";
const cod=r=>r.productos?(r.productos.codigo_barras||r.productos.codigo||""):"";

function tabla(){
 $("kb").innerHTML=rows.map(r=>{const t=TIPO[r.tipo]||[r.tipo,""],c=+r.cantidad;return `<tr><td>${fh(r.created_at)}</td><td>${esc(cod(r))}</td><td><a href="#" data-p="${r.producto_id}" data-n="${esc(nombre(r))}" class="pl">${esc(nombre(r))}</a></td><td><span class="bd ${t[1]}">${t[0]}</span></td><td class="r ${c>0?"mp":"mm"}">${c>0?"+":""}${c}</td><td class="r">${r.stock_resultante}</td><td>${esc(r.nota||"")}</td><td>${esc(r.profiles?r.profiles.nombre:"")}</td></tr>`}).join("")||'<tr><td colspan="8" class="nod">Sin movimientos con estos filtros</td></tr>';
 $("kf").innerHTML=`<span>${rows.length} movimiento${rows.length===1?"":"s"} mostrados</span>${fin?"":'<button class="btn g" id="kMas" type="button">Mostrar más</button>'}`;
 const m=$("kMas");if(m)m.onclick=async()=>{m.disabled=true;try{await cargar(true);tabla()}catch(e){toast("No se pudo cargar: "+e.message)}}}

async function buscar(){
 $("kb").innerHTML='<tr><td colspan="8" class="nod">Cargando…</td></tr>';
 try{await cargar(false);tabla();const t=await totales();
  $("kk").innerHTML=[["Entradas",t.entrada,"ok"],["Salidas",t.salida,"w"],["Ventas",t.venta,"w"],["Devoluciones",t.devolucion,"o"]].map(k=>`<div class="kc ${k[2]}"><span>${k[0]} (unidades)</span><b>${k[1].toLocaleString("en-US")}</b></div>`).join("")}
 catch(e){$("kb").innerHTML='<tr><td colspan="8" class="nod">No se pudo cargar: '+esc(e.message||e)+'</td></tr>'}}

$("dash").innerHTML=`<div class="dbk" id="kk"></div>
<div class="pn s12" style="margin-bottom:24px"><div class="tbc"><input id="kQ" type="search" placeholder="Producto (nombre o código)" autocomplete="off"><span id="kChip"></span><select id="kT"><option value="">Todos los tipos</option><option value="entrada">Entradas</option><option value="salida">Salidas</option><option value="venta">Ventas</option><option value="devolucion">Devoluciones</option></select><input type="date" id="kD" value="${F.d}" style="flex:0 0 auto;min-width:0"><input type="date" id="kH" value="${F.h}" style="flex:0 0 auto;min-width:0"></div>
<div class="tw"><table class="xl"><thead><tr><th>Fecha</th><th>Código</th><th>Producto</th><th>Tipo</th><th class="r">Cantidad</th><th class="r">Stock resultante</th><th>Nota</th><th>Usuario</th></tr></thead><tbody id="kb"></tbody></table></div><div class="ft" id="kf"></div></div>`;
let tm=0;$("kQ").oninput=e=>{F.q=e.target.value;F.pid="";chip();clearTimeout(tm);tm=setTimeout(buscar,350)};
$("kT").onchange=e=>{F.tipo=e.target.value;buscar()};$("kD").onchange=e=>{F.d=e.target.value||F.d;buscar()};$("kH").onchange=e=>{F.h=e.target.value||F.h;buscar()};
function chip(){$("kChip").innerHTML=F.pid?`<span class="bd ok" style="padding:6px 10px">${esc(F.pn)} <a href="#" id="kX" style="margin-left:6px">✕</a></span>`:"";const x=$("kX");if(x)x.onclick=e=>{e.preventDefault();F.pid="";F.pn="";F.q="";$("kQ").value="";chip();buscar()}}
$("kb").addEventListener("click",e=>{const a=e.target.closest("a[data-p]");if(!a)return;e.preventDefault();F.pid=a.dataset.p;F.pn=a.dataset.n;F.q="";$("kQ").value="";chip();buscar()});
$("bCsv").onclick=async()=>{try{toast("Preparando archivo…");let all=[];for(let f=0;f<50000;f+=1000){const {data,error}=await consulta().range(f,f+999);if(error)throw new Error(error.message);all=all.concat(data);if(data.length<1000)break}
 const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"',L=[["Fecha","Código","Producto","Tipo","Cantidad","Stock resultante","Nota","Usuario"].map(q).join(",")].concat(all.map(r=>[fh(r.created_at),cod(r),nombre(r),(TIPO[r.tipo]||[r.tipo])[0],r.cantidad,r.stock_resultante,r.nota||"",r.profiles?r.profiles.nombre:""].map(q).join(",")));
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["﻿"+L.join("\n")],{type:"text/csv;charset=utf-8"}));a.download="kardex-"+F.d+"_a_"+F.h+".csv";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}catch(e){toast("No se pudo exportar: "+(e.message||e))}};
buscar();
})();
