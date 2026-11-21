-- 096 · Preventa (próxima colección): productos sin unidades que ya se pueden pedir en la tienda.
-- El cliente elige pagar un anticipo o todo. Al aceptar el pedido, la parte en preventa se vuelve una Reserva
-- (los abonos entran a Finanzas como siempre). Al llegar la mercadería se entrega la reserva y baja el stock.

alter table productos add column if not exists preventa boolean not null default false;
alter table productos add column if not exists preventa_llega date;
alter table productos add column if not exists preventa_limite integer;
alter table productos add column if not exists preventa_anticipo integer not null default 50;
alter table productos drop constraint if exists productos_preventa_limite_chk;
alter table productos add constraint productos_preventa_limite_chk check (preventa_limite is null or preventa_limite between 1 and 9999);
alter table productos drop constraint if exists productos_preventa_anticipo_chk;
alter table productos add constraint productos_preventa_anticipo_chk check (preventa_anticipo between 10 and 100);

alter table pedidos_linea add column if not exists preventa boolean not null default false;
alter table pedidos_linea add column if not exists pago text;
alter table pedidos_linea add column if not exists anticipo numeric(12,2);
alter table pedidos_linea drop constraint if exists pedidos_linea_pago_chk;
alter table pedidos_linea add constraint pedidos_linea_pago_chk check (pago is null or pago in ('anticipo','completo'));

alter table reservas add column if not exists preventa boolean not null default false;
alter table reservas add column if not exists items jsonb;
alter table reservas add column if not exists pedido_linea_id uuid references pedidos_linea(id) on delete set null;
create index if not exists reservas_preventa_idx on reservas (preventa) where preventa;

-- Código de sistema de un renglón del pedido (respeta las equivalencias tienda → sistema)
create or replace function _pv_codigo(it jsonb) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select e.codigo_sistema from tienda_equivalencias e where e.codigo_tienda = it->>'codigo'), nullif(it->>'sys',''), it->>'codigo')
$$;
revoke execute on function _pv_codigo(jsonb) from public, anon, authenticated;

-- Unidades ya apartadas en preventa: pedidos nuevos (12 h) + reservas de preventa sin entregar ni cancelar
create or replace function _preventa_apartadas() returns table(producto_id uuid, cant integer)
language sql stable security definer set search_path = public as $$
  select x.pid, sum(x.q)::integer from (
    select p.id as pid, greatest(coalesce((it.value->>'cantidad')::integer, 0), 0) as q
      from pedidos_linea pl
      cross join lateral jsonb_array_elements(pl.items) as it(value)
      join productos p on p.activo and (p.codigo_barras = _pv_codigo(it.value) or p.codigo = _pv_codigo(it.value))
     where pl.estado = 'nuevo' and pl.preventa and coalesce(it.value->>'preventa','') = '1'
       and pl.created_at > now() - interval '12 hours'
    union all
    select (i.value->>'producto_id')::uuid, greatest(coalesce((i.value->>'cantidad')::integer, 0), 0)
      from reservas r cross join lateral jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) as i(value)
     where r.preventa and r.cancelada_en is null and r.entregada_en is null and (i.value->>'producto_id') is not null
  ) x group by x.pid
$$;
revoke execute on function _preventa_apartadas() from public, anon, authenticated;

-- Para el sistema: cuántas lleva apartadas cada producto en preventa
create or replace function preventa_resumen() returns table(producto_id uuid, apartadas integer)
language sql stable security definer set search_path = public as $$
  select a.producto_id, a.cant from _preventa_apartadas() a where es_usuario_activo()
$$;
revoke execute on function preventa_resumen() from public, anon;
grant execute on function preventa_resumen() to authenticated;

-- Catálogo de la tienda: los productos en preventa salen aunque tengan 0 unidades.
-- "stock" de un producto en preventa = cupo que le queda (99 si no tiene límite).
create or replace function tienda_catalogo() returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select producto_id, sum(cant)::integer as c from _reservas_tienda() group by producto_id),
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

