-- 016 · Cuánto espacio ocupa el sistema (solo administradores)
create or replace function uso_espacio() returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare db_b bigint; st_b bigint; st_n bigint; pr int; vt int; cl int;
begin
  if not es_admin() then raise exception 'Solo un administrador puede ver el uso de espacio'; end if;
  select pg_database_size(current_database()) into db_b;
  select coalesce(sum((metadata->>'size')::bigint),0), count(*) into st_b, st_n from storage.objects where bucket_id = 'productos';
  select count(*) into pr from productos where activo;
  select count(*) into vt from ventas;
  select count(*) into cl from clientes;
  return jsonb_build_object('db_bytes', db_b, 'storage_bytes', st_b, 'fotos', st_n, 'productos', pr, 'ventas', vt, 'clientes', cl);
end $$;
revoke execute on function uso_espacio() from public, anon;
grant execute on function uso_espacio() to authenticated;
