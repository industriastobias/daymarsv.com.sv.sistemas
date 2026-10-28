-- =====================================================================
-- DAYMARSHOP · Migración para la página de Compra
-- Pégalo completo en Supabase → SQL Editor → Run (una sola vez).
-- No borra nada: solo agrega columnas, una tabla y funciones.
-- =====================================================================

-- ---------- Campos nuevos en productos ----------
alter table productos
  add column if not exists codigo_barras text,
  add column if not exists descripcion text,
  add column if not exists descuento_pct numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  add column if not exists fecha_compra date,
  add column if not exists tipo_compra text not null default 'normal' check (tipo_compra in ('normal','lote')),
  add column if not exists lotes integer not null default 0 check (lotes >= 0),
  add column if not exists unidades_por_lote integer not null default 0 check (unidades_por_lote >= 0),
  add column if not exists eliminado_en timestamptz;   -- papelera: fecha en que se envió

create unique index if not exists productos_codigo_barras_uq on productos (codigo_barras) where codigo_barras is not null;
create index if not exists productos_activo_idx on productos (activo, created_at desc);

-- ---------- Varias fotos por producto ----------
create table if not exists producto_imagenes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  url text not null,
  thumb_url text,
  path text,
  thumb_path text,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists producto_imagenes_prod_idx on producto_imagenes (producto_id, orden);
alter table producto_imagenes enable row level security;
drop policy if exists ver_imagenes on producto_imagenes;
drop policy if exists admin_imagenes on producto_imagenes;
create policy ver_imagenes   on producto_imagenes for select to authenticated using (es_usuario_activo());
create policy admin_imagenes on producto_imagenes for all    to authenticated using (es_admin()) with check (es_admin());

-- ---------- Categorías iniciales ----------
insert into categorias (nombre) values
 ('Accesorios para el cabello'),('Anillos'),('Aritos'),('Billeteras'),('Carteras'),('Case audifonos'),
 ('Case telefonos'),('Chokers'),('Collares'),('General'),('Lentes de sol'),('Otros'),('Pulseras'),('Relojes')
on conflict (nombre) do nothing;