-- Pedido desde la tienda: igual que antes, más la preventa (se revisa el cupo y se calcula el anticipo aquí)
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
    pr := null;
    if coalesce(it->>'preventa','') = '1' then
      select id, nombre, preventa_limite, preventa_anticipo into pr from productos
       where activo and preventa and (codigo_barras = _pv_codigo(it) or codigo = _pv_codigo(it)) limit 1;
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

-- Aceptar pedido: lo que está en preventa se vuelve una Reserva; lo demás se vende como siempre
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
    pr := null;
    select id, nombre, preventa, preventa_llega, foto_url into pr from productos where activo and (codigo_barras = v_cod or codigo = v_cod) limit 1;
    if pr.id is not null and coalesce(it->>'preventa','') = '1' and pr.preventa then
      lpv := lpv || jsonb_build_array(jsonb_build_object('producto_id', pr.id, 'cantidad', (it->>'cantidad')::integer,
               'nombre', coalesce(it->>'nombre', pr.nombre), 'precio', coalesce((it->>'precio')::numeric, 0)));
      v_pvtot := v_pvtot + round(coalesce((it->>'precio')::numeric,0) * (it->>'cantidad')::integer, 2);
      v_nombres := v_nombres || case when v_nombres = '' then '' else ', ' end || (it->>'cantidad') || '× ' || coalesce(it->>'nombre', pr.nombre);
      v_foto := coalesce(v_foto, nullif(pr.foto_url,'')); v_llega := greatest(v_llega, pr.preventa_llega);
    elsif pr.id is not null then
      lst := lst || jsonb_build_array(jsonb_build_object('producto_id', pr.id, 'cantidad', (it->>'cantidad')::integer));
    else
      select v.id as vid, v.producto_id into vr from producto_variantes v join productos p on p.id = v.producto_id where p.activo and v.codigo_barras = v_cod limit 1;
      if not found then raise exception 'Producto no registrado en el sistema: % (%)', coalesce(it->>'nombre',''), it->>'codigo'; end if;
      lst := lst || jsonb_build_array(jsonb_build_object('producto_id', vr.producto_id, 'variante_id', vr.vid, 'cantidad', (it->>'cantidad')::integer));
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

-- Entregar una reserva de preventa cuando ya llegó: baja el stock (queda en el Kardex) y la marca entregada.
-- Pide que ya esté pagada completa: el dinero entra a Finanzas con los abonos.
create or replace function entregar_preventa(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas%rowtype; i jsonb; pr record; q integer;
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
    update productos set stock = stock - q where id = pr.id;
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, usuario_id)
    values (pr.id, 'salida', -q, pr.stock - q, 'Entrega de preventa · Reserva #' || r.numero || ' – ' || r.cliente_nombre, auth.uid());
  end loop;
  update reservas set entregada_en = now() where id = p_id;
end $$;
revoke execute on function entregar_preventa(uuid) from public, anon;
grant execute on function entregar_preventa(uuid) to authenticated;

