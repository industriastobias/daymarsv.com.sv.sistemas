-- =====================================================================
-- DAYMARSHOP · Esquema de base de datos (PostgreSQL / Supabase)
-- Pégalo completo en Supabase → SQL Editor → Run
-- =====================================================================

create type rol_usuario as enum ('admin','vendedor');
create type tipo_movimiento as enum ('entrada','salida','venta','devolucion');

-- ---------- Tablas ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null default 'vendedor',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text, correo text, notas text,
  created_at timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text, correo text, notas text,
  created_at timestamptz not null default now()
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  categoria_id uuid references categorias(id) on delete set null,
  proveedor_id uuid references proveedores(id) on delete set null,
  precio_costo numeric(10,2) not null default 0 check (precio_costo >= 0),
  precio_venta numeric(10,2) not null default 0 check (precio_venta >= 0),
  stock integer not null default 0 check (stock >= 0),
  stock_minimo integer not null default 3 check (stock_minimo >= 0),
  foto_url text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on productos (nombre);
create index on productos (categoria_id);

create table ventas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  cliente_id uuid references clientes(id) on delete set null,
  usuario_id uuid references profiles(id),
  subtotal numeric(12,2) not null default 0,
  descuento_pct numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  total numeric(12,2) not null default 0,
  costo_total numeric(12,2) not null default 0,
  metodo_pago text not null check (metodo_pago in ('Efectivo','Tarjeta','Transferencia')),
  estado text not null default 'completada' check (estado in ('completada','anulada')),
  created_at timestamptz not null default now()
);
create index on ventas (created_at);
create index on ventas (cliente_id);

create table venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad integer not null check (cantidad > 0),
  precio_unit numeric(10,2) not null,
  costo_unit numeric(10,2) not null default 0
);
create index on venta_items (venta_id);
create index on venta_items (producto_id);

create table movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  tipo tipo_movimiento not null,
  cantidad integer not null check (cantidad <> 0),   -- con signo: + entra, - sale
  stock_resultante integer not null,
  nota text,
  venta_id uuid references ventas(id) on delete set null,
  usuario_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on movimientos_stock (producto_id, created_at desc);
create index on movimientos_stock (created_at desc);

-- ---------- Funciones de apoyo ----------
create or replace function es_usuario_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and activo)
$$;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'admin' and activo)
$$;

-- Al crear un usuario se crea su perfil. El PRIMER usuario es administrador.
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
    (case when (select count(*) from profiles) = 0 then 'admin' else 'vendedor' end)::rol_usuario
  );
  return new;
end $$;

create trigger al_crear_usuario after insert on auth.users
for each row execute function crear_perfil();

-- ---------- Operaciones de negocio (atómicas) ----------
-- Entrada o salida manual de stock (solo administrador)
create or replace function registrar_movimiento(
  p_producto uuid, p_tipo tipo_movimiento, p_cantidad integer, p_nota text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_stock integer; v_delta integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede ajustar el stock'; end if;
  if p_tipo not in ('entrada','salida') then raise exception 'Tipo de movimiento no permitido'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  v_delta := case when p_tipo = 'entrada' then p_cantidad else -p_cantidad end;

  select stock into v_stock from productos where id = p_producto and activo for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if v_stock + v_delta < 0 then raise exception 'Stock insuficiente: solo hay % unidades', v_stock; end if;

  update productos set stock = v_stock + v_delta where id = p_producto;
  insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, usuario_id)
  values (p_producto, p_tipo, v_delta, v_stock + v_delta, p_nota, auth.uid());
end $$;

