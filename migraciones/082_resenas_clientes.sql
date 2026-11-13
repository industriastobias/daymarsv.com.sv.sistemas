-- 082 · Las clientas dejan su reseña desde el seguimiento del pedido (solo con pedido ENTREGADO, una por pedido).
-- Llegan ocultas: un administrador las aprueba en Reseñas antes de que se vean en la tienda.
alter table resenas_tienda add column if not exists pedido_codigo text;
alter table resenas_tienda add column if not exists origen text not null default 'admin';
create unique index if not exists resenas_tienda_pedido_uk on resenas_tienda (pedido_codigo) where pedido_codigo is not null;

create or replace function tienda_resena_enviar(p_codigo text, p_estrellas integer, p_texto text) returns text
language plpgsql security definer set search_path = public as $$
declare v_c text; v_cod text; est jsonb; v_nom text; v_pro text; v_txt text;
begin
  v_c := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if v_c ~ '^[0-9]{6}$' then v_c := 'DY' || v_c; end if;
  if length(v_c) not in (8, 10) then raise exception 'Número de pedido inválido'; end if;
  est := tienda_pedido_estado(v_c);
  if est is null then raise exception 'No encontramos ese pedido'; end if;
  if est->>'estado' <> 'entregado' then raise exception 'Podrás dejar tu reseña cuando tu pedido esté entregado'; end if;
  v_cod := est->>'codigo';
  if exists (select 1 from resenas_tienda where pedido_codigo = v_cod) then raise exception 'Ya dejaste tu reseña de este pedido. ¡Gracias!'; end if;
  v_txt := left(trim(coalesce(p_texto,'')), 280);
  if length(v_txt) < 5 then raise exception 'Cuéntanos un poco más (mínimo 5 letras)'; end if;
  if (select count(*) from resenas_tienda where origen = 'cliente' and created_at > now() - interval '1 hour') > 30 then raise exception 'Intenta más tarde'; end if;
  select coalesce(nullif(split_part(trim(cliente_nombre),' ',1),'') || coalesce(' ' || nullif(left(split_part(trim(cliente_nombre),' ',2),1),'') || '.',''), 'Clienta') into v_nom
    from pedidos_linea where replace(codigo,'-','') = v_c;
  if v_nom is null then
    select coalesce(nullif(split_part(trim(cliente_nombre),' ',1),'') || coalesce(' ' || nullif(left(split_part(trim(cliente_nombre),' ',2),1),'') || '.',''), 'Clienta') into v_nom
      from ventas where replace(codigo,'-','') = v_c;
  end if;
  v_pro := left(est->'items'->0->>'nombre', 60);
  insert into resenas_tienda (nombre, texto, estrellas, producto, visible, pedido_codigo, origen)
  values (coalesce(v_nom,'Clienta'), v_txt, least(greatest(coalesce(p_estrellas,5),1),5), v_pro, false, v_cod, 'cliente');
  return 'ok';
end $$;
revoke execute on function tienda_resena_enviar(text, integer, text) from public;
grant execute on function tienda_resena_enviar(text, integer, text) to anon, authenticated;
