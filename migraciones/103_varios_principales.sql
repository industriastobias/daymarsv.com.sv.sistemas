-- 103 · Varios administradores principales (pedido del dueño).
-- El DUEÑO (la cuenta principal original) puede nombrar o quitar otros «principales».
-- Los principales tienen los mismos poderes que el dueño (todo lo que pide es_principal()),
-- pero solo el dueño puede: nombrar/quitar principales y cambiar el rol o desactivar a otro principal.
-- Nadie puede modificar la cuenta del dueño.

alter table profiles add column if not exists principal boolean not null default false;

create or replace function es_dueno() returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() and lower(coalesce(auth.jwt() ->> 'email','')) = 'aehtobias@gmail.com'
$$;

create or replace function es_principal() returns boolean
language sql stable security definer set search_path = public as $$
  select es_dueno() or exists (select 1 from profiles where id = auth.uid() and rol = 'admin' and activo and principal)
$$;

-- Nadie cambia la marca «principal» salvo el dueño; quien deja de ser administrador deja de ser principal
create or replace function profiles_principal_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rol is distinct from 'admin' then new.principal := false; end if;
  if new.principal is distinct from old.principal and auth.uid() is not null and not es_dueno() then
    raise exception 'Solo el dueño puede nombrar o quitar administradores principales';
  end if;
  return new;
end $$;
drop trigger if exists profiles_principal_guard on profiles;
create trigger profiles_principal_guard before update on profiles for each row execute function profiles_principal_guard();

create or replace function marcar_principal(p_id uuid, p_si boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_dueno() then raise exception 'Solo el dueño puede nombrar o quitar administradores principales'; end if;
  if p_id = auth.uid() then raise exception 'Tu cuenta ya es la principal'; end if;
  if p_si and not exists (select 1 from profiles where id = p_id and rol = 'admin' and activo) then
    raise exception 'Solo un administrador activo puede ser principal'; end if;
  update profiles set principal = coalesce(p_si, false) where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;
revoke all on function marcar_principal(uuid, boolean) from public, anon;
grant execute on function marcar_principal(uuid, boolean) to authenticated;

create or replace function cambiar_rol_usuario(p_id uuid, p_rol rol_usuario) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede cambiar roles'; end if;
  if exists (select 1 from profiles where id = p_id and lower(email) = 'aehtobias@gmail.com') then
    raise exception 'La cuenta del administrador principal no se puede modificar'; end if;
  if exists (select 1 from profiles where id = p_id and principal) and not es_dueno() then
    raise exception 'Solo el dueño puede cambiar a otro administrador principal'; end if;
  update profiles set rol = p_rol where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

create or replace function activar_usuario(p_id uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede activar o desactivar cuentas'; end if;
  if exists (select 1 from profiles where id = p_id and lower(email) = 'aehtobias@gmail.com') then
    raise exception 'La cuenta del administrador principal no se puede modificar'; end if;
  if exists (select 1 from profiles where id = p_id and principal) and not es_dueno() then
    raise exception 'Solo el dueño puede cambiar a otro administrador principal'; end if;
  update profiles set activo = p_activo where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

-- «Cerrar la sesión de todos los demás»: tampoco cierra la sesión de quien lo pide
create or replace function cerrar_todas_sesiones() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede cerrar sesiones'; end if;
  update profiles set sesion_desde = now() where lower(coalesce(email,'')) <> 'aehtobias@gmail.com' and id is distinct from auth.uid();
  get diagnostics n = row_count;
  begin delete from auth.sessions where user_id in (select id from profiles where lower(coalesce(email,'')) <> 'aehtobias@gmail.com' and id is distinct from auth.uid()); exception when others then null; end;
  return n;
end $$;
