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
let P=[],V=[],IT=[],META={},charts=[],S={q:"",cat:"",est:"",ord:"nombre",dir:1,n:60},R={p:"30",d:"",h:""},SM={dias:90,n:40};

async function cargar(){
 const d0=new Date(Date.now()-730*864e5);d0.setHours(0,0,0,0);
 const [prods,ventas,items,metas]=await Promise.all([
  fetchAll(()=>db.from("productos").select("id,codigo,nombre,precio_venta,precio_costo,descuento_pct,stock,foto_url,codigo_barras,categorias(nombre)").eq("activo",true).order("nombre")),
  fetchAll(()=>db.from("ventas").select("id,total,estado,created_at").eq("estado","completada").gte("created_at",d0.toISOString()).order("created_at")),
  fetchAll(()=>db.from("venta_items").select("producto_id,cantidad,precio_unit,costo_unit,nombre,ventas!inner(estado,created_at)").eq("ventas.estado","completada").gte("ventas.created_at",d0.toISOString())),
  db.from("metas_venta").select("tipo,monto").then(r=>r.data||[],()=>[])
 ]);
 META={};metas.forEach(m=>META[m.tipo]=+m.monto);
 IT=items.map(i=>({...i,t:new Date(i.ventas.created_at).getTime()}));
 V=ventas.map(v=>({...v,t:new Date(v.created_at).getTime()}));
 const last={};IT.forEach(i=>{if(i.producto_id&&(!last[i.producto_id]||i.t>last[i.producto_id]))last[i.producto_id]=i.t});
 P=prods.map(p=>{const fin=r2((+p.precio_venta||0)*(1-(+p.descuento_pct||0)/100)),st=+p.stock||0,costo=+p.precio_costo||0;
  return {id:p.id,codigo:p.codigo_barras||p.codigo||"",nombre:p.nombre||"",cat:p.categorias?p.categorias.nombre:"Sin categoría",precio:+p.precio_venta||0,desc:+p.descuento_pct||0,fin,costo,margen:fin>0&&costo>0?(fin-costo)/fin*100:null,stock:st,valor:fin*st,vend:0,ultima:last[p.id]||0,foto:p.foto_url||""}})}

/* Rango elegido y el periodo anterior de la misma duración */
function rango(){
 const hoy=new Date();hoy.setHours(0,0,0,0);let a,b=new Date(hoy.getTime()+864e5);
 if(R.p==="hoy")a=new Date(hoy);
 else if(R.p==="7")a=new Date(hoy.getTime()-6*864e5);
 else if(R.p==="30")a=new Date(hoy.getTime()-29*864e5);
 else if(R.p==="90")a=new Date(hoy.getTime()-89*864e5);
 else if(R.p==="mes")a=new Date(hoy.getFullYear(),hoy.getMonth(),1);
 else if(R.p==="anio")a=new Date(hoy.getFullYear(),0,1);
 else{const x=new Date((R.d||dia(hoy))+"T00:00:00"),y=new Date((R.h||dia(hoy))+"T00:00:00");a=x<=y?x:y;b=new Date((x<=y?y:x).getTime()+864e5)}
 const len=b-a;return {a:a.getTime(),b:b.getTime(),pa:a.getTime()-len,pb:a.getTime(),dias:Math.round(len/864e5)}}
const enR=(L,a,b)=>L.filter(x=>x.t>=a&&x.t<b);
const nombreRango=()=>({hoy:"hoy","7":"últimos 7 días","30":"últimos 30 días","90":"últimos 90 días",mes:"este mes",anio:"este año",per:"el rango elegido"}[R.p]);

const estado=p=>p.stock<=0?"agotado":p.stock<=2?"bajo":"ok";

