-- Si se anula o elimina una venta, su factura queda ANULADA
create or replace function anular_venta(p_venta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it record; v_stock integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede anular ventas'; end if;
  if exists (select 1 from devoluciones where venta_id = p_venta) then
    raise exception 'Esta venta ya tiene devoluciones o cambios: no se puede anular. Puedes eliminarla si fue un error.'; end if;
  perform 1 from ventas where id = p_venta and estado in ('completada','pendiente') for update;
  if not found then raise exception 'La venta no existe o ya fue anulada'; end if;
  for it in select producto_id, cantidad from venta_items where venta_id = p_venta loop
    update productos set stock = stock + it.cantidad where id = it.producto_id returning stock into v_stock;
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (it.producto_id, 'devolucion', it.cantidad, v_stock, 'Venta anulada', p_venta, auth.uid());
  end loop;
  update facturas set estado = 'anulada' where p_venta = any(venta_ids) and estado = 'emitida';
  update ventas set estado = 'anulada', anulada_por = auth.uid(), anulada_en = now() where id = p_venta;
end $$;

create or replace function eliminar_venta(p_venta uuid, p_devolver boolean) returns void
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
  update facturas set estado = 'anulada' where p_venta = any(venta_ids) and estado = 'emitida';
  update facturas set venta_ids = array_remove(venta_ids, p_venta) where p_venta = any(venta_ids);
  delete from ventas where id = p_venta;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
    values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'ventas', 'eliminar_venta',
            case when p_devolver then 'Eliminó una venta y devolvió los productos al stock' else 'Eliminó una venta sin devolver al stock' end);
end $$;

-- Facturas que quedaron válidas aunque su venta ya fue eliminada
update facturas set estado = 'anulada' where estado = 'emitida' and coalesce(array_length(venta_ids,1),0) = 0;
