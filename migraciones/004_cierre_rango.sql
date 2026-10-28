-- Cierre de caja por periodo (días, semana, mes, año o rango libre)
alter table cierres_caja add column if not exists fecha_hasta date;

drop function if exists cerrar_caja(date, numeric, text);
create or replace function cerrar_caja(p_fecha date, p_contado numeric default null, p_nota text default null, p_hasta date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid(); v_res jsonb; v_n int; v_tot numeric; v_cost numeric; v_anu int; v_esp numeric;
  v_dn int; v_dt numeric; v_dc numeric; v_defe numeric; v_h date := coalesce(p_hasta, p_fecha);
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  if v_h < p_fecha then raise exception 'La fecha final no puede ser anterior a la inicial'; end if;
  if v_h - p_fecha > 366 then raise exception 'El periodo no puede superar un año'; end if;
  if p_contado is not null and p_contado < 0 then raise exception 'El efectivo contado no puede ser negativo'; end if;
  with v as (
    select case when tipo = 'entrega_pendiente' then 'ent' when tipo = 'cod' then 'cod' when tipo = 'cobro_pendiente' then 'cob'
                when metodo_pago = 'Transferencia' then 'tr' else 'ef' end as k, total, costo_total
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
  insert into cierres_caja (id, fecha, fecha_hasta, resumen, n_ventas, total_ventas, costo_total, n_anuladas, esperado_efectivo, efectivo_contado, diferencia, nota, creado_por)
  values (v_id, p_fecha, case when v_h = p_fecha then null else v_h end, v_res, v_n, v_tot + v_dt, v_cost + v_dc, v_anu, v_esp, p_contado, case when p_contado is null then null else p_contado - v_esp end, nullif(trim(p_nota),''), auth.uid());
  return v_id;
end $$;
revoke execute on function cerrar_caja(date, numeric, text, date) from public, anon;
grant execute on function cerrar_caja(date, numeric, text, date) to authenticated;
