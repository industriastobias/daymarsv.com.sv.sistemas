-- Fotos que ocupan espacio pero ya no sirven (subidas que se cortaron o repetidas). Solo el administrador principal.
-- p_todas = true devuelve todas las fotos del bucket (para vaciar los datos de verdad).
create or replace function fotos_sobrantes(p_todas boolean default false) returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare v jsonb;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede liberar espacio'; end if;
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v
    from storage.objects o
   where o.bucket_id = 'productos'
     and (coalesce(p_todas, false)
          or (not exists (select 1 from producto_imagenes i where i.path = o.name or i.thumb_path = o.name)
              and not exists (select 1 from productos p where p.foto_url like '%' || o.name)));
  return v;
end $$;
revoke execute on function fotos_sobrantes(boolean) from public, anon;
grant execute on function fotos_sobrantes(boolean) to authenticated;
