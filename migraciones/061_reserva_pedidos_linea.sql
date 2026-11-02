-- Reserva de stock para pedidos en línea: un pedido "nuevo" aparta sus unidades en la tienda hasta 12 horas.
-- No toca el stock real: solo la tienda muestra menos disponible. Se libera al aceptar (ahí baja el stock real),
-- al rechazar, o cuando pasan 12 horas sin atenderlo.
create or replace function _reservas_tienda() returns table(producto_id uuid, variante_id uuid, cant integer)
language sql stable security definer set search_path = public as $$
  with its as (
    select greatest(coalesce((it.value->>'cantidad')::integer, 0), 0) as q,
           coalesce(e.codigo_sistema, nullif(it.value->>'sys',''), it.value->>'codigo') as cod
      from pedidos_linea pl
      cross join lateral jsonb_array_elements(pl.items) as it(value)
      left join tienda_equivalencias e on e.codigo_tienda = it.value->>'codigo'
     where pl.estado = 'nuevo' and pl.created_at > now() - interval '12 hours'
  )
  select p.id, null::uuid, sum(i.q)::integer from its i
    join productos p on p.activo and (p.codigo_barras = i.cod or p.codigo = i.cod) group by p.id
  union all
  select v.producto_id, v.id, sum(i.q)::integer from its i
    join producto_variantes v on v.codigo_barras = i.cod
   where not exists (select 1 from productos p where p.activo and (p.codigo_barras = i.cod or p.codigo = i.cod))
   group by v.producto_id, v.id
$$;
revoke execute on function _reservas_tienda() from public, anon, authenticated;

create or replace function tienda_catalogo() returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select producto_id, sum(cant)::integer as c from _reservas_tienda() group by producto_id)
  select coalesce(jsonb_agg(t.x order by t.sin_stock, t.cat, t.nom), '[]'::jsonb) from (
    select (p.stock - coalesce(r.c,0) <= 0) as sin_stock, coalesce(c.nombre, 'Otros') as cat, p.nombre as nom,
      jsonb_build_object(
        'name', p.nombre,
        'price', p.precio_venta,
        'stock', greatest(p.stock - coalesce(r.c,0), 0),
        'barcode', coalesce(nullif(p.codigo_barras, ''), p.codigo),
        'category', coalesce(c.nombre, 'Otros'),
        'description', nullif(p.descripcion, ''),
        'discount', coalesce(p.descuento_pct, 0),
        'images', coalesce(
          (select jsonb_agg(pi.url order by pi.orden) from producto_imagenes pi where pi.producto_id = p.id and coalesce(pi.url, '') <> ''),
          case when coalesce(p.foto_url, '') <> '' then jsonb_build_array(p.foto_url) else '[]'::jsonb end)
      ) as x
    from productos p left join categorias c on c.id = p.categoria_id left join r on r.producto_id = p.id
    where p.activo and p.publicar_tienda and coalesce(nullif(p.codigo_barras, ''), p.codigo) is not null
  ) t
$$;
revoke execute on function tienda_catalogo() from public;
grant execute on function tienda_catalogo() to anon, authenticated;

create or replace function tienda_stock() returns table(codigo text, stock integer, precio numeric)
language sql stable security definer set search_path = public as $$
  with r as (select producto_id, variante_id, sum(cant)::integer as c from _reservas_tienda() group by producto_id, variante_id),
       rp as (select producto_id, sum(c)::integer as c from r group by producto_id)
  select coalesce(nullif(p.codigo_barras,''), p.codigo) as codigo, greatest(p.stock - coalesce(rp.c,0), 0)::integer,
         round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from productos p left join rp on rp.producto_id = p.id where p.activo and p.publicar_tienda
  union all
  select v.codigo_barras, greatest(v.stock - coalesce(rv.c,0), 0)::integer, round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from producto_variantes v join productos p on p.id = v.producto_id
    left join r rv on rv.variante_id = v.id
   where p.activo and p.publicar_tienda and coalesce(v.codigo_barras,'') <> ''
$$;
revoke execute on function tienda_stock() from public;
grant execute on function tienda_stock() to anon, authenticated;
