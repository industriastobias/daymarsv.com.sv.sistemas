-- 104 · Cuentas del equipo sin correo real (pedido del dueño, diseño «3 · Tarjetas del equipo»).
-- El dueño o un administrador principal crea cuentas tipo usuario@daymarjewelry.com con una contraseña,
-- y puede ponerles una contraseña nueva si la olvidan. No se envía ningún correo.

create extension if not exists pgcrypto with schema extensions;

create or replace function crear_cuenta_equipo(p_nombre text, p_usuario text, p_rol rol_usuario, p_clave text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user text := lower(trim(coalesce(p_usuario,'')));
  v_mail text;
  v_nom  text := nullif(trim(coalesce(p_nombre,'')),'');
  v_id   uuid := gen_random_uuid();
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede crear cuentas'; end if;
  if v_user !~ '^[a-z0-9][a-z0-9._-]{1,29}$' then
    raise exception 'El usuario debe tener de 2 a 30 letras o números, sin espacios ni tildes'; end if;
  if v_nom is null then raise exception 'Escribe el nombre de la persona'; end if;
  if p_clave is null or length(p_clave) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  v_mail := v_user || '@daymarjewelry.com';
  if exists (select 1 from auth.users where lower(email) = v_mail) or exists (select 1 from profiles where lower(email) = v_mail) then
    raise exception 'Ese usuario ya existe. Elige otro'; end if;

  -- La invitación permite el registro (validar_registro) y le da nombre y rol al perfil (crear_perfil)
  insert into invitaciones (email, rol, nombre, creado_por) values (v_mail, p_rol, v_nom, auth.uid())
  on conflict (email) do update set rol = excluded.rol, nombre = excluded.nombre, usada = false;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_mail,
    crypt(p_clave, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nombre', v_nom, 'creada_por_principal', true),
    now(), now(), '', '', '', '', '', '', '', '');

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_mail, 'email_verified', true),
    'email', null, now(), now());

  return v_id;
end $$;

create or replace function cambiar_clave_equipo(p_id uuid, p_clave text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_p profiles%rowtype;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede cambiar contraseñas'; end if;
  select * into v_p from profiles where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if lower(coalesce(v_p.email,'')) = 'aehtobias@gmail.com' then raise exception 'La contraseña del dueño no se cambia desde aquí'; end if;
  if p_id = auth.uid() then raise exception 'Tu propia contraseña se cambia desde «¿Olvidaste tu contraseña?»'; end if;
  if v_p.rol = 'admin' and v_p.principal and not es_dueno() then
    raise exception 'Solo el dueño puede cambiar la contraseña de otro principal'; end if;
  if p_clave is null or length(p_clave) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;

  update auth.users set encrypted_password = crypt(p_clave, gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  -- Por seguridad se cierra su sesión en todos sus dispositivos: entra de nuevo con la contraseña nueva
  update profiles set sesion_desde = now() where id = p_id;
  begin delete from auth.sessions where user_id = p_id; exception when others then null; end;
end $$;

revoke all on function crear_cuenta_equipo(text, text, rol_usuario, text) from public, anon;
revoke all on function cambiar_clave_equipo(uuid, text) from public, anon;
grant execute on function crear_cuenta_equipo(text, text, rol_usuario, text), cambiar_clave_equipo(uuid, text) to authenticated;
