-- Pago con tarjeta (Visa / Mastercard): nuevo método en ventas, pedidos en línea y cierre de caja.
do $$ declare r record; begin
  for r in select conname from pg_constraint where conrelid = 'pedidos_linea'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%metodo%' loop
    execute format('alter table pedidos_linea drop constraint %I', r.conname);
  end loop;
  alter table pedidos_linea add constraint pedidos_linea_metodo_check check (metodo in ('Efectivo','Transferencia','Tarjeta'));
  for r in select conname from pg_constraint where conrelid = 'ventas'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%metodo_pago%' loop
    execute format('alter table ventas drop constraint %I', r.conname);
  end loop;
  alter table ventas add constraint ventas_metodo_pago_check check (metodo_pago in ('Efectivo','Tarjeta','Transferencia'));
end $$;

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
  v_cid uuid := nullif(p_opts->>'cliente_id','')::uuid;
  v_abono numeric := coalesce(nullif(p_opts->>'abonado','')::numeric,0);
  v_id uuid; it jsonb; pr record; q integer; v_precio numeric; v_base numeric;
  v_sub numeric := 0; v_cost numeric := 0; t record; v_pend boolean; v_var uuid; vr producto_variantes%rowtype; v_nom text; v_cb text;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if v_tipo not in ('inmediata','cod','entrega_pendiente','cobro_pendiente') then raise exception 'Tipo de venta inválido'; end if;
  if v_metodo not in ('Efectivo','Transferencia','Tarjeta') then raise exception 'Método de pago inválido'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  if v_envio < 0 or v_seguro < 0 or v_cval < 0 or v_abono < 0 then raise exception 'Los importes no pueden ser negativos'; end if;
  if v_ctipo not in ('percentage','fixed') then raise exception 'Tipo de comisión inválido'; end if;
  if v_ctipo = 'percentage' and v_cval > 100 then raise exception 'La comisión porcentual no puede superar el 100%%'; end if;
  if v_quien not in ('client','we') then raise exception 'Valor inválido'; end if;
  if v_tipo not in ('cod','entrega_pendiente') then v_envio := 0; v_cval := 0; end if;
  if v_tipo <> 'cod' then v_seguro := 0; v_quien := 'client'; end if;
  if v_tipo = 'entrega_pendiente' then v_ctipo := 'percentage'; end if;
  if v_tipo <> 'cobro_pendiente' then v_abono := 0; end if;
  if v_cid is not null then select nombre into v_cliente from clientes where id = v_cid; if not found then v_cid := null; end if; end if;
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
      v_var := nullif(it->>'variante_id','')::uuid; vr := null; v_nom := pr.nombre; v_cb := pr.codigo_barras;
      if v_var is not null then
        select * into vr from producto_variantes where id = v_var and producto_id = pr.id for update;
        if not found then raise exception 'El color elegido ya no existe'; end if;
        if vr.stock < q then raise exception 'Stock insuficiente de % (%): quedan %', pr.nombre, vr.nombre, vr.stock; end if;
        v_nom := pr.nombre || ' – ' || vr.nombre; v_cb := coalesce(nullif(vr.codigo_barras,''), pr.codigo_barras);
      end if;
      v_base := round(pr.precio_venta * (1 - coalesce(pr.descuento_pct,0) / 100), 2);
      v_precio := v_base;
      if it ? 'precio' and es_admin() then
        v_precio := (it->>'precio')::numeric;
        if v_precio is null or v_precio < 0 then raise exception 'Precio inválido'; end if;
      end if;
      update productos set stock = stock - q where id = pr.id;
      insert into venta_items (venta_id, producto_id, variante_id, cantidad, precio_unit, costo_unit, nombre, codigo, codigo_barras, precio_original, descuento_pct)
      values (v_id, pr.id, v_var, q, round(v_precio,2), pr.precio_costo, v_nom, pr.codigo, v_cb, pr.precio_venta, coalesce(pr.descuento_pct,0));
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
         quien_paga = v_quien, seguro = v_seguro, cliente_nombre = v_cliente, cliente_id = v_cid,
         abonado = v_abono, pendiente_monto = case when v_tipo='cobro_pendiente' then v_sub - v_abono else 0 end,
         ganancia_neta = t.neta
   where id = v_id;
  return v_id;
