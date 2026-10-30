-- Contra entrega: el paquete puede estar entregado pero la empresa de envíos aún no liquida el dinero.
alter table ventas add column if not exists entregado_en timestamptz, add column if not exists empresa_envio text;

create or replace function marcar_entregado(p_venta uuid, p_empresa text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if v.tipo <> 'cod' or v.estado <> 'pendiente' then raise exception 'Solo un pedido contra entrega pendiente puede marcarse como entregado'; end if;
  update ventas set entregado_en = now(), empresa_envio = nullif(left(trim(coalesce(p_empresa,'')),80),'') where id = p_venta;
end $$;

create or replace function deshacer_entrega(p_venta uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  update ventas set entregado_en = null, empresa_envio = null where id = p_venta and tipo = 'cod' and estado = 'pendiente';
end $$;

revoke execute on function marcar_entregado(uuid, text), deshacer_entrega(uuid) from public, anon;
grant execute on function marcar_entregado(uuid, text), deshacer_entrega(uuid) to authenticated;
