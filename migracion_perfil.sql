-- DAYMAR-SHOP · Perfil de cada usuario (nombre y foto). Se puede correr más de una vez.
alter table profiles add column if not exists avatar text;

create or replace function actualizar_mi_perfil(p_nombre text, p_avatar text default null, p_quitar_avatar boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_nombre is null or length(trim(p_nombre)) < 1 or length(trim(p_nombre)) > 60 then
    raise exception 'El nombre debe tener entre 1 y 60 caracteres'; end if;
  if p_avatar is not null and (left(p_avatar, 11) <> 'data:image/' or length(p_avatar) > 300000) then
    raise exception 'La foto no es válida o es demasiado grande'; end if;
  update profiles
     set nombre = trim(p_nombre),
         avatar = case when p_quitar_avatar then null when p_avatar is not null then p_avatar else avatar end
   where id = auth.uid();
end $$;
revoke execute on function actualizar_mi_perfil(text, text, boolean) from public, anon;
grant execute on function actualizar_mi_perfil(text, text, boolean) to authenticated;
