-- =====================================================================
-- DAYMAR-SHOP · Migración "Sistema completo"
-- Usuarios por invitación · Facturas · Cierre de caja · Finanzas · Descuentos
-- Ejecutar DESPUÉS de schema.sql, migracion_compra.sql y migracion_almacen.sql.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- ---------- 1. USUARIOS POR INVITACIÓN ----------
alter table profiles add column if not exists email text;
update profiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null;

create table if not exists invitaciones (
  email text primary key check (email = lower(email)),
  rol rol_usuario not null default 'vendedor',
  nombre text,
  usada boolean not null default false,
  creado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table invitaciones enable row level security;
drop policy if exists ver_invitaciones on invitaciones;
create policy ver_invitaciones on invitaciones for select to authenticated using (es_admin());

-- Administrador principal (el único que crea cuentas y cambia roles)
create or replace function es_principal() returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() and lower(coalesce(auth.jwt() ->> 'email','')) = 'aehtobias@gmail.com'
$$;

-- Solo se pueden registrar correos invitados (o la primerísima cuenta del sistema)
create or replace function validar_registro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from profiles) = 0 then return new; end if;
  if exists (select 1 from invitaciones where email = lower(new.email)) then return new; end if;
  raise exception 'Este correo no tiene invitación. Pide al administrador principal que te invite.';
end $$;
drop trigger if exists antes_crear_usuario on auth.users;
create trigger antes_crear_usuario before insert on auth.users
for each row execute function validar_registro();

create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rol rol_usuario; v_nom text;
begin
  select rol, nombre into v_rol, v_nom from invitaciones where email = lower(new.email);
  if v_rol is null then
    v_rol := (case when (select count(*) from profiles) = 0 then 'admin' else 'vendedor' end)::rol_usuario;
  else
    update invitaciones set usada = true where email = lower(new.email);
  end if;
  insert into profiles (id, nombre, rol, email)
  values (new.id, coalesce(nullif(trim(v_nom),''), nullif(trim(new.raw_user_meta_data->>'nombre'),''), split_part(new.email,'@',1)), v_rol, lower(new.email));
  return new;
end $$;

-- Ya nadie edita perfiles directamente: solo las funciones del administrador principal
drop policy if exists admin_perfiles on profiles;

