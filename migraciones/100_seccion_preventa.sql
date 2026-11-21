-- 100 · Sección «Preventa» del menú: apartados manuales (por WhatsApp o en tienda) ligados a un cliente.

alter table reservas add column if not exists cliente_id uuid references clientes(id) on delete set null;
create index if not exists reservas_cliente_idx on reservas (cliente_id) where cliente_id is not null;

-- Apartar un producto en preventa a mano: revisa el cupo, guarda/crea el cliente y (si hay) registra el primer pago.
create or replace function crear_apartado_preventa(p_producto uuid, p_variante uuid default null, p_cantidad integer default 1,
  p_cliente_id uuid default null, p_nombre text default null, p_telefono text default null,
  p_abono numeric default 0, p_metodo text default 'Efectivo', p_nota text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare pr record; vv record; v_ap integer; v_cid uuid; v_nom text; v_tel text; v_precio numeric; v_total numeric; v_id uuid; v_nombre_item text; v_foto text;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if coalesce(p_cantidad,0) < 1 or p_cantidad > 99 then raise exception 'Cantidad inválida'; end if;
  perform pg_advisory_xact_lock(hashtext('daymar_preventa'));
  select id, nombre, precio_venta, descuento_pct, preventa, preventa_limite, preventa_llega, foto_url into pr from productos where id = p_producto and activo;
  if pr.id is null then raise exception 'El producto no existe'; end if;
  if not pr.preventa then raise exception '% ya no está en preventa', pr.nombre; end if;
  v_nombre_item := pr.nombre; v_foto := nullif(pr.foto_url,'');
  if p_variante is not null then
    select id, nombre, foto_url into vv from producto_variantes where id = p_variante and producto_id = pr.id;
    if vv.id is null then raise exception 'La variante elegida ya no existe'; end if;
    v_nombre_item := pr.nombre || ' – ' || vv.nombre; v_foto := coalesce(nullif(vv.foto_url,''), v_foto);
  end if;
  if pr.preventa_limite is not null then
    select coalesce(sum(cant),0) into v_ap from _preventa_apartadas() where producto_id = pr.id;
    if v_ap + p_cantidad > pr.preventa_limite then raise exception 'La preventa de % ya no tiene cupo (quedan %)', pr.nombre, greatest(pr.preventa_limite - v_ap, 0); end if;
  end if;
  v_tel := nullif(left(regexp_replace(coalesce(p_telefono,''), '[^0-9+]', '', 'g'), 20), '');
  if p_cliente_id is not null then select id, nombre, coalesce(v_tel, telefono) into v_cid, v_nom, v_tel from clientes where id = p_cliente_id; end if;
  if v_cid is null then
    v_nom := nullif(trim(coalesce(p_nombre,'')), '');
    if v_nom is null then raise exception 'Escribe el nombre del cliente'; end if;
    if v_tel is not null then select id into v_cid from clientes where telefono = v_tel limit 1; end if;
    if v_cid is null then insert into clientes (nombre, telefono, notas) values (left(v_nom,100), v_tel, 'Creado desde Preventa') returning id into v_cid; end if;
  end if;
  v_precio := round(pr.precio_venta * (1 - coalesce(pr.descuento_pct,0) / 100), 2);
  v_total := round(v_precio * p_cantidad, 2);
  if v_total <= 0 then raise exception 'El producto no tiene precio'; end if;
  if coalesce(p_abono,0) < 0 or coalesce(p_abono,0) > v_total then raise exception 'El pago debe estar entre $0 y $%', to_char(v_total, 'FM999990.00'); end if;
  insert into reservas (cliente_nombre, telefono, producto, imagen_url, precio_total, monto_pagado, notas, vence, preventa, items, cliente_id)
  values (left(v_nom,120), v_tel, left(p_cantidad || '× ' || v_nombre_item, 300), v_foto, v_total, 0,
          left(coalesce(nullif(trim(p_nota),''), 'Preventa · apartado manual'), 300),
          case when pr.preventa_llega is not null then pr.preventa_llega + 30 end, true,
          jsonb_build_array(jsonb_build_object('producto_id', pr.id, 'variante_id', p_variante, 'cantidad', p_cantidad, 'nombre', v_nombre_item, 'precio', v_precio)), v_cid)
  returning id into v_id;
  if coalesce(p_abono,0) > 0 then
    insert into reserva_abonos (reserva_id, monto, metodo, nota)
    values (v_id, round(p_abono,2), case when p_metodo in ('Efectivo','Transferencia','Tarjeta') then p_metodo else 'Efectivo' end, 'Primer pago');
  end if;
  return v_id;
end $$;
revoke execute on function crear_apartado_preventa(uuid, uuid, integer, uuid, text, text, numeric, text, text) from public, anon;
grant execute on function crear_apartado_preventa(uuid, uuid, integer, uuid, text, text, numeric, text, text) to authenticated;

-- Aceptar pedido en línea: la reserva de preventa queda ligada al cliente
create or replace function aceptar_pedido_linea(p_id uuid, p_envio numeric default null, p_omitir text[] default null, p_tipo text default 'cod', p_guardar_dir boolean default false, p_cliente_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare ped pedidos_linea%rowtype; it jsonb; pr record; vr record; lst jsonb := '[]'::jsonb; lpv jsonb := '[]'::jsonb; v_cid uuid; v_venta uuid; v_envio numeric; v_cod text;
  v_pvtot numeric := 0; v_nombres text := ''; v_foto text; v_llega date; v_res uuid; v_num integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede aceptar pedidos'; end if;
  select * into ped from pedidos_linea where id = p_id for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if ped.estado <> 'nuevo' then raise exception 'Este pedido ya fue atendido'; end if;
  for it in select value from jsonb_array_elements(ped.items) loop
    if p_omitir is not null and (it->>'codigo') = any(p_omitir) then continue; end if;
    v_cod := _pv_codigo(it);
    select null::uuid as id, null::text as nombre, null::boolean as preventa, null::date as preventa_llega, null::text as foto_url into pr;
    select null::uuid as vid, null::uuid as producto_id, null::text as foto_url into vr;
    select id, nombre, preventa, preventa_llega, foto_url into pr from productos where activo and (codigo_barras = v_cod or codigo = v_cod) limit 1;
    if pr.id is null then
      select v.id as vid, v.producto_id, v.foto_url into vr from producto_variantes v join productos p on p.id = v.producto_id where p.activo and v.codigo_barras = v_cod limit 1;
      if vr.vid is not null then select id, nombre, preventa, preventa_llega, foto_url into pr from productos where id = vr.producto_id; end if;
    end if;
    if pr.id is not null and coalesce(it->>'preventa','') = '1' and pr.preventa then
      lpv := lpv || jsonb_build_array(jsonb_build_object('producto_id', pr.id, 'variante_id', vr.vid, 'cantidad', (it->>'cantidad')::integer,
               'nombre', coalesce(it->>'nombre', pr.nombre), 'precio', coalesce((it->>'precio')::numeric, 0)));
      v_pvtot := v_pvtot + round(coalesce((it->>'precio')::numeric,0) * (it->>'cantidad')::integer, 2);
      v_nombres := v_nombres || case when v_nombres = '' then '' else ', ' end || (it->>'cantidad') || '× ' || coalesce(it->>'nombre', pr.nombre);
      v_foto := coalesce(v_foto, nullif(vr.foto_url,''), nullif(pr.foto_url,'')); v_llega := greatest(v_llega, pr.preventa_llega);
    elsif vr.vid is not null then
      lst := lst || jsonb_build_array(jsonb_build_object('producto_id', vr.producto_id, 'variante_id', vr.vid, 'cantidad', (it->>'cantidad')::integer));
    elsif pr.id is not null then
      lst := lst || jsonb_build_array(jsonb_build_object('producto_id', pr.id, 'cantidad', (it->>'cantidad')::integer));
    else
      raise exception 'Producto no registrado en el sistema: % (%)', coalesce(it->>'nombre',''), it->>'codigo';
    end if;
  end loop;
  if jsonb_array_length(lst) = 0 and jsonb_array_length(lpv) = 0 then raise exception 'No quedó ningún producto para vender'; end if;
  if p_cliente_id is not null then select id into v_cid from clientes where id = p_cliente_id; end if;
  if v_cid is null then select id into v_cid from clientes
   where (ped.cliente_correo is not null and lower(correo) = lower(ped.cliente_correo)) or (ped.cliente_telefono is not null and telefono = ped.cliente_telefono) limit 1; end if;
  if v_cid is null and coalesce(ped.cliente_nombre,'') <> '' then
    insert into clientes (nombre, telefono, correo, direccion, notas)
    values (ped.cliente_nombre, ped.cliente_telefono, ped.cliente_correo, ped.cliente_direccion, 'Creado desde un pedido en línea') returning id into v_cid;
  end if;
  if p_guardar_dir and v_cid is not null and coalesce(ped.cliente_direccion,'') <> '' then update clientes set direccion = ped.cliente_direccion where id = v_cid; end if;
  v_envio := coalesce(p_envio, ped.envio);
  if jsonb_array_length(lst) > 0 then
    v_venta := registrar_pedido(lst, jsonb_build_object(
        'tipo', case when p_tipo = 'entrega_pendiente' then 'entrega_pendiente' else 'cod' end, 'metodo', ped.metodo, 'envio', v_envio, 'comision_tipo', 'fixed', 'comision_valor', 0,
        'cliente', ped.cliente_nombre, 'cliente_id', v_cid));
  end if;
  if jsonb_array_length(lpv) > 0 then
    -- si no hubo venta normal, el envío se cobra en la reserva
    if v_venta is null then v_pvtot := v_pvtot + coalesce(v_envio, 0); end if;
    insert into reservas (cliente_nombre, telefono, producto, imagen_url, precio_total, monto_pagado, notas, vence, preventa, items, pedido_linea_id, cliente_id)
    values (coalesce(nullif(trim(ped.cliente_nombre),''), 'Cliente de la tienda'), ped.cliente_telefono, left(v_nombres, 300), v_foto, greatest(v_pvtot, 0.01), 0,
            'Preventa · pedido ' || coalesce(ped.codigo,'') ||
            case ped.pago when 'completo' then ' · eligió pagar todo ($' || to_char(coalesce(ped.anticipo, v_pvtot), 'FM999990.00') || ')'
                          when 'anticipo' then ' · anticipo de $' || to_char(coalesce(ped.anticipo,0), 'FM999990.00') else '' end ||
            case when v_venta is null and coalesce(v_envio,0) > 0 then ' · incluye envío $' || to_char(v_envio, 'FM999990.00') else '' end,
            case when v_llega is not null then v_llega + 30 end, true, lpv, ped.id, v_cid)
    returning id, numero into v_res, v_num;
  end if;
  update pedidos_linea set estado = 'aceptado', venta_id = v_venta, atendido_por = auth.uid(), atendido_en = now() where id = p_id;
  return coalesce(v_venta, v_res);
end $$;
revoke execute on function aceptar_pedido_linea(uuid, numeric, text[], text, boolean, uuid) from public, anon;
grant execute on function aceptar_pedido_linea(uuid, numeric, text[], text, boolean, uuid) to authenticated;
