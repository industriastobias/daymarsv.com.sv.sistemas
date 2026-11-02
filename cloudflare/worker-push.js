/* DAYMARSV · avisos de pedidos en línea (Web Push)
   La base de datos le manda a este Worker el aviso y las suscripciones de los administradores;
   el Worker lo cifra y lo entrega al servicio de notificaciones del navegador (Google, Apple, Mozilla).
   Variables: VAPID_PUBLICA (texto), VAPID_PRIVADA (secreto, JWK en JSON), CONTACTO (mailto:...). */
const HOSTS_OK = [/(^|\.)googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)mozilla\.com$/, /(^|\.)mozaws\.net$/, /(^|\.)windows\.com$/, /(^|\.)notify\.windows\.com$/];
const enc = new TextEncoder();
const b64u = {
  de: s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); const r = atob(s); const u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; },
  en: u => { let s = ''; u = new Uint8Array(u); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
};
const cat = (...a) => { const n = a.reduce((t, x) => t + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/* RFC 8291 (aes128gcm) */
async function cifrar(sub, texto) {
  const uaPub = b64u.de(sub.p256dh), authSecret = b64u.de(sub.auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return cat(salt, rs, new Uint8Array([65]), asPub, cifrado);
}

/* RFC 8292 (VAPID) */
async function vapid(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const h = b64u.en(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64u.en(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.CONTACTO || 'mailto:admin@example.com' })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVADA), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(h + '.' + c)));
  return 'vapid t=' + h + '.' + c + '.' + b64u.en(firma) + ', k=' + env.VAPID_PUBLICA;
}

async function enviarUno(sub, texto, env) {
  let u; try { u = new URL(sub.endpoint); } catch (e) { return { ok: false, st: 0 }; }
  if (u.protocol !== 'https:' && !env.PERMITIR_TODO) return { ok: false, st: 0 };
  if (!env.PERMITIR_TODO && !HOSTS_OK.some(r => r.test(u.hostname))) return { ok: false, st: 0 };
  const body = await cifrar(sub, texto);
  const r = await fetch(sub.endpoint, { method: 'POST', body, headers: { 'Authorization': await vapid(sub.endpoint, env), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'TTL': '86400', 'Urgency': 'high' } });
  return { ok: r.ok, st: r.status };
}


