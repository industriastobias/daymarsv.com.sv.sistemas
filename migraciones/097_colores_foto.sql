-- 097 · Arreglo urgente: los pedidos normales de la tienda volvían a guardarse (error «record pr is not assigned yet» desde la 096).
-- Colores con su propia foto (y en la tienda): cada color puede tener su foto; el catálogo de la tienda
-- manda los colores con su foto y sus unidades. La preventa también funciona con productos que tienen colores.

alter table producto_variantes add column if not exists foto_url text;

-- Producto de un código: el del producto o el de uno de sus colores
create or replace function _pv_prod(p_cod text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from productos where activo and (codigo_barras = p_cod or codigo = p_cod) limit 1),
    (select v.producto_id from producto_variantes v join productos p on p.id = v.producto_id where p.activo and v.codigo_barras = p_cod limit 1))
$$;
revoke execute on function _pv_prod(text) from public, anon, authenticated;


-- Unidades apartadas en preventa (ahora también por código de color)

create or replace function _preventa_apartadas() returns table(producto_id uuid, cant integer)
language sql stable security definer set search_path = public as $$
  select x.pid, sum(x.q)::integer from (
    select p.id as pid, greatest(coalesce((it.value->>'cantidad')::integer, 0), 0) as q
      from pedidos_linea pl
      cross join lateral jsonb_array_elements(pl.items) as it(value)
      join productos p on p.activo and p.preventa and p.id = _pv_prod(_pv_codigo(it.value))
     where pl.estado = 'nuevo' and pl.preventa and coalesce(it.value->>'preventa','') = '1'
       and pl.created_at > now() - interval '12 hours'
    union all
    select (i.value->>'producto_id')::uuid, greatest(coalesce((i.value->>'cantidad')::integer, 0), 0)
      from reservas r cross join lateral jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) as i(value)
     where r.preventa and r.cancelada_en is null and r.entregada_en is null and (i.value->>'producto_id') is not null
  ) x group by x.pid
$$;
revoke execute on function _preventa_apartadas() from public, anon, authenticated;

-- Catálogo de la tienda con los colores (foto, unidades)

create or replace function tienda_catalogo() returns jsonb
language sql stable security definer set search_path = public as $$
  with rt as (select * from _reservas_tienda()),
       r as (select producto_id, sum(cant)::integer as c from rt group by producto_id),
       rv as (select variante_id, sum(cant)::integer as c from rt where variante_id is not null group by variante_id),
       pv as (select producto_id, cant as c from _preventa_apartadas())
  select coalesce(jsonb_agg(t.x order by t.sin_stock, t.cat, t.nom), '[]'::jsonb) from (
    select (case when p.preventa then p.preventa_limite is not null and p.preventa_limite - coalesce(pv.c,0) <= 0
                 else p.stock - coalesce(r.c,0) <= 0 end) as sin_stock,
      coalesce(c.nombre, 'Otros') as cat, p.nombre as nom,
      jsonb_build_object(
        'name', p.nombre,
        'price', p.precio_venta,
        'stock', case when p.preventa then (case when p.preventa_limite is null then 99 else greatest(p.preventa_limite - coalesce(pv.c,0), 0) end)
                      else greatest(p.stock - coalesce(r.c,0), 0) end,
        'barcode', coalesce(nullif(p.codigo_barras, ''), p.codigo),
        'category', coalesce(c.nombre, 'Otros'),
        'description', nullif(p.descripcion, ''),
        'discount', coalesce(p.descuento_pct, 0),
        'alta', p.alta_tienda,
        'foto', nullif(p.foto_url, ''),
        'preventa', p.preventa,
        'llega', case when p.preventa then p.preventa_llega end,
        'anticipo', case when p.preventa then p.preventa_anticipo end,
        'cupo', case when p.preventa and p.preventa_limite is not null then greatest(p.preventa_limite - coalesce(pv.c,0), 0) end,
        'variants', (select jsonb_agg(jsonb_build_object(
              'nombre', v.nombre,
              'barcode', v.codigo_barras,
              'stock', case when p.preventa then (case when p.preventa_limite is null then 99 else greatest(p.preventa_limite - coalesce(pv.c,0), 0) end)
                            else greatest(v.stock - coalesce(rv.c,0), 0) end,
              'foto', nullif(v.foto_url, '')) order by v.orden, v.nombre)
            from producto_variantes v left join rv on rv.variante_id = v.id
           where v.producto_id = p.id and coalesce(v.codigo_barras, '') <> ''),
        'images', coalesce(
          (select jsonb_agg(pi.url order by pi.orden) from producto_imagenes pi where pi.producto_id = p.id and coalesce(pi.url, '') <> ''),
          case when coalesce(p.foto_url, '') <> '' then jsonb_build_array(p.foto_url) else '[]'::jsonb end),
        'thumbs', coalesce(
          (select jsonb_agg(coalesce(nullif(pi.thumb_url, ''), pi.url) order by pi.orden) from producto_imagenes pi where pi.producto_id = p.id and coalesce(pi.url, '') <> ''),
          case when coalesce(p.foto_url, '') <> '' then jsonb_build_array(p.foto_url) else '[]'::jsonb end)
      ) as x
    from productos p left join categorias c on c.id = p.categoria_id left join r on r.producto_id = p.id left join pv on pv.producto_id = p.id
    where p.activo and p.publicar_tienda and coalesce(nullif(p.codigo_barras, ''), p.codigo) is not null
  ) t