-- Seguimiento en la tienda: un pedido en preventa aceptado dice «Preventa apartada» hasta que se entrega
create or replace function tienda_pedido_estado(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p pedidos_linea%rowtype; v ventas%rowtype; v_c text; v_est text; v_vest text; v_vseg text; v_vtipo text; v_vab numeric; v_vpen numeric; v_it jsonb;
  rs reservas%rowtype;
begin
  v_c := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_c) not in (8, 10) then return null; end if;
  select * into p from pedidos_linea where replace(codigo,'-','') = v_c;
  if found then
    if p.venta_id is not null then select estado, seguimiento, tipo, abonado, pendiente_monto into v_vest, v_vseg, v_vtipo, v_vab, v_vpen from ventas where id = p.venta_id; end if;
    if p.preventa and p.estado = 'aceptado' then select * into rs from reservas where pedido_linea_id = p.id order by created_at desc limit 1; end if;
    v_est := case
      when p.estado = 'nuevo' then 'recibido'
      when p.estado = 'aceptado' and rs.id is not null and rs.cancelada_en is not null and p.venta_id is null then 'cancelado'
      when p.estado = 'aceptado' and rs.id is not null and rs.entregada_en is null and rs.cancelada_en is null then 'preventa'
      when p.estado = 'aceptado' and rs.id is not null and p.venta_id is null and rs.entregada_en is not null then 'entregado'
      when p.estado = 'aceptado' and v_vest = 'completada' then 'entregado'
      when p.estado = 'aceptado' and v_vest = 'anulada' then 'cancelado'
      when p.estado = 'aceptado' and coalesce(p.seguimiento, v_vseg) is not null then coalesce(p.seguimiento, v_vseg)
      when p.estado = 'aceptado' and v_vest = 'pendiente' and v_vtipo = 'cobro_pendiente' then 'pago_pendiente'
      when p.estado = 'aceptado' then 'aceptado'
      when coalesce(p.nota,'') like '%Vencido autom%' then 'vencido'
      else 'rechazado' end;
    select coalesce(jsonb_agg(jsonb_build_object('nombre', i->>'nombre', 'cantidad', (i->>'cantidad')::int, 'precio', (i->>'precio')::numeric)), '[]'::jsonb)
      into v_it from jsonb_array_elements(p.items) i;
    return jsonb_build_object('codigo', p.codigo, 'estado', v_est, 'creado', p.created_at, 'actualizado', coalesce(p.seguimiento_en, p.atendido_en),
      'items', v_it, 'envio', p.envio, 'total', p.total,
      'saldo', case when v_vest = 'pendiente' and v_vtipo = 'cobro_pendiente' then coalesce(v_vpen, 0)
                    when v_est = 'preventa' then greatest(rs.precio_total - rs.monto_pagado, 0) end,
      'abonado', case when v_vest = 'pendiente' and v_vtipo = 'cobro_pendiente' then coalesce(v_vab, 0)
                      when v_est = 'preventa' then rs.monto_pagado end,
      'llega', case when v_est = 'preventa' then (select max(pp.preventa_llega) from productos pp
                     where pp.id in (select (x->>'producto_id')::uuid from jsonb_array_elements(coalesce(rs.items,'[]'::jsonb)) x)) end);
  end if;
  select * into v from ventas where replace(codigo,'-','') = v_c;
  if not found then return null; end if;
  v_est := case
    when v.estado = 'anulada' then 'cancelado'
    when v.estado = 'completada' then 'entregado'
    when v.seguimiento is not null then v.seguimiento
    when v.estado = 'pendiente' and v.tipo = 'cobro_pendiente' then 'pago_pendiente'
    else 'aceptado' end;
  select coalesce(jsonb_agg(jsonb_build_object('nombre', vi.nombre, 'cantidad', vi.cantidad, 'precio', vi.precio_unit)), '[]'::jsonb)
    into v_it from venta_items vi where vi.venta_id = v.id;
  return jsonb_build_object('codigo', v.codigo, 'estado', v_est, 'creado', v.created_at, 'actualizado', v.seguimiento_en,
    'items', v_it, 'envio', greatest(round(coalesce(v.total,0) - coalesce(v.subtotal,0), 2), 0), 'total', v.total,
    'saldo', case when v.estado = 'pendiente' and v.tipo = 'cobro_pendiente' then coalesce(v.pendiente_monto, 0) end,
    'abonado', case when v.estado = 'pendiente' and v.tipo = 'cobro_pendiente' then coalesce(v.abonado, 0) end);
end $$;
revoke execute on function tienda_pedido_estado(text) from public;
grant execute on function tienda_pedido_estado(text) to anon, authenticated;
