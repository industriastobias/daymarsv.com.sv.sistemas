-- DAYMAR-SHOP · Control: historial de actividad, eliminar ventas (solo admin) y capital. Se puede correr más de una vez.

-- ============ 1. Quién anuló una venta ============
alter table ventas add column if not exists anulada_por uuid, add column if not exists anulada_en timestamptz;

create or replace function anular_venta(p_venta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it record; v_stock integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede anular ventas'; end if;
  perform 1 from ventas where id = p_venta and estado in ('completada','pendiente') for update;
  if not found then raise exception 'La venta no existe o ya fue anulada'; end if;
  for it in select producto_id, cantidad from venta_items where venta_id = p_venta loop
    update productos set stock = stock + it.cantidad where id = it.producto_id returning stock into v_stock;
    insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (it.producto_id, 'devolucion', it.cantidad, v_stock, 'Venta anulada', p_venta, auth.uid());
  end loop;
  update ventas set estado = 'anulada', anulada_por = auth.uid(), anulada_en = now() where id = p_venta;
end $$;
revoke execute on function anular_venta(uuid) from public, anon;
grant execute on function anular_venta(uuid) to authenticated;

-- ============ 2. Eliminar una venta (solo administradores) ============
-- p_devolver = true  -> los productos regresan al stock
-- p_devolver = false -> el stock se queda como está
-- En ambos casos la venta desaparece de ventas, reportes y movimientos de stock.
create or replace function eliminar_venta(p_venta uuid, p_devolver boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; it record;
begin
  if not es_admin() then raise exception 'Solo un administrador puede eliminar ventas'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if p_devolver and v.estado <> 'anulada' then
    for it in select producto_id, cantidad from venta_items where venta_id = p_venta loop
      update productos set stock = stock + it.cantidad where id = it.producto_id;
    end loop;
  end if;
  delete from movimientos_stock where venta_id = p_venta;
  update facturas set venta_ids = array_remove(venta_ids, p_venta) where p_venta = any(venta_ids);
  delete from ventas where id = p_venta;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
    values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'ventas', 'eliminar_venta',
            case when p_devolver then 'Eliminó una venta y devolvió los productos al stock' else 'Eliminó una venta sin devolver al stock' end);
end $$;
revoke execute on function eliminar_venta(uuid, boolean) from public, anon;
grant execute on function eliminar_venta(uuid, boolean) to authenticated;

-- ============ 3. Historial de actividad ============
create table if not exists bitacora (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  tabla text not null,
  accion text not null,
  registro_id text,
  resumen text,
  cambios jsonb
);
create index if not exists bitacora_fecha_idx on bitacora (created_at desc);
create index if not exists bitacora_usuario_idx on bitacora (usuario_id, created_at desc);
alter table bitacora enable row level security;
drop policy if exists ver_bitacora on bitacora;
-- Los administradores ven todo; solo el principal ve cuando se elimina una venta.
create policy ver_bitacora on bitacora for select to authenticated
  using (es_principal() or (es_admin() and accion <> 'eliminar_venta'));

create or replace function registrar_bitacora() returns trigger
language plpgsql security definer set search_path = public as $$
declare nw jsonb; od jsonb; k text; dif jsonb := '{}'; acc text; res text; nom text; ref jsonb;
begin
  if tg_op = 'DELETE' then ref := to_jsonb(old); acc := 'eliminar';
  else ref := to_jsonb(new); acc := case when tg_op = 'INSERT' then 'crear' else 'editar' end; end if;
  if tg_table_name = 'ventas' then
    if tg_op = 'INSERT' then   -- se registra al final de la operación, con el total ya calculado
      select to_jsonb(v) into ref from ventas v where v.id = new.id;
      if ref is null then return new; end if;
    elsif (to_jsonb(new)->>'estado') is not distinct from (to_jsonb(old)->>'estado') then return new; end if;
  end if;
  if tg_op = 'UPDATE' then
    nw := to_jsonb(new); od := to_jsonb(old);
    for k in select jsonb_object_keys(nw) loop
      if k in ('stock','created_at','updated_at','abonado','anulada_en','anulada_por','completada_en') then continue; end if;
      if nw->k is distinct from od->k and length(coalesce((nw->k)::text,'')) < 400 then
        dif := dif || jsonb_build_object(k, jsonb_build_object('antes', od->k, 'despues', nw->k));
      end if;
    end loop;
    if dif = '{}'::jsonb then return new; end if;
    if tg_table_name = 'ventas' and nw->>'estado' = 'anulada' and od->>'estado' <> 'anulada' then acc := 'anular'; end if;
  end if;
  res := coalesce(ref->>'nombre', ref->>'cliente_nombre', ref->>'tercero', ref->>'descripcion', ref->>'categoria', ref->>'codigo', ref->>'email', '');
  if tg_table_name in ('ventas','facturas') and ref ? 'numero' then res := '#' || (ref->>'numero') || case when res = '' then '' else ' · ' || res end; end if;
  if ref ? 'monto' then res := trim(res || ' $' || (ref->>'monto')); end if;
  if ref ? 'total' and tg_table_name in ('ventas','facturas') then res := trim(res || ' $' || (ref->>'total')); end if;
  select nombre into nom from profiles where id = auth.uid();
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, registro_id, resumen, cambios)
    values (auth.uid(), nom, tg_table_name, acc, ref->>'id', res, case when dif = '{}'::jsonb then null else dif end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['productos','clientes','proveedores','categorias','fin_movimientos','fin_cuentas','facturas','promo_codigos','cierres_caja','config_negocio'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists bitacora_%1$s on %1$I', t);
      execute format('create trigger bitacora_%1$s after insert or update or delete on %1$I for each row execute function registrar_bitacora()', t);
    end if;
  end loop;
end $$;
-- ventas: solo crear y editar (borrar queda sin rastro, ver eliminar_venta)
drop trigger if exists bitacora_ventas on ventas;
drop trigger if exists bitacora_ventas_i on ventas;
create constraint trigger bitacora_ventas_i after insert on ventas deferrable initially deferred for each row execute function registrar_bitacora();
drop trigger if exists bitacora_ventas_u on ventas;
create trigger bitacora_ventas_u after update on ventas for each row execute function registrar_bitacora();
-- perfiles: cambios de rol o de estado
drop trigger if exists bitacora_profiles on profiles;
create trigger bitacora_profiles after update on profiles for each row
  when (old.rol is distinct from new.rol or old.activo is distinct from new.activo) execute function registrar_bitacora();

-- ============ 4. Capital: inversión, retiros y préstamos ============
create table if not exists capital_movs (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default ((now() at time zone 'America/El_Salvador')::date),
  tipo text not null check (tipo in ('inversion','retiro','prestamo','pago_prestamo')),
  tercero text,                      -- quién presta o a quién se le paga
  descripcion text,
  monto numeric(12,2) not null check (monto > 0),
  metodo text default 'Efectivo',
  creado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists capital_movs_fecha_idx on capital_movs (fecha desc);
alter table capital_movs enable row level security;
drop policy if exists admin_capital on capital_movs;
create policy admin_capital on capital_movs for all to authenticated using (es_admin()) with check (es_admin());
drop trigger if exists bitacora_capital_movs on capital_movs;
create trigger bitacora_capital_movs after insert or update or delete on capital_movs for each row execute function registrar_bitacora();
