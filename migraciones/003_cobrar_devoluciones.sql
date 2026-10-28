-- Cuentas por cobrar ligadas al cliente + devoluciones y cambios. Se puede correr más de una vez.

-- ============ 1. Cuentas por cobrar ligadas a un cliente ============
alter table fin_cuentas add column if not exists cliente_id uuid references clientes(id) on delete set null;
create index if not exists fin_cuentas_cliente_idx on fin_cuentas (cliente_id);

-- ============ 2. Devoluciones y cambios ============
create table if not exists devoluciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  fecha date not null default ((now() at time zone 'America/El_Salvador')::date),
  venta_id uuid references ventas(id) on delete set null,
  venta_numero bigint,
  cliente_nombre text,
  tipo text not null check (tipo in ('devolucion','cambio')),
  motivo text,
  metodo text not null default 'Efectivo',
  monto_devuelto numeric(12,2) not null default 0,   -- valor de lo que el cliente regresa
  costo_recuperado numeric(12,2) not null default 0, -- costo de lo que vuelve al stock
  monto_nuevo numeric(12,2) not null default 0,      -- valor de lo que se entrega a cambio
  costo_nuevo numeric(12,2) not null default 0,
  diferencia numeric(12,2) not null default 0,       -- + el cliente paga · − se le devuelve dinero
  creado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists devoluciones_fecha_idx on devoluciones (fecha desc);
create index if not exists devoluciones_venta_idx on devoluciones (venta_id);
create table if not exists devolucion_items (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references devoluciones(id) on delete cascade,
  direccion text not null check (direccion in ('entra','sale')),
  venta_item_id uuid,
  producto_id uuid,
  nombre text,
  cantidad integer not null check (cantidad > 0),
  precio_unit numeric(12,2) not null default 0,
  costo_unit numeric(12,2) not null default 0,
  regresa_stock boolean not null default true
);
create index if not exists devolucion_items_dev_idx on devolucion_items (devolucion_id);
create index if not exists devolucion_items_vi_idx on devolucion_items (venta_item_id);
alter table devoluciones enable row level security;
alter table devolucion_items enable row level security;
drop policy if exists ver_devoluciones on devoluciones;
drop policy if exists ver_devolucion_items on devolucion_items;
create policy ver_devoluciones on devoluciones for select to authenticated using (es_usuario_activo());
create policy ver_devolucion_items on devolucion_items for select to authenticated using (es_usuario_activo());

