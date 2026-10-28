-- 014 · Cambios de producto con colores: se puede elegir el color que el cliente se lleva
alter table devolucion_items add column if not exists variante_id uuid references producto_variantes(id) on delete set null;

create or replace function registrar_devolucion(p_venta uuid, p_items jsonb, p_motivo text, p_metodo text, p_nuevos jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v ventas%rowtype; vr producto_variantes%rowtype; v_var uuid; v_nom text; it jsonb; vi venta_items%rowtype; pr productos%rowtype;
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
      v_var := nullif(it->>'variante_id','')::uuid; v_nom := pr.nombre; vr := null;
      if v_var is null and exists (select 1 from producto_variantes where producto_id = pr.id) then raise exception 'Elige el color de %', pr.nombre; end if;
      if v_var is not null then
        select * into vr from producto_variantes where id = v_var and producto_id = pr.id for update;
        if not found then raise exception 'El color elegido ya no existe'; end if;
        if vr.stock < q then raise exception 'Stock insuficiente de % (%): quedan %', pr.nombre, vr.nombre, vr.stock; end if;
        v_nom := pr.nombre || ' – ' || vr.nombre;
        perform _var_mover(v_var, -q);
      end if;
      u := round(pr.precio_venta * (1 - coalesce(pr.descuento_pct,0) / 100), 2);
      update productos set stock = stock - q where id = pr.id returning stock into v_stock;
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
        values (pr.id, 'venta', -q, v_stock, 'Cambio de la venta #' || v.numero, v.id, auth.uid());
      insert into devolucion_items (devolucion_id, direccion, producto_id, variante_id, nombre, cantidad, precio_unit, costo_unit, regresa_stock)
        values (v_id, 'sale', pr.id, v_var, v_nom, q, u, pr.precio_costo, true);
      v_new := v_new + q * u; v_cnew := v_cnew + q * pr.precio_costo;
    end loop;
  end if;
  update devoluciones set monto_devuelto = v_dev, costo_recuperado = v_cdev, monto_nuevo = v_new, costo_nuevo = v_cnew, diferencia = v_new - v_dev where id = v_id;
  return v_id;
end $$;
revoke execute on function registrar_devolucion(uuid, jsonb, text, text, jsonb) from public, anon;
grant execute on function registrar_devolucion(uuid, jsonb, text, text, jsonb) to authenticated;
