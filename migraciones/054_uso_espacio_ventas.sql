-- Uso de espacio: desglosa las ventas por estado (para ver qué queda sin borrar)
create or replace function uso_espacio() returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare db_b bigint; st_b bigint; st_n bigint; pr int; vt int; cl int; v_comp int; v_anu int; v_pen int;
begin
  if not es_admin() then raise exception 'Solo un administrador puede ver el uso de espacio'; end if;
  select pg_database_size(current_database()) into db_b;
  select coalesce(sum((metadata->>'size')::bigint),0), count(*) into st_b, st_n from storage.objects where bucket_id = 'productos';
  select count(*) into pr from productos where activo;
  select count(*), count(*) filter (where estado = 'completada'), count(*) filter (where estado = 'anulada'), count(*) filter (where estado = 'pendiente') into vt, v_comp, v_anu, v_pen from ventas;
  select count(*) into cl from clientes;
  return jsonb_build_object('db_bytes', db_b, 'storage_bytes', st_b, 'fotos', st_n, 'productos', pr, 'ventas', vt, 'clientes', cl,
                            'ventas_completadas', v_comp, 'ventas_anuladas', v_anu, 'ventas_pendientes', v_pen);
end $$;
