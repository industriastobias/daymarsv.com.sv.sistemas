-- Registro de inicios de sesión (dispositivo, hora, IP) y aviso de dispositivos nuevos
create table if not exists accesos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references profiles(id) on delete cascade,
  email text,
  nombre text,
  exito boolean not null default true,
  dispositivo text, sistema text, navegador text,
  huella text,
  nuevo boolean not null default false,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists accesos_fecha_idx on accesos (created_at desc);
create index if not exists accesos_usuario_idx on accesos (usuario_id, created_at desc);
alter table accesos enable row level security;
drop policy if exists ver_accesos on accesos;
create policy ver_accesos on accesos for select to authenticated using (es_admin());

create or replace function _ip_cliente() returns text language plpgsql stable as $$
declare h json;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then return null; end;
  if h is null then return null; end if;
  return nullif(trim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-forwarded-for', ''), ',', 1)), '');
end $$;

create or replace function registrar_acceso(p_dispositivo text, p_sistema text, p_navegador text, p_huella text) returns boolean
language plpgsql security definer set search_path = public as $$
declare pr profiles%rowtype; v_prev boolean; v_nuevo boolean;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select * into pr from profiles where id = auth.uid();
  if not found then return false; end if;
  select exists(select 1 from accesos where usuario_id = pr.id and exito) into v_prev;
  v_nuevo := v_prev and not exists(select 1 from accesos where usuario_id = pr.id and exito and huella = left(p_huella, 80));
  insert into accesos (usuario_id, email, nombre, exito, dispositivo, sistema, navegador, huella, nuevo, ip)
  values (pr.id, pr.email, pr.nombre, true, left(p_dispositivo,30), left(p_sistema,40), left(p_navegador,40), left(p_huella,80), v_nuevo, _ip_cliente());
  delete from accesos where created_at < now() - interval '180 days';
  return v_nuevo;
end $$;

create or replace function registrar_acceso_fallido(p_email text, p_dispositivo text, p_sistema text, p_navegador text) returns void
language plpgsql security definer set search_path = public as $$
declare pr profiles%rowtype;
begin
  select * into pr from profiles where lower(email) = lower(trim(p_email));
  if not found then return; end if;   -- solo se anotan intentos contra cuentas reales
  if (select count(*) from accesos where usuario_id = pr.id and not exito and created_at > now() - interval '1 hour') >= 20 then return; end if;
  insert into accesos (usuario_id, email, nombre, exito, dispositivo, sistema, navegador, ip)
  values (pr.id, pr.email, pr.nombre, false, left(p_dispositivo,30), left(p_sistema,40), left(p_navegador,40), _ip_cliente());
end $$;

revoke execute on function registrar_acceso(text,text,text,text) from public, anon;
grant execute on function registrar_acceso(text,text,text,text) to authenticated;
revoke execute on function registrar_acceso_fallido(text,text,text,text) from public;
grant execute on function registrar_acceso_fallido(text,text,text,text) to anon, authenticated;
revoke execute on function _ip_cliente() from public, anon;