$$;
revoke execute on function tienda_catalogo() from public;
grant execute on function tienda_catalogo() to anon, authenticated;

-- Pedido desde la tienda (preventa también con códigos de color)

create or replace function tienda_pedido(p_cliente jsonb, p_items jsonb, p_codigo text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; v_total numeric := 0; v_envio numeric; v_tel text; v_metodo text; v_cod text;
  v_items jsonb := '[]'::jsonb; pr record; v_pv boolean := false; v_pvtot numeric := 0; v_ant numeric := 0; v_pago text; v_ap integer; v_linea numeric;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then raise exception 'Pedido inválido'; end if;
  if (select count(*) from pedidos_linea where created_at > now() - interval '1 hour') > 60 then raise exception 'Demasiados pedidos, intenta más tarde'; end if;
  v_tel := left(regexp_replace(coalesce(p_cliente->>'telefono',''), '[^0-9+]', '', 'g'), 20);
  if v_tel <> '' and (select count(*) from pedidos_linea where cliente_telefono = v_tel and created_at > now() - interval '1 hour') >= 5 then raise exception 'Ya enviaste varios pedidos, escríbenos por WhatsApp'; end if;
  v_envio := least(greatest(coalesce(nullif(p_cliente->>'envio','')::numeric,0),0),50);
  v_metodo := case when p_cliente->>'metodo' = 'Transferencia' then 'Transferencia' else 'Efectivo' end;
  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce(x.value->>'preventa','') = '1') then
    perform pg_advisory_xact_lock(hashtext('daymar_preventa'));
  end if;
  for it in select value from jsonb_array_elements(p_items) loop
    if coalesce((it->>'cantidad')::integer,0) < 1 or coalesce((it->>'cantidad')::integer,0) > 99 then raise exception 'Cantidad inválida'; end if;
    if coalesce(nullif(it->>'codigo',''),'') = '' then raise exception 'Producto inválido'; end if;
    v_linea := round(coalesce((it->>'precio')::numeric,0) * (it->>'cantidad')::integer, 2);
    v_total := v_total + v_linea;
    select null::uuid as id, null::text as nombre, null::integer as preventa_limite, null::integer as preventa_anticipo into pr;
    if coalesce(it->>'preventa','') = '1' then
      select id, nombre, preventa_limite, preventa_anticipo into pr from productos
       where activo and preventa and id = _pv_prod(_pv_codigo(it)) limit 1;
    end if;
    if pr.id is not null then
      if pr.preventa_limite is not null then
        select coalesce(sum(cant),0) into v_ap from _preventa_apartadas() where producto_id = pr.id;
        if v_ap + (it->>'cantidad')::integer > pr.preventa_limite then
          raise exception 'La preventa de % ya no tiene cupo (quedan %)', pr.nombre, greatest(pr.preventa_limite - v_ap, 0);
        end if;
      end if;
      v_pv := true; v_pvtot := v_pvtot + v_linea; v_ant := v_ant + round(v_linea * pr.preventa_anticipo / 100.0, 2);
      v_items := v_items || jsonb_build_array(it || '{"preventa":"1"}'::jsonb);
    else
      v_items := v_items || jsonb_build_array(it - 'preventa');
    end if;
  end loop;
  v_pago := case when not v_pv then null when p_cliente->>'pago' = 'completo' then 'completo' else 'anticipo' end;
  v_cod := upper(coalesce(p_codigo,''));
  if v_cod !~ '^(DM-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}|DY-[0-9]{6})$' or exists (select 1 from pedidos_linea where codigo = v_cod) then
    loop v_cod := _nuevo_codigo_pedido(); exit when not exists (select 1 from pedidos_linea where codigo = v_cod); end loop;
  end if;
  insert into pedidos_linea (cliente_nombre, cliente_telefono, cliente_correo, cliente_direccion, metodo, items, envio, total, nota, codigo, preventa, pago, anticipo)
  values (left(nullif(trim(p_cliente->>'nombre'),''),120), nullif(v_tel,''), left(nullif(trim(p_cliente->>'correo'),''),120),
          left(nullif(trim(p_cliente->>'direccion'),''),300), v_metodo, v_items, v_envio, v_total + v_envio, left(nullif(trim(p_cliente->>'nota'),''),300), v_cod,
          v_pv, v_pago, case when v_pago = 'anticipo' then v_ant when v_pago = 'completo' then v_pvtot end)
  returning id into v_id;
  return v_cod;
