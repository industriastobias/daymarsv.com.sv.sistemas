-- Guardar en la factura el correo al que se debe enviar (para enviarla al entregar)
alter table facturas add column if not exists cliente_correo text;
create or replace function factura_guardar_correo(p_id uuid, p_correo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  update facturas set cliente_correo = left(nullif(trim(coalesce(p_correo,'')),''),120) where id = p_id;
end $$;
revoke execute on function factura_guardar_correo(uuid, text) from public, anon;
grant execute on function factura_guardar_correo(uuid, text) to authenticated;
