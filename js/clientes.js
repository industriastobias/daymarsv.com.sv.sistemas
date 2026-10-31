/* DAYMAR-SHOP · Clientes · conectado a Supabase */
(async()=>{
"use strict";
const {db,esc,$$,ymd,toast,mountSide,requireSession}=DAY;
const {$,r2,fdate,deb,rpc,fetchAll,espera,modal,confirmar,pedirClave,excel,norm}=UI;
const me=await requireSession();if(!me)return;
const ADM=me.rol==="admin";
mountSide($("side"),"clientes",me.rol);$("app").classList.remove("hidden");$("bnav").remove();
document.querySelector("main").style.paddingBottom="30px";
const S={C:[],V:[],F:[],CU:[],PE:[],DV:[],orden:"nombre"};
const AVC=[["#6b2737","#f0d9de"],["#8a5a1f","#f6e6c8"],["#2f5d50","#d8ece5"],["#3d4f7c","#dbe2f4"],["#7a3b6e","#f0dcec"],["#5b4636","#eadfd6"],["#a04a2c","#f7ddd2"],["#2f6a7a","#d6eaf0"]];
function avatar(n){let h=0;for(const ch of String(n||"?"))h=(h*31+ch.charCodeAt(0))>>>0;const [f,b]=AVC[h%AVC.length],g=h%3===0?"M28 64c0-13 9-21 22-21s22 8 22 21z":h%3===1?"M26 66c2-14 10-22 24-22s22 8 24 22z":"M30 64c0-12 8-20 20-20s20 8 20 20z";
 return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><rect width="100" height="100" fill="${b}"/><circle cx="50" cy="32" r="${15+h%3}" fill="${f}"/><path d="${g}" transform="translate(0 6)" fill="${f}"/></svg>`}
const ini=n=>(n||"?").trim().charAt(0).toUpperCase()||"?";
/* ---------- datos ---------- */
async function cargar(){
 const [c,v,f,cu,pe,dv]=await Promise.all([
  fetchAll(()=>db.from("clientes").select("*").order("nombre")),
  fetchAll(()=>db.from("ventas").select("id,numero,total,created_at,cliente_id,cliente_nombre").eq("estado","completada").or("cliente_id.not.is.null,cliente_nombre.not.is.null").order("created_at",{ascending:false})),
  fetchAll(()=>db.from("facturas").select("id,numero,fecha,total,cliente_nombre,estado").eq("estado","emitida").not("cliente_nombre","is",null).order("fecha",{ascending:false})),
  ADM?fetchAll(()=>db.from("fin_cuentas").select("*").eq("tipo","cobrar").eq("estado","pendiente").order("vence",{ascending:true,nullsFirst:false})):[],
  fetchAll(()=>db.from("ventas").select("id,numero,created_at,cliente_nombre,pendiente_monto,total").eq("estado","pendiente").eq("tipo","cobro_pendiente")),
  fetchAll(()=>db.from("devoluciones").select("id,numero,fecha,tipo,cliente_nombre,monto_devuelto,diferencia").order("fecha",{ascending:false}))]);
 S.C=c;S.V=v;S.F=f;S.CU=cu;S.PE=pe;S.DV=dv;
 const mapa={};S.C.forEach(x=>{mapa[norm(x.nombre)]=x.id});
 S.stats={};
 S.C.forEach(x=>S.stats[x.id]={n:0,t:0,u:null,ventas:[],facs:[],cuentas:[],pend:[],devs:[],deuda:0});
 S.V.forEach(x=>{const id=x.cliente_id&&S.stats[x.cliente_id]?x.cliente_id:mapa[norm(x.cliente_nombre)];if(!id)return;const o=S.stats[id];o.n++;o.t+=+x.total;o.ventas.push(x);if(!o.u||x.created_at>o.u)o.u=x.created_at});
 S.F.forEach(x=>{const id=mapa[norm(x.cliente_nombre)];if(id)S.stats[id].facs.push(x)});
 S.CU.forEach(x=>{const id=x.cliente_id&&S.stats[x.cliente_id]?x.cliente_id:mapa[norm(x.tercero)];if(id){const o=S.stats[id];o.cuentas.push(x);o.deuda+=+x.monto-+x.abonado}});
 S.PE.forEach(x=>{const id=mapa[norm(x.cliente_nombre)];if(id){const o=S.stats[id];o.pend.push(x);o.deuda+=+x.pendiente_monto}});
 S.DV.forEach(x=>{const id=mapa[norm(x.cliente_nombre)];if(id)S.stats[id].devs.push(x)})}
/* ---------- lista ---------- */
function filtrados(){
 const q=norm($("cQ").value);let L=S.C.filter(c=>!q||norm([c.nombre,c.codigo,c.telefono,c.correo,c.documento].join(" ")).includes(q));
 const st=c=>S.stats[c.id];
 if(S.orden==="gasto")L=L.slice().sort((a,b)=>st(b).t-st(a).t);else if(S.orden==="deuda")L=L.filter(c=>st(c).deuda>0).sort((a,b)=>st(b).deuda-st(a).deuda);else if(S.orden==="reciente")L=L.slice().sort((a,b)=>(st(b).u||"").localeCompare(st(a).u||""));
 return L}
const waUrl=(c,s)=>{let t=String(c.telefono||"").replace(/\D/g,"");if(t.length===8)t="503"+t;if(t.length<8)return "";
 const m=`Hola ${c.nombre}, te escribimos de DAYMARSV.`+(s&&s.deuda>0?` Tienes un saldo pendiente de ${$$(s.deuda)}.`:"");return "https://wa.me/"+t+"?text="+encodeURIComponent(m)};
function pintar(){
 const act=S.C.filter(c=>S.stats[c.id].n>0).length,tot=S.C.reduce((s,c)=>s+S.stats[c.id].t,0),deu=S.C.reduce((s,c)=>s+S.stats[c.id].deuda,0);
 $("cK").innerHTML=`<div><span>Clientes</span><b>${S.C.length}</b></div><div><span>Con compras</span><b>${act}</b></div><div><span>Vendido a clientes</span><b>${$$(tot)}</b></div><div><span>Por cobrar</span><b class="${deu>0?"neg":""}">${$$(deu)}</b><small>${S.C.filter(c=>S.stats[c.id].deuda>0).length} cliente(s)</small></div>`;
 $("cSg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.o===S.orden));
 const L=filtrados();
 $("cL").innerHTML=L.length?L.slice(0,400).map(c=>{const s=S.stats[c.id];
  return `<div class="rw" data-c="${c.id}" style="cursor:pointer"><div class="th ph" style="padding:0;overflow:hidden;border-radius:50%">${avatar(c.nombre)}</div><div class="ti"><b>${esc(c.nombre)}</b><small>${esc([c.codigo,c.telefono,c.correo].filter(Boolean).join(" · ")||"Sin contacto")}${c.acepta_promos?" · ✉ promos":""}</small></div>
  ${waUrl(c,s)?`<a class="cwa" href="${waUrl(c,s)}" target="_blank" rel="noopener" aria-label="WhatsApp de ${esc(c.nombre)}" title="Escribir por WhatsApp" style="flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#25d366;color:#fff;margin-right:8px"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.6.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.6-1.2a.5.5 0 000-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.4.8 3.2.7a2.7 2.7 0 001.8-1.3 2.2 2.2 0 00.2-1.3c-.1-.1-.3-.2-.6-.3z"/></svg></a>`:""}<div class="am2"><b>${$$(s.t)}</b><br><small>${s.n} compra${s.n===1?"":"s"}${s.u?" · "+fdate(s.u):""}</small>${s.deuda>0?`<br><span class="bd or">Debe ${$$(s.deuda)}</span>`:""}</div></div>`}).join("")
  :`<div class="empty card">${S.C.length?"Ningún cliente coincide con la búsqueda.":"Aún no hay clientes. Toca “Nuevo cliente” para crear el primero."}</div>`}
/* ---------- formulario ---------- */
function form(c){
 c=c||{};const nuevo=!c.id;
 const d=modal(nuevo?"Nuevo cliente":"Editar cliente",`<div class="fg"><div class="full"><label>Nombre</label><input name="n" maxlength="100" value="${esc(c.nombre||"")}" autocomplete="off"></div>
  <div><label>Teléfono</label><input name="t" type="tel" maxlength="30" inputmode="tel" value="${esc(c.telefono||"")}"></div><div><label>Correo</label><input name="c" type="email" maxlength="100" value="${esc(c.correo||"")}"></div>
  <div><label>DUI / NIT <small>(para factura)</small></label><input name="d" maxlength="30" value="${esc(c.documento||"")}"></div><div><label>Dirección <small>(opcional)</small></label><input name="a" maxlength="200" value="${esc(c.direccion||"")}"></div>
  <div class="full"><label>Notas <small>(opcional)</small></label><input name="o" maxlength="300" value="${esc(c.notas||"")}"></div><div class="full"><label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="ap" ${c.acepta_promos?"checked":""} style="width:auto;flex:none"> Acepta recibir promociones por correo</label>${c.baja_promos_en&&!c.acepta_promos?`<small style="color:var(--mute)">Se dio de baja el ${fdate(c.baja_promos_en)}.</small>`:""}</div></div><div class="err2" id="fE" role="alert"></div>`,
  {foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="fOk">Guardar</button>`});
 const g=n=>d.q(`[name=${n}]`).value.trim();setTimeout(()=>d.q("[name=n]").focus(),60);
 d.q("#fOk").onclick=async()=>{if(!g("n")){d.q("#fE").textContent="Escribe el nombre del cliente.";return}
  const dup=S.C.find(x=>x.id!==c.id&&(norm(x.nombre)===norm(g("n"))||(g("t")&&x.telefono&&x.telefono.replace(/\D/g,"")===g("t").replace(/\D/g,""))));
  if(dup&&!await confirmar(`Ya existe un cliente parecido: <b>${esc(dup.nombre)}</b>${dup.telefono?" ("+esc(dup.telefono)+")":""}. ¿Guardar igual?`,{titulo:"Posible duplicado",ok:"Guardar igual"}))return;
  const row={nombre:g("n"),telefono:g("t")||null,correo:g("c")||null,documento:g("d")||null,direccion:g("a")||null,notas:g("o")||null};
  const ap=d.q("[name=ap]").checked&&!!g("c");if(d.q("[name=ap]").checked&&!g("c")){d.q("#fE").textContent="Para activar las promociones, escribe el correo del cliente.";return}
  if(ap!==!!c.acepta_promos||!c.id){row.acepta_promos=ap;if(ap)row.baja_promos_en=null}
  const ok=await espera(async()=>{const {error}=c.id?await db.from("clientes").update(row).eq("id",c.id):await db.from("clientes").insert(row);if(error)throw new Error(/documento|direccion/.test(error.message)?"Falta aplicar la migración de clientes (002_clientes.sql).":error.message);return true});
  if(ok){d.close();toast("Cliente guardado");await recargar()}}}

