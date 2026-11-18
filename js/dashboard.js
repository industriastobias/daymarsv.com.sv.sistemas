/* DAYMARSV · Dashboard de almacenamiento: KPIs, gráficas y tabla de productos tipo Excel */
(async()=>{
"use strict";
const {db,esc,toast,mountSide,requireSession}=DAY;
const $=i=>document.getElementById(i);
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"almacenamiento",me.rol);$("app").classList.remove("hidden");
const money=n=>"$"+(Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const num=n=>(Number(n)||0).toLocaleString("en-US");
const r2=n=>Math.round((Number(n)||0)*100)/100;
const fetchAll=async mk=>{let out=[],from=0;for(;;){const {data,error}=await mk().range(from,from+999);if(error)throw new Error(error.message);out=out.concat(data);if(data.length<1000)break;from+=1000}return out};
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||"#6B2D3E";
const PAL=()=>[css("--wine"),css("--gold"),css("--ok"),css("--warn"),css("--w2"),"#5b8def","#9b6bd1","#20a39e","#e0719a","#8d8d8d"];
const dia=d=>{const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0")};
let P=[],V=[],IT=[],charts=[],S={q:"",cat:"",est:"",ord:"nombre",dir:1,n:60};

async function cargar(){
 const d30=new Date(Date.now()-30*864e5);d30.setHours(0,0,0,0);
 const [prods,ventas,items]=await Promise.all([
  fetchAll(()=>db.from("productos").select("id,codigo,nombre,precio_venta,precio_costo,descuento_pct,stock,foto_url,codigo_barras,categorias(nombre)").eq("activo",true).order("nombre")),
  fetchAll(()=>db.from("ventas").select("id,total,estado,created_at").eq("estado","completada").gte("created_at",d30.toISOString()).order("created_at")),
  fetchAll(()=>db.from("venta_items").select("producto_id,cantidad,precio_unit,costo_unit,nombre,ventas!inner(estado,created_at)").eq("ventas.estado","completada").gte("ventas.created_at",d30.toISOString()))
 ]);
 const vend={};items.forEach(i=>{if(i.producto_id)vend[i.producto_id]=(vend[i.producto_id]||0)+(+i.cantidad||0)});
 P=prods.map(p=>{const fin=r2((+p.precio_venta||0)*(1-(+p.descuento_pct||0)/100)),st=+p.stock||0,costo=+p.precio_costo||0;
  return {id:p.id,codigo:p.codigo_barras||p.codigo||"",nombre:p.nombre||"",cat:p.categorias?p.categorias.nombre:"Sin categoría",precio:+p.precio_venta||0,desc:+p.descuento_pct||0,fin,costo,margen:fin>0&&costo>0?(fin-costo)/fin*100:null,stock:st,valor:fin*st,vend:vend[p.id]||0,foto:p.foto_url||""}});
 V=ventas;IT=items}

const estado=p=>p.stock<=0?"agotado":p.stock<=2?"bajo":"ok";

function kpis(){
 const hoy=dia(new Date()),vh=V.filter(v=>dia(v.created_at)===hoy),tot=V.reduce((s,v)=>s+(+v.total||0),0),th=vh.reduce((s,v)=>s+(+v.total||0),0);
 const uds=P.reduce((s,p)=>s+p.stock,0),val=P.reduce((s,p)=>s+p.valor,0),cost=P.reduce((s,p)=>s+p.costo*p.stock,0),ag=P.filter(p=>p.stock<=0).length,ba=P.filter(p=>p.stock>0&&p.stock<=2).length;
 const utilidad=IT.reduce((s,i)=>s+((+i.precio_unit||0)-(+i.costo_unit||0))*(+i.cantidad||0),0);
 const K=[["Productos activos",num(P.length),`${num(uds)} unidades en stock`,""],["Valor del inventario",money(val),"a precio de venta","g"]];
 if(ADM)K.push(["Costo del inventario",money(cost),"margen potencial "+money(val-cost),"g"]);
 K.push(["Ventas de hoy",money(th),num(vh.length)+" venta"+(vh.length===1?"":"s"),"o"],["Ventas 30 días",money(tot),num(V.length)+" ventas","o"],["Ticket promedio",money(V.length?tot/V.length:0),"últimos 30 días","o"]);
 if(ADM)K.push(["Utilidad 30 días",money(utilidad),"ventas − costo","o"]);
 K.push(["Agotados",num(ag),num(ba)+" con stock bajo (1–2)","w"]);
 return `<div class="dbk">${K.map(k=>`<div class="kc ${k[3]}"><span>${k[0]}</span><b>${k[1]}</b><small>${k[2]}</small></div>`).join("")}</div>`}

function graficas(){
 charts.forEach(c=>c.destroy());charts=[];
 const pal=PAL(),ink=css("--ink"),mute=css("--mute"),line=css("--line");
 Chart.defaults.color=mute;Chart.defaults.font.family='"DM Sans",sans-serif';
 const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}};
 const ejes=(fmt)=>({x:{grid:{display:false},ticks:{color:mute,maxRotation:0,autoSkip:true}},y:{beginAtZero:true,grid:{color:line},ticks:{color:mute,callback:fmt||(v=>v)}}});
 // ventas por día (30 días)
 const dias=[];for(let i=29;i>=0;i--)dias.push(dia(Date.now()-i*864e5));
 const porDia=Object.fromEntries(dias.map(d=>[d,0]));V.forEach(v=>{const d=dia(v.created_at);if(d in porDia)porDia[d]+=+v.total||0});
 charts.push(new Chart($("cVen"),{type:"line",data:{labels:dias.map(d=>d.slice(5)),datasets:[{label:"Ventas",data:dias.map(d=>r2(porDia[d])),borderColor:pal[0],backgroundColor:pal[0]+"22",fill:true,tension:.3,pointRadius:2}]},options:{...base,scales:ejes(v=>"$"+v),plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>money(c.parsed.y)}}}}}));
 // valor por categoría
 const porCat={};P.forEach(p=>{porCat[p.cat]=(porCat[p.cat]||0)+p.valor});
 let cats=Object.entries(porCat).sort((a,b)=>b[1]-a[1]);if(cats.length>8){const resto=cats.slice(7).reduce((s,x)=>s+x[1],0);cats=cats.slice(0,7).concat([["Otras",resto]])}
 charts.push(new Chart($("cCat"),{type:"doughnut",data:{labels:cats.map(c=>c[0]),datasets:[{data:cats.map(c=>r2(c[1])),backgroundColor:pal,borderColor:css("--card"),borderWidth:2}]},options:{...base,cutout:"58%",plugins:{legend:{display:true,position:"right",labels:{color:ink,boxWidth:12}},tooltip:{callbacks:{label:c=>c.label+": "+money(c.parsed)}}}}}));
 // top 10 vendidos
 const top=P.filter(p=>p.vend>0).sort((a,b)=>b.vend-a.vend).slice(0,10);
 charts.push(new Chart($("cTop"),{type:"bar",data:{labels:top.map(p=>p.nombre.length>26?p.nombre.slice(0,25)+"…":p.nombre),datasets:[{data:top.map(p=>p.vend),backgroundColor:pal[1],borderRadius:6}]},options:{...base,indexAxis:"y",scales:{x:{beginAtZero:true,grid:{color:line},ticks:{color:mute,precision:0}},y:{grid:{display:false},ticks:{color:ink}}}}}));
 // stock por categoría
 const stc={};P.forEach(p=>{stc[p.cat]=(stc[p.cat]||0)+p.stock});const sc=Object.entries(stc).sort((a,b)=>b[1]-a[1]).slice(0,10);
 charts.push(new Chart($("cStk"),{type:"bar",data:{labels:sc.map(c=>c[0]),datasets:[{data:sc.map(c=>c[1]),backgroundColor:pal[2],borderRadius:6}]},options:{...base,scales:ejes()}}));
 // salud del stock
 const D=[["Agotado",P.filter(p=>p.stock<=0).length,css("--bad")],["1–2 unidades",P.filter(p=>p.stock>0&&p.stock<=2).length,css("--warn")],["3–5 unidades",P.filter(p=>p.stock>2&&p.stock<=5).length,css("--gold")],["6 o más",P.filter(p=>p.stock>5).length,css("--ok")]];
 charts.push(new Chart($("cSal"),{type:"doughnut",data:{labels:D.map(d=>d[0]),datasets:[{data:D.map(d=>d[1]),backgroundColor:D.map(d=>d[2]),borderColor:css("--card"),borderWidth:2}]},options:{...base,cutout:"58%",plugins:{legend:{display:true,position:"right",labels:{color:ink,boxWidth:12}}}}}));
 // ventas por día de la semana
 const sem=[0,0,0,0,0,0,0];V.forEach(v=>{sem[new Date(v.created_at).getDay()]+=+v.total||0});
 charts.push(new Chart($("cSem"),{type:"bar",data:{labels:["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],datasets:[{data:sem.map(r2),backgroundColor:pal[0],borderRadius:6}]},options:{...base,scales:ejes(v=>"$"+v),plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>money(c.parsed.y)}}}}}))}

function filtrados(){
 const q=S.q.trim().toLowerCase();
 let L=P.filter(p=>(!q||(p.nombre+" "+p.codigo+" "+p.cat).toLowerCase().includes(q))&&(!S.cat||p.cat===S.cat)&&(!S.est||estado(p)===S.est));
 const k=S.ord,d=S.dir;
 L.sort((a,b)=>{const x=k==="estado"?a.stock:a[k],y=k==="estado"?b.stock:b[k];if(typeof x==="string")return d*x.localeCompare(y,"es");return d*((x??-1e12)-(y??-1e12))});
 return L}
const COLS=[["foto",""],["codigo","Código"],["nombre","Producto"],["cat","Categoría"],["precio","Precio","r"],["desc","Desc. %","r"],["fin","Precio final","r"]].concat(ADM?[["costo","Costo","r"],["margen","Margen %","r"]]:[]).concat([["stock","Stock","r"],["valor","Valor","r"],["vend","Vend. 30d","r"],["estado","Estado"]]);
function tabla(){
 const L=filtrados(),vis=L.slice(0,S.n);
 $("tbd").innerHTML=vis.map(p=>{const e=estado(p);return `<tr><td>${p.foto?`<img class="im" loading="lazy" src="${esc(p.foto)}" alt="">`:""}</td><td>${esc(p.codigo)}</td><td>${esc(p.nombre)}</td><td>${esc(p.cat)}</td><td class="r">${money(p.precio)}</td><td class="r">${p.desc?p.desc+"%":"—"}</td><td class="r">${money(p.fin)}</td>${ADM?`<td class="r">${money(p.costo)}</td><td class="r">${p.margen===null?"—":p.margen.toFixed(0)+"%"}</td>`:""}<td class="r">${num(p.stock)}</td><td class="r">${money(p.valor)}</td><td class="r">${num(p.vend)}</td><td><span class="bd ${e==="ok"?"ok":e==="bajo"?"w":"b"}">${e==="ok"?"Disponible":e==="bajo"?"Stock bajo":"Agotado"}</span></td></tr>`}).join("")||`<tr><td colspan="${COLS.length}" class="nod">Sin resultados</td></tr>`;
 const sv=L.reduce((s,p)=>s+p.stock,0),vv=L.reduce((s,p)=>s+p.valor,0);
 $("tft").innerHTML=`<span>${num(vis.length)} de ${num(L.length)} productos · ${num(sv)} unidades · ${money(vv)}</span>${L.length>S.n?'<button class="btn g" id="tMas" type="button">Mostrar más</button>':""}`;
 const m=$("tMas");if(m)m.onclick=()=>{S.n+=100;tabla()};
 document.querySelectorAll("#thd th").forEach(th=>th.textContent=th.dataset.t+(th.dataset.k===S.ord?(S.dir>0?" ▲":" ▼"):""))}

function csv(){
 const L=filtrados(),cols=COLS.filter(c=>c[0]!=="foto"),q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const rows=[cols.map(c=>q(c[1])).join(",")].concat(L.map(p=>cols.map(c=>q(c[0]==="estado"?(estado(p)==="ok"?"Disponible":estado(p)==="bajo"?"Stock bajo":"Agotado"):c[0]==="margen"?(p.margen===null?"":p.margen.toFixed(1)):p[c[0]])).join(",")));
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["﻿"+rows.join("\n")],{type:"text/csv;charset=utf-8"}));a.download="dashboard-productos-"+dia(new Date())+".csv";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

function pintar(){
 const cats=[...new Set(P.map(p=>p.cat))].sort((a,b)=>a.localeCompare(b,"es"));
 $("dash").innerHTML=kpis()+`<div class="gr">
  <div class="pn s8"><h3>Ventas por día (últimos 30 días)</h3><div class="cv"><canvas id="cVen"></canvas></div></div>
  <div class="pn s4"><h3>Valor del inventario por categoría</h3><div class="cv"><canvas id="cCat"></canvas></div></div>
  <div class="pn s4"><h3>Top 10 productos vendidos (30 días)</h3><div class="cv"><canvas id="cTop"></canvas></div></div>
  <div class="pn s4"><h3>Salud del stock</h3><div class="cv"><canvas id="cSal"></canvas></div></div>
  <div class="pn s4"><h3>Ventas por día de la semana</h3><div class="cv"><canvas id="cSem"></canvas></div></div>
  <div class="pn s12"><h3>Unidades en stock por categoría</h3><div class="cv"><canvas id="cStk"></canvas></div></div>
 </div>
 <div class="pn s12" style="margin-bottom:24px"><h3>Productos</h3>
  <div class="tbc"><input id="fQ" type="search" placeholder="Buscar por nombre, código o categoría" autocomplete="off"><select id="fC"><option value="">Todas las categorías</option>${cats.map(c=>`<option>${esc(c)}</option>`).join("")}</select><select id="fE"><option value="">Todos los estados</option><option value="ok">Disponible</option><option value="bajo">Stock bajo</option><option value="agotado">Agotado</option></select><button class="btn g" id="bCsv" type="button">Exportar CSV</button></div>
  <div class="tw"><table class="xl"><thead><tr id="thd">${COLS.map(c=>`<th class="${c[2]||""}" data-k="${c[0]}" data-t="${c[1]}">${c[1]}</th>`).join("")}</tr></thead><tbody id="tbd"></tbody></table></div>
  <div class="ft" id="tft"></div></div>`;
 try{graficas()}catch(e){console.warn("Gráficas:",e)}
 $("fQ").value=S.q;$("fC").value=S.cat;$("fE").value=S.est;
 $("fQ").oninput=e=>{S.q=e.target.value;S.n=60;tabla()};$("fC").onchange=e=>{S.cat=e.target.value;S.n=60;tabla()};$("fE").onchange=e=>{S.est=e.target.value;S.n=60;tabla()};
 $("bCsv").onclick=csv;
 $("thd").onclick=e=>{const th=e.target.closest("th");if(!th||th.dataset.k==="foto")return;const k=th.dataset.k;if(S.ord===k)S.dir*=-1;else{S.ord=k;S.dir=(k==="nombre"||k==="cat"||k==="codigo")?1:-1}tabla()};
 tabla()}

async function iniciar(){
 $("dash").innerHTML='<div class="nod">Cargando datos…</div>';
 try{await cargar();pintar()}catch(e){$("dash").innerHTML='<div class="nod">No se pudieron cargar los datos: '+esc(e.message||e)+'</div>'}}
$("bRef").onclick=async()=>{await iniciar();toast("Datos actualizados")};
addEventListener("day:perfil",()=>{});
iniciar();
})();