/* ---------- Monitor de caídas (cada 5 minutos) + registro de dispositivos ---------- */
const SUPA = 'https://itafqiemoulcztmhfqah.supabase.co', SUPA_KEY = 'sb_publishable_gkdG2OvACj7eGxaa5JSsLw_wO7w0bEB';
const REVISAR = [
  { n: 'La tienda en línea', f: () => fetch('https://industriastobias.github.io/klohesvtiendaonline/', { cf: { cacheTtl: 0 } }) },
  { n: 'El sistema', f: () => fetch('https://industriastobias.github.io/daymarsv.com.sv.sistemas/', { cf: { cacheTtl: 0 } }) },
  { n: 'La base de datos', f: async () => { const r = await fetch(SUPA + '/rest/v1/rpc/tienda_stock', { method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' }, body: '{}' }); if (r.ok) { const j = await r.json(); if (!Array.isArray(j)) throw new Error('respuesta rara'); } return r; } }
];
const sha = async t => b64u.en(await crypto.subtle.digest('SHA-256', enc.encode(t)));
async function esAdmin(token) {
  try {
    const r = await fetch(SUPA + '/rest/v1/rpc/es_admin', { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    return r.ok && (await r.json()) === true;
  } catch (e) { return false; }
}
async function avisarATodos(env, titulo, cuerpo, url) {
  if (!env.AVISOS) return 0;
  const texto = JSON.stringify({ titulo, cuerpo, url: url || 'menu.html' });
  const { keys } = await env.AVISOS.list({ prefix: 'sub:', limit: 50 });
  let n = 0;
  await Promise.all(keys.map(async k => {
    const sub = JSON.parse((await env.AVISOS.get(k.name)) || 'null'); if (!sub) return;
    const r = await enviarUno(sub, texto, env).catch(() => ({ ok: false, st: -1 }));
    if (r.ok) n++; else if (r.st === 404 || r.st === 410) await env.AVISOS.delete(k.name);
  }));
  return n;
}
/* Anula los pedidos en línea que llevan más de 12 horas sin atenderse */
async function vencerPedidos() {
  try { await fetch(SUPA + '/rest/v1/rpc/vencer_pedidos_linea', { method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' }, body: '{}' }); } catch (e) { /* se reintenta en 5 minutos */ }
}
async function revisar(env) {
  if (!env.AVISOS) return;
  const est = JSON.parse((await env.AVISOS.get('estado')) || '{}');
  const cambios = [];
  for (const c of REVISAR) {
    let ok = false;
    try { const r = await Promise.race([c.f(), new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo')), 15000))]); ok = r.ok; } catch (e) { ok = false; }
    const e = est[c.n] || { fallos: 0, caido: false };
    if (ok) { if (e.caido) cambios.push(['ok', c.n]); est[c.n] = { fallos: 0, caido: false }; }
    else { e.fallos++; if (e.fallos >= 2 && !e.caido) { e.caido = true; cambios.push(['mal', c.n]); } est[c.n] = e; }
  }
  await env.AVISOS.put('estado', JSON.stringify(est));
  for (const [t, n] of cambios) {
    if (t === 'mal') await avisarATodos(env, 'Posible caída', n + ' no responde. Revísalo.', 'menu.html');
    else await avisarATodos(env, 'Todo normal otra vez', n + ' ya responde.', 'menu.html');
  }
  return cambios;
}

const ORIGENES = ['https://industriastobias.github.io'];
const cors = req => { const o = req.headers.get('Origin'); return ORIGENES.includes(o) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' } : {}; };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method === 'GET' && url.pathname === '/ping') return new Response('ok');
    if (req.method === 'POST' && url.pathname === '/registrar') {
      if (!env.AVISOS) return new Response('sin almacenamiento', { status: 500, headers: cors(req) });
      const tk = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
      if (!tk || !(await esAdmin(tk))) return new Response('no autorizado', { status: 401, headers: cors(req) });
      let d; try { d = await req.json(); } catch (e) { return new Response('json', { status: 400, headers: cors(req) }); }
      let u; try { u = new URL(d.endpoint); } catch (e) { return new Response('endpoint', { status: 400, headers: cors(req) }); }
      if (u.protocol !== 'https:' || !HOSTS_OK.some(r => r.test(u.hostname))) return new Response('endpoint', { status: 400, headers: cors(req) });
      const k = 'sub:' + await sha(d.endpoint);
      if (d.quitar) { await env.AVISOS.delete(k); return Response.json({ ok: true }, { headers: cors(req) }); }
      if (!d.p256dh || !d.auth) return new Response('datos', { status: 400, headers: cors(req) });
      const { keys } = await env.AVISOS.list({ prefix: 'sub:', limit: 60 });
      if (keys.length >= 50 && !keys.some(x => x.name === k)) return new Response('lleno', { status: 429, headers: cors(req) });
      await env.AVISOS.put(k, JSON.stringify({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }));
      return Response.json({ ok: true }, { headers: cors(req) });
    }
    if (req.method !== 'POST' || url.pathname !== '/enviar') return new Response('no', { status: 404 });
    if (!env.VAPID_PRIVADA || !env.VAPID_PUBLICA) return new Response('sin claves', { status: 500 });
    let d; try { d = await req.json(); } catch (e) { return new Response('json', { status: 400 }); }
    const subs = Array.isArray(d.subs) ? d.subs.slice(0, 20) : [];
    const texto = JSON.stringify({ titulo: String(d.titulo || 'DAYMARSV').slice(0, 80), cuerpo: String(d.cuerpo || '').slice(0, 200), url: String(d.url || 'pedidos.html').slice(0, 200) });
    const res = await Promise.all(subs.map(s => enviarUno(s, texto, env).catch(() => ({ ok: false, st: -1 }))));
    return Response.json({ enviados: res.filter(r => r.ok).length, total: subs.length, estados: res.map(r => r.st) }, { headers: cors(req) });
  }
  ,
  async scheduled(ev, env, ctx) { ctx.waitUntil(Promise.all([vencerPedidos(), revisar(env)])); }
};
