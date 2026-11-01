-- Finanzas: el envío no es ingreso del negocio (se paga a la empresa de envío); solo cuenta el valor de los productos
create or replace function fin_ventas_mensuales(p_desde date, p_hasta date)
returns table (mes date, ventas numeric, costo numeric, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede ver finanzas'; end if;
  return query
  select m, coalesce(sum(vt),0), coalesce(sum(ct),0), coalesce(sum(nn),0)::bigint from (
    select date_trunc('month', (created_at at time zone 'America/El_Salvador'))::date as m, (total - coalesce(envio,0)) as vt, costo_total as ct, 1 as nn
      from ventas where estado = 'completada' and (created_at at time zone 'America/El_Salvador')::date between p_desde and p_hasta
    union all
    select date_trunc('month', fecha)::date, monto_nuevo - monto_devuelto, costo_nuevo - costo_recuperado, 0
      from devoluciones where fecha between p_desde and p_hasta
  ) x group by m order by m;
end $$;
