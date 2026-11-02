-- Importar el catálogo de la tienda en línea al sistema (solo administrador principal).
-- p_items = [{name, price, stock, barcode, category, description, imgs:[url,...]}]
-- p_limpiar = true: antes de importar, borra los productos actuales; los que aparecen en alguna venta
--             (completada o pendiente) NO se borran: quedan ocultos para conservar el historial.
-- Todo ocurre en una sola transacción: si algo falla, no cambia nada.
create or replace function importar_productos_tienda(p_items jsonb, p_limpiar boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; it jsonb; v_cod text; v_cat uuid; v_pid uuid; v_stock integer; v_nom text; v_cn text; v_u text; k integer;
        n_ins integer := 0; n_del integer := 0; n_ocu integer := 0; n_omit integer := 0; n_fotos integer := 0; omitidos text[] := '{}';
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede importar el catálogo'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Lista de productos no válida'; end if;
  if p_limpiar then
    for r in select id from productos loop
      if exists (select 1 from venta_items where producto_id = r.id) then
        update productos set activo = false, eliminado_en = null, codigo_barras = null,
               codigo = 'old-' || substr(md5(r.id::text), 1, 10) where id = r.id;
        n_ocu := n_ocu + 1;
      else
        delete from movimientos_stock where producto_id = r.id;
        delete from productos where id = r.id;
        n_del := n_del + 1;
      end if;
    end loop;
  end if;
  for it in select value from jsonb_array_elements(p_items) loop
    v_cod := nullif(trim(coalesce(it->>'barcode', '')), '');
    v_nom := left(trim(coalesce(it->>'name', '')), 200);
    if v_cod is null or v_nom = '' or exists (select 1 from productos where codigo_barras = v_cod or codigo = v_cod) then
      n_omit := n_omit + 1; omitidos := omitidos || coalesce(v_cod, '?'); continue;
    end if;
    v_cn := nullif(trim(coalesce(it->>'category', '')), '');
    v_cat := null;
    if v_cn is not null then
      select id into v_cat from categorias where nombre = v_cn;
      if v_cat is null then insert into categorias (nombre) values (v_cn) returning id into v_cat; end if;
    end if;
    v_stock := greatest(0, coalesce(nullif(it->>'stock', '')::integer, 0));
    v_u := nullif(it #>> '{imgs,0}', '');
    insert into productos (codigo, codigo_barras, nombre, categoria_id, precio_costo, precio_venta, stock, stock_minimo, descripcion, foto_url, activo)
    values (v_cod, v_cod, v_nom, v_cat, 0, greatest(0, coalesce(nullif(it->>'price', '')::numeric, 0)), v_stock, 0,
            nullif(left(coalesce(it->>'description', ''), 1000), ''), v_u, true)
    returning id into v_pid;
    n_ins := n_ins + 1;
    k := 0;
    for v_u in select value from jsonb_array_elements_text(coalesce(it->'imgs', '[]'::jsonb)) loop
      insert into producto_imagenes (producto_id, url, thumb_url, orden) values (v_pid, v_u, v_u, k);
      k := k + 1; n_fotos := n_fotos + 1;
    end loop;
    if v_stock > 0 then
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, usuario_id)
      values (v_pid, 'entrada', v_stock, v_stock, 'Importado de la tienda en línea', auth.uid());
    end if;
  end loop;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
  values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'productos', 'importar_tienda',
          'Importó ' || n_ins || ' productos de la tienda' || case when p_limpiar then '; borró ' || n_del || ' y ocultó ' || n_ocu || ' anteriores' else '' end);
  return jsonb_build_object('importados', n_ins, 'borrados', n_del, 'ocultos', n_ocu, 'omitidos', n_omit, 'omitidos_codigos', to_jsonb(omitidos), 'fotos', n_fotos);
end $$;
revoke execute on function importar_productos_tienda(jsonb, boolean) from public, anon;
grant execute on function importar_productos_tienda(jsonb, boolean) to authenticated;
