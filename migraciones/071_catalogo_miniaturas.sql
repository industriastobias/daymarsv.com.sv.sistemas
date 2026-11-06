-- 071 · El catálogo de la tienda también entrega miniaturas (más livianas para las tarjetas del celular)
create or replace function tienda_catalogo() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.x order by t.sin_stock, t.cat, t.nom), '[]'::jsonb) from (
    select (p.stock <= 0) as sin_stock, coalesce(c.nombre, 'Otros') as cat, p.nombre as nom,
      jsonb_build_object(
        'name', p.nombre,
        'price', p.precio_venta,
        'stock', greatest(p.stock, 0),
        'barcode', coalesce(nullif(p.codigo_barras, ''), p.codigo),
        'category', coalesce(c.nombre, 'Otros'),
        'description', nullif(p.descripcion, ''),
        'discount', coalesce(p.descuento_pct, 0),
        'images', coalesce(
          (select jsonb_agg(pi.url order by pi.orden) from producto_imagenes pi where pi.producto_id = p.id and coalesce(pi.url, '') <> ''),
          case when coalesce(p.foto_url, '') <> '' then jsonb_build_array(p.foto_url) else '[]'::jsonb end),
        'thumbs', coalesce(
          (select jsonb_agg(coalesce(nullif(pi.thumb_url, ''), pi.url) order by pi.orden) from producto_imagenes pi where pi.producto_id = p.id and coalesce(pi.url, '') <> ''),
          case when coalesce(p.foto_url, '') <> '' then jsonb_build_array(p.foto_url) else '[]'::jsonb end)
      ) as x
    from productos p left join categorias c on c.id = p.categoria_id
    where p.activo and p.publicar_tienda and coalesce(nullif(p.codigo_barras, ''), p.codigo) is not null
  ) t
$$;
revoke execute on function tienda_catalogo() from public;
grant execute on function tienda_catalogo() to anon, authenticated;
