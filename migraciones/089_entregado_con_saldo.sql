-- 089 · Seguimiento "Se lo llevó, falta el pago" para ventas pendientes de cobro
alter table ventas drop constraint if exists ventas_seguimiento_chk;
alter table ventas add constraint ventas_seguimiento_chk check (seguimiento is null or seguimiento in ('preparacion','listo','envio','entregado_pago'));

create or replace function venta_seguimiento(p_id uuid, p_seg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if coalesce(p_seg,'') = '' then p_seg := null; end if;
  if p_seg is not null and p_seg not in ('preparacion','listo','envio','entregado_pago') then raise exception 'Estado no válido'; end if;
  if p_seg = 'entregado_pago' and not exists (select 1 from ventas where id = p_id and tipo = 'cobro_pendiente') then
    raise exception 'Esta opción es solo para ventas pendientes de cobro';
  end if;
  update ventas set seguimiento = p_seg, seguimiento_en = case when p_seg is null then null else now() end
   where id = p_id and estado = 'pendiente';
  if not found then raise exception 'Solo se puede dar seguimiento a pedidos pendientes'; end if;
end $$;
revoke execute on function venta_seguimiento(uuid, text) from public, anon;
grant execute on function venta_seguimiento(uuid, text) to authenticated;
