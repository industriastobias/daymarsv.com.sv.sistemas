-- Vaciar datos de prueba (solo el administrador principal). NO borra usuarios, invitaciones, categorías ni datos del negocio.
create or replace function reiniciar_datos(p_opciones jsonb, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o_prod boolean := coalesce((p_opciones->>'productos')::boolean, false);
  o_vent boolean := coalesce((p_opciones->>'ventas')::boolean, false);
  o_cli  boolean := coalesce((p_opciones->>'clientes')::boolean, false);
  o_prov boolean := coalesce((p_opciones->>'proveedores')::boolean, false);
  o_fin  boolean := coalesce((p_opciones->>'finanzas')::boolean, false);
  o_hist boolean := coalesce((p_opciones->>'historial')::boolean, false);
  n int; r jsonb := '{}'::jsonb;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede vaciar los datos'; end if;
  if coalesce(p_confirmacion,'') <> 'BORRAR TODO' then raise exception 'Falta la confirmación'; end if;
  if o_prod and not o_vent then raise exception 'Para borrar los productos también hay que borrar las ventas'; end if;
  if not (o_prod or o_vent or o_cli or o_prov or o_fin or o_hist) then raise exception 'No elegiste nada para borrar'; end if;

  if o_vent then
    delete from devolucion_items; delete from devoluciones;
    delete from factura_items; delete from facturas;
    delete from venta_items; delete from ventas; get diagnostics n = row_count; r := r || jsonb_build_object('ventas', n);
    delete from cierres_caja;
    alter table ventas alter column numero restart with 1;
    alter table devoluciones alter column numero restart with 1;
    alter sequence factura_seq restart with 1;
  end if;
  if o_prod then
    delete from descuentos_programados; delete from promo_codigos;
    delete from movimientos_stock; delete from producto_imagenes;
    delete from productos; get diagnostics n = row_count; r := r || jsonb_build_object('productos', n);
  end if;
  if o_cli then delete from clientes; get diagnostics n = row_count; r := r || jsonb_build_object('clientes', n); end if;
  if o_prov then delete from proveedores; get diagnostics n = row_count; r := r || jsonb_build_object('proveedores', n); end if;
  if o_fin then
    delete from fin_movimientos; delete from fin_cuentas; delete from fin_banco; delete from capital_movs;
    r := r || jsonb_build_object('finanzas', true);
  end if;
  if o_hist then delete from bitacora; delete from accesos; r := r || jsonb_build_object('historial', true); end if;
  return r;
end $$;
revoke execute on function reiniciar_datos(jsonb, text) from public, anon;
grant execute on function reiniciar_datos(jsonb, text) to authenticated;