const delta=(a,b)=>{if(!b)return a?'<em class="dlt dup">nuevo</em>':"";const p=(a-b)/b*100;return `<em class="dlt ${p>=0?"dup":"ddn"}">${p>=0?"▲":"▼"} ${Math.abs(p).toFixed(0)}% vs. periodo anterior</em>`};
function resumen(rg,a,b){const v=enR(V,a,b),it=enR(IT,a,b),t=v.reduce((s,x)=>s+(+x.total||0),0),u=it.reduce((s,i)=>s+((+i.precio_unit||0)-(+i.costo_unit||0))*(+i.cantidad||0),0);return {n:v.length,tot:t,tk:v.length?t/v.length:0,u,uds:it.reduce((s,i)=>s+(+i.cantidad||0),0)}}
function barra(titulo,act,meta,sub){if(!meta)return `<div class="mt"><div class="mh"><b>${titulo}</b><span>${money(act)}</span></div><small>Sin meta definida${ADM?' — toca "Editar metas"':""}</small></div>`;const p=Math.min(100,act/meta*100);return `<div class="mt"><div class="mh"><b>${titulo}</b><span>${money(act)} de ${money(meta)} · ${(act/meta*100).toFixed(0)}%</span></div><div class="mpb"><i class="${act>=meta?"ok":""}" style="width:${p}%"></i></div><small>${act>=meta?"¡Meta cumplida!":"Faltan "+money(meta-act)}${sub?" · "+sub:""}</small></div>`}
function kpis(){
 const rg=rango(),A=resumen(rg,rg.a,rg.b),B=resumen(rg,rg.pa,rg.pb);
 const uds=P.reduce((s,p)=>s+p.stock,0),val=P.reduce((s,p)=>s+p.valor,0),cost=P.reduce((s,p)=>s+p.costo*p.stock,0),ag=P.filter(p=>p.stock<=0).length,ba=P.filter(p=>p.stock>0&&p.stock<=2).length;
 const K=[["Ventas ("+nombreRango()+")",money(A.tot),delta(A.tot,B.tot),"o"],["N.º de ventas",num(A.n),delta(A.n,B.n),"o"],["Ticket promedio",money(A.tk),delta(A.tk,B.tk),"o"],["Unidades vendidas",num(A.uds),delta(A.uds,B.uds),"o"]];
 if(ADM)K.push(["Utilidad",money(A.u),delta(A.u,B.u),"o"]);
 K.push(["Productos activos",num(P.length),num(uds)+" unidades en stock",""],["Valor del inventario",money(val),"a precio de venta","g"]);
 if(ADM)K.push(["Costo del inventario",money(cost),"margen potencial "+money(val-cost),"g"]);
 K.push(["Agotados",num(ag),num(ba)+" con stock bajo (1–2)","w"]);
 const hoy=new Date();hoy.setHours(0,0,0,0);const t0=hoy.getTime(),m0=new Date(hoy.getFullYear(),hoy.getMonth(),1).getTime();
 const vh=enR(V,t0,t0+864e5).reduce((s,x)=>s+(+x.total||0),0),vm=enR(V,m0,t0+864e5).reduce((s,x)=>s+(+x.total||0),0);
 const diasMes=new Date(hoy.getFullYear(),hoy.getMonth()+1,0).getDate(),ritmo=vm/hoy.getDate()*diasMes;
 const metas=`<div class="pn s12 mts"><div class="mhd"><h3>Metas de venta</h3>${ADM?'<button class="btn g sm" id="bMeta" type="button">Editar metas</button>':""}</div><div class="mtg">${barra("Meta de hoy",vh,META.dia)}${barra("Meta del mes",vm,META.mes,"ritmo proyectado "+money(ritmo))}</div></div>`;
 return `<div class="dbk">${K.map(k=>`<div class="kc ${k[3]}"><span>${k[0]}</span><b>${k[1]}</b><small>${k[2]}</small></div>`).join("")}</div>`+metas}