end $$;

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
  if v_metodo not in ('Efectivo','Transferencia','Tarjeta') then raise exception 'Método de pago inválido'; end if;
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

create or replace function cerrar_caja(p_fecha date, p_contado numeric default null, p_nota text default null, p_hasta date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid(); v_res jsonb; v_n int; v_tot numeric; v_cost numeric; v_anu int; v_esp numeric;
  v_dn int; v_dt numeric; v_dc numeric; v_defe numeric; v_h date := coalesce(p_hasta, p_fecha);
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  if v_h < p_fecha then raise exception 'La fecha final no puede ser anterior a la inicial'; end if;
  if v_h - p_fecha > 366 then raise exception 'El periodo no puede superar un año'; end if;
  if p_contado is not null and p_contado < 0 then raise exception 'El efectivo contado no puede ser negativo'; end if;
  with v as (
    select case when tipo = 'entrega_pendiente' then 'ent' when tipo = 'cod' then 'cod' when tipo = 'cobro_pendiente' then 'cob'
                when metodo_pago = 'Transferencia' then 'tr' when metodo_pago = 'Tarjeta' then 'tj' else 'ef' end as k, total, costo_total
    from ventas where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date between p_fecha and v_h),
  g as (select k, sum(total) t, count(*) n from v group by k)
  select jsonb_object_agg(k, jsonb_build_object('total', t, 'n', n)), coalesce(sum(n),0), coalesce(sum(t),0)
    into v_res, v_n, v_tot from g;
  select coalesce(sum(costo_total),0) into v_cost from ventas where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date between p_fecha and v_h;
  select count(*) into v_anu from ventas where estado = 'anulada' and (created_at at time zone 'America/El_Salvador')::date between p_fecha and v_h;
  select count(*), coalesce(sum(monto_nuevo - monto_devuelto),0), coalesce(sum(costo_nuevo - costo_recuperado),0),
         coalesce(sum(case when metodo = 'Efectivo' then diferencia else 0 end),0)
    into v_dn, v_dt, v_dc, v_defe from devoluciones where fecha between p_fecha and v_h;
  v_res := coalesce(v_res,'{}'::jsonb);
  if v_dn > 0 then v_res := v_res || jsonb_build_object('dev', jsonb_build_object('total', v_dt, 'n', v_dn)); end if;
  v_esp := coalesce((v_res->'ef'->>'total')::numeric, 0) + v_defe;
  insert into cierres_caja (id, fecha, fecha_hasta, resumen, n_ventas, total_ventas, costo_total, n_anuladas, esperado_efectivo, efectivo_contado, diferencia, nota, creado_por)
  values (v_id, p_fecha, case when v_h = p_fecha then null else v_h end, v_res, v_n, v_tot + v_dt, v_cost + v_dc, v_anu, v_esp, p_contado, case when p_contado is null then null else p_contado - v_esp end, nullif(trim(p_nota),''), auth.uid());
  return v_id;
end $$;

create or replace function editar_pedido_linea(p_id uuid, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_met text;
begin
  if not es_admin() then raise exception 'Solo un administrador puede editar pedidos'; end if;
  v_met := case when p_datos->>'metodo' in ('Transferencia','Tarjeta') then p_datos->>'metodo' else 'Efectivo' end;
  update pedidos_linea set
    cliente_nombre = left(nullif(trim(coalesce(p_datos->>'nombre','')),''),120),
    cliente_telefono = left(nullif(trim(coalesce(p_datos->>'telefono','')),''),20),
    cliente_correo = left(nullif(trim(coalesce(p_datos->>'correo','')),''),120),
    cliente_direccion = left(nullif(trim(coalesce(p_datos->>'direccion','')),''),300),
    nota = left(nullif(trim(coalesce(p_datos->>'nota','')),''),300),
    metodo = v_met,
    envio = least(greatest(coalesce(nullif(p_datos->>'envio','')::numeric, envio),0),50),
    total = total - envio + least(greatest(coalesce(nullif(p_datos->>'envio','')::numeric, envio),0),50)
  where id = p_id and estado = 'nuevo';
  if not found then raise exception 'El pedido no existe o ya fue atendido'; end if;
end $$;
