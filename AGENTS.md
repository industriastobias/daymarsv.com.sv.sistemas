# DAYMARSV · Guía para agentes (Claude Code, Claude, y cualquier otro asistente)

Este archivo resume cómo está hecho el sistema, las reglas del dueño y lo que está pendiente.
Léelo completo antes de cambiar algo. Última actualización: 20 de noviembre de 2026.

## 1. Qué es
- **DAYMARSV** es un negocio familiar de joyería, bisutería y accesorios en El Salvador.
- **Sistema interno** (este repo, `industriastobias/daymarsv.com.sv.sistemas`): inventario, punto de venta, pendientes, facturas, clientes, finanzas, equipo y tareas, etc. Se publica con GitHub Pages: `https://industriastobias.github.io/daymarsv.com.sv.sistemas/`.
- **Tienda en línea** (repo `industriastobias/klohesvtiendaonline`): catálogo público y pedidos. Lee los mismos datos del sistema.
- El dueño (Ernesto Tobias) habla **español**. Responde siempre en español, corto y claro, sin términos técnicos innecesarios.

## 2. Cómo está hecho
- Páginas HTML estáticas + JavaScript sin framework (`*.html`, `js/*.js`, `css/*.css`).
- Base de datos y usuarios: **Supabase** (RLS + funciones RPC). La conexión está en `js/app.js` (`CFG`).
- **Migraciones**: `migraciones/NNN_nombre.sql`, numeradas en orden (la última es la 100). Un GitHub Action (`.github/workflows/migraciones.yml`) las aplica solas al hacer push. Revisa que el Action termine bien (`gh run list -R industriastobias/daymarsv.com.sv.sistemas -L 2`).
- **Cloudflare Workers** (carpeta `cloudflare/`): `worker-push.js` (notificaciones push, "daymar-push") y `worker-fotos.js` (fotos en R2, "daymar-fotos").
- Correos automáticos (facturas, anulaciones, recordatorios, promociones): se envían desde la base de datos con plantillas HTML en las migraciones; todos llevan al pie los íconos de redes (Instagram, TikTok, WhatsApp).
- `js/app.js` = funciones comunes (sesión, menú `GRUPOS`, íconos `ICON`, ventanas `DAY.ask/say/input`, permisos). `js/comun.js` y `js/almacen.js` = lógica grande de ventas/inventario/facturas.
- **Idioma inglés**: `js/idioma.js` traduce toda la pantalla cuando `localStorage.dms_lang === "en"`. Es un diccionario (texto exacto en español → inglés) más reglas para números y frases. Si agregas textos nuevos en pantalla, agrega también su traducción ahí. No traduce facturas, tickets ni PDF para clientes (`.docv`, `.tkt`, contenido fuera de pantalla), ni JSON/código, enlaces o correos.

## 3. Forma de trabajar (obligatorio)
1. Después de cambiar un JS o CSS, **sube el número de versión** en los HTML que lo cargan (`archivo.js?v=AAAAMMDDHHMM`), si no, el teléfono sigue usando la versión vieja.
2. Prueba antes de subir: abrir las páginas con Playwright (hay Chromium instalado) y revisar que no haya errores, que no se mueva la página de lado en celular (390 px) y que funcione en computadora (1366 px), en español y en inglés.
3. Commit con mensaje en español, `git pull --rebase` y `git push`.
4. Avisa siempre al dueño que no pudiste probar en su teléfono real ni con sus datos reales, y que recargue (Ctrl + F5 en computadora; cerrar y abrir la app en el celular).
5. Cuando el dueño pida un diseño nuevo, es mejor mostrar **2 o 3 opciones en imagen** para que elija, en vez de subir uno a la vez.

## 4. Reglas del dueño (no romperlas)
- Solo el **administrador principal** puede: editar/borrar en Finanzas, borrar Actividad, borrar facturas, cambiar roles y permisos, cerrar sesiones de otros, hacer el Conteo físico.
- El dueño **nunca** debe mandar por chat su contraseña de Hacienda ni su firma electrónica: esos datos se guardan como secretos del servidor y los pone él mismo.
- La **factura electrónica** (`dte.html`, `js/dte.js`) es solo una **simulación**: debe seguir diciendo "Simulación · sin validez fiscal" y "Sello de recepción — no enviado" hasta que se conecte de verdad con Hacienda. No quitar esas marcas.
- No inventar datos ni registros. No borrar información del negocio sin que el dueño lo pida claramente.
- No escribir contraseñas, claves ni datos de tarjetas en ningún campo.

