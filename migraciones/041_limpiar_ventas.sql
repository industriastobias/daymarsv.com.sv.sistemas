-- Eliminar ventas conservando las facturas (no se anulan) + limpieza masiva de ventas
drop function if exists eliminar_venta(uuid, boolean);
create or replace function eliminar_venta(p_venta uuid, p_devolver boolean, p_conservar_factura boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; it record;
begin
  if not es_admin() then raise exception 'Solo un administrador puede eliminar ventas'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if p_devolver and v.estado <> 'anulada' then
    -- solo regresa lo que todavía no había vuelto por una devolución
    for it in select vi.producto_id, vi.cantidad - coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = vi.id and di.direccion = 'entra' and di.regresa_stock), 0) as falta
                from venta_items vi where vi.venta_id = p_venta and vi.producto_id is not null loop
      if it.falta > 0 then update productos set stock = stock + it.falta where id = it.producto_id; end if;
    end loop;
  end if;
  if p_devolver and v.estado <> 'anulada' then
    for it in select vi.variante_id, vi.cantidad - coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = vi.id and di.direccion = 'entra' and di.regresa_stock), 0) as falta
                from venta_items vi where vi.venta_id = p_venta and vi.variante_id is not null loop
      if it.falta > 0 then perform _var_mover(it.variante_id, it.falta::integer); end if;
    end loop;
  end if;
  delete from movimientos_stock where venta_id = p_venta;
  delete from devoluciones where venta_id = p_venta;
  if not p_conservar_factura then update facturas set estado = 'anulada' where p_venta = any(venta_ids) and estado = 'emitida'; end if;
  update facturas set venta_ids = array_remove(venta_ids, p_venta) where p_venta = any(venta_ids);
  delete from ventas where id = p_venta;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
    values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'ventas', 'eliminar_venta',
            case when p_devolver then 'Eliminó una venta y devolvió los productos al stock' else 'Eliminó una venta sin devolver al stock' end);
end $$;
revoke execute on function eliminar_venta(uuid, boolean, boolean) from public, anon;
grant execute on function eliminar_venta(uuid, boolean, boolean) to authenticated;

-- Borra ventas viejas (p_dias null = todas) para liberar espacio. Las facturas NO se anulan.
-- Nunca toca ventas pendientes (entrega/cobro/contra entrega sin cerrar).
create or replace function limpiar_ventas(p_dias integer default null, p_devolver boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede limpiar las ventas'; end if;
  for r in select id from ventas
           where estado in ('completada','anulada')
             and (p_dias is null or created_at < now() - make_interval(days => p_dias)) loop
    perform eliminar_venta(r.id, p_devolver, true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function limpiar_ventas(integer, boolean) from public, anon;
grant execute on function limpiar_ventas(integer, boolean) to authenticated;
