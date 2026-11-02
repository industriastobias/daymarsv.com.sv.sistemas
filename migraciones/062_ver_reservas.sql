-- Para el personal: unidades apartadas por pedidos en línea nuevos (las ve Almacenamiento)
create or replace function reservas_pedidos_linea() returns table(producto_id uuid, variante_id uuid, cant integer)
language sql stable security definer set search_path = public as $$
  select r.producto_id, r.variante_id, r.cant from _reservas_tienda() r where es_usuario_activo()
$$;
revoke execute on function reservas_pedidos_linea() from public, anon;
grant execute on function reservas_pedidos_linea() to authenticated;
