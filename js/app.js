/* DAYMAR-SHOP · funciones compartidas (conexión, sesión y utilidades) */
(function(){
const CFG={url:"https://itafqiemoulcztmhfqah.supabase.co",key:"sb_publishable_gkdG2OvACj7eGxaa5JSsLw_wO7w0bEB"};
const db=supabase.createClient(CFG.url,CFG.key);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $$=n=>"$"+Number(n||0).toLocaleString("es-SV",{minimumFractionDigits:2,maximumFractionDigits:2});
const ymd=d=>d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);
const toast=t=>{const e=document.getElementById("toast");if(!e)return;e.textContent=t;e.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("on"),3000)};
try{const th=localStorage.getItem("dms_th");if(th)document.documentElement.dataset.theme=th}catch(e){}
const toggleTheme=()=>{const r=document.documentElement,dk=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme:dark)").matches;r.dataset.theme=dk?"light":"dark";try{localStorage.setItem("dms_th",r.dataset.theme)}catch(e){}};
/* Iconos (líneas finas) y grupos del menú. ok = ya conectado a la base de datos · adm = solo administrador */
const ICON={
 cart:'<circle cx="9" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/><path d="M2 3h3l2.7 12.4a1 1 0 001 .8h9.7a1 1 0 001-.8L21 7H6"/>',
 box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
 store:'<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0"/>',
 users:'<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0112 0v1M17 4a4 4 0 010 8M22 21v-1a5 5 0 00-4-4.9"/>',
 tag:'<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
 receipt:'<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
 quote:'<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
 sale:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2"/>',
 cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"/>',
 chip:'<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
 bank:'<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
 stock:'<path d="M3 9l9-6 9 6v12H3z"/><path d="M8 21v-7h8v7"/>',
 home:'<path d="M3 12l9-9 9 9M5 10v10h14V10"/>'};
const GRUPOS=[
 {t:"Vender",m:[{k:"almacenamiento",n:"Punto de venta",i:"sale",h:"almacenamiento.html",ok:1},{k:"facturas",n:"Facturas",i:"receipt",h:"almacenamiento.html#fac",ok:1},{k:"clientes",n:"Clientes",i:"users",h:"sistema.html#cli",ok:1},{k:"descuentos",n:"Descuentos",i:"tag",h:"descuentos.html",ok:1,adm:1},{k:"cotizacion",n:"Cotización",i:"quote",h:"traslados.html"},{k:"reservas",n:"Reservas",i:"cal",h:"reservas.html"}]},
 {t:"Almacén",m:[{k:"inventario",n:"Inventario",i:"box",h:"reportes.html",ok:1},{k:"compra",n:"Compra",i:"cart",h:"compra.html",ok:1,adm:1},{k:"catalogo",n:"Catálogo",i:"store",h:"gastos.html"}]},
 {t:"Negocio",m:[{k:"finanzas",n:"Finanzas",i:"bank",h:"finanzas.html",ok:1,adm:1},{k:"usuarios",n:"Usuarios",i:"users",h:"usuarios.html",ok:1,adm:1}]}];
const svg=k=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const visibles=(g,rol)=>g.m.filter(m=>!m.adm||rol==="admin");
const enlace=(m,c,on)=>`<a class="${c||""}${m.ok?"":" off"}${on===m.k?" on":""}" href="${m.ok?m.h:"#"}" ${m.ok?"":`data-n="${esc(m.n)}"`}>${svg(m.i)}<span>${esc(m.n)}</span></a>`;
/* Menú lateral de escritorio (en el celular se oculta y se navega desde el menú principal) */
function mountSide(el,activo,rol){
 el.innerHTML=`<div class="brand">DAYMAR<i>-SHOP</i></div><nav><a href="menu.html" class="${activo==="menu"?"on":""}">${svg("home")}<span>Inicio</span></a>`+
  GRUPOS.map(g=>`<div class="sg">${g.t}</div>`+visibles(g,rol).map(m=>enlace(m,"",activo)).join("")).join("")+`</nav><button class="lo" id="lo1">Cerrar sesión</button>`;
 el.querySelector("#lo1").onclick=()=>{if(confirm("¿Cerrar sesión?"))logout()};
 el.addEventListener("click",e=>{const a=e.target.closest("[data-n]");if(a){e.preventDefault();toast(a.dataset.n+" se conectará a la base de datos pronto.")}})}
async function logout(){await db.auth.signOut();location.replace("index.html")}
/* Si no hay sesión, manda al login. Devuelve el perfil del usuario. */
async function requireSession(){
 const {data}=await db.auth.getSession();
 if(!data.session){location.replace("index.html");return null}
 const r=await db.from("profiles").select("*").eq("id",data.session.user.id).single();
 if(r.error||!r.data||!r.data.activo){await db.auth.signOut();location.replace("index.html?e=perfil");return null}
 return r.data}
window.DAY={db,esc,$$,ymd,toast,toggleTheme,ICON,GRUPOS,svg,visibles,enlace,mountSide,logout,requireSession};
})();