/* ---------- promociones por correo ---------- */
async function promo(){
 let cfg={},codes=[],hoy={enviados:0,limite:250};
 try{const {data}=await db.from("config_negocio").select("*").eq("id",1).maybeSingle();cfg=data||{}}catch(e){}
 try{const {data}=await db.from("promo_codigos").select("codigo,pct").eq("activo",true);codes=data||[]}catch(e){}
 let st=null;try{st=await rpc("config_correo_estado")}catch(e){}
 if(!st||!st.listo){toast("Primero configura el correo (Finanzas → Datos del negocio, administrador principal)");return}
 try{hoy=await rpc("correos_hoy")}catch(e){}
 const dias=c=>{const u=S.stats[c.id]&&S.stats[c.id].u;return u?(Date.now()-new Date(u))/864e5:Infinity};
 const OK=S.C.filter(c=>c.correo&&c.acepta_promos).sort((a,b)=>a.nombre.localeCompare(b.nombre));
 const sinAcep=S.C.filter(c=>c.correo&&!c.acepta_promos&&!c.baja_promos_en).length;
 const opt=(v,t,n)=>`<option value="${v}">${t} (${n})</option>`;
 const m=modal("Enviar promoción por correo",`
  <p class="pw" style="margin-top:0" id="pmH">Hoy van <b>${hoy.enviados}</b> correos de <b>${hoy.limite}</b> permitidos. Solo se envía a clientes que aceptan promociones y tienen correo.</p>
  <div class="fg"><div class="full"><label>Destinatarios</label><select id="pmD">${opt("todos","Todos los que aceptan promociones",OK.length)}${opt("30","Compraron en los últimos 30 días",OK.filter(c=>dias(c)<=30).length)}${opt("90","Compraron en los últimos 90 días",OK.filter(c=>dias(c)<=90).length)}${opt("no90","No han comprado en 90 días",OK.filter(c=>dias(c)>90).length)}<option value="man">Elegir manualmente…</option></select></div>
  <div class="full hidden" id="pmMan" style="max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px">${OK.map(c=>`<label style="display:flex;gap:8px;align-items:center;font-weight:500;padding:4px"><input type="checkbox" data-pc="${c.id}" style="width:auto;flex:none"> ${esc(c.nombre)} <small style="color:var(--mute)">${esc(c.correo)}</small></label>`).join("")||'<p class="hint">Ningún cliente acepta promociones todavía.</p>'}</div>
  ${sinAcep?`<div class="full"><small>Hay ${sinAcep} cliente(s) con correo que aún no aceptan promociones. <button class="btn g sm" id="pmAct" type="button">Activarles las promociones</button></small></div>`:""}
  <div class="full"><label>Asunto</label><input id="pmS" maxlength="120" value="¡Una promoción para ti, {{NOMBRE}}!"></div>
  <div class="full"><label>Mensaje <small>(usa {{NOMBRE}} para poner su nombre)</small></label><textarea id="pmM" rows="5" maxlength="1200" style="width:100%">Hola {{NOMBRE}}, tenemos novedades y una promoción pensada para ti. ¡Esperamos verte pronto!</textarea></div>
  <div><label>Código de descuento</label><select id="pmC"><option value="">Sin código</option>${codes.map(c=>`<option value="${esc(c.codigo)}">${esc(c.codigo)} · ${+c.pct}%</option>`).join("")}</select></div>
  <div style="display:flex;align-items:end"><label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="pmP" checked style="width:auto;flex:none"> Incluir productos nuevos</label></div></div>
  <p class="hint" id="pmN"></p><div class="err2" id="pmE"></div>`,
  {foot:`<button class="btn g" data-x>Cerrar</button><button class="btn g" id="pmV" type="button">Vista previa</button><button class="btn g" id="pmT" type="button">Enviarme prueba</button><button class="btn" id="pmOk" type="button">Enviar promoción</button>`});
 const dest=()=>{const v=m.q("#pmD").value;if(v==="man"){const ids=[...m.el.querySelectorAll("[data-pc]:checked")].map(x=>x.dataset.pc);return OK.filter(c=>ids.includes(c.id))}
  return v==="todos"?OK:v==="no90"?OK.filter(c=>dias(c)>90):OK.filter(c=>dias(c)<=+v)};
 const pintN=()=>{m.q("#pmMan").classList.toggle("hidden",m.q("#pmD").value!=="man");const n=dest().length;m.q("#pmN").textContent=n+" cliente"+(n===1?"":"s")+" recibirá"+(n===1?"":"n")+" esta promoción."};
 m.q("#pmD").onchange=pintN;m.el.addEventListener("change",e=>{if(e.target.closest("[data-pc]"))pintN()});pintN();
 const nuevos=async()=>{if(!m.q("#pmP").checked)return[];try{const {data}=await db.from("productos").select("nombre,precio_venta,descuento_pct,foto_url").gt("stock",0).not("foto_url","is",null).order("created_at",{ascending:false}).limit(30);const L=data||[];for(let i=L.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[L[i],L[j]]=[L[j],L[i]]}return L.slice(0,3)}catch(e){return[]}};
 const armar=async()=>{const msg=m.q("#pmM").value.trim(),asu=m.q("#pmS").value.trim();if(!asu||!msg){m.q("#pmE").textContent="Escribe el asunto y el mensaje.";return null}m.q("#pmE").textContent="";
  const cod=m.q("#pmC").value,pr=cod?codes.find(c=>c.codigo===cod):null;return {asu,html:promoHTML(cfg,{msg,promo:pr,nuevos:await nuevos()})}};
 const act=m.q("#pmAct");if(act)act.onclick=async()=>{
  if(!await confirmar("Se activarán las promociones de <b>"+sinAcep+"</b> cliente(s) con correo. Hazlo <b>solo si te dieron permiso</b> para escribirles. Quienes se hayan dado de baja no se tocan.",{titulo:"Activar promociones",ok:"Activar"}))return;
  const ok=await espera(async()=>{const {error}=await db.from("clientes").update({acepta_promos:true}).not("correo","is",null).eq("acepta_promos",false).is("baja_promos_en",null);if(error)throw new Error(error.message);return true});
  if(ok){m.close();toast("Promociones activadas");await recargar();promo()}};
 m.q("#pmV").onclick=async()=>{const r=await armar();if(!r)return;const v=modal("Vista previa",`<iframe id="pvF" style="width:100%;height:62vh;border:0;background:#f5f1f2;border-radius:10px"></iframe>`,{foot:'<button class="btn g" data-x>Cerrar</button>'});v.q("#pvF").srcdoc=r.html.replace(/\{\{NOMBRE\}\}/g,"María").replace(/\{\{BAJA\}\}/g,"#")};
 m.q("#pmT").onclick=async()=>{const r=await armar();if(!r)return;const para=DAY.email;
  await UI.progreso("Enviando prueba…",async()=>{await rpc("enviar_correo_simple",{p_para:para,p_asunto:"[Prueba] "+r.asu.replace(/\{\{NOMBRE\}\}/g,"María"),p_html:r.html.replace(/\{\{NOMBRE\}\}/g,"María").replace(/\{\{BAJA\}\}/g,"#"),p_copia:false,p_tipo:"promocion",p_ref:"Prueba"});return true},"Prueba enviada a "+esc(para))};
 m.q("#pmOk").onclick=async()=>{const L=dest();if(!L.length){m.q("#pmE").textContent="No hay destinatarios con esa selección.";return}
  const r=await armar();if(!r)return;
  const libres=Math.max(0,hoy.limite-hoy.enviados);
  if(!await confirmar("Se enviará esta promoción a <b>"+L.length+"</b> cliente"+(L.length===1?"":"s")+"."+(L.length>libres?" <br><br>Hoy solo quedan <b>"+libres+"</b> envíos disponibles; el resto no saldrá hoy.":""),{titulo:"Enviar promoción",ok:"Enviar"}))return;
  m.close();const g=UI.dlgEstado("Enviando 0 de "+L.length+"…");const base=new URL("./",location.href).href,res={ok:0,no:0,limite:0};
  for(let i=0;i<L.length;i++){g.set("Enviando "+(i+1)+" de "+L.length+"…<br><small>No cierres esta pantalla</small>",true);
   try{const x=await rpc("enviar_promocion",{p_cliente:L[i].id,p_asunto:r.asu,p_html:r.html,p_base:base,p_campana:r.asu.slice(0,50)});if(x==="ok")res.ok++;else if(x==="limite"){res.limite=L.length-i;break}else res.no++}catch(e){g.set(esc(e.message),false,true);return}
   await new Promise(z=>setTimeout(z,250))}
  g.set('<div style="font-size:38px;color:#2f7d4f;line-height:1">'+(res.ok?"✓":"!")+"</div>"+res.ok+" enviado"+(res.ok===1?"":"s")+(res.no?"<br><small>"+res.no+" omitido(s) (sin permiso o sin correo)</small>":"")+(res.limite?"<br><small>"+res.limite+" quedaron sin enviar: se alcanzó el límite diario. Envíalos mañana.</small>":""),false,true)}}
