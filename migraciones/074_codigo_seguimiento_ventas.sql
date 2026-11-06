-- 074 · Número y seguimiento también para ventas normales (Instagram, WhatsApp, contra entrega, etc.)
-- Cada venta tiene un número DM-XXXX-XXXX; el cliente lo consulta en la tienda igual que un pedido en línea.
alter table ventas add column if not exists codigo text;
alter table ventas add column if not exists seguimiento text;
alter table ventas add column if not exists seguimiento_en timestamptz;
alter table ventas drop constraint if exists ventas_seguimiento_chk;
alter table ventas add constraint ventas_seguimiento_chk check (seguimiento is null or seguimiento in ('preparacion','listo','envio'));
create unique index if not exists ventas_codigo_uq on ventas (codigo);

-- número que no exista ni en ventas ni en pedidos en línea
create or replace function _codigo_unico() returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  loop
    c := _nuevo_codigo_pedido();
    exit when not exists (select 1 from ventas where codigo = c) and not exists (select 1 from pedidos_linea where codigo = c);
  end loop;
  return c;
end $$;
revoke execute on function _codigo_unico() from public, anon, authenticated;

create or replace function _ventas_codigo_trg() returns trigger language plpgsql as $$
begin if new.codigo is null or new.codigo = '' then new.codigo := _codigo_unico(); end if; return new; end $$;
drop trigger if exists ventas_codigo on ventas;
create trigger ventas_codigo before insert on ventas for each row execute function _ventas_codigo_trg();

-- ventas anteriores
do $$ declare x record; begin
  for x in select id from ventas where codigo is null loop update ventas set codigo = _codigo_unico() where id = x.id; end loop;
end $$;

create or replace function venta_seguimiento(p_id uuid, p_seg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if coalesce(p_seg,'') = '' then p_seg := null; end if;
  if p_seg is not null and p_seg not in ('preparacion','listo','envio') then raise exception 'Estado no válido'; end if;
  update ventas set seguimiento = p_seg, seguimiento_en = case when p_seg is null then null else now() end
   where id = p_id and estado = 'pendiente';
  if not found then raise exception 'Solo se puede dar seguimiento a pedidos pendientes'; end if;
end $$;
revoke execute on function venta_seguimiento(uuid, text) from public, anon;
grant execute on function venta_seguimiento(uuid, text) to authenticated;

-- Consulta pública: busca primero en pedidos en línea y luego en ventas. Sin datos personales.
create or replace function tienda_pedido_estado(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p pedidos_linea%rowtype; v ventas%rowtype; v_c text; v_est text; v_vest text; v_vseg text; v_it jsonb; v_act timestamptz;
begin
  v_c := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_c) <> 10 then return null; end if;
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
