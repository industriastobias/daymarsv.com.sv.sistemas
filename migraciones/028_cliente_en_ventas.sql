-- Guarda el cliente (opcional) en cualquier tipo de venta, para verlo en su ficha.
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
  v_sub numeric := 0; v_cost numeric := 0; t record; v_pend boolean; v_var uuid; vr producto_variantes%rowtype; v_nom text; v_cb text;
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
  if v_tipo <> 'cobro_pendiente' then v_abono := 0; end if;
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
         quien_paga = v_quien, seguro = v_seguro, cliente_nombre = v_cliente,
         abonado = v_abono, pendiente_monto = case when v_tipo='cobro_pendiente' then v_sub - v_abono else 0 end,
         ganancia_neta = t.neta
   where id = v_id;
  return v_id;
end $$;
