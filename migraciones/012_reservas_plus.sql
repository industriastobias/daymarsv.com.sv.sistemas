-- 012 · Reservas: fecha límite, entrega, cancelación e historial de abonos
alter table reservas add column if not exists vence date;
alter table reservas add column if not exists entregada_en timestamptz;
alter table reservas add column if not exists cancelada_en timestamptz;
alter table reservas add column if not exists cancelada_motivo text;

alter table reservas drop column if exists estado;
alter table reservas add column estado text generated always as (
  case when cancelada_en is not null then 'cancelada'
       when monto_pagado >= precio_total then 'completado'
       else 'pendiente' end) stored;
create index if not exists reservas_estado_idx on reservas (estado);
create index if not exists reservas_vence_idx on reservas (vence);

create table if not exists reserva_abonos (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  metodo text not null default 'Efectivo' check (metodo in ('Efectivo','Transferencia','Tarjeta')),
  nota text,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists reserva_abonos_res_idx on reserva_abonos (reserva_id, created_at);
alter table reserva_abonos enable row level security;
drop policy if exists ver_abonos_res on reserva_abonos;
drop policy if exists crear_abonos_res on reserva_abonos;
drop policy if exists borrar_abonos_res on reserva_abonos;
create policy ver_abonos_res   on reserva_abonos for select to authenticated using (es_usuario_activo());
create policy crear_abonos_res on reserva_abonos for insert to authenticated with check (es_usuario_activo());
create policy borrar_abonos_res on reserva_abonos for delete to authenticated using (es_admin());
grant select, insert, delete on reserva_abonos to authenticated;

-- El total pagado de la reserva siempre es la suma de sus abonos
create or replace function trg_abonos_sync() returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid := coalesce(new.reserva_id, old.reserva_id);
begin
  update reservas set monto_pagado = (select coalesce(sum(monto),0) from reserva_abonos where reserva_id = rid) where id = rid;
  return null;
end $$;
drop trigger if exists abonos_sync on reserva_abonos;
create trigger abonos_sync after insert or update or delete on reserva_abonos for each row execute function trg_abonos_sync();

-- Reservas que ya tenían un pago registrado: se convierte en su primer abono
insert into reserva_abonos (reserva_id, monto, nota, usuario_id, created_at)
select r.id, r.monto_pagado, 'Abono inicial', r.usuario_id, r.created_at from reservas r
 where r.monto_pagado > 0 and not exists (select 1 from reserva_abonos a where a.reserva_id = r.id);

drop trigger if exists bitacora_reserva_abonos on reserva_abonos;
create trigger bitacora_reserva_abonos after insert or delete on reserva_abonos for each row execute function registrar_bitacora();
