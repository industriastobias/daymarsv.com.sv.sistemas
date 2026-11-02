/* DAYMARSV · Finanzas simple (solo administradores)
   Idea: el dinero de las ventas es una caja. De ahí salen las compras (productos, insumos, envíos…).
   Lo que pagaste con tu tarjeta o tu bolsillo es "lo que puse yo". */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,norm,fdate,fetchAll,espera,modal,pedirClave,excel,rango,deb}=UI;
const me=await requireSession();if(!me)return;
if(me.rol!=="admin"){location.replace("menu.html");return}
mountSide($("side"),"finanzas",me.rol);$("app").classList.remove("hidden");
const $n=n=>n<0?"−"+$$(-n):$$(n);
const S={q:"all",desde:"",hasta:"",V:[],M:[],K:[],C:[],PC:[],VD:[],f:"all"};
const hoy=()=>ymd(new Date());
const CAT_IN=["Venta","Otro ingreso"],CAT_OUT=["Productos","Insumos y empaques","Tarjetas y etiquetas","Envíos","Impuestos y aduanas","Publicidad","Pago de préstamo","Otros"];
const COL=["#6B2D3E","#C9973F","#d9822b","#2f7d4f","#4a6fa5","#9b5de5","#8d8d8d"];

async function cargar(){
 if(S.q!=="custom"){[S.desde,S.hasta]=rango(S.q)}
 const d0=new Date(S.desde+"T00:00:00-06:00"),d1=new Date(S.hasta+"T00:00:00-06:00");d1.setDate(d1.getDate()+1);
 const [v,m,k,c,pc,vd]=await Promise.all([
  db.rpc("fin_ventas_mensuales",{p_desde:S.desde,p_hasta:S.hasta}),
  fetchAll(()=>db.from("fin_movimientos").select("*").gte("fecha",S.desde).lte("fecha",S.hasta).order("fecha",{ascending:false}).order("created_at",{ascending:false})),
  fetchAll(()=>db.from("capital_movs").select("tipo,monto,fecha").gte("fecha",S.desde).lte("fecha",S.hasta)).catch(()=>[]),
  fetchAll(()=>db.from("fin_cuentas").select("id,tipo,tercero,concepto,monto,abonado,estado,vence,fecha").order("vence",{ascending:true,nullsFirst:false})).catch(()=>[]),
  fetchAll(()=>db.from("ventas").select("numero,cliente_nombre,pendiente_monto").eq("estado","pendiente").eq("tipo","cobro_pendiente")).catch(()=>[]),
  fetchAll(()=>db.from("ventas").select("id,numero,created_at,total,cliente_nombre,metodo_pago").eq("estado","completada").gte("created_at",d0.toISOString()).lt("created_at",d1.toISOString()).order("created_at",{ascending:false})).catch(()=>[])]);
 if(v.error)throw new Error(v.error.message);
 S.V=v.data||[];S.M=m;S.K=k;S.C=c;S.PC=pc;S.VD=vd}

const sum=a=>a.reduce((t,x)=>t+(+x.monto||0),0);
const esSal=m=>m.tipo!=="ingreso";
function calc(){
 const ventas=S.V.reduce((t,x)=>t+ +x.ventas,0),otros=sum(S.M.filter(m=>m.tipo==="ingreso"));
 const salV=sum(S.M.filter(m=>esSal(m)&&m.origen!=="propio")),salP=sum(S.M.filter(m=>esSal(m)&&m.origen==="propio"));
 const inv=sum(S.K.filter(k=>k.tipo==="inversion"));
 const entro=ventas+otros,queda=entro-salV,puse=salP+inv;
 const debo=S.C.filter(c=>c.tipo==="pagar"&&c.estado==="pendiente").reduce((t,c)=>t+c.monto-c.abonado,0);
 const deben=S.C.filter(c=>c.tipo==="cobrar"&&c.estado==="pendiente").reduce((t,c)=>t+c.monto-c.abonado,0)+S.PC.reduce((t,v)=>t+(+v.pendiente_monto||0),0);
 return {entro,salV,queda,puse,res:queda-puse,debo,deben}}

