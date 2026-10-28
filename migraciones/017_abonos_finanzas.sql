-- 017 · Los abonos de reservas cuentan como ingreso en Finanzas el día que se reciben
alter table fin_movimientos add column if not exists abono_id uuid references reserva_abonos(id) on delete cascade;
alter table fin_movimientos add column if not exists reserva_id uuid references reservas(id) on delete cascade;
create unique index if not exists fin_mov_abono_uk on fin_movimientos (abono_id) where abono_id is not null;
create index if not exists fin_mov_reserva_idx on fin_movimientos (reserva_id) where reserva_id is not null;

-- Cada abono nuevo crea su ingreso (si se borra el abono, el ingreso se borra solo)
create or replace function trg_abono_a_finanzas() returns trigger language plpgsql security definer set search_path = public as $$
declare r reservas%rowtype;
begin
  select * into r from reservas where id = new.reserva_id;
  insert into fin_movimientos (fecha, tipo, categoria, descripcion, monto, metodo, referencia, abono_id, reserva_id, creado_por)
  values ((new.created_at at time zone 'America/El_Salvador')::date, 'ingreso', 'Abonos de reservas',
          'Abono reserva #' || r.numero || ' – ' || r.cliente_nombre, new.monto, new.metodo, 'Reserva #' || r.numero,
          new.id, new.reserva_id, new.usuario_id);
  return null;
end $$;
drop trigger if exists abono_a_finanzas on reserva_abonos;
create trigger abono_a_finanzas after insert on reserva_abonos for each row execute function trg_abono_a_finanzas();

-- Reservas que ya tenían abonos: se pasan a Finanzas una sola vez
insert into fin_movimientos (fecha, tipo, categoria, descripcion, monto, metodo, referencia, abono_id, reserva_id, creado_por)
select (a.created_at at time zone 'America/El_Salvador')::date, 'ingreso', 'Abonos de reservas',
       'Abono reserva #' || r.numero || ' – ' || r.cliente_nombre, a.monto, a.metodo, 'Reserva #' || r.numero, a.id, a.reserva_id, a.usuario_id
  from reserva_abonos a join reservas r on r.id = a.reserva_id
 where not exists (select 1 from fin_movimientos f where f.abono_id = a.id);

-- Cancelar: se puede devolver el dinero (queda como gasto) o quedárselo (los ingresos se mantienen)
create or replace function cancelar_reserva(p_id uuid, p_motivo text default null, p_devolver boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas%rowtype; v_dev numeric;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  select * into r from reservas where id = p_id for update;
  if not found then raise exception 'La reserva no existe'; end if;
  if r.cancelada_en is not null then raise exception 'La reserva ya está cancelada'; end if;
  update reservas set cancelada_en = now(),
         cancelada_motivo = nullif(trim(coalesce(p_motivo,'') || case when r.monto_pagado > 0 then case when p_devolver then ' [abono devuelto]' else ' [abono retenido]' end else '' end),'')
   where id = p_id;
  if p_devolver and r.monto_pagado > 0 then
    v_dev := r.monto_pagado;
    insert into fin_movimientos (fecha, tipo, categoria, descripcion, monto, metodo, referencia, reserva_id, creado_por)
    values ((now() at time zone 'America/El_Salvador')::date, 'gasto', 'Devolución de abonos',
            'Devolución reserva #' || r.numero || ' – ' || r.cliente_nombre, v_dev, 'Efectivo', 'Reserva #' || r.numero, p_id, auth.uid());
  end if;
end $$;
revoke execute on function cancelar_reserva(uuid, text, boolean) from public, anon;
grant execute on function cancelar_reserva(uuid, text, boolean) to authenticated;

-- Reactivar: si se había devuelto el dinero, ese gasto se elimina
create or replace function trg_reserva_reactivada() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.cancelada_en is not null and new.cancelada_en is null then
    delete from fin_movimientos where reserva_id = new.id and abono_id is null;
  end if;
  return null;
end $$;
drop trigger if exists reserva_reactivada on reservas;
create trigger reserva_reactivada after update on reservas for each row execute function trg_reserva_reactivada();
