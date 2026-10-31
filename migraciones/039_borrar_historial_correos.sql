-- Limpiar el historial de correos enviados (solo administradores). p_dias = null borra todo.
create or replace function borrar_historial_correos(p_dias int default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not es_admin() then raise exception 'Solo un administrador puede limpiar el historial de correos'; end if;
  delete from correos_enviados where p_dias is null or created_at < now() - make_interval(days => p_dias);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function borrar_historial_correos(int) from public, anon;
grant execute on function borrar_historial_correos(int) to authenticated;
