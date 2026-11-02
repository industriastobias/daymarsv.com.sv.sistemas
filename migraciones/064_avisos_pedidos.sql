-- Avisos (notificaciones) de pedidos en línea para los administradores
create table if not exists push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  creado timestamptz not null default now()
);
alter table push_suscripciones enable row level security;   -- sin políticas: solo se usa por las funciones de abajo

create or replace function guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede recibir avisos'; end if;
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then raise exception 'Suscripción inválida'; end if;
  insert into push_suscripciones (user_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 80))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, dispositivo = excluded.dispositivo;
end $$;
revoke execute on function guardar_suscripcion_push(text,text,text,text) from public, anon;
grant execute on function guardar_suscripcion_push(text,text,text,text) to authenticated;

create or replace function quitar_suscripcion_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_suscripciones where endpoint = p_endpoint and user_id = auth.uid()
$$;
revoke execute on function quitar_suscripcion_push(text) from public, anon;
grant execute on function quitar_suscripcion_push(text) to authenticated;

-- Cuántos dispositivos tienen avisos (para mostrarlo en Configuración)
create or replace function mis_dispositivos_push() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from push_suscripciones where user_id = auth.uid()
$$;
revoke execute on function mis_dispositivos_push() from public, anon;
grant execute on function mis_dispositivos_push() to authenticated;

-- Al llegar un pedido en línea nuevo, avisar a los administradores (nunca debe impedir que el pedido se guarde)
create or replace function avisar_pedido_linea() returns trigger
language plpgsql security definer set search_path = public as $$
declare subs jsonb; n integer; cuerpo text;
begin
  begin
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into subs
      from push_suscripciones s join profiles p on p.id = s.user_id and p.rol = 'admin' and p.activo;
    if jsonb_array_length(subs) > 0 then
      n := coalesce(jsonb_array_length(new.items), 0);
      cuerpo := coalesce(nullif(new.cliente_nombre, ''), 'Cliente') || ' · ' || n || (case when n = 1 then ' producto' else ' productos' end) || ' · $' || to_char(new.total, 'FM999990.00');
      perform net.http_post(
        url := 'https://daymar-push.daymarsv.workers.dev/enviar',
        body := jsonb_build_object('titulo', 'Nuevo pedido en línea', 'cuerpo', cuerpo, 'url', 'pedidos.html', 'subs', subs),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 10000);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_avisar_pedido_linea on pedidos_linea;
create trigger trg_avisar_pedido_linea after insert on pedidos_linea for each row execute function avisar_pedido_linea();