function donut(items){
 const tot=items.reduce((t,x)=>t+x[1],0);if(!tot)return `<div class="empty">Todavía no hay salidas en este periodo.</div>`;
 const R=80,r=50,cx=100,cy=100;let a0=-Math.PI/2,sv="";
 const P=(rr,a)=>(cx+rr*Math.cos(a)).toFixed(2)+" "+(cy+rr*Math.sin(a)).toFixed(2);
 items.forEach(([n,v],i)=>{const f=v/tot,a1=a0+f*2*Math.PI-(f===1?1e-4:0),L=a1-a0>Math.PI?1:0;
  sv+=`<path d="M${P(R,a0)} A${R} ${R} 0 ${L} 1 ${P(R,a1)} L${P(r,a1)} A${r} ${r} 0 ${L} 0 ${P(r,a0)}Z" style="fill:${COL[i%COL.length]}"><title>${esc(n)} ${$$(v)}</title></path>`;a0=a1});
 const li=items.map(([n,v],i)=>`<li><i style="background:${COL[i%COL.length]}"></i><span>${esc(n)}</span><b>${$$(v)}</b><small>${(v/tot*100).toFixed(0)}%</small></li>`).join("");
 return `<div class="pie"><svg viewBox="0 0 200 200" role="img" aria-label="En qué se fue el dinero">${sv}<text x="100" y="95" text-anchor="middle" class="pc1">Salió</text><text x="100" y="115" text-anchor="middle" class="pc2">${$$(tot)}</text></svg><ul>${li}</ul></div>`}

function pintar(){
 const c=calc();
 $("vEnt").textContent="+"+$$(c.entro);$("vSal").textContent="−"+$$(c.salV);
 const q=$("vQue");q.textContent=$n(c.queda);q.className=c.queda>=0?"pos":"neg";
 const bn=$("vRes");bn.className="banner "+(c.puse<=0?"":c.res>=0?"ok":"mal");
 bn.innerHTML=c.puse<=0?`<span class="bi">i</span><p>Sin inversión propia en este periodo.</p>`:c.res>=0?`<span class="bi">✓</span><p>Ya recuperaste tu inversión. Ganancia: <b>${$$(c.res)}</b></p>`:`<span class="bi">!</span><p>Te faltan <b>${$$(-c.res)}</b> para recuperar tu inversión</p>`;
 $("vDeu").innerHTML=`<div><span>Inversión</span><b>${$$(c.puse)}</b></div><a href="#cue"><span>Debo</span><b>${$$(c.debo)}</b></a><a href="#cue"><span>Me deben</span><b>${$$(c.deben)}</b></a>`;
 deudas();
 const cat={};S.M.filter(esSal).forEach(m=>{const k=(m.categoria||"Otros").trim()||"Otros";cat[k]=(cat[k]||0)+ +m.monto});
 let it=Object.entries(cat).sort((a,b)=>b[1]-a[1]);if(it.length>6){const o=it.slice(6).reduce((t,x)=>t+x[1],0);it=it.slice(0,6);it.push(["Otros",o])}
 $("vGraf").innerHTML=donut(it);
 $("fBar").querySelectorAll("[data-q]").forEach(b=>b.classList.toggle("on",b.dataset.q===S.q));
 lista();informe()}

