-- Publicar en la tienda: la tienda en línea lee su catálogo del sistema
alter table productos add column if not exists publicar_tienda boolean not null default true;

-- Catálogo público (sin sesión) con solo datos que ya se ven en la tienda: nada de costos ni datos internos
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
          case when coalesce(p.foto_url, '') <> '' then jsonb_build_array(p.foto_url) else '[]'::jsonb end)
      ) as x
    from productos p left join categorias c on c.id = p.categoria_id
    where p.activo and p.publicar_tienda and coalesce(nullif(p.codigo_barras, ''), p.codigo) is not null
  ) t
$$;
revoke execute on function tienda_catalogo() from public;
grant execute on function tienda_catalogo() to anon, authenticated;

-- tienda_stock también respeta "publicar en la tienda"
create or replace function tienda_stock() returns table(codigo text, stock integer, precio numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.codigo_barras,''), p.codigo) as codigo, greatest(p.stock,0)::integer,
         round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from productos p where p.activo and p.publicar_tienda
  union all
  select v.codigo_barras, greatest(v.stock,0)::integer, round(p.precio_venta * (1 - coalesce(p.descuento_pct,0)/100), 2)
    from producto_variantes v join productos p on p.id = v.producto_id
   where p.activo and p.publicar_tienda and coalesce(v.codigo_barras,'') <> ''
$$;