-- p_items  = [{venta_item_id, cantidad, regresa_stock}]   lo que el cliente devuelve
-- p_nuevos = [{producto_id, cantidad}]                    lo que se entrega a cambio (opcional)
create or replace function registrar_devolucion(p_venta uuid, p_items jsonb, p_motivo text, p_metodo text, p_nuevos jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v ventas%rowtype; it jsonb; vi venta_items%rowtype; pr productos%rowtype;
  v_id uuid := gen_random_uuid(); q int; ya int; f numeric; u numeric;
  v_dev numeric := 0; v_cdev numeric := 0; v_new numeric := 0; v_cnew numeric := 0; v_reg boolean; v_stock int;
begin
  if not es_admin() then raise exception 'Solo un administrador puede registrar devoluciones'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Elige qué productos se devuelven'; end if;
  if p_metodo not in ('Efectivo','Transferencia','Tarjeta') then raise exception 'Método inválido'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if v.estado <> 'completada' then raise exception 'Solo se pueden devolver productos de ventas completadas'; end if;
  f := 1 - coalesce(v.descuento_pct, 0) / 100;
  insert into devoluciones (id, venta_id, venta_numero, cliente_nombre, tipo, motivo, metodo, creado_por)
    values (v_id, v.id, v.numero, v.cliente_nombre, case when jsonb_typeof(p_nuevos) = 'array' and jsonb_array_length(p_nuevos) > 0 then 'cambio' else 'devolucion' end,
            nullif(trim(coalesce(p_motivo,'')), ''), p_metodo, auth.uid());
  for it in select value from jsonb_array_elements(p_items) loop
    q := (it->>'cantidad')::int;
    if q is null or q <= 0 then raise exception 'Cantidad inválida'; end if;
    select * into vi from venta_items where id = (it->>'venta_item_id')::uuid and venta_id = v.id;
    if not found then raise exception 'Un producto no pertenece a esta venta'; end if;
    select coalesce(sum(cantidad), 0) into ya from devolucion_items where venta_item_id = vi.id and direccion = 'entra';
    if q > vi.cantidad - ya then raise exception 'De "%" solo quedan % por devolver', coalesce(vi.nombre,'producto'), vi.cantidad - ya; end if;
    v_reg := coalesce((it->>'regresa_stock')::boolean, true) and vi.producto_id is not null;
    u := round(vi.precio_unit * f, 2);
    insert into devolucion_items (devolucion_id, direccion, venta_item_id, producto_id, nombre, cantidad, precio_unit, costo_unit, regresa_stock)
      values (v_id, 'entra', vi.id, vi.producto_id, vi.nombre, q, u, coalesce(vi.costo_unit,0), v_reg);
    v_dev := v_dev + q * u;
    if v_reg then
      update productos set stock = stock + q where id = vi.producto_id returning stock into v_stock;
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
        values (vi.producto_id, 'devolucion', q, v_stock, 'Devolución de la venta #' || v.numero, v.id, auth.uid());
      v_cdev := v_cdev + q * coalesce(vi.costo_unit,0);
    end if;
  end loop;
  if jsonb_typeof(p_nuevos) = 'array' then
    for it in select value from jsonb_array_elements(p_nuevos) loop
      q := (it->>'cantidad')::int;
      if q is null or q <= 0 then raise exception 'Cantidad inválida'; end if;
      select * into pr from productos where id = (it->>'producto_id')::uuid and activo for update;
      if not found then raise exception 'Producto no encontrado'; end if;
      if pr.stock < q then raise exception 'Stock insuficiente de %: quedan %', pr.nombre, pr.stock; end if;
      u := round(pr.precio_venta * (1 - coalesce(pr.descuento_pct,0) / 100), 2);
      update productos set stock = stock - q where id = pr.id returning stock into v_stock;
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
        values (pr.id, 'venta', -q, v_stock, 'Cambio de la venta #' || v.numero, v.id, auth.uid());
      insert into devolucion_items (devolucion_id, direccion, producto_id, nombre, cantidad, precio_unit, costo_unit, regresa_stock)
        values (v_id, 'sale', pr.id, pr.nombre, q, u, pr.precio_costo, true);
      v_new := v_new + q * u; v_cnew := v_cnew + q * pr.precio_costo;
    end loop;
  end if;
  update devoluciones set monto_devuelto = v_dev, costo_recuperado = v_cdev, monto_nuevo = v_new, costo_nuevo = v_cnew, diferencia = v_new - v_dev where id = v_id;
  return v_id;
end $$;
revoke execute on function registrar_devolucion(uuid, jsonb, text, text, jsonb) from public, anon;
grant execute on function registrar_devolucion(uuid, jsonb, text, text, jsonb) to authenticated;

-- Historial: quién hizo la devolución
drop trigger if exists bitacora_devoluciones on devoluciones;
create trigger bitacora_devoluciones after insert on devoluciones for each row execute function registrar_bitacora();

-- ============ 3. Ajustes en anular / eliminar ventas ============
create or replace function anular_venta(p_venta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it record; v_stock integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede anular ventas'; end if;
  if exists (select 1 from devoluciones where venta_id = p_venta) then
    raise exception 'Esta venta ya tiene devoluciones o cambios: no se puede anular. Puedes eliminarla si fue un error.'; end if;
  perform 1 from ventas where id = p_venta and estado in ('completada','pendiente') for update;
  if not found then raise exception 'La venta no existe o ya fue anulada'; end if;
  for it in select producto_id, cantidad from venta_items where venta_id = p_venta loop
    update productos set stock = stock + it.cantidad where id = it.producto_id returning stock into v_stock;
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (it.producto_id, 'devolucion', it.cantidad, v_stock, 'Venta anulada', p_venta, auth.uid());
  end loop;
  update ventas set estado = 'anulada', anulada_por = auth.uid(), anulada_en = now() where id = p_venta;
end $$;

create or replace function eliminar_venta(p_venta uuid, p_devolver boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; it record;
begin
  if not es_admin() then raise exception 'Solo un administrador puede eliminar ventas'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if p_devolver and v.estado <> 'anulada' then
    -- solo regresa lo que todavía no había vuelto por una devolución
    for it in select vi.producto_id, vi.cantidad - coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = vi.id and di.direccion = 'entra' and di.regresa_stock), 0) as falta
                from venta_items vi where vi.venta_id = p_venta and vi.producto_id is not null loop
      if it.falta > 0 then update productos set stock = stock + it.falta where id = it.producto_id; end if;
    end loop;
  end if;
  delete from movimientos_stock where venta_id = p_venta;
  delete from devoluciones where venta_id = p_venta;
  update facturas set venta_ids = array_remove(venta_ids, p_venta) where p_venta = any(venta_ids);
  delete from ventas where id = p_venta;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
    values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'ventas', 'eliminar_venta',
            case when p_devolver then 'Eliminó una venta y devolvió los productos al stock' else 'Eliminó una venta sin devolver al stock' end);