-- Venta completa: valida stock, descuenta, guarda items y movimientos
-- p_items = [{"producto_id":"...","cantidad":2}, ...]. Los precios los toma el servidor.
create or replace function registrar_venta(
  p_cliente uuid, p_items jsonb, p_descuento numeric default 0, p_metodo text default 'Efectivo'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; it jsonb; pr record; q integer;
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

    update productos set stock = stock - q where id = pr.id;
    insert into venta_items (venta_id, producto_id, cantidad, precio_unit, costo_unit)
      values (v_id, pr.id, q, pr.precio_venta, pr.precio_costo);
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (pr.id, 'venta', -q, pr.stock - q, 'Venta', v_id, auth.uid());
    v_sub := v_sub + q * pr.precio_venta;
    v_cost := v_cost + q * pr.precio_costo;
  end loop;

  update ventas set subtotal = v_sub, costo_total = v_cost,
         total = round(v_sub * (1 - p_descuento / 100), 2)
   where id = v_id;
  return v_id;
end $$;

-- Anular venta: devuelve el stock (solo administrador)
create or replace function anular_venta(p_venta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it record; v_stock integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede anular ventas'; end if;
  perform 1 from ventas where id = p_venta and estado = 'completada' for update;
  if not found then raise exception 'La venta no existe o ya fue anulada'; end if;
  for it in select producto_id, cantidad from venta_items where venta_id = p_venta loop
    update productos set stock = stock + it.cantidad where id = it.producto_id returning stock into v_stock;
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (it.producto_id, 'devolucion', it.cantidad, v_stock, 'Venta anulada', p_venta, auth.uid());
  end loop;
  update ventas set estado = 'anulada' where id = p_venta;
end $$;

revoke execute on function registrar_movimiento(uuid, tipo_movimiento, integer, text) from public, anon;
revoke execute on function registrar_venta(uuid, jsonb, numeric, text) from public, anon;
revoke execute on function anular_venta(uuid) from public, anon;
grant execute on function registrar_movimiento(uuid, tipo_movimiento, integer, text) to authenticated;
grant execute on function registrar_venta(uuid, jsonb, numeric, text) to authenticated;
grant execute on function anular_venta(uuid) to authenticated;

-- ---------- Vistas para el panel ----------
create or replace view vista_ventas_diarias with (security_invoker = true) as
  select (created_at at time zone 'America/El_Salvador')::date as fecha,
         count(*)::int as ventas, sum(total) as total, sum(total - costo_total) as ganancia
  from ventas where estado = 'completada' group by 1;

create or replace view vista_top_productos with (security_invoker = true) as
  select p.id, p.nombre, sum(vi.cantidad)::int as unidades, sum(vi.cantidad * vi.precio_unit) as ingresos
  from venta_items vi
  join ventas v on v.id = vi.venta_id
  join productos p on p.id = vi.producto_id
  where v.estado = 'completada' and v.created_at > now() - interval '30 days'
  group by p.id, p.nombre order by ingresos desc limit 10;

-- ---------- Seguridad (Row Level Security) ----------
alter table profiles          enable row level security;
alter table categorias        enable row level security;
alter table proveedores       enable row level security;
alter table clientes          enable row level security;
alter table productos         enable row level security;
alter table ventas            enable row level security;
alter table venta_items       enable row level security;
alter table movimientos_stock enable row level security;

-- Lectura: cualquier usuario activo
create policy ver_profiles    on profiles          for select to authenticated using (es_usuario_activo());
create policy ver_categorias  on categorias        for select to authenticated using (es_usuario_activo());
create policy ver_proveedores on proveedores       for select to authenticated using (es_usuario_activo());
create policy ver_clientes    on clientes          for select to authenticated using (es_usuario_activo());
create policy ver_productos   on productos         for select to authenticated using (es_usuario_activo());
create policy ver_ventas      on ventas            for select to authenticated using (es_usuario_activo());
create policy ver_items       on venta_items       for select to authenticated using (es_usuario_activo());
create policy ver_movimientos on movimientos_stock for select to authenticated using (es_usuario_activo());

-- Escritura: administrador (clientes también los vendedores)
create policy admin_perfiles   on profiles    for update to authenticated using (es_admin()) with check (es_admin());
create policy admin_categorias on categorias  for all to authenticated using (es_admin()) with check (es_admin());
create policy admin_proveedores on proveedores for all to authenticated using (es_admin()) with check (es_admin());
create policy admin_productos  on productos   for all to authenticated using (es_admin()) with check (es_admin());
create policy crear_clientes   on clientes    for insert to authenticated with check (es_usuario_activo());
create policy editar_clientes  on clientes    for update to authenticated using (es_usuario_activo()) with check (es_usuario_activo());
create policy borrar_clientes  on clientes    for delete to authenticated using (es_admin());
-- ventas, venta_items y movimientos_stock NO tienen políticas de escritura:
-- solo se modifican mediante las funciones de arriba.

-- ---------- Fotos de productos ----------
insert into storage.buckets (id, name, public) values ('productos', 'productos', true)
on conflict (id) do nothing;
create policy fotos_ver    on storage.objects for select using (bucket_id = 'productos');
create policy fotos_subir  on storage.objects for insert to authenticated with check (bucket_id = 'productos' and es_admin());
create policy fotos_editar on storage.objects for update to authenticated using (bucket_id = 'productos' and es_admin());
create policy fotos_borrar on storage.objects for delete to authenticated using (bucket_id = 'productos' and es_admin());
