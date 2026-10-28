-- Compras registradas como egreso en Finanzas
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.fin_movimientos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%' loop
    execute format('alter table fin_movimientos drop constraint %I', c);
  end loop;
end $$;
alter table fin_movimientos add constraint fin_movimientos_tipo_check check (tipo in ('ingreso','gasto','costo','compra'));

drop function if exists registrar_compra(jsonb);
create or replace function registrar_compra(p_items jsonb, p_pago jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; v_cat uuid; v_nom text; v_id uuid; v_stock integer; v_q integer;
  v_ex productos%rowtype; v_out jsonb := '[]'::jsonb; v_existia boolean; v_lote boolean; v_total numeric := 0; v_n int := 0; v_nom1 text; v_prov uuid;
begin
  if not es_admin() then raise exception 'Solo un administrador puede registrar compras'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'No hay productos para guardar'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_q := coalesce((it->>'cantidad')::integer, 0);
    if v_q < 0 then raise exception 'La cantidad no puede ser negativa (%)', it->>'codigo'; end if;
    if coalesce(trim(it->>'codigo'), '') = '' or coalesce(trim(it->>'nombre'), '') = '' then
      raise exception 'Falta el nombre o el código de un producto'; end if;
    v_lote := coalesce(it->>'tipo_compra', 'normal') = 'lote';

    v_nom := nullif(trim(it->>'categoria'), '');
    v_cat := null;
    if v_nom is not null then
      select id into v_cat from categorias where lower(nombre) = lower(v_nom);
      if v_cat is null then insert into categorias (nombre) values (v_nom) returning id into v_cat; end if;
    end if;

    select * into v_ex from productos where codigo = it->>'codigo' for update;
    v_existia := found;
    if v_existia then
      if not coalesce((it->>'sumar')::boolean, false) then raise exception 'El código % ya existe', it->>'codigo'; end if;
      if not v_ex.activo then raise exception 'El código % está en la papelera. Restáuralo primero.', it->>'codigo'; end if;
      update productos set
        stock = stock + v_q,
        tipo_compra = case when v_lote then 'lote' else tipo_compra end,
        lotes = case when v_lote then lotes + coalesce((it->>'lotes')::integer, 0) else lotes end,
        unidades_por_lote = case when v_lote and unidades_por_lote = 0 then coalesce((it->>'unidades_por_lote')::integer, 0) else unidades_por_lote end
      where id = v_ex.id returning id, stock into v_id, v_stock;
    else
      insert into productos (codigo, nombre, codigo_barras, categoria_id, precio_venta, precio_costo, stock,
                             descripcion, descuento_pct, fecha_compra, tipo_compra, lotes, unidades_por_lote)
      values (trim(it->>'codigo'), trim(it->>'nombre'), nullif(trim(it->>'codigo_barras'), ''), v_cat,
              coalesce((it->>'precio_venta')::numeric, 0), coalesce((it->>'precio_costo')::numeric, 0), v_q,
              nullif(trim(it->>'descripcion'), ''), coalesce((it->>'descuento_pct')::numeric, 0),
              nullif(it->>'fecha_compra', '')::date, case when v_lote then 'lote' else 'normal' end,
              case when v_lote then coalesce((it->>'lotes')::integer, 0) else 0 end,
              case when v_lote then coalesce((it->>'unidades_por_lote')::integer, 0) else 0 end)
      returning id, stock into v_id, v_stock;
    end if;

    if v_q > 0 then
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, usuario_id)
      values (v_id, 'entrada', v_q, v_stock, case when v_existia then 'Compra (suma de stock)' else 'Compra inicial' end, auth.uid());
    end if;

    v_out := v_out || jsonb_build_object('id', v_id, 'codigo', it->>'codigo', 'existia', v_existia);
    v_total := v_total + round(coalesce((it->>'precio_costo')::numeric, 0) * v_q, 2);
    v_n := v_n + 1; if v_n = 1 then v_nom1 := trim(it->>'nombre'); end if;
  end loop;
  -- Si se pidió, la compra queda registrada en Finanzas (tipo 'compra', no afecta la utilidad: es inventario)
  if p_pago is not null and coalesce((p_pago->>'registrar')::boolean, false) and v_total > 0 then
    v_prov := nullif(p_pago->>'proveedor_id', '')::uuid;
    insert into fin_movimientos (fecha, tipo, categoria, descripcion, monto, metodo, proveedor_id, referencia, creado_por)
    values (coalesce(nullif(p_pago->>'fecha','')::date, (now() at time zone 'America/El_Salvador')::date), 'compra', 'Mercadería',
            case when v_n = 1 then 'Compra: ' || v_nom1 else 'Compra de ' || v_n || ' productos' end,
            v_total, coalesce(nullif(p_pago->>'metodo',''), 'Efectivo'), v_prov, nullif(trim(p_pago->>'referencia'), ''), auth.uid());
  end if;
  return v_out;
end $$;

revoke execute on function registrar_compra(jsonb, jsonb) from public, anon;
grant execute on function registrar_compra(jsonb, jsonb) to authenticated;
