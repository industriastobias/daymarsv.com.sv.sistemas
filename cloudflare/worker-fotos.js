/* Worker de Cloudflare para guardar las fotos de DAYMARSV en R2.
   Guía de instalación: cloudflare/LEEME.md
   Variables que necesita (Settings > Variables del Worker):
     FOTOS            (binding R2: el bucket de fotos)
     SUPABASE_URL     https://itafqiemoulcztmhfqah.supabase.co
     SUPABASE_KEY     la clave pública (sb_publishable_...) del sistema
     ORIGENES         (opcional) páginas permitidas, separadas por coma. Ej: https://industriastobias.github.io
*/
const MAX = 5 * 1024 * 1024;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const RUTA_OK = /^[A-Za-z0-9][A-Za-z0-9_\-\/.]{0,198}$/;

function cors(req, env) {
  const o = req.headers.get('Origin') || '';
  const lista = (env.ORIGENES || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !lista.length || lista.includes(o);
  return {
    'Access-Control-Allow-Origin': ok ? (o || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
const json = (o, st, h) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });

/* Solo deja pasar a un usuario activo del sistema (se comprueba con Supabase) */
async function usuarioActivo(req, env) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!t) return false;
  const h = { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + t };
  const u = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: h });
  if (!u.ok) return false;
  const id = (await u.json()).id;
  if (!id) return false;
  const p = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(id) + '&select=activo', { headers: h });
  if (!p.ok) return false;
  const r = await p.json();
  return !!(r[0] && r[0].activo);
}

export default {
  async fetch(req, env) {
    const c = cors(req, env), url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });

    /* Lectura pública de una foto: /f/<ruta> (con caché de Cloudflare) */
    if (req.method === 'GET' && url.pathname.startsWith('/f/')) {
      const ruta = decodeURIComponent(url.pathname.slice(3));
      if (!RUTA_OK.test(ruta) || ruta.includes('..')) return new Response('No encontrada', { status: 404, headers: c });
      const cache = caches.default, key = new Request(url.origin + url.pathname);
      let r = await cache.match(key);
      if (!r) {
        const o = await env.FOTOS.get(ruta);
        if (!o) return new Response('No encontrada', { status: 404, headers: c });
        r = new Response(o.body, { headers: { 'Content-Type': (o.httpMetadata && o.httpMetadata.contentType) || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'ETag': o.httpEtag } });
        await cache.put(key, r.clone());
      }
      const h = new Headers(r.headers); Object.keys(c).forEach(k => h.set(k, c[k]));
      return new Response(r.body, { status: r.status, headers: h });
    }

    if (url.pathname === '/ping') return json({ ok: true }, 200, c);
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405, c);
    if (!(await usuarioActivo(req, env))) return json({ error: 'No autorizado' }, 401, c);

    /* Subir una foto: POST /subir?path=<ruta> con la imagen en el cuerpo */
    if (url.pathname === '/subir') {
      const ruta = url.searchParams.get('path') || '';
      if (!RUTA_OK.test(ruta) || ruta.includes('..')) return json({ error: 'Ruta no válida' }, 400, c);
      const tipo = (req.headers.get('Content-Type') || '').split(';')[0];
      if (!TIPOS.includes(tipo)) return json({ error: 'Solo se aceptan imágenes JPG, PNG o WEBP' }, 415, c);
      const cuerpo = await req.arrayBuffer();
      if (!cuerpo.byteLength || cuerpo.byteLength > MAX) return json({ error: 'La imagen está vacía o pesa más de 5 MB' }, 413, c);
      await env.FOTOS.put(ruta, cuerpo, { httpMetadata: { contentType: tipo, cacheControl: 'public, max-age=31536000, immutable' } });
      return json({ ok: true, path: ruta }, 200, c);
    }

    /* Borrar fotos: POST /borrar con {paths:[...]} */
    if (url.pathname === '/borrar') {
      let b; try { b = await req.json(); } catch (e) { return json({ error: 'Datos no válidos' }, 400, c); }
      const L = (Array.isArray(b.paths) ? b.paths : []).filter(p => typeof p === 'string' && RUTA_OK.test(p) && !p.includes('..')).slice(0, 500);
      if (L.length) await env.FOTOS.delete(L);
      return json({ ok: true, borradas: L.length }, 200, c);
    }
    return json({ error: 'No encontrado' }, 404, c);
  }
};
