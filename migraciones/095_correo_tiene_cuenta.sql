-- «¿Olvidaste tu contraseña?»: avisar si el correo no pertenece a un usuario autorizado del sistema.
create or replace function correo_tiene_cuenta(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where lower(email) = lower(trim(coalesce(p_email,''))) and activo);
$$;
revoke all on function correo_tiene_cuenta(text) from public;
grant execute on function correo_tiene_cuenta(text) to anon, authenticated;