## 5. Diseño actual
- Colores: vino `#6B2D3E`, dorado `#C9973F` / `#e2b45a`, fondo `#F5F2F3`. Letras: DM Sans y Bricolage Grotesque.
- **Inicio de sesión** (`index.html`, `css/login.css`): diseño "rosa con accesorios" (fondo rosado con anillos, aretes, bolsos, relojes flotando; tarjeta blanca "¡Hola de nuevo!"; aviso "Conexión segura · Acceso solo para usuarios autorizados"). En computadora es una tarjeta de dos lados (izquierda vino con DAYMARSV, derecha el formulario). **Sin la "D"** (al dueño no le gusta). Al dueño NO le gustaron: el anillo con diamante, "Aurora" (vidrio oscuro), el "profesional" blanco.
- **Menú** (`menu.html`): «Preventa» va en Vender (junto a Pedidos en línea); «Descuentos» se movió a Negocio para que Vender siga con 9. «Tienda en línea» ya no está en el menú: es un botón arriba a la derecha dentro de **Actividad** (solo administradores ven Actividad). En celular, cuadritos de 3 en fila. En computadora, cuadritos pequeños de **9 por fila** (cada grupo en una sola fila). NO le gustaron los paneles por grupo ni la lista con descripciones.
- **Almacenamiento**: botones de la cabecera solo con íconos (excepto el valor del inventario). En las tarjetas de producto los botones van **2 arriba (Vender · Tienda) y 2 abajo (Precio · Stock)**; el botón dice "Tienda" u "Oculto".
- Con el menú lateral cerrado en computadora, el contenido usa todo el ancho (no dejar margen grueso).

## 6. Funciones recientes importantes
- **Sesión**: no se cierra sola. Si falla la red al abrir, reintenta y muestra "Sin conexión · tu sesión sigue abierta" en vez de pedir contraseña. Las peticiones de inicio de sesión no se cortan a los 30 s.
- **¿Olvidaste tu contraseña?**: si el correo no es de un usuario autorizado, dice "Ese correo no tiene cuenta en el sistema…" (función `correo_tiene_cuenta`, migración 095).
- **Pendientes**: estado "Se lo llevó · debe" (entregado con saldo pendiente) para cobros pendientes.
- **Facturas**: formato Carta/A4 parecido al de Hacienda, botón Eliminar (solo principal), aviso de anulación por correo (también cuando se anula sin devolver stock).
- **Equipo y tareas** con número en el menú; centro de avisos (campana) y búsqueda global (lupa); notificaciones push.
- **Búsqueda por foto** (`js/fotobusq.js`, MobileNet en el navegador): funciona pero no es muy precisa.
- **Preventa** (migración 096, diseño «A · cinta dorada» elegido por el dueño): en Compra, interruptor «Preventa · próxima colección» con fecha de llegada, límite (vacío = sin límite) y % de anticipo (0% = sin anticipo, migración 098: en la tienda dice «Sin anticipo · pagas al recibir»). El producto sale en la tienda aunque tenga 0 unidades, con la etiqueta «PREVENTA» (mismo estilo que «NUEVO»: blanca, pequeña, en la esquina), «Llega aprox. … · quedan N» y botón «Pedir en preventa». En la tienda **no** se pregunta cómo pagar (el dueño lo acuerda por chat; migración 099: `pedidos_linea.pago` queda null = «Pago a convenir por chat»; el cupo se revisa en `tienda_pedido`). Al aceptar, la parte en preventa se vuelve una **Reserva** (`reservas.preventa/items/pedido_linea_id`) donde se registran los abonos; lo demás se vende como siempre. Al llegar, «Marcar entregada» usa `entregar_preventa` (pide pago completo y unidades, baja el stock y queda en el Kardex). Al subir stock de un producto en preventa, el sistema avisa a quién entregar y ofrece «Terminar preventa». El seguimiento del cliente muestra «Preventa apartada».
- **Sección Preventa** (`preventa.html`, `js/preventa.js`, `css/preventa.css`, migración 100; diseño «A · pestañas» elegido por el dueño): casilla en el menú. Arriba: Apartados, Por cobrar, Cobrado. Pestañas **Productos** (productos en preventa con llegada, cupo, «+ Apartar», «Ver apartados», «Editar», «Terminar preventa») y **Apartados** (reservas de preventa con filtros Falta pago/Anticipo/Pagado/Entregado/Cancelado; botones Registrar pago con atajos Anticipo/Todo → `reserva_abonos`, WhatsApp con mensaje según el estado, Entregar → `entregar_preventa`, ••• → Reservas/ficha del cliente/Cancelar → `cancelar_reserva`). «Apartar» crea apartados manuales con `crear_apartado_preventa` (revisa cupo, busca o crea el cliente por teléfono, primer pago opcional). `reservas.cliente_id` liga el apartado al cliente (también al aceptar pedidos en línea).
- **Colores con su propia foto** (migración 097, diseño «Formulario 1 · línea simple» + tienda «B · miniaturas con foto», elegidos por el dueño): en Compra, interruptor «Colores o variantes»; cada color tiene su foto (se elige tocando el cuadro, entre las imágenes del producto; se guarda en `producto_variantes.foto_url`) y unidades; el código de barras del color no se muestra: se genera solo (los que ya tenían se conservan). La tienda recibe `variants` en `tienda_catalogo`: la tarjeta muestra puntitos «N colores» y el botón «Elegir color» abre el detalle con miniaturas; el carrito y el pedido llevan el código del color. La preventa también funciona con colores. Preventa y Colores usan el estilo minimalista (sin recuadro amarillo). Las variantes van por nombre (sin puntito de color en el sistema; en las tarjetas y la tabla del Punto de venta se ven como miniaturas encimadas de sus fotos + «N variantes», opción B elegida por el dueño; en la tienda los puntitos usan la foto de cada variante).
- **Productos nuevos primero**: en el sistema y en la tienda los productos nuevos salen al inicio, también los de preventa aunque tengan 0 unidades.
- **Arreglo 097**: desde la 096 `tienda_pedido` fallaba con pedidos sin preventa («record pr is not assigned yet») durante ~15 min; se corrigió asignando el registro antes de usarlo. En PL/pgSQL, no leer campos de un `record` que pudo quedar sin asignar.
- **Fotos más rápidas**: cada foto de producto tiene foto grande (1000 px) + miniatura (480 px, `_t.jpg`, ~25 KB). Listas, tarjetas del punto de venta y la tienda usan la miniatura (`productos.foto_url` = miniatura de la primera foto; `producto_imagenes.thumb_url`); al abrir el producto se ve la grande. Las fotos nuevas ya se guardan así. Para las fotos viejas, el administrador principal usa una vez Configuración → Fotos → «Fotos más rápidas» (`crearMiniaturas` en js/app.js; no toca las fotos grandes).
- **Quitar fondo** (`js/fondo.js` + `modelos/u2netp.onnx`, gratis, corre en el dispositivo): botón ✨ en cada foto de la galería de Compra (Nuevo/Editar producto). Muestra antes/después, fondos blanco/rosado/vino suave/crema y reemplaza la foto al guardar el producto. El dueño eligió esta opción (A: botón en cada foto). Funciona bien con fotos de solo el producto; con personas deja parte de la persona.