function promoHTML(c,x){
 const W="#6B2D3E",neg=c.nombre||"DAYMARSV",ig=c.instagram?String(c.instagram).replace(/^@/,""):"",tel=String(c.telefono||"").replace(/\D/g,""),wa=tel.length===8?"503"+tel:tel;
 const logo=new URL("img/logo-correo.jpg",location.href).href,money=v=>"$"+(+v).toFixed(2);
 const btn=(url,txt,bg)=>`<a href="${esc(url)}" style="display:inline-block;margin:4px;padding:11px 18px;background:${bg};color:#fff;text-decoration:none;border-radius:24px;font-weight:bold;font-size:14px">${txt}</a>`;
 const nv=(x.nuevos||[]).length?`<div style="margin-top:22px"><div style="font-weight:bold;color:${W};font-size:15px;margin-bottom:6px">Novedades que te pueden gustar</div><table width="100%" style="border-collapse:collapse"><tr>${x.nuevos.map(p=>{const pr=(+p.precio_venta)*(1-(+p.descuento_pct||0)/100);return `<td style="width:33%;padding:4px;text-align:center;vertical-align:top"><img src="${esc(p.foto_url)}" alt="" width="140" style="width:100%;max-width:140px;height:auto;border-radius:8px;display:block;margin:0 auto 4px"><div style="font-size:12px;line-height:1.3">${esc(p.nombre)}</div><div style="font-weight:bold;color:${W};font-size:13px">${money(pr)}</div></td>`}).join("")}</tr></table></div>`:"";
 const botones=[wa?btn("https://wa.me/"+wa+"?text="+encodeURIComponent("Hola, vi su promoción y me interesa"),"Escríbenos por WhatsApp","#25D366"):"",ig?btn("https://instagram.com/"+ig,"Síguenos en Instagram",W):"",c.url_tienda?btn(c.url_tienda,"Ver nuestra tienda","#8a3a4f"):""].join("");
 return `<div style="background:#f5f1f2;padding:16px 6px;font-family:Arial,Helvetica,sans-serif;color:#222"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
 <img src="${esc(logo)}" alt="${esc(neg)}" width="560" style="display:block;width:100%;height:auto;background:${W}">
 <div style="padding:22px 24px"><div style="font-size:15px;line-height:1.6">${esc(x.msg).replace(/\n/g,"<br>")}</div>
 ${x.promo?`<div style="margin-top:22px;text-align:center;background:#fbf4e6;border:1px dashed #C9973F;border-radius:10px;padding:14px"><div style="font-size:13px;color:#555">Tu código de descuento</div><div style="font-size:24px;font-weight:bold;color:${W};letter-spacing:2px;margin:4px 0">${esc(x.promo.codigo)}</div><div style="font-size:14px">${+x.promo.pct}% de descuento</div></div>`:""}
 ${nv}<div style="text-align:center;margin-top:22px">${botones}</div>
 <p style="text-align:center;font-size:11px;color:#999;margin:18px 0 0;line-height:1.5">${esc(neg)}${c.direccion?" · "+esc(c.direccion):""}<br>Recibes este correo porque aceptaste recibir nuestras promociones.<br><a href="{{BAJA}}" style="color:#999">Dejar de recibir promociones</a></p>
 </div></div></div>`}
