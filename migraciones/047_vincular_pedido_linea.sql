-- Un pedido en línea atendido desde el punto de venta queda enlazado a su venta
create or replace function vincular_pedido_linea(p_id uuid, p_venta uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede atender pedidos'; end if;
  update pedidos_linea set estado = 'aceptado', venta_id = p_venta, atendido_por = auth.uid(), atendido_en = now()
   where id = p_id and estado = 'nuevo';
end $$;
revoke execute on function vincular_pedido_linea(uuid, uuid) from public, anon;
grant execute on function vincular_pedido_linea(uuid, uuid) to authenticated;
