-- 081 · Reseñas de clientas que se muestran en la tienda (las gestiona un administrador)
create table if not exists resenas_tienda (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  texto text not null,
  estrellas integer not null default 5 check (estrellas between 1 and 5),
  producto text,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
alter table resenas_tienda enable row level security;
drop policy if exists admin_resenas on resenas_tienda;
create policy admin_resenas on resenas_tienda for all to authenticated using (es_admin()) with check (es_admin());
grant select, insert, update, delete on resenas_tienda to authenticated;

create or replace function tienda_resenas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('n', nombre, 't', texto, 'e', estrellas, 'p', producto) order by created_at desc), '[]'::jsonb)
  from (select * from resenas_tienda where visible order by created_at desc limit 12) r
$$;
grant execute on function tienda_resenas() to anon, authenticated;
