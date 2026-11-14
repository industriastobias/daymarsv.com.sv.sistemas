-- 085 · Avisos de pedidos en línea: más robusto y con registro de errores
create table if not exists aviso_errores (id bigserial primary key, creado timestamptz not null default now(), detalle text);
alter table aviso_errores enable row level security;

create or replace function avisar_pedido_linea() returns trigger
language plpgsql security definer set search_path = public, extensions, net as $$
declare subs jsonb; n integer; cuerpo text;
begin
  begin
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into subs
      from push_suscripciones s join profiles p on p.id = s.user_id and p.rol = 'admin' and coalesce(p.activo, true);
    if jsonb_array_length(subs) > 0 then
      n := coalesce(jsonb_array_length(new.items), 0);
      cuerpo := coalesce(nullif(new.cliente_nombre, ''), 'Cliente') || ' · ' || n || (case when n = 1 then ' producto' else ' productos' end) || ' · $' || to_char(new.total, 'FM999990.00');
      perform net.http_post(
        url := 'https://daymar-push.daymarsv.workers.dev/enviar',
        body := jsonb_build_object('titulo', 'Nuevo pedido en línea', 'cuerpo', cuerpo, 'url', 'pedidos.html', 'subs', subs),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 10000);
    else
      insert into aviso_errores (detalle) values ('Sin dispositivos con avisos de administradores activos');
    end if;
  exception when others then
    begin insert into aviso_errores (detalle) values (left(sqlerrm, 300)); exception when others then null; end;
  end;
  return new;
end $$;
drop trigger if exists trg_avisar_pedido_linea on pedidos_linea;
create trigger trg_avisar_pedido_linea after insert on pedidos_linea for each row execute function avisar_pedido_linea();
