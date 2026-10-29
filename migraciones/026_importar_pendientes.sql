-- Importar ventas pendientes de cobro del sistema anterior. NO toca el stock (esos productos ya habían salido del inventario).
create or replace function importar_pendientes_cobro(p_ventas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; it jsonb; pr record; v_id uuid; v_fecha timestamptz; v_cli text; v_ab numeric; v_sub numeric; v_cost numeric;
        v_q integer; v_p numeric; v_met text; v_ok int := 0; v_om int := 0; v_nom text;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede importar datos'; end if;
  if jsonb_typeof(p_ventas) <> 'array' then raise exception 'Formato inválido'; end if;
  for v in select value from jsonb_array_elements(p_ventas) loop
    v_cli := nullif(trim(coalesce(v->>'cliente','')),'');
    v_fecha := coalesce(nullif(v->>'fecha','')::timestamptz, now());
    v_ab := greatest(0, coalesce(nullif(v->>'abonado','')::numeric, 0));
    v_met := case when v->>'metodo' = 'Transferencia' then 'Transferencia' else 'Efectivo' end;
    if v_cli is null or jsonb_typeof(v->'items') <> 'array' or jsonb_array_length(v->'items') = 0 then v_om := v_om + 1; continue; end if;
    if exists (select 1 from ventas where tipo = 'cobro_pendiente' and cliente_nombre = v_cli and created_at = v_fecha) then v_om := v_om + 1; continue; end if;
    v_sub := 0; v_cost := 0;
    insert into ventas (usuario_id, metodo_pago, tipo, estado, created_at, cliente_nombre)
    values (auth.uid(), v_met, 'cobro_pendiente', 'pendiente', v_fecha, v_cli) returning id into v_id;
    for it in select value from jsonb_array_elements(v->'items') loop
      v_q := greatest(1, coalesce(nullif(it->>'cantidad','')::integer, 1));
      v_p := round(coalesce(nullif(it->>'precio','')::numeric, 0), 2);
      select * into pr from productos where activo and codigo = nullif(trim(coalesce(it->>'codigo','')),'') limit 1;
      v_nom := coalesce(nullif(trim(coalesce(it->>'nombre','')),''), pr.nombre, 'Producto');
      if found then
        insert into venta_items (venta_id, producto_id, cantidad, precio_unit, costo_unit, nombre, codigo, codigo_barras, precio_original, descuento_pct)
        values (v_id, pr.id, v_q, v_p, coalesce(pr.precio_costo,0), v_nom, pr.codigo, coalesce(pr.codigo_barras, nullif(it->>'barcode','')),
                coalesce(nullif(it->>'precio_original','')::numeric, v_p), coalesce(nullif(it->>'descuento','')::numeric, 0));
        v_cost := v_cost + v_q * coalesce(pr.precio_costo,0);
      else
        insert into venta_items (venta_id, producto_id, cantidad, precio_unit, costo_unit, nombre, codigo, codigo_barras, categoria, precio_original, es_libre)
        values (v_id, null, v_q, v_p, 0, v_nom, coalesce(nullif(trim(coalesce(it->>'codigo','')),''), 'ANT_' || substr(gen_random_uuid()::text,1,8)),
                nullif(it->>'barcode',''), 'Sistema anterior', coalesce(nullif(it->>'precio_original','')::numeric, v_p), true);
      end if;
      v_sub := v_sub + round(v_p * v_q, 2);
    end loop;
    if v_ab >= v_sub then v_ab := greatest(0, v_sub - 0.01); end if;
    update ventas set subtotal = v_sub, total = v_sub, costo_total = v_cost, abonado = v_ab, pendiente_monto = v_sub - v_ab where id = v_id;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('importadas', v_ok, 'omitidas', v_om);
end $$;
revoke execute on function importar_pendientes_cobro(jsonb) from public, anon;
grant execute on function importar_pendientes_cobro(jsonb) to authenticated;
