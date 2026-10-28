-- 013 · Cotización de lotes (solo administradores)
create table if not exists cot_lotes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha date not null default current_date,
  envio_proveedor numeric(12,2) not null default 0 check (envio_proveedor >= 0),
  envio_traslado numeric(12,2) not null default 0 check (envio_traslado >= 0),
  impuestos numeric(12,2) not null default 0 check (impuestos >= 0),
  otros numeric(12,2) not null default 0 check (otros >= 0),
  reparto text not null default 'costo' check (reparto in ('costo','unidades','producto')),
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  notas text,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cot_lotes_nombre_uq on cot_lotes (lower(nombre));
create table if not exists cot_items (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references cot_lotes(id) on delete cascade,
  producto_id uuid references productos(id) on delete set null,
  nombre text not null,
  imagen_url text,
  imagen_path text,
  unidades integer not null default 1 check (unidades >= 1),
  costo numeric(12,2) not null check (costo > 0),
  precio numeric(12,2) not null default 0 check (precio >= 0),
  vendidas integer not null default 0 check (vendidas >= 0),
  devueltas integer not null default 0 check (devueltas >= 0),
  precio_real numeric(12,2) check (precio_real is null or precio_real >= 0),
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  check (vendidas <= unidades and devueltas <= vendidas)
);
create index if not exists cot_items_lote_idx on cot_items (lote_id);
alter table cot_lotes enable row level security;
alter table cot_items enable row level security;
drop policy if exists cot_lotes_admin on cot_lotes;
drop policy if exists cot_items_admin on cot_items;
create policy cot_lotes_admin on cot_lotes for all to authenticated using (es_admin()) with check (es_admin());
create policy cot_items_admin on cot_items for all to authenticated using (es_admin()) with check (es_admin());
grant select, insert, update, delete on cot_lotes, cot_items to authenticated;

create or replace function trg_cot_lotes_upd() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists cot_lotes_upd on cot_lotes;
create trigger cot_lotes_upd before update on cot_lotes for each row execute function trg_cot_lotes_upd();
drop trigger if exists bitacora_cot_lotes on cot_lotes;
create trigger bitacora_cot_lotes after insert or update or delete on cot_lotes for each row execute function registrar_bitacora();

-- Vaciar datos de prueba: también las cotizaciones
create or replace function reiniciar_datos(p_opciones jsonb, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o_prod boolean := coalesce((p_opciones->>'productos')::boolean, false);
  o_vent boolean := coalesce((p_opciones->>'ventas')::boolean, false);
  o_cli  boolean := coalesce((p_opciones->>'clientes')::boolean, false);
  o_prov boolean := coalesce((p_opciones->>'proveedores')::boolean, false);
  o_fin  boolean := coalesce((p_opciones->>'finanzas')::boolean, false);
  o_hist boolean := coalesce((p_opciones->>'historial')::boolean, false);
  o_res  boolean := coalesce((p_opciones->>'reservas')::boolean, false);
  o_cot  boolean := coalesce((p_opciones->>'cotizaciones')::boolean, false);
  n int; r jsonb := '{}'::jsonb;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede vaciar los datos'; end if;
  if coalesce(p_confirmacion,'') <> 'BORRAR TODO' then raise exception 'Falta la confirmación'; end if;
  if o_prod and not o_vent then raise exception 'Para borrar los productos también hay que borrar las ventas'; end if;
  if not (o_prod or o_vent or o_cli or o_prov or o_fin or o_hist or o_res or o_cot) then raise exception 'No elegiste nada para borrar'; end if;

  if o_vent then
    delete from devolucion_items; delete from devoluciones;
    delete from factura_items; delete from facturas;
    delete from venta_items; delete from ventas; get diagnostics n = row_count; r := r || jsonb_build_object('ventas', n);
    delete from cierres_caja;
    alter table ventas alter column numero restart with 1;
    alter table devoluciones alter column numero restart with 1;
    alter sequence factura_seq restart with 1;
  end if;
  if o_prod then
    delete from descuentos_programados; delete from promo_codigos;
    delete from movimientos_stock; delete from producto_imagenes;
    delete from productos; get diagnostics n = row_count; r := r || jsonb_build_object('productos', n);
  end if;
  if o_res then delete from reservas; get diagnostics n = row_count; r := r || jsonb_build_object('reservas', n); alter table reservas alter column numero restart with 1; end if;
  if o_cot then delete from cot_lotes; get diagnostics n = row_count; r := r || jsonb_build_object('cotizaciones', n); end if;
  if o_cli then delete from clientes; get diagnostics n = row_count; r := r || jsonb_build_object('clientes', n); end if;
  if o_prov then delete from proveedores; get diagnostics n = row_count; r := r || jsonb_build_object('proveedores', n); end if;
  if o_fin then
    delete from fin_movimientos; delete from fin_cuentas; delete from fin_banco; delete from capital_movs;
    r := r || jsonb_build_object('finanzas', true);
  end if;
  if o_hist then delete from bitacora; delete from accesos; r := r || jsonb_build_object('historial', true); end if;
  return r;
end $$;
revoke execute on function reiniciar_datos(jsonb, text) from public, anon;
grant execute on function reiniciar_datos(jsonb, text) to authenticated;
