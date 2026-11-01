# Fotos en Cloudflare R2 (opcional)

Mientras `R2.worker` esté vacío en `js/app.js`, el sistema sigue guardando las fotos en Supabase como siempre.

## Pasos (una sola vez)
1. Crea una cuenta en https://dash.cloudflare.com y entra a **R2 Object Storage** (pide una tarjeta para verificar; no cobra mientras no pases el límite gratis).
2. **Create bucket** → nombre: `daymar-fotos`. No hace falta hacerlo público.
3. **Workers & Pages → Create → Worker** → nombre: `daymar-fotos` → Deploy → **Edit code** → borra todo y pega el contenido de `cloudflare/worker-fotos.js` → Deploy.
4. En el Worker: **Settings → Bindings → Add → R2 bucket**: variable `FOTOS`, bucket `daymar-fotos`.
5. En el Worker: **Settings → Variables and Secrets → Add**:
   - `SUPABASE_URL` = `https://itafqiemoulcztmhfqah.supabase.co`
   - `SUPABASE_KEY` = la clave pública `sb_publishable_...` (está en `js/app.js`, línea 3)
   - `ORIGENES` = `https://industriastobias.github.io`
6. Copia la dirección del Worker (algo como `https://daymar-fotos.TU-USUARIO.workers.dev`) y pásasela a Claude.

## Qué hará Claude después
Poner esa dirección en `js/app.js` (`R2.worker` y `R2.publico` = dirección + `/f`). Desde ese momento las fotos nuevas van a R2. Las que ya tienes se pasan con el botón **"Pasar fotos a Cloudflare"** en Configuración → Datos.

## Seguridad
- Solo un usuario activo del sistema (con sesión iniciada) puede subir o borrar fotos; el Worker lo comprueba con Supabase.
- Solo acepta JPG/PNG/WEBP de hasta 5 MB.
- Las fotos se leen públicamente por `/f/<ruta>`, igual que ahora en Supabase.