end $$;
revoke execute on function tienda_pedido(jsonb, jsonb, text) from public;
grant execute on function tienda_pedido(jsonb, jsonb, text) to anon, authenticated;

-- Aceptar pedido (colores en preventa y en venta normal)

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
    insert into reservas (cliente_nombre, telefono, producto, imagen_url, precio_total, monto_pagado, notas, vence, preventa, items, pedido_linea_id)
    values (coalesce(nullif(trim(ped.cliente_nombre),''), 'Cliente de la tienda'), ped.cliente_telefono, left(v_nombres, 300), v_foto, greatest(v_pvtot, 0.01), 0,
            'Preventa · pedido ' || coalesce(ped.codigo,'') ||
            case ped.pago when 'completo' then ' · eligió pagar todo ($' || to_char(coalesce(ped.anticipo, v_pvtot), 'FM999990.00') || ')'
                          when 'anticipo' then ' · anticipo de $' || to_char(coalesce(ped.anticipo,0), 'FM999990.00') else '' end ||
            case when v_venta is null and coalesce(v_envio,0) > 0 then ' · incluye envío $' || to_char(v_envio, 'FM999990.00') else '' end,
            case when v_llega is not null then v_llega + 30 end, true, lpv, ped.id)
    returning id, numero into v_res, v_num;
  end if;
  update pedidos_linea set estado = 'aceptado', venta_id = v_venta, atendido_por = auth.uid(), atendido_en = now() where id = p_id;
  return coalesce(v_venta, v_res);
end $$;
revoke execute on function aceptar_pedido_linea(uuid, numeric, text[], text, boolean, uuid) from public, anon;
grant execute on function aceptar_pedido_linea(uuid, numeric, text[], text, boolean, uuid) to authenticated;

-- Entregar preventa (también descuenta el color)

create or replace function entregar_preventa(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas%rowtype; i jsonb; pr record; q integer; vv record;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  select * into r from reservas where id = p_id for update;
  if not found then raise exception 'La reserva no existe'; end if;
  if not r.preventa then raise exception 'Esta reserva no es de preventa'; end if;
  if r.cancelada_en is not null then raise exception 'La reserva está cancelada'; end if;
  if r.entregada_en is not null then raise exception 'Esta reserva ya se entregó'; end if;
  if r.monto_pagado < r.precio_total then raise exception 'Falta cobrar $%: registra el pago antes de entregar', to_char(r.precio_total - r.monto_pagado, 'FM999990.00'); end if;
  for i in select value from jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) loop
    q := greatest(coalesce((i->>'cantidad')::integer, 0), 0);
    if q = 0 then continue; end if;
    select id, nombre, stock into pr from productos where id = (i->>'producto_id')::uuid for update;
    if not found then raise exception 'Un producto de esta reserva ya no existe'; end if;
    if pr.stock < q then raise exception 'Todavía no hay unidades de %: quedan %. Súbelas primero en Compra.', pr.nombre, pr.stock; end if;
    if nullif(i->>'variante_id','') is not null then
      select id, nombre, stock into vv from producto_variantes where id = (i->>'variante_id')::uuid and producto_id = pr.id for update;
      if found then
        if vv.stock < q then raise exception 'Todavía no hay unidades de % (%): quedan %. Súbelas primero en Compra.', pr.nombre, vv.nombre, vv.stock; end if;
        update producto_variantes set stock = stock - q where id = vv.id;
      end if;
    end if;
    update productos set stock = stock - q where id = pr.id;
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, usuario_id)
    values (pr.id, 'salida', -q, pr.stock - q, 'Entrega de preventa · Reserva #' || r.numero || ' – ' || r.cliente_nombre, auth.uid());
  end loop;
  update reservas set entregada_en = now() where id = p_id;
end $$;
revoke execute on function entregar_preventa(uuid) from public, anon;
grant execute on function entregar_preventa(uuid) to authenticated;
