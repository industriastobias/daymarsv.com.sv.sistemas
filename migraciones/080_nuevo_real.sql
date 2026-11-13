-- 080 · "NUEVO" real: solo cuenta lo agregado después de esta migración (los productos que ya existían no se marcan como nuevos).
-- Excepción: lo creado en los últimos 2 días antes de aplicarla (el producto que acabas de agregar).
alter table productos add column if not exists alta_tienda timestamptz;
update productos set alta_tienda = created_at where alta_tienda is null and created_at > now() - interval '2 days';
create or replace function _productos_alta_tienda() returns trigger language plpgsql as $$
begin if new.alta_tienda is null then new.alta_tienda := now(); end if; return new; end $$;
drop trigger if exists trg_productos_alta_tienda on productos;
create trigger trg_productos_alta_tienda before insert on productos for each row execute function _productos_alta_tienda();
-- 080 · El catálogo usa alta_tienda (fecha real de alta) para marcar los productos nuevos
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
        'alta', p.alta_tienda,
        'images', coalesce(
          (select jsonb_agg(pi.url order by pi.orden) from producto_imagenes pi where pi.producto_id = p.id and coalesce(pi.url, '') <> ''),
          case when coalesce(p.foto_url, '') <> '' then jsonb_build_array(p.foto_url) else '[]'::jsonb end),
        'thumbs', coalesce(
          (select jsonb_agg(coalesce(nullif(pi.thumb_url, ''), pi.url) order by pi.orden) from producto_imagenes pi where pi.producto_id = p.id and coalesce(pi.url, '') <> ''),
          case when coalesce(p.foto_url, '') <> '' then jsonb_build_array(p.foto_url) else '[]'::jsonb end)
      ) as x
    from productos p left join categorias c on c.id = p.categoria_id left join r on r.producto_id = p.id
    where p.activo and p.publicar_tienda and coalesce(nullif(p.codigo_barras, ''), p.codigo) is not null
  ) t
$$;
revoke execute on function tienda_catalogo() from public;
grant execute on function tienda_catalogo() to anon, authenticated;