end $$;

-- ============ 4. Las devoluciones cuentan en finanzas y en el cierre de caja ============
create or replace function fin_ventas_mensuales(p_desde date, p_hasta date)
returns table (mes date, ventas numeric, costo numeric, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede ver finanzas'; end if;
  return query
  select m, coalesce(sum(vt),0), coalesce(sum(ct),0), coalesce(sum(nn),0)::bigint from (
    select date_trunc('month', (created_at at time zone 'America/El_Salvador'))::date as m, total as vt, costo_total as ct, 1 as nn
      from ventas where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date between p_desde and p_hasta
    union all
    select date_trunc('month', fecha)::date, monto_nuevo - monto_devuelto, costo_nuevo - costo_recuperado, 0
      from devoluciones where fecha between p_desde and p_hasta
  ) x group by m order by m;
end $$;

create or replace function cerrar_caja(p_fecha date, p_contado numeric default null, p_nota text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid(); v_res jsonb; v_n int; v_tot numeric; v_cost numeric; v_anu int; v_esp numeric;
  v_dn int; v_dt numeric; v_dc numeric; v_defe numeric;
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
  select count(*), coalesce(sum(monto_nuevo - monto_devuelto),0), coalesce(sum(costo_nuevo - costo_recuperado),0),
         coalesce(sum(case when metodo = 'Efectivo' then diferencia else 0 end),0)
    into v_dn, v_dt, v_dc, v_defe from devoluciones where fecha = p_fecha;
  v_res := coalesce(v_res,'{}'::jsonb);
  if v_dn > 0 then v_res := v_res || jsonb_build_object('dev', jsonb_build_object('total', v_dt, 'n', v_dn)); end if;
  v_esp := coalesce((v_res->'ef'->>'total')::numeric, 0) + v_defe;
  insert into cierres_caja (id, fecha, resumen, n_ventas, total_ventas, costo_total, n_anuladas, esperado_efectivo, efectivo_contado, diferencia, nota, creado_por)
  values (v_id, p_fecha, v_res, v_n, v_tot + v_dt, v_cost + v_dc, v_anu, v_esp, p_contado, case when p_contado is null then null else p_contado - v_esp end, nullif(trim(p_nota),''), auth.uid());
  return v_id;
end $$;
