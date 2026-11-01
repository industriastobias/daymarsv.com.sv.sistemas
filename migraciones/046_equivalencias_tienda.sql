-- Emparejar productos de la tienda con los del sistema aunque tengan distinto código (permanente),
-- y poder omitir líneas al aceptar un pedido en línea.
create table if not exists tienda_equivalencias (
  codigo_tienda text primary key,
  codigo_sistema text not null,
  created_at timestamptz not null default now()
);
alter table tienda_equivalencias enable row level security;
drop policy if exists tienda_equiv_ver on tienda_equivalencias;
create policy tienda_equiv_ver on tienda_equivalencias for select using (es_usuario_activo());

create or replace function guardar_equivalencia(p_tienda text, p_sistema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede emparejar productos'; end if;
  if coalesce(trim(p_tienda),'') = '' then raise exception 'Código de la tienda vacío'; end if;
  if coalesce(trim(p_sistema),'') = '' then delete from tienda_equivalencias where codigo_tienda = trim(p_tienda); return; end if;
  insert into tienda_equivalencias (codigo_tienda, codigo_sistema) values (trim(p_tienda), trim(p_sistema))
  on conflict (codigo_tienda) do update set codigo_sistema = excluded.codigo_sistema;
end $$;
revoke execute on function guardar_equivalencia(text, text) from public, anon;
grant execute on function guardar_equivalencia(text, text) to authenticated;

-- El stock público ahora también responde por los códigos de la tienda emparejados
create or replace function tienda_stock() returns table(codigo text, stock integer, precio numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.codigo_barras,''), p.codigo) as codigo, greatest(p.stock,0)::integer,
         round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from productos p where p.activo
  union all
  select v.codigo_barras, greatest(v.stock,0)::integer, round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from producto_variantes v join productos p on p.id = v.producto_id
   where p.activo and coalesce(v.codigo_barras,'') <> ''
  union all
  select e.codigo_tienda, greatest(p.stock,0)::integer, round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from tienda_equivalencias e join productos p on p.activo and (p.codigo_barras = e.codigo_sistema or p.codigo = e.codigo_sistema)
$$;

drop function if exists aceptar_pedido_linea(uuid, numeric);
create or replace function aceptar_pedido_linea(p_id uuid, p_envio numeric default null, p_omitir text[] default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare ped pedidos_linea%rowtype; it jsonb; pr record; vr record; lst jsonb := '[]'::jsonb; v_cid uuid; v_venta uuid; v_envio numeric; v_cod text;
begin
  if not es_admin() then raise exception 'Solo un administrador puede aceptar pedidos'; end if;
  select * into ped from pedidos_linea where id = p_id for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if ped.estado <> 'nuevo' then raise exception 'Este pedido ya fue atendido'; end if;
  for it in select value from jsonb_array_elements(ped.items) loop
    if p_omitir is not null and (it->>'codigo') = any(p_omitir) then continue; end if;
    v_cod := coalesce((select codigo_sistema from tienda_equivalencias where codigo_tienda = it->>'codigo'), nullif(it->>'sys',''), it->>'codigo');
    select id into pr from productos where activo and (codigo_barras = v_cod or codigo = v_cod) limit 1;
    if found then
      lst := lst || jsonb_build_array(jsonb_build_object('producto_id', pr.id, 'cantidad', (it->>'cantidad')::integer));
    else
      select v.id as vid, v.producto_id into vr from producto_variantes v join productos p on p.id = v.producto_id where p.activo and v.codigo_barras = v_cod limit 1;
      if not found then raise exception 'Producto no registrado en el sistema: % (%)', coalesce(it->>'nombre',''), it->>'codigo'; end if;
      lst := lst || jsonb_build_array(jsonb_build_object('producto_id', vr.producto_id, 'variante_id', vr.vid, 'cantidad', (it->>'cantidad')::integer));
    end if;
  end loop;
  if jsonb_array_length(lst) = 0 then raise exception 'No quedó ningún producto para vender'; end if;
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
revoke execute on function aceptar_pedido_linea(uuid, numeric, text[]) from public, anon;
grant execute on function aceptar_pedido_linea(uuid, numeric, text[]) to authenticated;