-- ---------- Registrar compras (uno o muchos productos, todo o nada) ----------
-- p_items = [{codigo,nombre,codigo_barras,categoria,precio_venta,precio_costo,fecha_compra,descuento_pct,
--             cantidad,tipo_compra,lotes,unidades_por_lote,descripcion,sumar}]
-- Si el código ya existe y sumar = true, suma el stock; si no, avisa del error.
create or replace function registrar_compra(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; v_cat uuid; v_nom text; v_id uuid; v_stock integer; v_q integer;
  v_ex productos%rowtype; v_out jsonb := '[]'::jsonb; v_existia boolean; v_lote boolean;
begin
  if not es_admin() then raise exception 'Solo un administrador puede registrar compras'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'No hay productos para guardar'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_q := coalesce((it->>'cantidad')::integer, 0);
    if v_q < 0 then raise exception 'La cantidad no puede ser negativa (%)', it->>'codigo'; end if;
    if coalesce(trim(it->>'codigo'), '') = '' or coalesce(trim(it->>'nombre'), '') = '' then
      raise exception 'Falta el nombre o el código de un producto'; end if;
    v_lote := coalesce(it->>'tipo_compra', 'normal') = 'lote';

    v_nom := nullif(trim(it->>'categoria'), '');
    v_cat := null;
    if v_nom is not null then
      select id into v_cat from categorias where lower(nombre) = lower(v_nom);
      if v_cat is null then insert into categorias (nombre) values (v_nom) returning id into v_cat; end if;
    end if;

    select * into v_ex from productos where codigo = it->>'codigo' for update;
    v_existia := found;
    if v_existia then
      if not coalesce((it->>'sumar')::boolean, false) then raise exception 'El código % ya existe', it->>'codigo'; end if;
      if not v_ex.activo then raise exception 'El código % está en la papelera. Restáuralo primero.', it->>'codigo'; end if;
      update productos set
        stock = stock + v_q,
        tipo_compra = case when v_lote then 'lote' else tipo_compra end,
        lotes = case when v_lote then lotes + coalesce((it->>'lotes')::integer, 0) else lotes end,
        unidades_por_lote = case when v_lote and unidades_por_lote = 0 then coalesce((it->>'unidades_por_lote')::integer, 0) else unidades_por_lote end
      where id = v_ex.id returning id, stock into v_id, v_stock;
    else
      insert into productos (codigo, nombre, codigo_barras, categoria_id, precio_venta, precio_costo, stock,
                             descripcion, descuento_pct, fecha_compra, tipo_compra, lotes, unidades_por_lote)
      values (trim(it->>'codigo'), trim(it->>'nombre'), nullif(trim(it->>'codigo_barras'), ''), v_cat,
              coalesce((it->>'precio_venta')::numeric, 0), coalesce((it->>'precio_costo')::numeric, 0), v_q,
              nullif(trim(it->>'descripcion'), ''), coalesce((it->>'descuento_pct')::numeric, 0),
              nullif(it->>'fecha_compra', '')::date, case when v_lote then 'lote' else 'normal' end,
              case when v_lote then coalesce((it->>'lotes')::integer, 0) else 0 end,
              case when v_lote then coalesce((it->>'unidades_por_lote')::integer, 0) else 0 end)
      returning id, stock into v_id, v_stock;
    end if;

    if v_q > 0 then
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, usuario_id)
      values (v_id, 'entrada', v_q, v_stock, case when v_existia then 'Compra (suma de stock)' else 'Compra inicial' end, auth.uid());
    end if;

    v_out := v_out || jsonb_build_object('id', v_id, 'codigo', it->>'codigo', 'existia', v_existia);
  end loop;
  return v_out;
end $$;

-- ---------- Regenerar códigos de barras (numéricos y únicos) ----------
create or replace function regenerar_codigos_barras(p_longitud integer default null) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; len integer; lo bigint; hi bigint; cod text; tries integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede regenerar códigos'; end if;
  if p_longitud is not null and (p_longitud < 4 or p_longitud > 8) then raise exception 'Longitud inválida'; end if;
  update productos set codigo_barras = null where activo;
  for r in select id from productos where activo order by created_at loop
    tries := 0;
    loop
      len := coalesce(p_longitud, 4 + floor(random() * 5)::integer);
      if tries > 300 then len := least(len + 1, 12); end if;
      lo := power(10::numeric, len - 1)::bigint;
      hi := power(10::numeric, len)::bigint - 1;
      cod := (lo + floor(random() * (hi - lo + 1))::bigint)::text;
      exit when not exists (select 1 from productos where codigo_barras = cod);
      tries := tries + 1;
    end loop;
    update productos set codigo_barras = cod where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Eliminar de la papelera para siempre ----------
-- Si el producto ya tiene ventas, se conserva oculto para no perder el historial.
create or replace function eliminar_producto_definitivo(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede eliminar definitivamente'; end if;
  perform 1 from productos where id = p_id and not activo;
  if not found then raise exception 'El producto no está en la papelera'; end if;
  if exists (select 1 from venta_items where producto_id = p_id) then
    update productos set eliminado_en = null where id = p_id;
    return 'oculto';
  end if;
  delete from movimientos_stock where producto_id = p_id;
  delete from productos where id = p_id;
  return 'borrado';
end $$;

revoke execute on function registrar_compra(jsonb) from public, anon;
revoke execute on function regenerar_codigos_barras(integer) from public, anon;
revoke execute on function eliminar_producto_definitivo(uuid) from public, anon;
grant execute on function registrar_compra(jsonb) to authenticated;
grant execute on function regenerar_codigos_barras(integer) to authenticated;
grant execute on function eliminar_producto_definitivo(uuid) to authenticated;
