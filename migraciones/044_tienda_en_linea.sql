-- Conexión con la tienda en línea: stock público (solo lectura) y pedidos en línea

-- 1) Stock y precio de lo que está activo. Público (la tienda lo consulta sin sesión). Sin costos ni datos internos.
create or replace function tienda_stock() returns table(codigo text, stock integer, precio numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.codigo_barras,''), p.codigo) as codigo, greatest(p.stock,0)::integer,
         round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from productos p where p.activo
  union all
  select v.codigo_barras, greatest(v.stock,0)::integer, round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from producto_variantes v join productos p on p.id = v.producto_id
   where p.activo and coalesce(v.codigo_barras,'') <> ''
$$;
revoke execute on function tienda_stock() from public;
grant execute on function tienda_stock() to anon, authenticated;

-- 2) Pedidos que llegan desde la tienda
create table if not exists pedidos_linea (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  estado text not null default 'nuevo' check (estado in ('nuevo','aceptado','rechazado')),
  cliente_nombre text, cliente_telefono text, cliente_correo text, cliente_direccion text,
  metodo text not null default 'Efectivo' check (metodo in ('Efectivo','Transferencia')),
  items jsonb not null,
  envio numeric(10,2) not null default 0,
  total numeric(12,2) not null default 0,
  nota text,
  venta_id uuid references ventas(id) on delete set null,
  atendido_por uuid references profiles(id) on delete set null,
  atendido_en timestamptz
);
create index if not exists pedidos_linea_estado_idx on pedidos_linea (estado, created_at desc);
alter table pedidos_linea enable row level security;
drop policy if exists pedidos_linea_ver on pedidos_linea;
create policy pedidos_linea_ver on pedidos_linea for select using (es_usuario_activo());
-- (las escrituras solo pasan por las funciones de abajo)

-- 3) Recibir un pedido de la tienda (público, con límites para evitar abuso)
create or replace function tienda_pedido(p_cliente jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; v_total numeric := 0; v_envio numeric; v_tel text; v_n integer; v_metodo text;
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
  insert into pedidos_linea (cliente_nombre, cliente_telefono, cliente_correo, cliente_direccion, metodo, items, envio, total, nota)
  values (left(nullif(trim(p_cliente->>'nombre'),''),120), nullif(v_tel,''), left(nullif(trim(p_cliente->>'correo'),''),120),
          left(nullif(trim(p_cliente->>'direccion'),''),300), v_metodo, p_items, v_envio, v_total + v_envio, left(nullif(trim(p_cliente->>'nota'),''),300))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function tienda_pedido(jsonb, jsonb) from public;
grant execute on function tienda_pedido(jsonb, jsonb) to anon, authenticated;

-- 4) Aceptar: crea la venta pendiente (descuenta stock) y guarda al cliente
create or replace function aceptar_pedido_linea(p_id uuid, p_envio numeric default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare ped pedidos_linea%rowtype; it jsonb; pr record; vr record; lst jsonb := '[]'::jsonb; v_cid uuid; v_venta uuid; v_envio numeric; v_cod text;
begin
  if not es_admin() then raise exception 'Solo un administrador puede aceptar pedidos'; end if;
  select * into ped from pedidos_linea where id = p_id for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if ped.estado <> 'nuevo' then raise exception 'Este pedido ya fue atendido'; end if;
  for it in select value from jsonb_array_elements(ped.items) loop
    v_cod := coalesce(nullif(it->>'sys',''), it->>'codigo');
    select id into pr from productos where activo and (codigo_barras = v_cod or codigo = v_cod) limit 1;
    if found then
      lst := lst || jsonb_build_array(jsonb_build_object('producto_id', pr.id, 'cantidad', (it->>'cantidad')::integer));
    else
      select v.id as vid, v.producto_id into vr from producto_variantes v join productos p on p.id = v.producto_id where p.activo and v.codigo_barras = v_cod limit 1;
      if not found then raise exception 'Producto no registrado en el sistema: % (%)', coalesce(it->>'nombre',''), v_cod; end if;
      lst := lst || jsonb_build_array(jsonb_build_object('producto_id', vr.producto_id, 'variante_id', vr.vid, 'cantidad', (it->>'cantidad')::integer));
    end if;
  end loop;
  -- cliente: se busca por correo o teléfono; si no existe se crea
  select id into v_cid from clientes
   where (ped.cliente_correo is not null and lower(correo) = lower(ped.cliente_correo)) or (ped.cliente_telefono is not null and telefono = ped.cliente_telefono) limit 1;
  if v_cid is null and coalesce(ped.cliente_nombre,'') <> '' then
    insert into clientes (nombre, telefono, correo, direccion, notas)
    values (ped.cliente_nombre, ped.cliente_telefono, ped.cliente_correo, ped.cliente_direccion, 'Creado desde un pedido en línea') returning id into v_cid;
  end if;
  v_envio := coalesce(p_envio, ped.envio);
  v_venta := registrar_pedido(lst, jsonb_build_object(
      'tipo', 'cod', 'metodo', ped.metodo, 'envio', v_envio, 'comision_tipo', 'fixed', 'comision_valor', 0,
      'cliente', ped.cliente_nombre, 'cliente_id', v_cid));
  update pedidos_linea set estado = 'aceptado', venta_id = v_venta, atendido_por = auth.uid(), atendido_en = now() where id = p_id;
  return v_venta;
end $$;
revoke execute on function aceptar_pedido_linea(uuid, numeric) from public, anon;
grant execute on function aceptar_pedido_linea(uuid, numeric) to authenticated;

create or replace function rechazar_pedido_linea(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede rechazar pedidos'; end if;
  update pedidos_linea set estado = 'rechazado', atendido_por = auth.uid(), atendido_en = now() where id = p_id and estado = 'nuevo';
  if not found then raise exception 'El pedido no existe o ya fue atendido'; end if;
end $$;
revoke execute on function rechazar_pedido_linea(uuid) from public, anon;
grant execute on function rechazar_pedido_linea(uuid) to authenticated;