## 7. Pendiente / ideas ofrecidas
- **Factura electrónica real**: el dueño se está inscribiendo en Hacienda. Faltan sus datos: NIT, NRC, nombre legal y comercial, actividad económica (código y descripción), dirección, teléfono, correo, códigos de establecimiento y punto de venta. La contraseña y la firma las pone él como secretos, nunca por chat.
- Búsqueda por foto más precisa (modelo más pesado tipo CLIP), si el dueño lo quiere.
- Etiquetas: cantidades por producto, formato para impresora térmica.

## 8. Servicios conectados y cómo conectarse (sin claves aquí)
Las claves **nunca** van en el chat, en este archivo ni en el código. Cada servicio las guarda en su propio lugar seguro; aquí solo se dice dónde.

| Servicio | Para qué | Dónde están las claves | Cómo se conecta un agente |
|---|---|---|---|
| **GitHub** (`industriastobias`) | Código de los 2 repos, GitHub Pages, Actions | Secretos del repo: `SUPABASE_DB_URL` (migraciones y respaldo), `RESPALDO_CLAVE` (respaldo) | En claude.ai: conector de GitHub / añadir el repo a la sesión. En la computadora: `gh auth login` con la cuenta del dueño. |
| **Supabase** | Base de datos, usuarios, correos automáticos, avisos | Contraseña de la base: solo en el secreto `SUPABASE_DB_URL` de GitHub. La clave pública `sb_publishable_…` está en `js/app.js` (es pública a propósito). | Los cambios de base se hacen con **migraciones** (`migraciones/NNN_*.sql`) y el Action las aplica. No hace falta acceso directo. |
| **Cloudflare** (cuenta `daymarsv`) | Worker **daymar-push** (notificaciones push, `…/enviar`) y Worker **daymar-fotos** + bucket R2 **daymar-fotos** (fotos) | Variables del Worker en el panel de Cloudflare: push → `VAPID_PUBLICA`, `VAPID_PRIVADA`, `CONTACTO`, `AVISOS`, `PERMITIR_TODO`; fotos → `SUPABASE_URL`, `SUPABASE_KEY`, `ORIGENES` y el enlace R2 `FOTOS` | En claude.ai: **Configuración → Conectores → Cloudflare** (el dueño inicia sesión una vez). En la computadora: `npx wrangler login` con la cuenta del dueño. El código de los Workers está en `cloudflare/`. |
| **Hacienda (DTE)** | Factura electrónica real (pendiente) | Usuario, contraseña y firma: el dueño los guardará como secretos del servidor | Aún no conectado. |

Si un agente nuevo no tiene acceso a un servicio, debe pedirle al dueño que **conecte el conector** o inicie sesión él mismo, nunca pedirle la clave por chat.

## 9. Notas técnicas útiles
- Algunas herramientas bloquean comandos que leen `js/app.js` porque contiene un correo; usa lectura/edición directa del archivo.
- Para probar sin tocar datos reales se usa un `window.supabase` falso (mock) en Playwright.
