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

const ORIGENES = ['https://industriastobias.github.io'];
const cors = req => { const o = req.headers.get('Origin'); return ORIGENES.includes(o) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' } : {}; };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method === 'GET' && url.pathname === '/ping') return new Response('ok');
    if (req.method !== 'POST' || url.pathname !== '/enviar') return new Response('no', { status: 404 });
    if (!env.VAPID_PRIVADA || !env.VAPID_PUBLICA) return new Response('sin claves', { status: 500 });
    let d; try { d = await req.json(); } catch (e) { return new Response('json', { status: 400 }); }
    const subs = Array.isArray(d.subs) ? d.subs.slice(0, 20) : [];
    const texto = JSON.stringify({ titulo: String(d.titulo || 'DAYMARSV').slice(0, 80), cuerpo: String(d.cuerpo || '').slice(0, 200), url: String(d.url || 'pedidos.html').slice(0, 200) });
    const res = await Promise.all(subs.map(s => enviarUno(s, texto, env).catch(() => ({ ok: false, st: -1 }))));
    return Response.json({ enviados: res.filter(r => r.ok).length, total: subs.length, estados: res.map(r => r.st) }, { headers: cors(req) });
  }
};
