-- Eliminar facturas (solo administrador principal) para liberar espacio
create or replace function eliminar_facturas(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede eliminar facturas'; end if;
  if p_ids is null or coalesce(array_length(p_ids,1),0) = 0 then return 0; end if;
  delete from factura_items where factura_id = any(p_ids);
  delete from facturas where id = any(p_ids);
  get diagnostics n = row_count;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
    values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'facturas', 'eliminar', 'Eliminó '||n||' factura(s) para liberar espacio');
  return n;
end $$;
revoke execute on function eliminar_facturas(uuid[]) from public, anon;
grant execute on function eliminar_facturas(uuid[]) to authenticated;
