-- 101 · Abrir caja (opción «A · caja del día», elegida por el dueño)
-- Se abre la caja con el efectivo inicial (fondo). Durante el día se anotan entradas y salidas de efectivo.
-- Al cerrar la caja de ese día, el efectivo esperado = ventas en efectivo + devoluciones en efectivo (como antes)
--   + fondo inicial + abonos de reservas en efectivo + entradas − salidas.
-- Si no se abrió la caja, el cierre funciona exactamente igual que antes.

create table if not exists caja_aperturas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default ((now() at time zone 'America/El_Salvador')::date),
  fondo numeric(12,2) not null default 0 check (fondo >= 0),
  nota text,
  abierta_por uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  cerrada_en timestamptz,
  cierre_id uuid references cierres_caja(id) on delete set null
);
-- solo puede haber una caja abierta a la vez
create unique index if not exists caja_una_abierta on caja_aperturas ((true)) where cerrada_en is null;
create index if not exists caja_aperturas_fecha_idx on caja_aperturas (fecha desc, created_at desc);
alter table caja_aperturas enable row level security;
drop policy if exists ver_caja_aperturas on caja_aperturas;
create policy ver_caja_aperturas on caja_aperturas for select to authenticated using (es_usuario_activo());

create table if not exists caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  apertura_id uuid not null references caja_aperturas(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','salida')),
  monto numeric(12,2) not null check (monto > 0),
  motivo text not null,
  creado_por uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists caja_mov_apertura_idx on caja_movimientos (apertura_id, created_at);
alter table caja_movimientos enable row level security;
drop policy if exists ver_caja_movimientos on caja_movimientos;
create policy ver_caja_movimientos on caja_movimientos for select to authenticated using (es_usuario_activo());

-- Efectivo de un día, con las mismas reglas que el cierre de caja
create or replace function caja_efectivo_dia(p_fecha date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ventas', coalesce((select sum(total) from ventas where estado = 'completada'
        and (created_at at time zone 'America/El_Salvador')::date = p_fecha
        and tipo not in ('entrega_pendiente','cod','cobro_pendiente')
        and coalesce(metodo_pago,'Efectivo') not in ('Transferencia','Tarjeta')), 0),
    'devoluciones', coalesce((select sum(diferencia) from devoluciones where fecha = p_fecha and metodo = 'Efectivo'), 0),
    'abonos', coalesce((select sum(monto) from reserva_abonos where metodo = 'Efectivo'
        and (created_at at time zone 'America/El_Salvador')::date = p_fecha), 0))
$$;
revoke all on function caja_efectivo_dia(date) from public, anon;

