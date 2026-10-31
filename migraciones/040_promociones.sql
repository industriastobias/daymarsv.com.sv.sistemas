-- Promociones por correo a clientes que las aceptan, con enlace de baja y límite diario
alter table clientes add column if not exists acepta_promos boolean not null default false;
alter table clientes add column if not exists baja_promos_en timestamptz;
alter table clientes add column if not exists token_baja uuid not null default gen_random_uuid();
create unique index if not exists clientes_token_baja on clientes (token_baja);
alter table config_correo add column if not exists limite_diario int not null default 250;

-- Cuántos correos salieron hoy (hora de El Salvador) y el límite diario
create or replace function correos_hoy() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'enviados', (select count(*) from correos_enviados where (created_at at time zone 'America/El_Salvador')::date = (now() at time zone 'America/El_Salvador')::date),
    'limite', coalesce((select limite_diario from config_correo where id = 1), 250));
$$;

-- Envía una promoción a UN cliente (solo si acepta, tiene correo y no se pasó el límite diario)
create or replace function enviar_promocion(p_cliente uuid, p_asunto text, p_html text, p_base text, p_campana text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c clientes%rowtype; h jsonb; v_nom text; html text; asu text; baja text;
begin
  if not es_admin() then raise exception 'Solo un administrador puede enviar promociones'; end if;
  select * into c from clientes where id = p_cliente;
  if not found then return 'sin_cliente'; end if;
  if not c.acepta_promos then return 'no_acepta'; end if;
  if c.correo is null or c.correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'sin_correo'; end if;
  h := correos_hoy();
  if (h->>'enviados')::int >= (h->>'limite')::int then return 'limite'; end if;
  v_nom := split_part(trim(c.nombre), ' ', 1);
  baja := rtrim(p_base, '/') || '/baja.html?t=' || c.token_baja::text;
  html := replace(replace(p_html, '{{NOMBRE}}', coalesce(nullif(v_nom,''), 'cliente')), '{{BAJA}}', baja);
  asu := replace(p_asunto, '{{NOMBRE}}', coalesce(nullif(v_nom,''), 'cliente'));
  perform _correo_enviar(c.correo, asu, html, null, null, null, 'promocion', left(coalesce(p_campana, 'Promoción'), 60));
  return 'ok';
end $$;

-- El cliente toca el enlace del correo y se da de baja (sin iniciar sesión)
create or replace function baja_promociones(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  update clientes set acepta_promos = false, baja_promos_en = now() where token_baja = p_token returning nombre into n;
  if not found then return 'no_encontrado'; end if;
  return 'ok';
end $$;

revoke execute on function correos_hoy(), enviar_promocion(uuid,text,text,text,text) from public, anon;
grant execute on function correos_hoy(), enviar_promocion(uuid,text,text,text,text) to authenticated;
revoke execute on function baja_promociones(uuid) from public;
grant execute on function baja_promociones(uuid) to anon, authenticated;