function lista(){
 const q=norm($("mQ").value),R=[];
 S.M.forEach(m=>{const ent=m.tipo==="ingreso";if(S.f==="in"&&!ent||S.f==="out"&&ent)return;if(q&&!norm((m.categoria||"")+" "+(m.descripcion||"")).includes(q))return;R.push({k:"m",m,ts:new Date(m.fecha+"T12:00:00-06:00").getTime()})});
 if(S.f!=="out")S.VD.forEach(v=>{if(q&&!norm("venta "+v.numero+" "+(v.cliente_nombre||"")+" "+(v.metodo_pago||"")).includes(q))return;R.push({k:"v",v,ts:new Date(v.created_at).getTime()})});
 R.sort((a,b)=>b.ts-a.ts);
 $("mSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===S.f));
 $("mL").innerHTML=R.length?R.slice(0,100).map(r=>{
  if(r.k==="v"){const v=r.v;return `<div class="rw mv"><span class="mi in">↑</span><div class="ti"><b>Venta #${v.numero}${v.cliente_nombre?" · "+esc(v.cliente_nombre):""}</b><small>${fdate(v.created_at)}${v.metodo_pago?" · "+esc(v.metodo_pago):""} · del sistema de ventas</small></div><div class="am2"><b class="pos">+${$$(+v.total)}</b></div></div>`}
  const m=r.m,ent=m.tipo==="ingreso";return `<div class="rw mv" data-id="${m.id}"><span class="mi ${ent?"in":"out"}">${ent?"↑":"↓"}</span><div class="ti"><b>${esc(m.categoria||"")}</b><small>${esc(m.descripcion||"")}</small><small>${fdate(m.fecha)}${ent?"":" · "+(m.origen==="propio"?"mi bolsillo / tarjeta":"de las ventas")}</small></div><div class="am2"><b class="${ent?"pos":"neg"}">${ent?"+":"−"}${$$(+m.monto)}</b></div></div>`}).join("")+(R.length>100?`<p class="hint">Mostrando 100 de ${R.length}. Usa el buscador o acorta el periodo.</p>`:""):`<div class="empty card">No hay movimientos.</div>`}

function anotar(m){
 m=m||{tipo:"gasto",fecha:ymd(new Date()),categoria:"",descripcion:"",monto:"",origen:"ventas"};
 let ent=m.tipo==="ingreso",or=m.origen==="propio"?"propio":"ventas";
 const d=modal(m.id?"Editar movimiento":"Anotar",`
  <div class="tp" id="aT"><button type="button" data-e="0" class="${ent?"":"on"}">Salió dinero</button><button type="button" data-e="1" class="${ent?"on":""}">Entró dinero</button></div>
  <div class="fg"><div><label>Monto ($)</label><input name="mo" type="number" min="0.01" step="0.01" inputmode="decimal" value="${m.monto}" autofocus></div><div><label>Fecha</label><input name="f" type="date" value="${m.fecha}"></div>
  <div class="full"><label>¿En qué? <small>(elige o escribe)</small></label><input name="c" list="dlC" maxlength="60" value="${esc(m.categoria)}"><datalist id="dlC"></datalist></div>
  <div class="full" id="aO"><label>¿De dónde salió el dinero?</label><div class="tp" id="aOr"><button type="button" data-o="ventas" class="${or==="ventas"?"on":""}">De las ventas</button><button type="button" data-o="propio" class="${or==="propio"?"on":""}">De mi bolsillo / tarjeta</button></div></div>
  <div class="full"><label>Nota <small>(opcional)</small></label><input name="d" maxlength="160" value="${esc(m.descripcion||"")}"></div></div><div class="err2" id="aE" role="alert"></div>`,
  {foot:`${m.id?'<button class="btn g" id="aDel" style="color:var(--bad);margin-right:auto">Eliminar</button>':""}<button class="btn g" data-x>Cancelar</button><button class="btn" id="aOk">Guardar</button>`});
 const ref=()=>{d.q("#dlC").innerHTML=(ent?CAT_IN:CAT_OUT).map(c=>`<option>${esc(c)}`).join("");d.q("#aO").style.display=ent?"none":"";d.el.querySelectorAll("#aT button").forEach(b=>b.classList.toggle("on",(b.dataset.e==="1")===ent))};ref();
 d.q("#aT").addEventListener("click",e=>{const b=e.target.closest("[data-e]");if(!b)return;ent=b.dataset.e==="1";ref()});
 d.q("#aOr").addEventListener("click",e=>{const b=e.target.closest("[data-o]");if(!b)return;or=b.dataset.o;d.el.querySelectorAll("#aOr button").forEach(x=>x.classList.toggle("on",x===b))});
 const g=n=>d.q(`[name=${n}]`).value.trim();
 d.q("#aOk").onclick=async()=>{const mo=Number(g("mo"));if(!(mo>0)){d.q("#aE").textContent="Escribe un monto mayor a cero.";return}if(!g("f")){d.q("#aE").textContent="Elige la fecha.";return}if(!g("c")){d.q("#aE").textContent="Escribe en qué fue.";return}
  const row={tipo:ent?"ingreso":(m.tipo&&m.tipo!=="ingreso"?m.tipo:"gasto"),fecha:g("f"),monto:r2(mo),categoria:g("c"),descripcion:g("d")||null,origen:ent?"ventas":or};
  const ok=await espera(async()=>{const {error}=m.id?await db.from("fin_movimientos").update(row).eq("id",m.id):await db.from("fin_movimientos").insert({...row,metodo:"Efectivo",creado_por:me.id});if(error)throw new Error(error.message);return true});
  if(ok){d.close();toast("Guardado");await refrescar()}};
 const del=d.q("#aDel");if(del)del.onclick=async()=>{if(!await pedirClave("Vas a eliminar este movimiento."))return;
  const ok=await espera(async()=>{const {error}=await db.from("fin_movimientos").delete().eq("id",m.id);if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Eliminado");await refrescar()}}}


/* ---------- Deudas: lo que debo y lo que me deben ---------- */
function deudas(){
 const P=S.C.filter(c=>c.estado==="pendiente"),pcs=S.PC.filter(v=>+v.pendiente_monto>0);
 $("dL").innerHTML=(!P.length&&!pcs.length?`<div class="empty">No hay deudas pendientes.</div>`:"")+P.map(c=>{const venc=c.vence&&c.vence<hoy(),pag=c.tipo==="pagar";return `<div class="rw"><div class="ti"><b>${pag?"Debo":"Me deben"} · ${esc(c.tercero)}</b><small>${esc(c.concepto||"")}${c.vence?" · vence "+fdate(c.vence):""}${venc?' · <span class="neg">vencida</span>':""}</small></div><div class="am2"><b class="${pag?"neg":"pos"}">${$$(c.monto-c.abonado)}</b><small>de ${$$(c.monto)}</small></div><button class="btn sm" data-ab="${c.id}">${pag?"Abonar":"Cobrar"}</button></div>`}).join("")
 +pcs.map(v=>`<div class="rw"><div class="ti"><b>Me deben · ${esc(v.cliente_nombre||"Cliente")}</b><small>Venta #${v.numero} con cobro pendiente</small></div><div class="am2"><b class="pos">${$$(+v.pendiente_monto)}</b></div></div>`).join("")}
$("dL").addEventListener("click",e=>{const b=e.target.closest("[data-ab]");if(!b)return;const c=S.C.find(x=>x.id===b.dataset.ab);if(!c)return;const sal=r2(c.monto-c.abonado),pag=c.tipo==="pagar";
 const d=modal(pag?"Abonar a la deuda":"Registrar cobro",`<p style="margin-top:0"><b>${esc(c.tercero)}</b> · saldo ${$$(sal)}</p><label>Monto ($)</label><input name="a" type="number" min="0.01" step="0.01" max="${sal}" value="${sal}" inputmode="decimal"><p class="hint">${pag?"Se anota como salida de las ventas.":"Se anota como entrada."}</p><div class="err2" id="abE" role="alert"></div>`,{foot:'<button class="btn g" data-x>Cancelar</button><button class="btn" id="abOk">Guardar</button>'});
 d.q("#abOk").onclick=async()=>{const a=r2(Number(d.q("[name=a]").value));if(!(a>0)||a>sal){d.q("#abE").textContent="El monto debe ser mayor a cero y no pasar de "+$$(sal);return}
  const ok=await espera(async()=>{const {error}=await db.rpc("abonar_cuenta",{p_id:c.id,p_monto:a});if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Guardado");await refrescar()}}});
$("dNew").onclick=()=>{let pag=true;
 const d=modal("Nueva deuda",`<div class="tp" id="dT"><button type="button" data-p="1" class="on">Yo debo</button><button type="button" data-p="0">Me deben</button></div><div class="fg"><div class="full"><label>¿A quién?</label><input name="t" maxlength="80"></div><div><label>Monto ($)</label><input name="m" type="number" min="0.01" step="0.01" inputmode="decimal"></div><div><label>Vence <small>(opcional)</small></label><input name="v" type="date"></div><div class="full"><label>Nota <small>(opcional)</small></label><input name="c" maxlength="120"></div></div><div class="err2" id="dE" role="alert"></div>`,{foot:'<button class="btn g" data-x>Cancelar</button><button class="btn" id="dOk">Guardar</button>'});
 d.q("#dT").addEventListener("click",e=>{const b=e.target.closest("[data-p]");if(!b)return;pag=b.dataset.p==="1";d.el.querySelectorAll("#dT button").forEach(x=>x.classList.toggle("on",x===b))});
 d.q("#dOk").onclick=async()=>{const g=n=>d.q(`[name=${n}]`).value.trim(),mo=Number(g("m"));if(!g("t")){d.q("#dE").textContent="Escribe a quién.";return}if(!(mo>0)){d.q("#dE").textContent="Escribe un monto mayor a cero.";return}
  const ok=await espera(async()=>{const {error}=await db.from("fin_cuentas").insert({tipo:pag?"pagar":"cobrar",tercero:g("t"),concepto:g("c")||null,monto:r2(mo),vence:g("v")||null});if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Guardado");await refrescar()}}};

/* ---------- Informes ---------- */
const mkey=d=>String(d).slice(0,7);
const mes=k=>{const [y,m]=k.split("-");return["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][+m-1]+" "+y.slice(2)};
function porMes(){
 const o={};const g=k=>o[k]=o[k]||{e:0,s:0};
 S.V.forEach(x=>{g(mkey(x.mes)).e+=+x.ventas});
 S.M.forEach(m=>{const r=g(mkey(m.fecha));if(m.tipo==="ingreso")r.e+=+m.monto;else if(m.origen!=="propio")r.s+=+m.monto});
 return Object.keys(o).sort().map(k=>[k,o[k].e,o[k].s,o[k].e-o[k].s])}
function porCat(){const cat={};S.M.filter(esSal).forEach(m=>{const k=(m.categoria||"Otros").trim()||"Otros";cat[k]=(cat[k]||0)+ +m.monto});return Object.entries(cat).sort((a,b)=>b[1]-a[1])}
function informe(){
 const c=calc(),cats=porCat(),tot=cats.reduce((t,x)=>t+x[1],0),pm=porMes(),t=(rows)=>rows.map(r=>`<tr>${r.map((x,i)=>`<${i?"td class=\"n\"":"td"}>${x}</${i?"td":"td"}>`).join("")}</tr>`).join("");
 $("iDoc").innerHTML=`<h3>Informe de finanzas</h3><p class="mn">Del ${fdate(S.desde)} al ${fdate(S.hasta)}</p>
 <h4>Resumen</h4><table class="tb"><tbody>${t([["Entró (ventas y otros ingresos)",$$(c.entro)],["Salió de las ventas","−"+$$(c.salV)],["<b>Queda en caja</b>","<b>"+$n(c.queda)+"</b>"],["Inversión (tarjeta o bolsillo)",$$(c.puse)],["<b>Recuperado (caja − inversión)</b>","<b>"+$n(c.res)+"</b>"],["Debo",$$(c.debo)],["Me deben",$$(c.deben)]])}</tbody></table>
 <h4>En qué se fue el dinero</h4><table class="tb"><tbody>${cats.length?t(cats.map(([n,v])=>[esc(n),$$(v)+" · "+(tot?(v/tot*100).toFixed(0):0)+"%"])):'<tr><td>Sin salidas</td></tr>'}</tbody></table>
 <h4>Mes por mes</h4><table class="tb"><thead><tr><th>Mes</th><th class="n">Entró</th><th class="n">Salió</th><th class="n">Queda</th></tr></thead><tbody>${pm.length?t(pm.map(([k,e,s,q])=>[mes(k),$$(e),$$(s),$n(q)])):'<tr><td colspan="4">Sin datos</td></tr>'}</tbody></table>`}
$("iPr").onclick=()=>{document.body.classList.add("imp");setTimeout(()=>{window.print();document.body.classList.remove("imp")},50)};
$("iXls").onclick=()=>{const c=calc();excel("finanzas-informe",[
 {n:"Resumen",c:[["Concepto",38],["Monto",16,"money"]],f:[["Entró (ventas y otros ingresos)",c.entro],["Salió de las ventas",c.salV],["Queda en caja",c.queda],["Inversión",c.puse],["Recuperado",c.res],["Debo",c.debo],["Me deben",c.deben]]},
 {n:"Por categoría",c:[["Categoría",30],["Monto",14,"money"]],f:porCat()},
 {n:"Mes por mes",c:[["Mes",12],["Entró",14,"money"],["Salió",14,"money"],["Queda",14,"money"]],f:porMes().map(r=>[mes(r[0]),r[1],r[2],r[3]])},
 {n:"Movimientos",c:[["Fecha",12],["Entró / Salió",14],["En qué",26],["Nota",36],["Monto",12,"money"],["De dónde salió",20]],f:S.M.map(m=>[m.fecha,m.tipo==="ingreso"?"Entró":"Salió",m.categoria||"",m.descripcion||"",+m.monto,m.tipo==="ingreso"?"":(m.origen==="propio"?"Mi bolsillo / tarjeta":"De las ventas")])},
 {n:"Deudas",c:[["Tipo",12],["Persona",26],["Nota",30],["Monto",12,"money"],["Abonado",12,"money"],["Saldo",12,"money"],["Vence",12]],f:S.C.filter(x=>x.estado==="pendiente").map(x=>[x.tipo==="pagar"?"Debo":"Me deben",x.tercero,x.concepto||"",+x.monto,+x.abonado,+x.monto-+x.abonado,x.vence||""])}])};

async function refrescar(){await espera(async()=>{await cargar();return true});pintar()}
$("aNew").onclick=()=>anotar();
$("fBar").addEventListener("click",e=>{const b=e.target.closest("[data-q]");if(!b)return;S.q=b.dataset.q;refrescar()});
$("mSg").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(b){S.f=b.dataset.t;lista()}});
$("mQ").addEventListener("input",deb(lista,150));
$("mL").addEventListener("click",e=>{const r=e.target.closest("[data-id]");if(r)anotar(S.M.find(x=>x.id===r.dataset.id))});
$("mXls").onclick=()=>excel("finanzas-movimientos",[{n:"Movimientos",c:[["Fecha",12],["Entró / Salió",14],["En qué",26],["Nota",36],["Monto",12,"money"],["De dónde salió",20]],f:S.VD.map(v=>[String(v.created_at).slice(0,10),"Entró","Venta #"+v.numero,v.cliente_nombre||"",+v.total,""]).concat(S.M.map(m=>[m.fecha,m.tipo==="ingreso"?"Entró":"Salió",m.categoria||"",m.descripcion||"",+m.monto,m.tipo==="ingreso"?"":(m.origen==="propio"?"Mi bolsillo / tarjeta":"De las ventas")]))}]);
const IC={res:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',mov:'<path d="M7 7h13l-3-3M17 17H4l3 3"/>',cue:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',inf:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>'};
UI.pestanas([["res","Resumen",IC.res],["mov","Movimientos",IC.mov],["cue","Deudas",IC.cue],["inf","Informes",IC.inf]],k=>{$("fBar").classList.toggle("hidden",k==="cue")});
await refrescar();
})();
