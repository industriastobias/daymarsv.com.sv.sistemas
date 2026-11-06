-- 076 · Números de pedido más cortos: DY-123456 (DY + 6 números). Los anteriores (DM-XXXX-XXXX) siguen funcionando.
create or replace function _nuevo_codigo_pedido() returns text language plpgsql as $$
begin return 'DY-' || lpad((floor(random() * 1000000))::int::text, 6, '0'); end $$;

create or replace function tienda_pedido(p_cliente jsonb, p_items jsonb, p_codigo text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; v_total numeric := 0; v_envio numeric; v_tel text; v_metodo text; v_cod text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then raise exception 'Pedido inválido'; end if;
  if (select count(*) from pedidos_linea where created_at > now() - interval '1 hour') > 60 then raise exception 'Demasiados pedidos, intenta más tarde'; end if;
  v_tel := left(regexp_replace(coalesce(p_cliente->>'telefono',''), '[^0-9+]', '', 'g'), 20);
  if v_tel <> '' and (select count(*) from pedidos_linea where cliente_telefono = v_tel and created_at > now() - interval '1 hour') >= 5 then raise exception 'Ya enviaste varios pedidos, escríbenos por WhatsApp'; end if;
  v_envio := least(greatest(coalesce(nullif(p_cliente->>'envio','')::numeric,0),0),50);
  v_metodo := case when p_cliente->>'metodo' = 'Transferencia' then 'Transferencia' else 'Efectivo' end;
  for it in select value from jsonb_array_elements(p_items) loop
    if coalesce((it->>'cantidad')::integer,0) < 1 or coalesce((it->>'cantidad')::integer,0) > 99 then raise exception 'Cantidad inválida'; end if;
    if coalesce(nullif(it->>'codigo',''),'') = '' then raise exception 'Producto inválido'; end if;
    v_total := v_total + round(coalesce((it->>'precio')::numeric,0) * (it->>'cantidad')::integer, 2);
  end loop;
  v_cod := upper(coalesce(p_codigo,''));
  if v_cod !~ '^(DM-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}|DY-[0-9]{6})$' or exists (select 1 from pedidos_linea where codigo = v_cod) then
    loop v_cod := _nuevo_codigo_pedido(); exit when not exists (select 1 from pedidos_linea where codigo = v_cod); end loop;
  end if;
  insert into pedidos_linea (cliente_nombre, cliente_telefono, cliente_correo, cliente_direccion, metodo, items, envio, total, nota, codigo)
  values (left(nullif(trim(p_cliente->>'nombre'),''),120), nullif(v_tel,''), left(nullif(trim(p_cliente->>'correo'),''),120),
          left(nullif(trim(p_cliente->>'direccion'),''),300), v_metodo, p_items, v_envio, v_total + v_envio, left(nullif(trim(p_cliente->>'nota'),''),300), v_cod)
  returning id into v_id;
  return v_cod;
end $$;
revoke execute on function tienda_pedido(jsonb, jsonb, text) from public;
grant execute on function tienda_pedido(jsonb, jsonb, text) to anon, authenticated;

create or replace function tienda_pedido_estado(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p pedidos_linea%rowtype; v ventas%rowtype; v_c text; v_est text; v_vest text; v_vseg text; v_it jsonb; v_act timestamptz;
begin
  v_c := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_c) not in (8, 10) then return null; end if;
  select * into p from pedidos_linea where replace(codigo,'-','') = v_c;
  if found then
    if p.venta_id is not null then select estado, seguimiento into v_vest, v_vseg from ventas where id = p.venta_id; end if;
    v_est := case
      when p.estado = 'nuevo' then 'recibido'
      when p.estado = 'aceptado' and v_vest = 'completada' then 'entregado'
      when p.estado = 'aceptado' and v_vest = 'anulada' then 'cancelado'
      when p.estado = 'aceptado' and coalesce(p.seguimiento, v_vseg) is not null then coalesce(p.seguimiento, v_vseg)
      when p.estado = 'aceptado' then 'aceptado'
      when coalesce(p.nota,'') like '%Vencido autom%' then 'vencido'
      else 'rechazado' end;
    select coalesce(jsonb_agg(jsonb_build_object('nombre', i->>'nombre', 'cantidad', (i->>'cantidad')::int, 'precio', (i->>'precio')::numeric)), '[]'::jsonb)
      into v_it from jsonb_array_elements(p.items) i;
    return jsonb_build_object('codigo', p.codigo, 'estado', v_est, 'creado', p.created_at, 'actualizado', coalesce(p.seguimiento_en, p.atendido_en),
      'items', v_it, 'envio', p.envio, 'total', p.total);
  end if;
  select * into v from ventas where replace(codigo,'-','') = v_c;
  if not found then return null; end if;
  v_est := case
    when v.estado = 'anulada' then 'cancelado'
    when v.estado = 'completada' then 'entregado'
    when v.seguimiento is not null then v.seguimiento
    else 'aceptado' end;
  select coalesce(jsonb_agg(jsonb_build_object('nombre', vi.nombre, 'cantidad', vi.cantidad, 'precio', vi.precio_unit)), '[]'::jsonb)
    into v_it from venta_items vi where vi.venta_id = v.id;
  return jsonb_build_object('codigo', v.codigo, 'estado', v_est, 'creado', v.created_at, 'actualizado', v.seguimiento_en,
    'items', v_it, 'envio', greatest(round(coalesce(v.total,0) - coalesce(v.subtotal,0), 2), 0), 'total', v.total);
end $$;
revoke execute on function tienda_pedido_estado(text) from public;
grant execute on function tienda_pedido_estado(text) to anon, authenticated;
