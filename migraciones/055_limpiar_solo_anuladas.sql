-- Limpiar ventas: opción para borrar solo las anuladas (conserva completadas). Las facturas no se anulan.
drop function if exists limpiar_ventas(integer, boolean);
create or replace function limpiar_ventas(p_dias integer default null, p_devolver boolean default false, p_solo_anuladas boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede limpiar las ventas'; end if;
  for r in select id from ventas
           where estado in ('completada','anulada')
             and (not coalesce(p_solo_anuladas, false) or estado = 'anulada')
             and (p_dias is null or created_at < now() - make_interval(days => p_dias)) loop
    perform eliminar_venta(r.id, p_devolver, true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function limpiar_ventas(integer, boolean, boolean) from public, anon;
grant execute on function limpiar_ventas(integer, boolean, boolean) to authenticated;
