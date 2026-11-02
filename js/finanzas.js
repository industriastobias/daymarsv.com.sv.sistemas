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
const S={q:"all",desde:"",hasta:"",V:[],M:[],K:[],C:[],PC:[],f:"all"};
const CAT_IN=["Venta","Otro ingreso"],CAT_OUT=["Productos","Insumos y empaques","Tarjetas y etiquetas","Envíos","Impuestos y aduanas","Publicidad","Pago de préstamo","Otros"];
const COL=["#6B2D3E","#C9973F","#d9822b","#2f7d4f","#4a6fa5","#9b5de5","#8d8d8d"];

async function cargar(){
 if(S.q!=="custom"){[S.desde,S.hasta]=rango(S.q)}
 const [v,m,k,c,pc]=await Promise.all([
  db.rpc("fin_ventas_mensuales",{p_desde:S.desde,p_hasta:S.hasta}),
  fetchAll(()=>db.from("fin_movimientos").select("*").gte("fecha",S.desde).lte("fecha",S.hasta).order("fecha",{ascending:false}).order("created_at",{ascending:false})),
  fetchAll(()=>db.from("capital_movs").select("tipo,monto,fecha").gte("fecha",S.desde).lte("fecha",S.hasta)).catch(()=>[]),
  fetchAll(()=>db.from("fin_cuentas").select("tipo,monto,abonado,estado")).catch(()=>[]),
  fetchAll(()=>db.from("ventas").select("pendiente_monto").eq("estado","pendiente").eq("tipo","cobro_pendiente")).catch(()=>[])]);
 if(v.error)throw new Error(v.error.message);
 S.V=v.data||[];S.M=m;S.K=k;S.C=c;S.PC=pc}

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
 $("vPuse").textContent=$$(c.puse);
 $("vRes").innerHTML=`<h3>3 · ¿Ya recuperé lo que puse?</h3>`+(c.puse<=0?`<p class="rt">No has puesto dinero propio en este periodo.</p>`:c.res>=0?`<p class="rt ok">Sí. Ya recuperaste lo que pusiste y te sobran <b>${$$(c.res)}</b> de ganancia.</p>`:`<p class="rt mal">Todavía no. Te faltan <b>${$$(-c.res)}</b> para recuperar lo que pusiste.</p>`)+`<p class="mn">Es lo que queda en caja (${$n(c.queda)}) menos lo que pusiste (${$$(c.puse)}).</p>`;
 $("vDeu").innerHTML=`<div><span>Debo</span><b>${$$(c.debo)}</b></div><div><span>Me deben</span><b>${$$(c.deben)}</b></div><div><a href="finanzas-avanzado.html" class="lk">Ver deudas y abonar ›</a></div>`;
 const cat={};S.M.filter(esSal).forEach(m=>{const k=(m.categoria||"Otros").trim()||"Otros";cat[k]=(cat[k]||0)+ +m.monto});
 let it=Object.entries(cat).sort((a,b)=>b[1]-a[1]);if(it.length>6){const o=it.slice(6).reduce((t,x)=>t+x[1],0);it=it.slice(0,6);it.push(["Otros",o])}
 $("vGraf").innerHTML=donut(it);
 $("fBar").querySelectorAll("[data-q]").forEach(b=>b.classList.toggle("on",b.dataset.q===S.q));
 lista()}

function lista(){
 const q=norm($("mQ").value);
 const L=S.M.filter(m=>(S.f==="all"||(S.f==="in"?m.tipo==="ingreso":m.tipo!=="ingreso"))&&(!q||norm((m.categoria||"")+" "+(m.descripcion||"")).includes(q)));
 $("mSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===S.f));
 $("mL").innerHTML=L.length?L.slice(0,80).map(m=>{const ent=m.tipo==="ingreso";return `<div class="rw mv" data-id="${m.id}"><div class="ti"><b>${esc(m.categoria||"")}</b><small>${esc(m.descripcion||"")}</small><small>${fdate(m.fecha)}${ent?"":" · "+(m.origen==="propio"?"mi bolsillo / tarjeta":"de las ventas")}</small></div><div class="am2"><b class="${ent?"pos":"neg"}">${ent?"+":"−"}${$$(+m.monto)}</b></div></div>`}).join("")+(L.length>80?`<p class="hint">Mostrando 80 de ${L.length}. Usa el buscador o acorta el periodo.</p>`:""):`<div class="empty card">No hay movimientos.</div>`}

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

async function refrescar(){await espera(async()=>{await cargar();return true});pintar()}
$("aNew").onclick=()=>anotar();
$("fBar").addEventListener("click",e=>{const b=e.target.closest("[data-q]");if(!b)return;S.q=b.dataset.q;refrescar()});
$("mSg").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(b){S.f=b.dataset.t;lista()}});
$("mQ").addEventListener("input",deb(lista,150));
$("mL").addEventListener("click",e=>{const r=e.target.closest("[data-id]");if(r)anotar(S.M.find(x=>x.id===r.dataset.id))});
$("mXls").onclick=()=>excel("finanzas-movimientos",[{n:"Movimientos",c:[["Fecha",12],["Entró / Salió",14],["En qué",26],["Nota",36],["Monto",12,"money"],["De dónde salió",20]],f:S.M.map(m=>[m.fecha,m.tipo==="ingreso"?"Entró":"Salió",m.categoria||"",m.descripcion||"",+m.monto,m.tipo==="ingreso"?"":(m.origen==="propio"?"Mi bolsillo / tarjeta":"De las ventas")])}]);
await refrescar();
})();
