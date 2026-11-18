-- 088 · Seguimiento en la tienda: una venta pendiente de cobro se muestra como "Pago pendiente" (con saldo), no como "Orden aceptada"
create or replace function tienda_pedido_estado(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p pedidos_linea%rowtype; v ventas%rowtype; v_c text; v_est text; v_vest text; v_vseg text; v_vtipo text; v_vab numeric; v_vpen numeric; v_it jsonb; v_act timestamptz;
begin
  v_c := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_c) not in (8, 10) then return null; end if;
  select * into p from pedidos_linea where replace(codigo,'-','') = v_c;
  if found then
    if p.venta_id is not null then select estado, seguimiento, tipo, abonado, pendiente_monto into v_vest, v_vseg, v_vtipo, v_vab, v_vpen from ventas where id = p.venta_id; end if;
    v_est := case
      when p.estado = 'nuevo' then 'recibido'
      when p.estado = 'aceptado' and v_vest = 'completada' then 'entregado'
      when p.estado = 'aceptado' and v_vest = 'anulada' then 'cancelado'
      when p.estado = 'aceptado' and coalesce(p.seguimiento, v_vseg) is not null then coalesce(p.seguimiento, v_vseg)
      when p.estado = 'aceptado' and v_vest = 'pendiente' and v_vtipo = 'cobro_pendiente' then 'pago_pendiente'
      when p.estado = 'aceptado' then 'aceptado'
      when coalesce(p.nota,'') like '%Vencido autom%' then 'vencido'
      else 'rechazado' end;
    select coalesce(jsonb_agg(jsonb_build_object('nombre', i->>'nombre', 'cantidad', (i->>'cantidad')::int, 'precio', (i->>'precio')::numeric)), '[]'::jsonb)
      into v_it from jsonb_array_elements(p.items) i;
    return jsonb_build_object('codigo', p.codigo, 'estado', v_est, 'creado', p.created_at, 'actualizado', coalesce(p.seguimiento_en, p.atendido_en),
      'items', v_it, 'envio', p.envio, 'total', p.total,
      'saldo', case when v_vest = 'pendiente' and v_vtipo = 'cobro_pendiente' then coalesce(v_vpen, 0) end,
      'abonado', case when v_vest = 'pendiente' and v_vtipo = 'cobro_pendiente' then coalesce(v_vab, 0) end);
  end if;
  select * into v from ventas where replace(codigo,'-','') = v_c;
  if not found then return null; end if;
  v_est := case
    when v.estado = 'anulada' then 'cancelado'
    when v.estado = 'completada' then 'entregado'
    when v.seguimiento is not null then v.seguimiento
    when v.estado = 'pendiente' and v.tipo = 'cobro_pendiente' then 'pago_pendiente'
    else 'aceptado' end;
  select coalesce(jsonb_agg(jsonb_build_object('nombre', vi.nombre, 'cantidad', vi.cantidad, 'precio', vi.precio_unit)), '[]'::jsonb)
    into v_it from venta_items vi where vi.venta_id = v.id;
  return jsonb_build_object('codigo', v.codigo, 'estado', v_est, 'creado', v.created_at, 'actualizado', v.seguimiento_en,
    'items', v_it, 'envio', greatest(round(coalesce(v.total,0) - coalesce(v.subtotal,0), 2), 0), 'total', v.total,
    'saldo', case when v.estado = 'pendiente' and v.tipo = 'cobro_pendiente' then coalesce(v.pendiente_monto, 0) end,
    'abonado', case when v.estado = 'pendiente' and v.tipo = 'cobro_pendiente' then coalesce(v.abonado, 0) end);
end $$;
revoke execute on function tienda_pedido_estado(text) from public;
grant execute on function tienda_pedido_estado(text) to anon, authenticated;
