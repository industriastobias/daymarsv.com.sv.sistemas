-- Los pedidos en línea que nadie atiende en 12 horas se anulan solos (ya no reservan stock)
create or replace function vencer_pedidos_linea() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update pedidos_linea
     set estado = 'rechazado', atendido_en = now(),
         nota = left(coalesce(nullif(nota,'') || ' · ', '') || 'Vencido automáticamente (12 h sin atender)', 300)
   where estado = 'nuevo' and created_at < now() - interval '12 hours';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function vencer_pedidos_linea() from public;
grant execute on function vencer_pedidos_linea() to anon, authenticated;
