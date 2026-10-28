-- =====================================================================
-- DAYMARSHOP · Migración para Almacenamiento (punto de venta)
-- Pégalo completo en Supabase → SQL Editor → Run (una sola vez).
-- Requiere haber corrido antes schema.sql y migracion_compra.sql.
-- No borra datos: agrega columnas y funciones.
-- =====================================================================

-- ---------- Tipos de pedido y estados en ventas ----------
alter table ventas
  add column if not exists tipo text not null default 'inmediata',
  add column if not exists envio numeric(10,2) not null default 0,
  add column if not exists comision_tipo text not null default 'percentage',
  add column if not exists comision_valor numeric(10,2) not null default 0,
  add column if not exists comision_monto numeric(10,2) not null default 0,
  add column if not exists quien_paga text not null default 'client',
  add column if not exists seguro numeric(10,2) not null default 0,
  add column if not exists cliente_nombre text,
  add column if not exists abonado numeric(12,2) not null default 0,
  add column if not exists pendiente_monto numeric(12,2) not null default 0,
  add column if not exists ganancia_neta numeric(12,2),
  add column if not exists completada_en timestamptz,
  add column if not exists oculto_pendientes boolean not null default false;

alter table ventas drop constraint if exists ventas_tipo_check;
alter table ventas add constraint ventas_tipo_check
  check (tipo in ('inmediata','cod','entrega_pendiente','cobro_pendiente'));
alter table ventas drop constraint if exists ventas_comision_tipo_check;
alter table ventas add constraint ventas_comision_tipo_check check (comision_tipo in ('percentage','fixed'));
alter table ventas drop constraint if exists ventas_quien_paga_check;
alter table ventas add constraint ventas_quien_paga_check check (quien_paga in ('client','we'));
alter table ventas drop constraint if exists ventas_estado_check;
alter table ventas add constraint ventas_estado_check check (estado in ('completada','anulada','pendiente'));

create index if not exists ventas_estado_tipo_idx on ventas (estado, tipo, created_at desc);

-- ---------- Líneas de venta: permiten "venta rápida" (producto que no está en inventario) ----------
alter table venta_items alter column producto_id drop not null;
alter table venta_items
  add column if not exists nombre text,
  add column if not exists codigo text,
  add column if not exists codigo_barras text,
  add column if not exists categoria text,
  add column if not exists descripcion text,
  add column if not exists precio_original numeric(10,2),
  add column if not exists descuento_pct numeric(5,2) not null default 0,
  add column if not exists es_libre boolean not null default false;

update venta_items vi set nombre = p.nombre, codigo = p.codigo, codigo_barras = p.codigo_barras
  from productos p where p.id = vi.producto_id and vi.nombre is null;

-- ---------- Cálculo de totales (misma fórmula que tu página original) ----------
create or replace function pedido_totales(
  p_tipo text, p_sub numeric, p_envio numeric, p_ctipo text, p_cval numeric, p_quien text, p_seguro numeric,
  out comision numeric, out total numeric, out neta numeric
) language plpgsql immutable as $$
begin
  comision := 0; neta := null;
  if p_tipo in ('cod','entrega_pendiente') then
    comision := case when p_ctipo = 'fixed' then round(p_cval, 2) else round(p_sub * p_cval / 100, 2) end;
  end if;
  if p_tipo = 'cod' then
    total := p_sub + p_envio + p_seguro + case when p_quien = 'we' then -comision else comision end;
    neta  := p_sub - case when p_quien = 'we' then comision else 0 end;
  elsif p_tipo = 'entrega_pendiente' then
    total := p_sub + p_envio + comision;
  else
    total := p_sub;
  end if;
end $$;

