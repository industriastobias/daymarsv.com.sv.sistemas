-- Las sesiones ya no vencen solas: duran hasta que el usuario cierre sesión
-- o hasta que el administrador principal las cierre desde Usuarios.
alter table profiles add column if not exists sesion_desde timestamptz;

create or replace function cerrar_sesion_usuario(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede cerrar sesiones'; end if;
  if exists (select 1 from profiles where id = p_id and lower(email) = 'aehtobias@gmail.com') then
    raise exception 'La sesión del administrador principal no se cierra desde aquí'; end if;
  update profiles set sesion_desde = now() where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  begin delete from auth.sessions where user_id = p_id; exception when others then null; end;
end $$;

create or replace function cerrar_todas_sesiones() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede cerrar sesiones'; end if;
  update profiles set sesion_desde = now() where lower(coalesce(email,'')) <> 'aehtobias@gmail.com';
  get diagnostics n = row_count;
  begin delete from auth.sessions where user_id in (select id from profiles where lower(coalesce(email,'')) <> 'aehtobias@gmail.com'); exception when others then null; end;
  return n;
end $$;

grant execute on function cerrar_sesion_usuario(uuid), cerrar_todas_sesiones() to authenticated;