create or replace function invitar_usuario(p_email text, p_rol rol_usuario, p_nombre text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_mail text := lower(trim(p_email));
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede invitar usuarios'; end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
  if exists (select 1 from profiles where email = v_mail) then raise exception 'Ese correo ya tiene una cuenta'; end if;
  insert into invitaciones (email, rol, nombre, creado_por) values (v_mail, p_rol, nullif(trim(p_nombre),''), auth.uid())
  on conflict (email) do update set rol = excluded.rol, nombre = excluded.nombre, usada = false;
end $$;

create or replace function quitar_invitacion(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede quitar invitaciones'; end if;
  delete from invitaciones where email = lower(trim(p_email)) and not usada;
end $$;

create or replace function cambiar_rol_usuario(p_id uuid, p_rol rol_usuario) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede cambiar roles'; end if;
  if exists (select 1 from profiles where id = p_id and lower(email) = 'aehtobias@gmail.com') then
    raise exception 'La cuenta del administrador principal no se puede modificar'; end if;
  update profiles set rol = p_rol where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

create or replace function activar_usuario(p_id uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede activar o desactivar cuentas'; end if;
  if exists (select 1 from profiles where id = p_id and lower(email) = 'aehtobias@gmail.com') then
    raise exception 'La cuenta del administrador principal no se puede modificar'; end if;
  update profiles set activo = p_activo where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

-- ---------- 2. DATOS DEL NEGOCIO (para facturas y reportes) ----------
create table if not exists config_negocio (
  id integer primary key default 1 check (id = 1),
  nombre text not null default 'DAYMAR-SHOP',
  eslogan text default 'A Family Company',
  razon_social text, nit text, nrc text, giro text,
  direccion text, telefono text, correo text,
  iva_pct numeric(5,2) not null default 13 check (iva_pct between 0 and 100),
  pie text default '¡Gracias por su compra!',
  updated_at timestamptz not null default now()
);
insert into config_negocio (id) values (1) on conflict do nothing;
alter table config_negocio enable row level security;
drop policy if exists ver_config on config_negocio;
drop policy if exists admin_config on config_negocio;
create policy ver_config on config_negocio for select to authenticated using (es_usuario_activo());
create policy admin_config on config_negocio for update to authenticated using (es_admin()) with check (es_admin());

-- ---------- 3. FACTURAS ----------
create sequence if not exists factura_seq;
create table if not exists facturas (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('factura_seq'),
  fecha date not null default ((now() at time zone 'America/El_Salvador')::date),
  cliente_nombre text, cliente_doc text, cliente_direccion text, cliente_telefono text,
  metodo_pago text not null default 'Efectivo',
  iva_modo text not null default 'incluido' check (iva_modo in ('incluido','agregado','ninguno')),
  iva_pct numeric(5,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  descuento_monto numeric(12,2) not null default 0,
  envio numeric(12,2) not null default 0,
  iva_monto numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  efectivo numeric(12,2), cambio numeric(12,2),
  nota text,
  estado text not null default 'emitida' check (estado in ('emitida','anulada')),
  venta_ids uuid[] not null default '{}',
  codigo text not null,
  creado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  anulada_en timestamptz
);
create index if not exists facturas_fecha_idx on facturas (fecha desc, numero desc);
create table if not exists factura_items (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas(id) on delete cascade,
  orden integer not null default 0,
  nombre text not null, codigo text,
  cantidad integer not null check (cantidad > 0),
  precio_unit numeric(10,2) not null check (precio_unit >= 0),
  total numeric(12,2) not null
);
create index if not exists factura_items_idx on factura_items (factura_id, orden);
alter table facturas enable row level security;
alter table factura_items enable row level security;
drop policy if exists ver_facturas on facturas;
drop policy if exists ver_factura_items on factura_items;
create policy ver_facturas on facturas for select to authenticated using (es_usuario_activo());
create policy ver_factura_items on factura_items for select to authenticated using (es_usuario_activo());

-- p_items = [{"nombre","codigo"?,"cantidad","precio"}]
-- p_opts  = {cliente_nombre, cliente_doc, cliente_direccion, cliente_telefono, metodo, iva_modo,
--            descuento_tipo ('pct'|'monto'), descuento_valor, envio, efectivo, nota, venta_ids[]}
create or replace function crear_factura(p_items jsonb, p_opts jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := coalesce(p_opts,'{}'::jsonb); it jsonb; v_id uuid := gen_random_uuid();
  v_sub numeric := 0; v_desc numeric := 0; v_env numeric := greatest(coalesce((o->>'envio')::numeric,0),0);
  v_neto numeric; v_iva numeric := 0; v_total numeric; v_pct numeric; v_modo text := coalesce(o->>'iva_modo','incluido');
  v_met text := coalesce(nullif(o->>'metodo',''),'Efectivo'); v_ef numeric; v_cant integer; v_pr numeric; v_n integer := 0;
  v_ventas uuid[] := '{}'; vid uuid; r record;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La factura necesita al menos un producto'; end if;
  if v_modo not in ('incluido','agregado','ninguno') then raise exception 'Modo de IVA no válido'; end if;
  if v_met not in ('Efectivo','Tarjeta','Transferencia') then raise exception 'Método de pago no válido'; end if;
  select iva_pct into v_pct from config_negocio where id = 1;
  if v_modo = 'ninguno' then v_pct := 0; end if;

  if o ? 'venta_ids' and jsonb_typeof(o->'venta_ids') = 'array' then
    for vid in select (x)::uuid from jsonb_array_elements_text(o->'venta_ids') x loop
      select f.numero into r from facturas f where f.estado = 'emitida' and vid = any(f.venta_ids) limit 1;
      if found then raise exception 'Una de las ventas ya tiene la factura F-%', lpad(r.numero::text,6,'0'); end if;
      v_ventas := v_ventas || vid;
    end loop;
  end if;

  insert into facturas (id, cliente_nombre, cliente_doc, cliente_direccion, cliente_telefono, metodo_pago, iva_modo, iva_pct, nota, venta_ids, codigo, creado_por)
  values (v_id, nullif(trim(o->>'cliente_nombre'),''), nullif(trim(o->>'cliente_doc'),''), nullif(trim(o->>'cliente_direccion'),''), nullif(trim(o->>'cliente_telefono'),''),
          v_met, v_modo, v_pct, nullif(trim(o->>'nota'),''), v_ventas, upper(substr(md5(random()::text || clock_timestamp()::text),1,10)), auth.uid());

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::integer; v_pr := round((it->>'precio')::numeric, 2);
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad no válida'; end if;
    if v_pr is null or v_pr < 0 then raise exception 'Precio no válido'; end if;
    if nullif(trim(it->>'nombre'),'') is null then raise exception 'Cada línea necesita un nombre'; end if;
    v_n := v_n + 1;
    insert into factura_items (factura_id, orden, nombre, codigo, cantidad, precio_unit, total)
    values (v_id, v_n, left(trim(it->>'nombre'),160), nullif(trim(it->>'codigo'),''), v_cant, v_pr, round(v_pr * v_cant, 2));
    v_sub := v_sub + round(v_pr * v_cant, 2);
  end loop;

  if coalesce(o->>'descuento_tipo','pct') = 'monto' then v_desc := least(greatest(coalesce((o->>'descuento_valor')::numeric,0),0), v_sub);
  else v_desc := round(v_sub * least(greatest(coalesce((o->>'descuento_valor')::numeric,0),0),100) / 100, 2); end if;
  v_neto := v_sub - v_desc + v_env;
  if v_modo = 'agregado' then v_iva := round(v_neto * v_pct / 100, 2); v_total := v_neto + v_iva;
  elsif v_modo = 'incluido' then v_total := v_neto; v_iva := round(v_total - v_total / (1 + v_pct/100), 2);
  else v_total := v_neto; end if;

  v_ef := nullif(o->>'efectivo','')::numeric;
  if v_met = 'Efectivo' and v_ef is not null and v_ef < v_total then raise exception 'El efectivo recibido es menor al total'; end if;
  if v_met <> 'Efectivo' then v_ef := null; end if;

  update facturas set subtotal = v_sub, descuento_monto = v_desc, envio = v_env, iva_monto = v_iva, total = v_total,
         efectivo = v_ef, cambio = case when v_ef is null then null else v_ef - v_total end where id = v_id;
  return v_id;
end $$;

create or replace function anular_factura(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede anular facturas'; end if;
  update facturas set estado = 'anulada', anulada_en = now() where id = p_id and estado = 'emitida';
  if not found then raise exception 'La factura no existe o ya está anulada'; end if;
end $$;

-- ---------- 4. CIERRE DE CAJA (no borra nada: guarda un registro) ----------
create table if not exists cierres_caja (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  resumen jsonb not null,
  n_ventas integer not null default 0,
  total_ventas numeric(12,2) not null default 0,
  costo_total numeric(12,2) not null default 0,
  n_anuladas integer not null default 0,
  esperado_efectivo numeric(12,2) not null default 0,
  efectivo_contado numeric(12,2),
  diferencia numeric(12,2),
  nota text,
  creado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cierres_fecha_idx on cierres_caja (fecha desc, created_at desc);
alter table cierres_caja enable row level security;
drop policy if exists ver_cierres on cierres_caja;
create policy ver_cierres on cierres_caja for select to authenticated using (es_usuario_activo());

create or replace function cerrar_caja(p_fecha date, p_contado numeric default null, p_nota text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid(); v_res jsonb; v_n int; v_tot numeric; v_cost numeric; v_anu int; v_esp numeric;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  if p_contado is not null and p_contado < 0 then raise exception 'El efectivo contado no puede ser negativo'; end if;
  with v as (
    select case when tipo = 'entrega_pendiente' then 'ent' when tipo = 'cod' then 'cod' when tipo = 'cobro_pendiente' then 'cob'
                when metodo_pago = 'Transferencia' then 'tr' else 'ef' end as k, total, costo_total
    from ventas where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date = p_fecha),
  g as (select k, sum(total) t, count(*) n from v group by k)
  select jsonb_object_agg(k, jsonb_build_object('total', t, 'n', n)), coalesce(sum(n),0), coalesce(sum(t),0)
    into v_res, v_n, v_tot from g;
  select coalesce(sum(costo_total),0) into v_cost from ventas where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date = p_fecha;
  select count(*) into v_anu from ventas where estado = 'anulada' and (created_at at time zone 'America/El_Salvador')::date = p_fecha;
  v_res := coalesce(v_res,'{}'::jsonb);
  v_esp := coalesce((v_res->'ef'->>'total')::numeric, 0);
  insert into cierres_caja (id, fecha, resumen, n_ventas, total_ventas, costo_total, n_anuladas, esperado_efectivo, efectivo_contado, diferencia, nota, creado_por)
  values (v_id, p_fecha, v_res, v_n, v_tot, v_cost, v_anu, v_esp, p_contado, case when p_contado is null then null else p_contado - v_esp end, nullif(trim(p_nota),''), auth.uid());
  return v_id;
end $$;

-- ---------- 5. FINANZAS (solo administradores) ----------
alter table proveedores add column if not exists nit text, add column if not exists direccion text, add column if not exists observaciones text;

create table if not exists fin_movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default ((now() at time zone 'America/El_Salvador')::date),
  tipo text not null check (tipo in ('ingreso','gasto','costo')),
  categoria text not null default 'General',
  descripcion text,
  monto numeric(12,2) not null check (monto > 0),
  metodo text default 'Efectivo',
  proveedor_id uuid references proveedores(id) on delete set null,
  referencia text,
  conciliado boolean not null default false,
  creado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fin_mov_fecha_idx on fin_movimientos (fecha desc);
create table if not exists fin_cuentas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cobrar','pagar')),
  tercero text not null,
  concepto text,
  monto numeric(12,2) not null check (monto > 0),
  abonado numeric(12,2) not null default 0 check (abonado >= 0),
  fecha date not null default ((now() at time zone 'America/El_Salvador')::date),
  vence date,
  estado text not null default 'pendiente' check (estado in ('pendiente','pagada')),
  created_at timestamptz not null default now()
);
create table if not exists fin_banco (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default ((now() at time zone 'America/El_Salvador')::date),
  saldo_banco numeric(12,2) not null,
  nota text,
  created_at timestamptz not null default now()
);
alter table fin_movimientos enable row level security;
alter table fin_cuentas enable row level security;
alter table fin_banco enable row level security;
drop policy if exists admin_fin_mov on fin_movimientos;
drop policy if exists admin_fin_cuentas on fin_cuentas;
drop policy if exists admin_fin_banco on fin_banco;
create policy admin_fin_mov on fin_movimientos for all to authenticated using (es_admin()) with check (es_admin());
create policy admin_fin_cuentas on fin_cuentas for all to authenticated using (es_admin()) with check (es_admin());
create policy admin_fin_banco on fin_banco for all to authenticated using (es_admin()) with check (es_admin());

create or replace function abonar_cuenta(p_id uuid, p_monto numeric) returns void
language plpgsql security definer set search_path = public as $$
declare c fin_cuentas%rowtype;
begin
  if not es_admin() then raise exception 'Solo un administrador puede registrar abonos'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El abono debe ser mayor a cero'; end if;
  select * into c from fin_cuentas where id = p_id for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if c.estado = 'pagada' then raise exception 'Esta cuenta ya está pagada'; end if;
  if c.abonado + p_monto > c.monto then raise exception 'El abono supera el saldo (%)', c.monto - c.abonado; end if;
  update fin_cuentas set abonado = abonado + p_monto, estado = case when abonado + p_monto >= monto then 'pagada' else 'pendiente' end where id = p_id;
  insert into fin_movimientos (tipo, categoria, descripcion, monto, creado_por)
  values (case when c.tipo = 'cobrar' then 'ingreso' else 'gasto' end,
          case when c.tipo = 'cobrar' then 'Cobro de cuenta' else 'Pago de cuenta' end,
          c.tercero || coalesce(' · ' || c.concepto,''), p_monto, auth.uid());
end $$;

-- Ventas por mes (ingresos y costo de lo vendido)
create or replace function fin_ventas_mensuales(p_desde date, p_hasta date)
returns table (mes date, ventas numeric, costo numeric, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede ver finanzas'; end if;
  return query
  select date_trunc('month', (created_at at time zone 'America/El_Salvador'))::date, coalesce(sum(total),0), coalesce(sum(costo_total),0), count(*)
  from ventas
  where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date between p_desde and p_hasta
  group by 1 order by 1;
end $$;

-- ---------- 6. DESCUENTOS ----------
create table if not exists promo_codigos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = upper(codigo)),
  pct numeric(5,2) not null check (pct > 0 and pct <= 100),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists descuentos_programados (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references categorias(id) on delete cascade,   -- null = todas las categorías
  pct numeric(5,2) not null check (pct > 0 and pct <= 100),
  desde date not null, hasta date not null check (hasta >= desde),
  estado text not null default 'pendiente' check (estado in ('pendiente','activo','finalizado')),
  created_at timestamptz not null default now()
);
alter table promo_codigos enable row level security;
alter table descuentos_programados enable row level security;
drop policy if exists ver_promos on promo_codigos;
drop policy if exists admin_promos on promo_codigos;
drop policy if exists ver_programados on descuentos_programados;
drop policy if exists admin_programados on descuentos_programados;
create policy ver_promos on promo_codigos for select to authenticated using (es_usuario_activo());
create policy admin_promos on promo_codigos for all to authenticated using (es_admin()) with check (es_admin());
create policy ver_programados on descuentos_programados for select to authenticated using (es_usuario_activo());
create policy admin_programados on descuentos_programados for all to authenticated using (es_admin()) with check (es_admin());

create or replace function aplicar_descuento(p_categoria uuid, p_pct numeric) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede cambiar descuentos'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'El descuento debe estar entre 0 y 100'; end if;
  update productos set descuento_pct = p_pct where activo and (p_categoria is null or categoria_id = p_categoria);
  get diagnostics n = row_count; return n;
end $$;

-- Activa los descuentos programados que ya empezaron y quita los que terminaron.
-- Cualquier usuario activo puede ejecutarla (se llama al abrir las páginas).
create or replace function aplicar_programados() returns integer
language plpgsql security definer set search_path = public as $$
declare d record; hoy date := (now() at time zone 'America/El_Salvador')::date; n integer := 0;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  for d in select * from descuentos_programados where estado = 'activo' and hasta < hoy loop
    update productos set descuento_pct = 0 where activo and (d.categoria_id is null or categoria_id = d.categoria_id);
    update descuentos_programados set estado = 'finalizado' where id = d.id; n := n + 1;
  end loop;
  for d in select * from descuentos_programados where estado = 'pendiente' and desde <= hoy and hasta >= hoy order by created_at loop
    update productos set descuento_pct = d.pct where activo and (d.categoria_id is null or categoria_id = d.categoria_id);
    update descuentos_programados set estado = 'activo' where id = d.id; n := n + 1;
  end loop;
  update descuentos_programados set estado = 'finalizado' where estado = 'pendiente' and hasta < hoy;
  return n;
end $$;

-- ---------- 7. PERMISOS DE LAS FUNCIONES ----------
do $$
declare f text;
begin
  foreach f in array array[
    'es_principal()','invitar_usuario(text,rol_usuario,text)','quitar_invitacion(text)',
    'cambiar_rol_usuario(uuid,rol_usuario)','activar_usuario(uuid,boolean)','crear_factura(jsonb,jsonb)','anular_factura(uuid)',
    'cerrar_caja(date,numeric,text)','abonar_cuenta(uuid,numeric)','fin_ventas_mensuales(date,date)',
    'aplicar_descuento(uuid,numeric)','aplicar_programados()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------- 8. La venta sencilla del panel también respeta el descuento del producto ----------
create or replace function registrar_venta(
  p_cliente uuid, p_items jsonb, p_descuento numeric default 0, p_metodo text default 'Efectivo'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; it jsonb; pr record; q integer; v_precio numeric(10,2);
  v_sub numeric(12,2) := 0; v_cost numeric(12,2) := 0;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos'; end if;
  if p_descuento is null or p_descuento < 0 or p_descuento > 100 then
    raise exception 'Descuento inválido'; end if;

  insert into ventas (cliente_id, usuario_id, descuento_pct, metodo_pago)
  values (p_cliente, auth.uid(), p_descuento, p_metodo) returning id into v_id;

  for it in select value from jsonb_array_elements(p_items) loop
    q := (it->>'cantidad')::integer;
    if q is null or q <= 0 then raise exception 'Cantidad inválida'; end if;
    select * into pr from productos where id = (it->>'producto_id')::uuid and activo for update;
    if not found then raise exception 'Producto no encontrado'; end if;
    if pr.stock < q then raise exception 'Stock insuficiente de %: quedan %', pr.nombre, pr.stock; end if;
    v_precio := round(pr.precio_venta * (1 - coalesce(pr.descuento_pct,0) / 100), 2);

    update productos set stock = stock - q where id = pr.id;
    insert into venta_items (venta_id, producto_id, cantidad, precio_unit, costo_unit, nombre, codigo, codigo_barras, precio_original, descuento_pct)
      values (v_id, pr.id, q, v_precio, pr.precio_costo, pr.nombre, pr.codigo, pr.codigo_barras, pr.precio_venta, coalesce(pr.descuento_pct,0));
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (pr.id, 'venta', -q, pr.stock - q, 'Venta', v_id, auth.uid());
    v_sub := v_sub + q * v_precio;
    v_cost := v_cost + q * pr.precio_costo;
  end loop;

  update ventas set subtotal = v_sub, costo_total = v_cost, total = round(v_sub * (1 - p_descuento / 100), 2),
         ganancia_neta = null
   where id = v_id;
  return v_id;
end $$;
revoke execute on function registrar_venta(uuid, jsonb, numeric, text) from public, anon;
grant execute on function registrar_venta(uuid, jsonb, numeric, text) to authenticated;