/* ---------- ficha ---------- */
function ficha(id){
 const c=S.C.find(x=>x.id===id);if(!c)return;const s=S.stats[id];
 const tel=(c.telefono||"").replace(/\D/g,""),wa=tel.length===8?"503"+tel:tel;
 const d=modal(esc(c.nombre),`<div class="kp" style="grid-template-columns:repeat(3,1fr);margin:0 0 12px"><div><span>Compras</span><b>${s.n}</b></div><div><span>Total</span><b>${$$(s.t)}</b></div><div><span>Ticket prom.</span><b>${$$(s.n?s.t/s.n:0)}</b></div></div>
  <div class="ti" style="margin-bottom:10px">${[c.codigo&&"Código "+esc(c.codigo),c.telefono&&"Tel. "+esc(c.telefono),c.correo&&esc(c.correo),c.documento&&"Doc. "+esc(c.documento),c.direccion&&esc(c.direccion)].filter(Boolean).map(x=>`<div>${x}</div>`).join("")||'<small>Sin datos de contacto</small>'}${c.notas?`<div style="margin-top:6px"><small>${esc(c.notas)}</small></div>`:""}</div>
  <div class="ctl" style="flex-wrap:wrap">${tel?`<a class="btn g sm" href="tel:${esc(c.telefono)}">Llamar</a><a class="btn g sm" target="_blank" rel="noopener" href="https://wa.me/${wa}">WhatsApp</a>`:""}${c.correo?`<a class="btn g sm" href="mailto:${esc(c.correo)}">Correo</a>`:""}<a class="btn g sm" href="almacenamiento.html#fac">Facturar</a>${s.deuda>0&&c.correo?`<button class="btn g sm" id="cRec">Recordar saldo por correo</button>`:""}</div>
  ${fichaDeuda(c,s)}
  <h3 class="sect">Últimas compras</h3>${s.ventas.length?s.ventas.slice(0,8).map(v=>`<div class="rw"><div class="ti"><b>Venta #${v.numero}</b><small>${fdate(v.created_at)}</small></div><div class="am2"><b>${$$(v.total)}</b></div></div>`).join(""):'<p class="hint">Todavía no tiene compras registradas. Para que aparezcan aquí, toca “Agregar cliente” al hacer una venta.</p>'}
  ${s.devs.length?`<h3 class="sect">Devoluciones y cambios</h3>${s.devs.slice(0,5).map(x=>`<div class="rw"><div class="ti"><b>${x.tipo==="cambio"?"Cambio":"Devolución"} #${x.numero}</b><small>${fdate(x.fecha)}</small></div><div class="am2"><b>${$$(x.monto_devuelto)}</b></div></div>`).join("")}`:""}
  ${s.facs.length?`<h3 class="sect">Facturas</h3>${s.facs.slice(0,5).map(f=>`<div class="rw"><div class="ti"><b>Factura ${String(f.numero).padStart(6,"0")}</b><small>${fdate(f.fecha)}</small></div><div class="am2"><b>${$$(f.total)}</b></div></div>`).join("")}`:""}`,
  {foot:`${ADM?'<button class="btn g" id="fDel" style="color:var(--bad);margin-right:auto">Eliminar</button>':""}<button class="btn g" data-x>Cerrar</button><button class="btn" id="fEd">Editar</button>`});
 d.q("#fEd").onclick=()=>{d.close();form(c)};
 const rec=d.q("#cRec");if(rec)rec.onclick=async()=>{
  let st=null;try{st=await rpc("config_correo_estado")}catch(e){}
  if(!st||!st.listo){toast("El correo automático aún no está configurado (Finanzas → Datos del negocio)");return}
  if(!await confirmar("Se enviará un correo a <b>"+esc(c.correo)+"</b> recordando el saldo de <b>"+$$(s.deuda)+"</b>.",{titulo:"Recordar saldo",ok:"Enviar"}))return;
  let neg="DAYMARSV",tel="";try{const {data}=await db.from("config_negocio").select("nombre,telefono").eq("id",1).maybeSingle();if(data){neg=data.nombre||neg;tel=data.telefono||""}}catch(e){}
  const h=`<div style="background:#f5f1f2;padding:20px 8px;font-family:Arial,Helvetica,sans-serif;color:#222"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:24px"><h1 style="margin:0;text-align:center;color:#6B2D3E;font-size:24px">${esc(neg)}</h1><div style="text-align:center;color:#6B2D3E;font-style:italic;margin-bottom:14px">Recordatorio de pago</div><p style="font-size:15px">Hola ${esc(c.nombre)}, te recordamos que tienes un saldo pendiente de:</p><p style="font-size:28px;font-weight:bold;color:#6B2D3E;text-align:center;margin:10px 0">${$$(s.deuda)}</p><p style="text-align:center;font-size:13px;color:#444">Para pagar o aclarar cualquier duda, escríbenos${tel?" por WhatsApp al "+esc(/^\+/.test(tel)?tel:"+503 "+tel):""}. ¡Gracias!</p></div></div>`;
  await UI.progreso("Enviando recordatorio…",async()=>{await rpc("enviar_correo_simple",{p_para:c.correo,p_asunto:"Recordatorio de pago – "+neg,p_html:h,p_copia:true,p_tipo:"recordatorio",p_ref:c.nombre});return true},"Recordatorio enviado a "+esc(c.correo))};
 d.el.addEventListener("click",e=>{const ab=e.target.closest("[data-ab]");if(ab){const cu=s.cuentas.find(z=>z.id===ab.dataset.ab);d.close();abonar(c,cu)}if(e.target.closest("#fNC")){d.close();nuevaCuenta(c)}});
 const del=d.q("#fDel");if(del)del.onclick=async()=>{if(!await pedirClave("Vas a eliminar al cliente "+c.nombre+"."))return;
  const ok=await espera(async()=>{const {error}=await db.from("clientes").delete().eq("id",id);if(error)throw new Error(error.message);return true});if(ok){d.close();toast("Cliente eliminado");await recargar()}}}
function fichaDeuda(c,s){
 const hay=s.cuentas.length||s.pend.length;
 return `<h3 class="sect">Por cobrar${s.deuda>0?` · <span class="neg">${$$(s.deuda)}</span>`:""}</h3>
  ${s.cuentas.map(x=>`<div class="rw"><div class="ti"><b>${esc(x.concepto||"Cuenta por cobrar")}</b><small>${x.vence?"vence "+fdate(x.vence):"sin vencimiento"} · de ${$$(x.monto)}, abonado ${$$(x.abonado)}</small></div><div class="am2"><b>${$$(x.monto-x.abonado)}</b></div>${ADM?`<button class="btn sm" data-ab="${x.id}">Abonar</button>`:""}</div>`).join("")}
  ${s.pend.map(x=>`<div class="rw"><div class="ti"><b>Venta #${x.numero} pendiente de cobro</b><small>${fdate(x.created_at)} · se cobra en Punto de venta</small></div><div class="am2"><b>${$$(x.pendiente_monto)}</b></div><a class="btn g sm" href="almacenamiento.html#pend">Ver</a></div>`).join("")}
  ${hay?"":'<p class="hint" style="margin:0 0 6px">No debe nada.</p>'}${ADM?'<div class="ctl"><button class="btn g sm" id="fNC" type="button">Nueva cuenta por cobrar</button></div>':""}`}
function abonar(c,cu){
 const sal=r2(cu.monto-cu.abonado);
 const d=modal("Registrar abono",`<p class="pw" style="margin-top:0">${esc(c.nombre)} · saldo <b>${$$(sal)}</b>. El abono se registra también como ingreso.</p><label>Monto del abono ($)</label><input name="a" type="number" min="0.01" step="0.01" max="${sal}" value="${sal}" inputmode="decimal"><div class="err2" id="abE"></div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="abOk">Registrar</button>`,onclose:()=>{}});
 d.q("#abOk").onclick=async()=>{const v=Number(d.q("[name=a]").value);if(!(v>0)||v>sal+.001){d.q("#abE").textContent="El abono debe ser mayor a cero y no pasar del saldo.";return}
  const ok=await espera(async()=>{await rpc("abonar_cuenta",{p_id:cu.id,p_monto:r2(v)});return true});if(ok){d.close();toast("Abono registrado");await recargar();ficha(c.id)}}}
function nuevaCuenta(c){
 const d=modal("Nueva cuenta por cobrar",`<p class="pw" style="margin-top:0">Para <b>${esc(c.nombre)}</b>. Úsala para ventas fiadas o dinero que te debe.</p><div class="fg"><div class="full"><label>Concepto <small>(opcional)</small></label><input name="c" maxlength="160" placeholder="Ej. 3 camisas fiadas"></div><div><label>Monto ($)</label><input name="m" type="number" min="0.01" step="0.01" inputmode="decimal"></div><div><label>Vence <small>(opcional)</small></label><input name="v" type="date"></div></div><div class="err2" id="ncE"></div>`,{foot:`<button class="btn g" data-x>Cancelar</button><button class="btn" id="ncOk">Guardar</button>`});
 const g=n=>d.q(`[name=${n}]`).value.trim();
 d.q("#ncOk").onclick=async()=>{if(!(Number(g("m"))>0)){d.q("#ncE").textContent="Escribe un monto mayor a cero.";return}
  const ok=await espera(async()=>{const {error}=await db.from("fin_cuentas").insert({tipo:"cobrar",tercero:c.nombre,cliente_id:c.id,concepto:g("c")||null,monto:r2(Number(g("m"))),vence:g("v")||null});if(error)throw new Error(/cliente_id/.test(error.message)?"Falta aplicar la migración 003 en Supabase.":error.message);return true});
  if(ok){d.close();toast("Cuenta registrada");await recargar();ficha(c.id)}}}
async function recargar(){const ok=await espera(async()=>{await cargar();return true},"Actualizando…");if(ok)pintar()}
$("cQ").addEventListener("input",deb(pintar,150));
$("cSg").addEventListener("click",e=>{const b=e.target.closest("[data-o]");if(b){S.orden=b.dataset.o;pintar()}});
$("cL").addEventListener("click",e=>{if(e.target.closest(".cwa"))return;const r=e.target.closest("[data-c]");if(r)ficha(r.dataset.c)});
$("cNew").onclick=()=>form();
if(ADM){const bp=document.createElement("button");bp.className="btn g sm";bp.type="button";bp.id="cPromo";bp.textContent="Enviar promoción";$("cXls").insertAdjacentElement("afterend",bp);bp.onclick=()=>promo()}
$("cXls").onclick=()=>excel("clientes",[{n:"Clientes",c:[["Código",10],["Nombre",28],["Teléfono",16],["Correo",26],["DUI / NIT",18],["Dirección",34],["Compras",10],["Total comprado",16,"money"],["Última compra",14],["Notas",30]],f:S.C.map(c=>{const s=S.stats[c.id];return[c.codigo||"",c.nombre,c.telefono||"",c.correo||"",c.documento||"",c.direccion||"",s.n,s.t,s.u?s.u.slice(0,10):"",c.notas||""]})}]);
await recargar();
const hc=location.hash.match(/c=([\w-]+)/);if(hc&&S.stats[hc[1]])ficha(hc[1]);
})();
