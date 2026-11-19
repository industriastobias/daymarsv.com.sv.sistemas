-- 093 · Avisos para todo el equipo: cualquier usuario activo puede activar avisos; al asignar una tarea, le llega a esa persona

create or replace function guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then raise exception 'Suscripción inválida'; end if;
  insert into push_suscripciones (user_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 80))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, dispositivo = excluded.dispositivo;
end $$;
revoke execute on function guardar_suscripcion_push(text,text,text,text) from public, anon;
grant execute on function guardar_suscripcion_push(text,text,text,text) to authenticated;

create table if not exists aviso_errores (id bigserial primary key, creado timestamptz not null default now(), detalle text);

create or replace function avisar_tarea() returns trigger
language plpgsql security definer set search_path = public, extensions, net as $$
declare subs jsonb; cuerpo text;
begin
  if new.asignado_a is null or new.estado = 'hecha' then return new; end if;
  if tg_op = 'UPDATE' and old.asignado_a is not distinct from new.asignado_a then return new; end if;
  if new.asignado_a = auth.uid() then return new; end if;   -- no avisarse a uno mismo
  begin
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into subs from push_suscripciones s where s.user_id = new.asignado_a;
    if jsonb_array_length(subs) > 0 then
      cuerpo := left(new.titulo, 100) || case when new.vence is not null then ' · vence ' || to_char(new.vence, 'DD/MM') else '' end
                || case new.prioridad when 'alta' then ' · prioridad alta' else '' end;
      perform net.http_post(
        url := 'https://daymar-push.daymarsv.workers.dev/enviar',
        body := jsonb_build_object('titulo', 'Nueva tarea para ti', 'cuerpo', cuerpo, 'url', 'equipo.html', 'subs', subs),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 10000);
    end if;
  exception when others then
    begin insert into aviso_errores (detalle) values ('tarea: ' || left(sqlerrm, 280)); exception when others then null; end;
  end;
  return new;
end $$;
drop trigger if exists trg_avisar_tarea on tareas;
create trigger trg_avisar_tarea after insert or update of asignado_a on tareas for each row execute function avisar_tarea();
