-- 099 · Preventa: la tienda ya no pregunta cómo pagar; el pago (anticipo o completo) se acuerda con el cliente por chat.
-- Un pedido de preventa puede quedar con pago = null («a convenir»).

create or replace function tienda_pedido(p_cliente jsonb, p_items jsonb, p_codigo text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; v_total numeric := 0; v_envio numeric; v_tel text; v_metodo text; v_cod text;
  v_items jsonb := '[]'::jsonb; pr record; v_pv boolean := false; v_pvtot numeric := 0; v_ant numeric := 0; v_pago text; v_ap integer; v_linea numeric;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then raise exception 'Pedido inválido'; end if;
  if (select count(*) from pedidos_linea where created_at > now() - interval '1 hour') > 60 then raise exception 'Demasiados pedidos, intenta más tarde'; end if;
  v_tel := left(regexp_replace(coalesce(p_cliente->>'telefono',''), '[^0-9+]', '', 'g'), 20);
  if v_tel <> '' and (select count(*) from pedidos_linea where cliente_telefono = v_tel and created_at > now() - interval '1 hour') >= 5 then raise exception 'Ya enviaste varios pedidos, escríbenos por WhatsApp'; end if;
  v_envio := least(greatest(coalesce(nullif(p_cliente->>'envio','')::numeric,0),0),50);
  v_metodo := case when p_cliente->>'metodo' = 'Transferencia' then 'Transferencia' else 'Efectivo' end;
  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce(x.value->>'preventa','') = '1') then
    perform pg_advisory_xact_lock(hashtext('daymar_preventa'));
  end if;
  for it in select value from jsonb_array_elements(p_items) loop
    if coalesce((it->>'cantidad')::integer,0) < 1 or coalesce((it->>'cantidad')::integer,0) > 99 then raise exception 'Cantidad inválida'; end if;
    if coalesce(nullif(it->>'codigo',''),'') = '' then raise exception 'Producto inválido'; end if;
    v_linea := round(coalesce((it->>'precio')::numeric,0) * (it->>'cantidad')::integer, 2);
    v_total := v_total + v_linea;
    select null::uuid as id, null::text as nombre, null::integer as preventa_limite, null::integer as preventa_anticipo into pr;
    if coalesce(it->>'preventa','') = '1' then
      select id, nombre, preventa_limite, preventa_anticipo into pr from productos
       where activo and preventa and id = _pv_prod(_pv_codigo(it)) limit 1;
    end if;
    if pr.id is not null then
      if pr.preventa_limite is not null then
        select coalesce(sum(cant),0) into v_ap from _preventa_apartadas() where producto_id = pr.id;
        if v_ap + (it->>'cantidad')::integer > pr.preventa_limite then
          raise exception 'La preventa de % ya no tiene cupo (quedan %)', pr.nombre, greatest(pr.preventa_limite - v_ap, 0);
        end if;
      end if;
      v_pv := true; v_pvtot := v_pvtot + v_linea; v_ant := v_ant + round(v_linea * pr.preventa_anticipo / 100.0, 2);
      v_items := v_items || jsonb_build_array(it || '{"preventa":"1"}'::jsonb);
    else
      v_items := v_items || jsonb_build_array(it - 'preventa');
    end if;
  end loop;
  -- el pago de la preventa se acuerda con el cliente por chat: solo se guarda si la tienda lo manda
  v_pago := case when not v_pv then null when p_cliente->>'pago' = 'completo' then 'completo' when p_cliente->>'pago' = 'anticipo' then 'anticipo' end;
  v_cod := upper(coalesce(p_codigo,''));
  if v_cod !~ '^(DM-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}|DY-[0-9]{6})$' or exists (select 1 from pedidos_linea where codigo = v_cod) then
    loop v_cod := _nuevo_codigo_pedido(); exit when not exists (select 1 from pedidos_linea where codigo = v_cod); end loop;
  end if;
  insert into pedidos_linea (cliente_nombre, cliente_telefono, cliente_correo, cliente_direccion, metodo, items, envio, total, nota, codigo, preventa, pago, anticipo)
  values (left(nullif(trim(p_cliente->>'nombre'),''),120), nullif(v_tel,''), left(nullif(trim(p_cliente->>'correo'),''),120),
          left(nullif(trim(p_cliente->>'direccion'),''),300), v_metodo, v_items, v_envio, v_total + v_envio, left(nullif(trim(p_cliente->>'nota'),''),300), v_cod,
          v_pv, v_pago, case when v_pago = 'anticipo' then v_ant when v_pago = 'completo' then v_pvtot end)
  returning id into v_id;
  return v_cod;
end $$;
revoke execute on function tienda_pedido(jsonb, jsonb, text) from public;
grant execute on function tienda_pedido(jsonb, jsonb, text) to anon, authenticated;
