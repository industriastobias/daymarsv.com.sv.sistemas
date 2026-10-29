-- Conteos que se empezaron antes de que el stock se corrigiera al instante: aplicar lo que quedó contado sin corregir
do $$
declare it record; n integer; v_ap integer;
begin
  for it in
    select i.id, i.contado, i.stock_al_contar, x.numero
      from inventario_items i join inventarios x on x.id = i.inventario_id
     where x.estado = 'abierto' and i.contado is not null and i.ajuste is null
  loop
    v_ap := _inv_aplicar(it.id, it.numero, it.contado - coalesce(it.stock_al_contar, 0));
    update inventario_items set ajuste = v_ap where id = it.id;
  end loop;
end $$;

-- Contar: la diferencia se calcula contra lo que ya se corrigió de esa fila (stock al contar + ajuste aplicado)
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
    if it.contado is not null then perform _inv_aplicar(p_item, n.numero, -coalesce(it.ajuste, 0)); end if;
    update inventario_items set contado = null, stock_al_contar = null, ajuste = null, contado_en = null, contado_por = null where id = p_item;
    return jsonb_build_object('contado', null, 'stock_al_contar', null);
  end if;
  if it.contado is null then
    v_s := coalesce(_inv_stock_actual(it.producto_id, it.variante_id, it.color), it.esperado);
    v_d := p_contado - v_s;
  else
    v_s := it.stock_al_contar;
    v_d := p_contado - (v_s + coalesce(it.ajuste, 0));
  end if;
  v_ap := _inv_aplicar(p_item, n.numero, v_d);
  update inventario_items set contado = p_contado, stock_al_contar = v_s,
         ajuste = coalesce(it.ajuste, 0) + v_ap, contado_en = now(), contado_por = auth.uid() where id = p_item;
  return jsonb_build_object('contado', p_contado, 'stock_al_contar', v_s);
end $$;
