-- 086 · Metas de venta (diaria y mensual) y permisos por módulo para vendedores

create table if not exists metas_venta (
  tipo text primary key check (tipo in ('dia','mes')),
  monto numeric(12,2) not null check (monto >= 0),
  actualizado timestamptz not null default now()
);
alter table metas_venta enable row level security;
drop policy if exists metas_leer on metas_venta;
create policy metas_leer on metas_venta for select to authenticated using (true);

create or replace function guardar_meta_venta(p_tipo text, p_monto numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede cambiar las metas'; end if;
  if p_tipo not in ('dia','mes') then raise exception 'Tipo de meta inválido'; end if;
  if coalesce(p_monto, -1) < 0 then raise exception 'Monto inválido'; end if;
  insert into metas_venta (tipo, monto, actualizado) values (p_tipo, round(p_monto, 2), now())
  on conflict (tipo) do update set monto = excluded.monto, actualizado = now();
end $$;
revoke execute on function guardar_meta_venta(text, numeric) from public, anon;
grant execute on function guardar_meta_venta(text, numeric) to authenticated;

-- Permisos por módulo: lista de módulos (claves del menú) que un vendedor NO puede abrir. Null = valores por defecto.
alter table profiles add column if not exists modulos_ocultos text[];

create or replace function guardar_modulos_usuario(p_id uuid, p_ocultos text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede cambiar permisos'; end if;
  if exists (select 1 from profiles where id = p_id and rol = 'admin') then raise exception 'Los administradores siempre ven todo'; end if;
  update profiles set modulos_ocultos = nullif(coalesce(p_ocultos, '{}'), '{}') where id = p_id;
end $$;
revoke execute on function guardar_modulos_usuario(uuid, text[]) from public, anon;
grant execute on function guardar_modulos_usuario(uuid, text[]) to authenticated;