-- ---------- Registrar un pedido (venta inmediata o pendiente), todo o nada ----------
-- p_items = [{producto_id, cantidad, precio?}]  ó  venta rápida: [{libre:true, nombre, precio, cantidad, categoria?, descripcion?, codigo_barras?}]
-- p_opts  = {tipo, metodo, envio, comision_tipo, comision_valor, quien_paga, seguro, cliente, abonado}
-- El precio de cada producto lo calcula el servidor (precio de venta − descuento). Solo un administrador puede cambiarlo.
create or replace function registrar_pedido(p_items jsonb, p_opts jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tipo text := coalesce(p_opts->>'tipo','inmediata');
  v_metodo text := coalesce(p_opts->>'metodo','Efectivo');
  v_envio numeric := coalesce(nullif(p_opts->>'envio','')::numeric,0);
  v_ctipo text := coalesce(p_opts->>'comision_tipo','percentage');
  v_cval numeric := coalesce(nullif(p_opts->>'comision_valor','')::numeric,0);
  v_quien text := coalesce(p_opts->>'quien_paga','client');
  v_seguro numeric := coalesce(nullif(p_opts->>'seguro','')::numeric,0);
  v_cliente text := nullif(trim(coalesce(p_opts->>'cliente','')),'');
  v_abono numeric := coalesce(nullif(p_opts->>'abonado','')::numeric,0);
  v_id uuid; it jsonb; pr record; q integer; v_precio numeric; v_base numeric;
  v_sub numeric := 0; v_cost numeric := 0; t record; v_pend boolean;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if v_tipo not in ('inmediata','cod','entrega_pendiente','cobro_pendiente') then raise exception 'Tipo de venta inválido'; end if;
  if v_metodo not in ('Efectivo','Transferencia') then raise exception 'Método de pago inválido'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  if v_envio < 0 or v_seguro < 0 or v_cval < 0 or v_abono < 0 then raise exception 'Los importes no pueden ser negativos'; end if;
  if v_ctipo not in ('percentage','fixed') then raise exception 'Tipo de comisión inválido'; end if;
  if v_ctipo = 'percentage' and v_cval > 100 then raise exception 'La comisión porcentual no puede superar el 100%%'; end if;
  if v_quien not in ('client','we') then raise exception 'Valor inválido'; end if;
  if v_tipo not in ('cod','entrega_pendiente') then v_envio := 0; v_cval := 0; end if;
  if v_tipo <> 'cod' then v_seguro := 0; v_quien := 'client'; end if;
  if v_tipo = 'entrega_pendiente' then v_ctipo := 'percentage'; end if;
  if v_tipo <> 'cobro_pendiente' then v_abono := 0; v_cliente := case when v_tipo='inmediata' then null else v_cliente end; end if;
  v_pend := v_tipo <> 'inmediata';

  insert into ventas (usuario_id, metodo_pago, tipo, estado, completada_en)
  values (auth.uid(), v_metodo, v_tipo, case when v_pend then 'pendiente' else 'completada' end,
          case when v_pend then null else now() end)
  returning id into v_id;

  for it in select value from jsonb_array_elements(p_items) loop
    q := (it->>'cantidad')::integer;
    if q is null or q <= 0 then raise exception 'Cantidad inválida'; end if;
    if coalesce((it->>'libre')::boolean,false) then
      v_precio := (it->>'precio')::numeric;
      if v_precio is null or v_precio <= 0 then raise exception 'El precio debe ser mayor a cero'; end if;
      if nullif(trim(coalesce(it->>'nombre','')),'') is null then raise exception 'El nombre del producto es obligatorio'; end if;
      insert into venta_items (venta_id, producto_id, cantidad, precio_unit, costo_unit, nombre, codigo, codigo_barras, categoria, descripcion, precio_original, es_libre)
      values (v_id, null, q, round(v_precio,2), 0, trim(it->>'nombre'), 'FAST_' || substr(gen_random_uuid()::text,1,8),
              nullif(trim(coalesce(it->>'codigo_barras','')),''), coalesce(nullif(trim(coalesce(it->>'categoria','')),''),'Venta rápida'),
              nullif(trim(coalesce(it->>'descripcion','')),''), round(v_precio,2), true);
      v_sub := v_sub + round(v_precio * q, 2);
    else
      select * into pr from productos where id = (it->>'producto_id')::uuid and activo for update;
      if not found then raise exception 'Producto no encontrado'; end if;
      if pr.stock < q then raise exception 'Stock insuficiente de %: quedan %', pr.nombre, pr.stock; end if;
      v_base := round(pr.precio_venta * (1 - coalesce(pr.descuento_pct,0) / 100), 2);
      v_precio := v_base;
      if it ? 'precio' and es_admin() then
        v_precio := (it->>'precio')::numeric;
        if v_precio is null or v_precio < 0 then raise exception 'Precio inválido'; end if;
      end if;
      update productos set stock = stock - q where id = pr.id;
      insert into venta_items (venta_id, producto_id, cantidad, precio_unit, costo_unit, nombre, codigo, codigo_barras, precio_original, descuento_pct)
      values (v_id, pr.id, q, round(v_precio,2), pr.precio_costo, pr.nombre, pr.codigo, pr.codigo_barras, pr.precio_venta, coalesce(pr.descuento_pct,0));
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (pr.id, 'venta', -q, pr.stock - q,
              case v_tipo when 'cod' then 'Pedido contra entrega' when 'entrega_pendiente' then 'Pedido pendiente de entrega'
                          when 'cobro_pendiente' then 'Pedido pendiente de cobro' else 'Venta' end, v_id, auth.uid());
      v_sub := v_sub + round(v_precio * q, 2);
      v_cost := v_cost + q * pr.precio_costo;
    end if;
  end loop;

  select * into t from pedido_totales(v_tipo, v_sub, v_envio, v_ctipo, v_cval, v_quien, v_seguro);
  if t.total < 0 then raise exception 'La comisión no puede producir un total negativo'; end if;
  if v_tipo = 'cobro_pendiente' then
    if v_cliente is null then raise exception 'Debes ingresar el nombre del cliente'; end if;
    if v_abono >= v_sub then raise exception 'El abono debe ser menor que el total'; end if;
  end if;

  update ventas set subtotal = v_sub, costo_total = v_cost, total = t.total,
         envio = v_envio, comision_tipo = v_ctipo, comision_valor = v_cval, comision_monto = t.comision,
         quien_paga = v_quien, seguro = v_seguro, cliente_nombre = v_cliente,
         abonado = v_abono, pendiente_monto = case when v_tipo='cobro_pendiente' then v_sub - v_abono else 0 end,
         ganancia_neta = t.neta
   where id = v_id;
  return v_id;
end $$;

-- ---------- Confirmar cobro / entrega / pago completo ----------
create or replace function completar_pedido(p_venta uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  perform 1 from ventas where id = p_venta and estado = 'pendiente' for update;
  if not found then raise exception 'El pedido no existe o ya fue completado'; end if;
  update ventas set estado = 'completada', completada_en = now(),
         abonado = case when tipo = 'cobro_pendiente' then subtotal else abonado end,
         pendiente_monto = 0
   where id = p_venta;
end $$;

-- ---------- Editar un pedido pendiente (contra entrega o entrega pendiente) ----------
-- p_cantidades = [{item_id, cantidad}] · p_opts = {envio, comision_tipo, comision_valor, quien_paga, seguro, metodo}
create or replace function editar_pedido(p_venta uuid, p_opts jsonb, p_cantidades jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v ventas%rowtype; c jsonb; li venta_items%rowtype; nq integer; d integer; v_stock integer;
  v_envio numeric; v_ctipo text; v_cval numeric; v_quien text; v_seguro numeric; v_metodo text; v_sub numeric; v_cost numeric; t record;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found or v.estado <> 'pendiente' or v.tipo not in ('cod','entrega_pendiente') then
    raise exception 'Solo se pueden editar pedidos pendientes de contra entrega o de entrega'; end if;

  for c in select value from jsonb_array_elements(coalesce(p_cantidades,'[]'::jsonb)) loop
    select * into li from venta_items where id = (c->>'item_id')::uuid and venta_id = p_venta for update;
    if not found then raise exception 'Línea no encontrada'; end if;
    nq := (c->>'cantidad')::integer;
    if nq is null or nq < 1 then raise exception 'La cantidad debe ser un entero mayor que cero'; end if;
    d := nq - li.cantidad;
    if d <> 0 and li.producto_id is not null then
      select stock into v_stock from productos where id = li.producto_id for update;
      if d > 0 and v_stock < d then raise exception 'Stock insuficiente: solo quedan % unidades', v_stock; end if;
      update productos set stock = stock - d where id = li.producto_id;
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (li.producto_id, case when d > 0 then 'venta'::tipo_movimiento else 'devolucion'::tipo_movimiento end,
              -d, v_stock - d, 'Pedido editado', p_venta, auth.uid());
    end if;
    update venta_items set cantidad = nq where id = li.id;
  end loop;

  v_envio  := coalesce(nullif(p_opts->>'envio','')::numeric, v.envio);
  v_ctipo  := coalesce(p_opts->>'comision_tipo', v.comision_tipo);
  v_cval   := coalesce(nullif(p_opts->>'comision_valor','')::numeric, v.comision_valor);
  v_quien  := coalesce(p_opts->>'quien_paga', v.quien_paga);
  v_seguro := coalesce(nullif(p_opts->>'seguro','')::numeric, v.seguro);
  v_metodo := coalesce(p_opts->>'metodo', v.metodo_pago);
  if v_envio < 0 or v_cval < 0 or v_seguro < 0 then raise exception 'Los importes no pueden ser negativos'; end if;
  if v_metodo not in ('Efectivo','Transferencia') then raise exception 'Método de pago inválido'; end if;
  if v_ctipo not in ('percentage','fixed') or v_quien not in ('client','we') then raise exception 'Valor inválido'; end if;
  if v_ctipo = 'percentage' and v_cval > 100 then raise exception 'La comisión porcentual no puede superar el 100%%'; end if;
  if v.tipo = 'entrega_pendiente' then v_ctipo := 'percentage'; v_quien := 'client'; v_seguro := 0; end if;

  select coalesce(sum(round(precio_unit * cantidad, 2)),0), coalesce(sum(costo_unit * cantidad),0) into v_sub, v_cost
    from venta_items where venta_id = p_venta;
  select * into t from pedido_totales(v.tipo, v_sub, v_envio, v_ctipo, v_cval, v_quien, v_seguro);
  if t.total < 0 then raise exception 'La comisión no puede producir un total negativo'; end if;
  update ventas set subtotal = v_sub, costo_total = v_cost, total = t.total, envio = v_envio,
         comision_tipo = v_ctipo, comision_valor = v_cval, comision_monto = t.comision,
         quien_paga = v_quien, seguro = v_seguro, metodo_pago = v_metodo, ganancia_neta = t.neta
   where id = p_venta;
end $$;

-- ---------- Anular o eliminar un pedido: devuelve el stock (solo administrador) ----------
create or replace function anular_venta(p_venta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it record; v_stock integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede anular ventas'; end if;
  perform 1 from ventas where id = p_venta and estado in ('completada','pendiente') for update;
  if not found then raise exception 'La venta no existe o ya fue anulada'; end if;
  for it in select producto_id, cantidad from venta_items where venta_id = p_venta and producto_id is not null loop
    update productos set stock = stock + it.cantidad where id = it.producto_id returning stock into v_stock;
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (it.producto_id, 'devolucion', it.cantidad, v_stock, 'Venta anulada', p_venta, auth.uid());
  end loop;
  update ventas set estado = 'anulada' where id = p_venta;
end $$;

-- ---------- Limpiar de las listas de pendientes los pedidos ya completados ----------
create or replace function ocultar_pendientes(p_tipo text, p_venta uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede limpiar el historial'; end if;
  update ventas set oculto_pendientes = true
   where estado = 'completada' and tipo = p_tipo and not oculto_pendientes and (p_venta is null or id = p_venta);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Permisos ----------
revoke execute on function registrar_pedido(jsonb, jsonb) from public, anon;
revoke execute on function completar_pedido(uuid) from public, anon;
revoke execute on function editar_pedido(uuid, jsonb, jsonb) from public, anon;
revoke execute on function anular_venta(uuid) from public, anon;
revoke execute on function ocultar_pendientes(text, uuid) from public, anon;
grant execute on function registrar_pedido(jsonb, jsonb) to authenticated;
grant execute on function completar_pedido(uuid) to authenticated;
grant execute on function editar_pedido(uuid, jsonb, jsonb) to authenticated;
grant execute on function anular_venta(uuid) to authenticated;
grant execute on function ocultar_pendientes(text, uuid) to authenticated;