create or replace function abrir_caja(p_fondo numeric, p_nota text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if p_fondo is null or p_fondo < 0 then raise exception 'El efectivo inicial no es válido'; end if;
  if p_fondo > 100000 then raise exception 'El efectivo inicial es demasiado alto'; end if;
  if exists (select 1 from caja_aperturas where cerrada_en is null) then raise exception 'La caja ya está abierta'; end if;
  insert into caja_aperturas (fondo, nota, abierta_por) values (round(p_fondo, 2), left(nullif(trim(coalesce(p_nota,'')),''), 200), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function caja_movimiento(p_tipo text, p_monto numeric, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ap uuid; v_id uuid;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if p_tipo not in ('entrada','salida') then raise exception 'Tipo no válido'; end if;
  if p_monto is null or p_monto <= 0 or p_monto > 100000 then raise exception 'El monto no es válido'; end if;
  if nullif(trim(coalesce(p_motivo,'')),'') is null then raise exception 'Escribe el motivo'; end if;
  select id into v_ap from caja_aperturas where cerrada_en is null limit 1;
  if v_ap is null then raise exception 'Primero abre la caja'; end if;
  insert into caja_movimientos (apertura_id, tipo, monto, motivo, creado_por)
  values (v_ap, p_tipo, round(p_monto, 2), left(trim(p_motivo), 120), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Estado de la caja para la pantalla «Hoy»
create or replace function caja_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a caja_aperturas%rowtype; v_ef jsonb; v_ent numeric; v_sal numeric; v_mov jsonb; v_nom text; v_ult numeric;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  select fondo into v_ult from caja_aperturas where cerrada_en is not null order by created_at desc limit 1;
  select * into a from caja_aperturas where cerrada_en is null order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('abierta', false, 'ultimo_fondo', v_ult);
  end if;
  select nombre into v_nom from profiles where id = a.abierta_por;
  v_ef := caja_efectivo_dia(a.fecha);
  select coalesce(sum(monto) filter (where tipo = 'entrada'), 0), coalesce(sum(monto) filter (where tipo = 'salida'), 0)
    into v_ent, v_sal from caja_movimientos where apertura_id = a.id;
  select coalesce(jsonb_agg(jsonb_build_object('tipo', m.tipo, 'monto', m.monto, 'motivo', m.motivo, 'hora', m.created_at,
           'por', (select nombre from profiles where id = m.creado_por)) order by m.created_at), '[]'::jsonb)
    into v_mov from caja_movimientos m where m.apertura_id = a.id;
  return jsonb_build_object('abierta', true, 'ultimo_fondo', v_ult,
    'id', a.id, 'fecha', a.fecha, 'fondo', a.fondo, 'nota', a.nota, 'abierta_en', a.created_at, 'abierta_por', v_nom,
    'ventas_ef', (v_ef->>'ventas')::numeric, 'devoluciones_ef', (v_ef->>'devoluciones')::numeric, 'abonos_ef', (v_ef->>'abonos')::numeric,
    'entradas', v_ent, 'salidas', v_sal, 'movimientos', v_mov,
    'esperado', a.fondo + (v_ef->>'ventas')::numeric + (v_ef->>'devoluciones')::numeric + (v_ef->>'abonos')::numeric + v_ent - v_sal);
end $$;

revoke all on function abrir_caja(numeric, text) from public, anon;
revoke all on function caja_movimiento(text, numeric, text) from public, anon;
revoke all on function caja_estado() from public, anon;
grant execute on function abrir_caja(numeric, text) to authenticated;
grant execute on function caja_movimiento(text, numeric, text) to authenticated;
grant execute on function caja_estado() to authenticated;

-- Cierre de caja: igual que antes (078) y, si la caja de ese periodo se abrió, suma fondo, abonos en efectivo, entradas y salidas
create or replace function cerrar_caja(p_fecha date, p_contado numeric default null, p_nota text default null, p_hasta date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid(); v_res jsonb; v_n int; v_tot numeric; v_cost numeric; v_anu int; v_esp numeric;
  v_dn int; v_dt numeric; v_dc numeric; v_defe numeric; v_h date := coalesce(p_hasta, p_fecha);
  v_ap caja_aperturas%rowtype; v_tiene_ap boolean := false; v_ab numeric := 0; v_ent numeric := 0; v_sal numeric := 0;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  if v_h < p_fecha then raise exception 'La fecha final no puede ser anterior a la inicial'; end if;
  if v_h - p_fecha > 366 then raise exception 'El periodo no puede superar un año'; end if;
  if p_contado is not null and p_contado < 0 then raise exception 'El efectivo contado no puede ser negativo'; end if;
  with v as (
    select case when tipo = 'entrega_pendiente' then 'ent' when tipo = 'cod' then 'cod' when tipo = 'cobro_pendiente' then 'cob'
                when metodo_pago = 'Transferencia' then 'tr' when metodo_pago = 'Tarjeta' then 'tj' else 'ef' end as k, total, costo_total
    from ventas where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date between p_fecha and v_h),
  g as (select k, sum(total) t, count(*) n from v group by k)
  select jsonb_object_agg(k, jsonb_build_object('total', t, 'n', n)), coalesce(sum(n),0), coalesce(sum(t),0)
    into v_res, v_n, v_tot from g;
  select coalesce(sum(costo_total),0) into v_cost from ventas where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date between p_fecha and v_h;
  select count(*) into v_anu from ventas where estado = 'anulada' and (created_at at time zone 'America/El_Salvador')::date between p_fecha and v_h;
  select count(*), coalesce(sum(monto_nuevo - monto_devuelto),0), coalesce(sum(costo_nuevo - costo_recuperado),0),
         coalesce(sum(case when metodo = 'Efectivo' then diferencia else 0 end),0)
    into v_dn, v_dt, v_dc, v_defe from devoluciones where fecha between p_fecha and v_h;
  v_res := coalesce(v_res,'{}'::jsonb);
  if v_dn > 0 then v_res := v_res || jsonb_build_object('dev', jsonb_build_object('total', v_dt, 'n', v_dn)); end if;
  v_esp := coalesce((v_res->'ef'->>'total')::numeric, 0) + v_defe;

  -- caja abierta dentro del periodo
  select * into v_ap from caja_aperturas where cerrada_en is null and fecha between p_fecha and v_h order by created_at desc limit 1;
  if found then
    v_tiene_ap := true;
    select coalesce(sum(monto),0) into v_ab from reserva_abonos where metodo = 'Efectivo'
      and (created_at at time zone 'America/El_Salvador')::date between p_fecha and v_h;
    select coalesce(sum(monto) filter (where tipo = 'entrada'), 0), coalesce(sum(monto) filter (where tipo = 'salida'), 0)
      into v_ent, v_sal from caja_movimientos where apertura_id = v_ap.id;
    v_esp := v_esp + v_ap.fondo + v_ab + v_ent - v_sal;
    v_res := v_res || jsonb_build_object('caja', jsonb_build_object('fondo', v_ap.fondo, 'abonos', v_ab, 'entradas', v_ent, 'salidas', v_sal,
      'abierta_en', v_ap.created_at, 'apertura_id', v_ap.id));
  end if;

  insert into cierres_caja (id, fecha, fecha_hasta, resumen, n_ventas, total_ventas, costo_total, n_anuladas, esperado_efectivo, efectivo_contado, diferencia, nota, creado_por)
  values (v_id, p_fecha, case when v_h = p_fecha then null else v_h end, v_res, v_n, v_tot + v_dt, v_cost + v_dc, v_anu, v_esp, p_contado, case when p_contado is null then null else p_contado - v_esp end, nullif(trim(p_nota),''), auth.uid());
  if v_tiene_ap then update caja_aperturas set cerrada_en = now(), cierre_id = v_id where id = v_ap.id; end if;
  return v_id;
end $$;
