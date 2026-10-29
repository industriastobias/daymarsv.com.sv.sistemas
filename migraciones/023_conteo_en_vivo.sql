-- Conteo físico: cada producto contado corrige su stock al instante (Punto de venta e Inventario lo ven de una vez).

-- Aplica una diferencia al stock real de una fila del conteo y deja el movimiento. Devuelve lo realmente aplicado.
create or replace function _inv_aplicar(p_it uuid, p_num integer, p_delta integer) returns integer
language plpgsql security definer set search_path = public as $$
declare it inventario_items%rowtype; v_act integer; v_ps integer; v_d integer := p_delta;
begin
  if v_d = 0 then return 0; end if;
  select * into it from inventario_items where id = p_it;
  v_act := coalesce(_inv_stock_actual(it.producto_id, it.variante_id, it.color), 0);
  if v_act + v_d < 0 then v_d := -v_act; end if;
  if v_d = 0 then return 0; end if;
  if it.variante_id is not null then
    update producto_variantes set stock = stock + v_d where id = it.variante_id;
  end if;
  update productos set stock = stock + v_d where id = it.producto_id returning stock into v_ps;
  insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, usuario_id)
  values (it.producto_id, case when v_d > 0 then 'entrada' else 'salida' end::tipo_movimiento, v_d, v_ps,
          'Inventario físico #' || p_num || coalesce(' · ' || nullif(it.color,''), ''), auth.uid());
  return v_d;
end $$;
revoke execute on function _inv_aplicar(uuid, integer, integer) from public, anon, authenticated;

create or replace function inventario_contar(p_item uuid, p_contado integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it inventario_items%rowtype; n inventarios%rowtype; v_s integer; v_d integer; v_ap integer;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede hacer el conteo físico'; end if;
  select i.* into it from inventario_items i join inventarios x on x.id = i.inventario_id where i.id = p_item and x.estado = 'abierto' for update of i;
  if not found then raise exception 'Ese conteo ya no está abierto'; end if;
  select * into n from inventarios where id = it.inventario_id;
  if p_contado is not null and p_contado < 0 then raise exception 'La cantidad no puede ser negativa'; end if;
  if p_contado is null then
    -- quitar el conteo: se devuelve lo que se había corregido
    if it.contado is not null then perform _inv_aplicar(p_item, n.numero, -coalesce(it.ajuste, 0)); end if;
    update inventario_items set contado = null, stock_al_contar = null, ajuste = null, contado_en = null, contado_por = null where id = p_item;
    return jsonb_build_object('contado', null, 'stock_al_contar', null);
  end if;
  if it.contado is null then
    v_s := coalesce(_inv_stock_actual(it.producto_id, it.variante_id, it.color), it.esperado);
    v_d := p_contado - v_s;
  else
    v_s := it.stock_al_contar;
    v_d := p_contado - it.contado;
  end if;
  v_ap := _inv_aplicar(p_item, n.numero, v_d);
  update inventario_items set contado = p_contado, stock_al_contar = v_s,
         ajuste = coalesce(it.ajuste, 0) + v_ap, contado_en = now(), contado_por = auth.uid() where id = p_item;
  return jsonb_build_object('contado', p_contado, 'stock_al_contar', v_s);
end $$;

-- Cerrar: lo contado ya se corrigió; opcionalmente los no contados se ponen en 0
create or replace function inventario_cerrar(p_inv uuid, p_ajustar boolean default true, p_no_contados_cero boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n inventarios%rowtype; it record; v_ap integer; v_aj int := 0; v_u int := 0;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede hacer el conteo físico'; end if;
  select * into n from inventarios where id = p_inv for update;
  if not found or n.estado <> 'abierto' then raise exception 'Ese conteo ya no está abierto'; end if;
  if p_no_contados_cero then
    for it in select * from inventario_items where inventario_id = p_inv and contado is null order by id loop
      v_ap := _inv_aplicar(it.id, n.numero, -coalesce(_inv_stock_actual(it.producto_id, it.variante_id, it.color), 0));
      update inventario_items set ajuste = v_ap where id = it.id;
    end loop;
  end if;
  select count(*) filter (where coalesce(ajuste,0) <> 0), coalesce(sum(abs(coalesce(ajuste,0))),0) into v_aj, v_u from inventario_items where inventario_id = p_inv;
  update inventarios set estado = 'cerrado', cerrado_en = now(), ajustado = true, no_contados_cero = coalesce(p_no_contados_cero,false) where id = p_inv;
  return jsonb_build_object('productos_ajustados', v_aj, 'unidades_movidas', v_u);
end $$;

-- Cancelar: se devuelve todo lo que se había corregido
create or replace function inventario_cancelar(p_inv uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n inventarios%rowtype; it record;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede hacer el conteo físico'; end if;
  select * into n from inventarios where id = p_inv and estado = 'abierto' for update;
  if not found then raise exception 'Ese conteo ya no está abierto'; end if;
  for it in select * from inventario_items where inventario_id = p_inv and coalesce(ajuste,0) <> 0 order by id loop
    perform _inv_aplicar(it.id, n.numero, -it.ajuste);
  end loop;
  update inventarios set estado = 'cancelado', cerrado_en = now() where id = p_inv;
end $$;
