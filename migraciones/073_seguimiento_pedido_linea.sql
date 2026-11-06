-- 073 · Seguimiento del pedido en línea: el sistema marca "En preparación", "Listo para retirar" o "En camino"
-- y el cliente lo ve al consultar su número. "Entregado" sigue siendo automático al completarse la venta.
alter table pedidos_linea add column if not exists seguimiento text;
alter table pedidos_linea add column if not exists seguimiento_en timestamptz;
alter table pedidos_linea drop constraint if exists pedidos_linea_seguimiento_chk;
alter table pedidos_linea add constraint pedidos_linea_seguimiento_chk check (seguimiento is null or seguimiento in ('preparacion','listo','envio'));

create or replace function pedido_linea_seguimiento(p_id uuid, p_seg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if coalesce(p_seg,'') = '' then p_seg := null; end if;
  if p_seg is not null and p_seg not in ('preparacion','listo','envio') then raise exception 'Estado no válido'; end if;
  update pedidos_linea set seguimiento = p_seg, seguimiento_en = case when p_seg is null then null else now() end
   where id = p_id and estado = 'aceptado';
  if not found then raise exception 'Solo se puede dar seguimiento a pedidos aceptados'; end if;
end $$;
revoke execute on function pedido_linea_seguimiento(uuid, text) from public, anon;
grant execute on function pedido_linea_seguimiento(uuid, text) to authenticated;

create or replace function tienda_pedido_estado(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p pedidos_linea%rowtype; v_c text; v_est text; v_vest text; v_it jsonb;
begin
  v_c := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_c) <> 10 then return null; end if;
  select * into p from pedidos_linea where replace(codigo,'-','') = v_c;
  if not found then return null; end if;
  if p.venta_id is not null then select estado into v_vest from ventas where id = p.venta_id; end if;
  v_est := case
    when p.estado = 'nuevo' then 'recibido'
    when p.estado = 'aceptado' and v_vest = 'completada' then 'entregado'
    when p.estado = 'aceptado' and v_vest = 'anulada' then 'cancelado'
    when p.estado = 'aceptado' and p.seguimiento is not null then p.seguimiento
    when p.estado = 'aceptado' then 'aceptado'
    when coalesce(p.nota,'') like '%Vencido autom%' then 'vencido'
    else 'rechazado' end;
  select coalesce(jsonb_agg(jsonb_build_object('nombre', i->>'nombre', 'cantidad', (i->>'cantidad')::int, 'precio', (i->>'precio')::numeric)), '[]'::jsonb)
    into v_it from jsonb_array_elements(p.items) i;
  return jsonb_build_object('codigo', p.codigo, 'estado', v_est, 'creado', p.created_at, 'actualizado', coalesce(p.seguimiento_en, p.atendido_en),
    'items', v_it, 'envio', p.envio, 'total', p.total);
end $$;
revoke execute on function tienda_pedido_estado(text) from public;
grant execute on function tienda_pedido_estado(text) to anon, authenticated;