function graficas(){
 charts.forEach(c=>c.destroy());charts=[];
 const pal=PAL(),ink=css("--ink"),mute=css("--mute"),line=css("--line");
 Chart.defaults.color=mute;Chart.defaults.font.family='"DM Sans",sans-serif';
 const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}};
 const ejes=(fmt)=>({x:{grid:{display:false},ticks:{color:mute,maxRotation:0,autoSkip:true}},y:{beginAtZero:true,grid:{color:line},ticks:{color:mute,callback:fmt||(v=>v)}}});
 // ventas por periodo (con el periodo anterior encima)
 const rg=rango(),n=rg.dias,bk=n<=93?1:7,nb=Math.ceil(n/bk),lab=[],act=new Array(nb).fill(0),ant=new Array(nb).fill(0);
 for(let k=0;k<nb;k++){const d=new Date(rg.a+k*bk*864e5);lab.push(String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0"))}
 V.forEach(v=>{if(v.t>=rg.a&&v.t<rg.b)act[Math.floor((v.t-rg.a)/864e5/bk)]+=+v.total||0;else if(v.t>=rg.pa&&v.t<rg.pb)ant[Math.floor((v.t-rg.pa)/864e5/bk)]+=+v.total||0});
 charts.push(new Chart($("cVen"),{type:"line",data:{labels:lab,datasets:[{label:"Periodo actual",data:act.map(r2),borderColor:pal[0],backgroundColor:pal[0]+"22",fill:true,tension:.3,pointRadius:n>45?0:2},{label:"Periodo anterior",data:ant.map(r2),borderColor:mute,borderDash:[5,4],fill:false,tension:.3,pointRadius:0,borderWidth:1.5}]},options:{...base,scales:ejes(v=>"$"+v),plugins:{legend:{display:true,position:"bottom",labels:{color:ink,boxWidth:12}},tooltip:{callbacks:{label:c=>c.dataset.label+": "+money(c.parsed.y)}}}}}));
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
 const sem=[0,0,0,0,0,0,0];enR(V,rg.a,rg.b).forEach(v=>{sem[new Date(v.t).getDay()]+=+v.total||0});
 charts.push(new Chart($("cSem"),{type:"bar",data:{labels:["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],datasets:[{data:sem.map(r2),backgroundColor:pal[0],borderRadius:6}]},options:{...base,scales:ejes(v=>"$"+v),plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>money(c.parsed.y)}}}}}))}

function filtrados(){
 const q=S.q.trim().toLowerCase();
 let L=P.filter(p=>(!q||(p.nombre+" "+p.codigo+" "+p.cat).toLowerCase().includes(q))&&(!S.cat||p.cat===S.cat)&&(!S.est||estado(p)===S.est));
 const k=S.ord,d=S.dir;
 L.sort((a,b)=>{const x=k==="estado"?a.stock:a[k],y=k==="estado"?b.stock:b[k];if(typeof x==="string")return d*x.localeCompare(y,"es");return d*((x??-1e12)-(y??-1e12))});
 return L}
const COLS=[["foto",""],["codigo","Código"],["nombre","Producto"],["cat","Categoría"],["precio","Precio","r"],["desc","Desc. %","r"],["fin","Precio final","r"]].concat(ADM?[["costo","Costo","r"],["margen","Margen %","r"]]:[]).concat([["stock","Stock","r"],["valor","Valor","r"],["vend","Vendidas","r"],["estado","Estado"]]);
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
 {const rg=rango(),m={};enR(IT,rg.a,rg.b).forEach(i=>{if(i.producto_id)m[i.producto_id]=(m[i.producto_id]||0)+(+i.cantidad||0)});P.forEach(p=>p.vend=m[p.id]||0)}
 const cats=[...new Set(P.map(p=>p.cat))].sort((a,b)=>a.localeCompare(b,"es"));
 $("dash").innerHTML=`<div class="rb"><div class="seg2" id="rSg">${[["hoy","Hoy"],["7","7 días"],["30","30 días"],["90","90 días"],["mes","Este mes"],["anio","Este año"],["per","Personalizado"]].map(x=>`<button data-p="${x[0]}" class="${R.p===x[0]?"on":""}">${x[1]}</button>`).join("")}</div>${R.p==="per"?`<span class="rf"><input type="date" id="rD" value="${R.d}"><input type="date" id="rH" value="${R.h}"></span>`:""}</div>`+kpis()+`<div class="gr">
  <div class="pn s8"><h3 id="tVen">Ventas por periodo</h3><div class="cv"><canvas id="cVen"></canvas></div></div>
  <div class="pn s4"><h3>Valor del inventario por categoría</h3><div class="cv"><canvas id="cCat"></canvas></div></div>
  <div class="pn s4"><h3>Top 10 productos vendidos (periodo)</h3><div class="cv"><canvas id="cTop"></canvas></div></div>
  <div class="pn s4"><h3>Salud del stock</h3><div class="cv"><canvas id="cSal"></canvas></div></div>
  <div class="pn s4"><h3>Ventas por día de la semana</h3><div class="cv"><canvas id="cSem"></canvas></div></div>
  <div class="pn s12"><h3>Unidades en stock por categoría</h3><div class="cv"><canvas id="cStk"></canvas></div></div>
 </div>
 <div class="pn s12" style="margin-bottom:14px"><div class="mhd"><h3>Productos sin movimiento</h3><label class="sml">Sin venderse en <select id="smD">${[30,60,90,180,365].map(d=>`<option value="${d}"${SM.dias===d?" selected":""}>${d} días</option>`).join("")}</select></label></div><div id="smB"></div></div>
 <div class="pn s12" style="margin-bottom:24px"><h3>Productos</h3>
  <div class="tbc"><input id="fQ" type="search" placeholder="Buscar por nombre, código o categoría" autocomplete="off"><select id="fC"><option value="">Todas las categorías</option>${cats.map(c=>`<option>${esc(c)}</option>`).join("")}</select><select id="fE"><option value="">Todos los estados</option><option value="ok">Disponible</option><option value="bajo">Stock bajo</option><option value="agotado">Agotado</option></select><button class="btn g" id="bCsv" type="button">Exportar CSV</button></div>
  <div class="tw"><table class="xl"><thead><tr id="thd">${COLS.map(c=>`<th class="${c[2]||""}" data-k="${c[0]}" data-t="${c[1]}">${c[1]}</th>`).join("")}</tr></thead><tbody id="tbd"></tbody></table></div>
  <div class="ft" id="tft"></div></div>`;
 try{graficas()}catch(e){console.warn("Gráficas:",e)}
 $("fQ").value=S.q;$("fC").value=S.cat;$("fE").value=S.est;
 $("fQ").oninput=e=>{S.q=e.target.value;S.n=60;tabla()};$("fC").onchange=e=>{S.cat=e.target.value;S.n=60;tabla()};$("fE").onchange=e=>{S.est=e.target.value;S.n=60;tabla()};
 $("bCsv").onclick=csv;
 $("thd").onclick=e=>{const th=e.target.closest("th");if(!th||th.dataset.k==="foto")return;const k=th.dataset.k;if(S.ord===k)S.dir*=-1;else{S.ord=k;S.dir=(k==="nombre"||k==="cat"||k==="codigo")?1:-1}tabla()};

 $("rSg").onclick=e=>{const b=e.target.closest("[data-p]");if(!b)return;R.p=b.dataset.p;if(R.p==="per"&&!R.d){const t=dia(new Date());R.d=dia(Date.now()-6*864e5);R.h=t}pintar()};
 if($("rD")){$("rD").onchange=e=>{R.d=e.target.value;pintar()};$("rH").onchange=e=>{R.h=e.target.value;pintar()}}
 $("smD").onchange=e=>{SM.dias=+e.target.value;SM.n=40;sinMov()};sinMov();
 if($("bMeta"))$("bMeta").onclick=editarMetas;
 tabla()}

function sinMov(){
 const lim=Date.now()-SM.dias*864e5,L=P.filter(p=>p.stock>0&&p.ultima<lim).sort((a,b)=>b.valor-a.valor),tot=L.reduce((s,p)=>s+p.valor,0),und=L.reduce((s,p)=>s+p.stock,0);
 const vis=L.slice(0,SM.n);
 $("smB").innerHTML=L.length?`<p class="hint">${num(L.length)} producto${L.length===1?"":"s"} · ${num(und)} unidades · <b>${money(tot)}</b> inmovilizados (precio final × stock). Ideal para promociones o liquidación. La última venta se busca en los últimos 2 años.</p>
  <div class="tw" style="max-height:50vh"><table class="xl"><thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="r">Stock</th><th class="r">Valor</th><th>Última venta</th><th class="r">Días sin vender</th></tr></thead><tbody>${vis.map(p=>`<tr><td>${esc(p.codigo)}</td><td>${esc(p.nombre)}</td><td>${esc(p.cat)}</td><td class="r">${num(p.stock)}</td><td class="r">${money(p.valor)}</td><td>${p.ultima?dia(p.ultima):"Sin ventas"}</td><td class="r">${p.ultima?num(Math.floor((Date.now()-p.ultima)/864e5)):"—"}</td></tr>`).join("")}</tbody></table></div>${L.length>SM.n?'<div class="ft"><span></span><button class="btn g" id="smMas" type="button">Mostrar más</button></div>':""}`:`<div class="nod" style="padding:24px 0">Todo lo que tiene stock se ha vendido en los últimos ${SM.dias} días.</div>`;
 const m=$("smMas");if(m)m.onclick=()=>{SM.n+=100;sinMov()}}

async function editarMetas(){
 const d=document.createElement("dialog");d.className="dday";d.innerHTML=`<form method="dialog" style="padding:18px;display:grid;gap:10px"><h3 style="margin:0">Metas de venta</h3><label>Meta diaria ($)<input id="mD" type="number" min="0" step="0.01" value="${META.dia||""}" placeholder="0 = sin meta" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:10px"></label><label>Meta mensual ($)<input id="mM" type="number" min="0" step="0.01" value="${META.mes||""}" placeholder="0 = sin meta" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:10px"></label><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn g" value="x">Cancelar</button><button class="btn" id="mOk" value="ok">Guardar</button></div></form>`;
 document.body.appendChild(d);d.showModal();
 d.querySelector("#mOk").onclick=async e=>{e.preventDefault();try{for(const [t,i] of [["dia","mD"],["mes","mM"]]){const v=+d.querySelector("#"+i).value||0;const r=await db.rpc("guardar_meta_venta",{p_tipo:t,p_monto:v});if(r.error)throw new Error(r.error.message);META[t]=v}d.close();toast("Metas guardadas");pintar()}catch(x){toast("No se pudo guardar: "+(x.message||x))}};
 d.addEventListener("close",()=>d.remove())}

async function iniciar(){
 $("dash").innerHTML='<div class="nod">Cargando datos…</div>';
 try{await cargar();pintar()}catch(e){$("dash").innerHTML='<div class="nod">No se pudieron cargar los datos: '+esc(e.message||e)+'</div>'}}
$("bRef").onclick=async()=>{await iniciar();toast("Datos actualizados")};
addEventListener("day:perfil",()=>{});
iniciar();
})();
