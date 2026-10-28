-- 010 · Variantes (colores) por producto: un solo producto/foto con varios colores y stock por color
create table if not exists producto_variantes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  nombre text not null,
  codigo_barras text,
  stock integer not null default 0,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists producto_variantes_uk on producto_variantes (producto_id, lower(nombre));
create index if not exists producto_variantes_prod on producto_variantes (producto_id);
alter table producto_variantes enable row level security;
drop policy if exists ver_variantes on producto_variantes;
drop policy if exists admin_variantes on producto_variantes;
create policy ver_variantes on producto_variantes for select to authenticated using (es_usuario_activo());
create policy admin_variantes on producto_variantes for all to authenticated using (es_admin()) with check (es_admin());
grant select, insert, update, delete on producto_variantes to authenticated;

alter table venta_items add column if not exists variante_id uuid references producto_variantes(id) on delete set null;

-- Mueve el stock de un color (negativo = sale). Falla si no alcanza.
create or replace function _var_mover(p_var uuid, p_delta integer) returns void
language plpgsql security definer set search_path = public as $$
declare s integer; n text;
begin
  update producto_variantes set stock = stock + p_delta where id = p_var returning stock, nombre into s, n;
  if not found then return; end if;
  if s < 0 then raise exception 'Stock insuficiente del color %', n; end if;
end $$;
revoke execute on function _var_mover(uuid, integer) from public, anon, authenticated;

-- Ventas: descontar / ajustar el color
create or replace function trg_vi_variante() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.variante_id is not null then perform _var_mover(new.variante_id, -new.cantidad); end if;
  elsif new.variante_id is not null and new.cantidad <> old.cantidad then
    perform _var_mover(new.variante_id, old.cantidad - new.cantidad);
  end if;
  return null;
end $$;
drop trigger if exists vi_variante_ins on venta_items;
drop trigger if exists vi_variante_upd on venta_items;
create trigger vi_variante_ins after insert on venta_items for each row execute function trg_vi_variante();
create trigger vi_variante_upd after update of cantidad on venta_items for each row execute function trg_vi_variante();

-- Anular una venta: regresa el stock de cada color
create or replace function trg_venta_anulada_variante() returns trigger language plpgsql security definer set search_path = public as $$
declare it record;
begin
  if new.estado = 'anulada' and old.estado <> 'anulada' then
    for it in select variante_id, cantidad from venta_items where venta_id = new.id and variante_id is not null loop
      perform _var_mover(it.variante_id, it.cantidad);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists venta_anulada_variante on ventas;
create trigger venta_anulada_variante after update of estado on ventas for each row execute function trg_venta_anulada_variante();

-- Devoluciones: si regresa al stock, regresa al color
create or replace function trg_di_variante() returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.direccion = 'entra' and new.regresa_stock and new.venta_item_id is not null then
    select variante_id into v from venta_items where id = new.venta_item_id;
    if v is not null then perform _var_mover(v, new.cantidad); end if;
  end if;
  return null;
end $$;
drop trigger if exists di_variante on devolucion_items;
create trigger di_variante after insert on devolucion_items for each row execute function trg_di_variante();

-- Funciones actualizadas
create or replace function registrar_pedido(p_items jsonb, p_opts jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tipo text := coalesce(p_opts->>'tipo','inmediata');
  v_metodo text := coalesce(p_opts->>'metodo','Efectivo');
  v_envio numeric := coalesce(nullif(p_opts->>'envio','')::numeric,0);
  v_ctipo text := coalesce(p_opts->>'comision_tipo','percentage');
  v_cval numeric := coalesce(nullif(p_opts->>'comision_valor','')::numeric,0);
  v_quien text := coalesce(p_opts->>'quien_paga','client');
  v_seguro numeric := coalesce(nullif(p_opts->>'seguro','')::numeric,0);
  v_cliente text := nullif(trim(coalesce(p_opts->>'cliente','')),'');
  v_abono numeric := coalesce(nullif(p_opts->>'abonado','')::numeric,0);
  v_id uuid; it jsonb; pr record; q integer; v_precio numeric; v_base numeric;
  v_sub numeric := 0; v_cost numeric := 0; t record; v_pend boolean; v_var uuid; vr producto_variantes%rowtype; v_nom text; v_cb text;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  if v_tipo not in ('inmediata','cod','entrega_pendiente','cobro_pendiente') then raise exception 'Tipo de venta inválido'; end if;
  if v_metodo not in ('Efectivo','Transferencia') then raise exception 'Método de pago inválido'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  if v_envio < 0 or v_seguro < 0 or v_cval < 0 or v_abono < 0 then raise exception 'Los importes no pueden ser negativos'; end if;
  if v_ctipo not in ('percentage','fixed') then raise exception 'Tipo de comisión inválido'; end if;
  if v_ctipo = 'percentage' and v_cval > 100 then raise exception 'La comisión porcentual no puede superar el 100%%'; end if;
  if v_quien not in ('client','we') then raise exception 'Valor inválido'; end if;
  if v_tipo not in ('cod','entrega_pendiente') then v_envio := 0; v_cval := 0; end if;
  if v_tipo <> 'cod' then v_seguro := 0; v_quien := 'client'; end if;
  if v_tipo = 'entrega_pendiente' then v_ctipo := 'percentage'; end if;
  if v_tipo <> 'cobro_pendiente' then v_abono := 0; v_cliente := case when v_tipo='inmediata' then null else v_cliente end; end if;
  v_pend := v_tipo <> 'inmediata';

  insert into ventas (usuario_id, metodo_pago, tipo, estado, completada_en)
  values (auth.uid(), v_metodo, v_tipo, case when v_pend then 'pendiente' else 'completada' end,
          case when v_pend then null else now() end)
  returning id into v_id;

  for it in select value from jsonb_array_elements(p_items) loop
    q := (it->>'cantidad')::integer;
    if q is null or q <= 0 then raise exception 'Cantidad inválida'; end if;
    if coalesce((it->>'libre')::boolean,false) then
      v_precio := (it->>'precio')::numeric;
      if v_precio is null or v_precio <= 0 then raise exception 'El precio debe ser mayor a cero'; end if;
      if nullif(trim(coalesce(it->>'nombre','')),'') is null then raise exception 'El nombre del producto es obligatorio'; end if;
      insert into venta_items (venta_id, producto_id, cantidad, precio_unit, costo_unit, nombre, codigo, codigo_barras, categoria, descripcion, precio_original, es_libre)
      values (v_id, null, q, round(v_precio,2), 0, trim(it->>'nombre'), 'FAST_' || substr(gen_random_uuid()::text,1,8),
              nullif(trim(coalesce(it->>'codigo_barras','')),''), coalesce(nullif(trim(coalesce(it->>'categoria','')),''),'Venta rápida'),
              nullif(trim(coalesce(it->>'descripcion','')),''), round(v_precio,2), true);
      v_sub := v_sub + round(v_precio * q, 2);
    else
      select * into pr from productos where id = (it->>'producto_id')::uuid and activo for update;
      if not found then raise exception 'Producto no encontrado'; end if;
      if pr.stock < q then raise exception 'Stock insuficiente de %: quedan %', pr.nombre, pr.stock; end if;
      v_var := nullif(it->>'variante_id','')::uuid; vr := null; v_nom := pr.nombre; v_cb := pr.codigo_barras;
      if v_var is not null then
        select * into vr from producto_variantes where id = v_var and producto_id = pr.id for update;
        if not found then raise exception 'El color elegido ya no existe'; end if;
        if vr.stock < q then raise exception 'Stock insuficiente de % (%): quedan %', pr.nombre, vr.nombre, vr.stock; end if;
        v_nom := pr.nombre || ' – ' || vr.nombre; v_cb := coalesce(nullif(vr.codigo_barras,''), pr.codigo_barras);
      end if;
      v_base := round(pr.precio_venta * (1 - coalesce(pr.descuento_pct,0) / 100), 2);
      v_precio := v_base;
      if it ? 'precio' and es_admin() then
        v_precio := (it->>'precio')::numeric;
        if v_precio is null or v_precio < 0 then raise exception 'Precio inválido'; end if;
      end if;
      update productos set stock = stock - q where id = pr.id;
      insert into venta_items (venta_id, producto_id, variante_id, cantidad, precio_unit, costo_unit, nombre, codigo, codigo_barras, precio_original, descuento_pct)
      values (v_id, pr.id, v_var, q, round(v_precio,2), pr.precio_costo, v_nom, pr.codigo, v_cb, pr.precio_venta, coalesce(pr.descuento_pct,0));
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, venta_id, usuario_id)
      values (pr.id, 'venta', -q, pr.stock - q,
              case v_tipo when 'cod' then 'Pedido contra entrega' when 'entrega_pendiente' then 'Pedido pendiente de entrega'
                          when 'cobro_pendiente' then 'Pedido pendiente de cobro' else 'Venta' end, v_id, auth.uid());
      v_sub := v_sub + round(v_precio * q, 2);
      v_cost := v_cost + q * pr.precio_costo;
    end if;
  end loop;

  select * into t from pedido_totales(v_tipo, v_sub, v_envio, v_ctipo, v_cval, v_quien, v_seguro);
  if t.total < 0 then raise exception 'La comisión no puede producir un total negativo'; end if;
  if v_tipo = 'cobro_pendiente' then
    if v_cliente is null then raise exception 'Debes ingresar el nombre del cliente'; end if;
    if v_abono >= v_sub then raise exception 'El abono debe ser menor que el total'; end if;
  end if;

  update ventas set subtotal = v_sub, costo_total = v_cost, total = t.total,
         envio = v_envio, comision_tipo = v_ctipo, comision_valor = v_cval, comision_monto = t.comision,
         quien_paga = v_quien, seguro = v_seguro, cliente_nombre = v_cliente,
         abonado = v_abono, pendiente_monto = case when v_tipo='cobro_pendiente' then v_sub - v_abono else 0 end,
         ganancia_neta = t.neta
   where id = v_id;
  return v_id;
end $$;

create or replace function eliminar_venta(p_venta uuid, p_devolver boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; it record;
begin
  if not es_admin() then raise exception 'Solo un administrador puede eliminar ventas'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if p_devolver and v.estado <> 'anulada' then
    -- solo regresa lo que todavía no había vuelto por una devolución
    for it in select vi.producto_id, vi.cantidad - coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = vi.id and di.direccion = 'entra' and di.regresa_stock), 0) as falta
                from venta_items vi where vi.venta_id = p_venta and vi.producto_id is not null loop
      if it.falta > 0 then update productos set stock = stock + it.falta where id = it.producto_id; end if;
    end loop;
  end if;
  if p_devolver and v.estado <> 'anulada' then
    for it in select vi.variante_id, vi.cantidad - coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = vi.id and di.direccion = 'entra' and di.regresa_stock), 0) as falta
                from venta_items vi where vi.venta_id = p_venta and vi.variante_id is not null loop
      if it.falta > 0 then perform _var_mover(it.variante_id, it.falta::integer); end if;
    end loop;
  end if;
  delete from movimientos_stock where venta_id = p_venta;
  delete from devoluciones where venta_id = p_venta;
  update facturas set venta_ids = array_remove(venta_ids, p_venta) where p_venta = any(venta_ids);
  delete from ventas where id = p_venta;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
    values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'ventas', 'eliminar_venta',
            case when p_devolver then 'Eliminó una venta y devolvió los productos al stock' else 'Eliminó una venta sin devolver al stock' end);
end $$;

-- ============ 4. Las devoluciones cuentan en finanzas y en el cierre de caja ============

create or replace function registrar_compra(p_items jsonb, p_pago jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; v_cat uuid; v_nom text; v_id uuid; v_stock integer; v_q integer;
  v_ex productos%rowtype; v_out jsonb := '[]'::jsonb; v_existia boolean; v_lote boolean; v_total numeric := 0; v_n int := 0; v_nom1 text; v_prov uuid; v_vars jsonb; vv jsonb; v_o int;
begin
  if not es_admin() then raise exception 'Solo un administrador puede registrar compras'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'No hay productos para guardar'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_q := coalesce((it->>'cantidad')::integer, 0);
    v_vars := case when jsonb_typeof(it->'variantes') = 'array' and jsonb_array_length(it->'variantes') > 0 then it->'variantes' else null end;
    if v_vars is not null then
      select coalesce(sum(greatest(coalesce((x->>'cantidad')::integer,0),0)),0) into v_q from jsonb_array_elements(v_vars) x;
    end if;
    if v_q < 0 then raise exception 'La cantidad no puede ser negativa (%)', it->>'codigo'; end if;
    if coalesce(trim(it->>'codigo'), '') = '' or coalesce(trim(it->>'nombre'), '') = '' then
      raise exception 'Falta el nombre o el código de un producto'; end if;
    v_lote := coalesce(it->>'tipo_compra', 'normal') = 'lote';

    v_nom := nullif(trim(it->>'categoria'), '');
    v_cat := null;
    if v_nom is not null then
      select id into v_cat from categorias where lower(nombre) = lower(v_nom);
      if v_cat is null then insert into categorias (nombre) values (v_nom) returning id into v_cat; end if;
    end if;

    select * into v_ex from productos where codigo = it->>'codigo' for update;
    v_existia := found;
    if v_existia then
      if not coalesce((it->>'sumar')::boolean, false) then raise exception 'El código % ya existe', it->>'codigo'; end if;
      if not v_ex.activo then raise exception 'El código % está en la papelera. Restáuralo primero.', it->>'codigo'; end if;
      update productos set
        stock = stock + v_q,
        tipo_compra = case when v_lote then 'lote' else tipo_compra end,
        lotes = case when v_lote then lotes + coalesce((it->>'lotes')::integer, 0) else lotes end,
        unidades_por_lote = case when v_lote and unidades_por_lote = 0 then coalesce((it->>'unidades_por_lote')::integer, 0) else unidades_por_lote end
      where id = v_ex.id returning id, stock into v_id, v_stock;
    else
      insert into productos (codigo, nombre, codigo_barras, categoria_id, precio_venta, precio_costo, stock,
                             descripcion, descuento_pct, fecha_compra, tipo_compra, lotes, unidades_por_lote)
      values (trim(it->>'codigo'), trim(it->>'nombre'), nullif(trim(it->>'codigo_barras'), ''), v_cat,
              coalesce((it->>'precio_venta')::numeric, 0), coalesce((it->>'precio_costo')::numeric, 0), v_q,
              nullif(trim(it->>'descripcion'), ''), coalesce((it->>'descuento_pct')::numeric, 0),
              nullif(it->>'fecha_compra', '')::date, case when v_lote then 'lote' else 'normal' end,
              case when v_lote then coalesce((it->>'lotes')::integer, 0) else 0 end,
              case when v_lote then coalesce((it->>'unidades_por_lote')::integer, 0) else 0 end)
      returning id, stock into v_id, v_stock;
    end if;

    if v_vars is not null then
      v_o := 0;
      for vv in select value from jsonb_array_elements(v_vars) loop
        if nullif(trim(coalesce(vv->>'nombre','')),'') is null then raise exception 'Falta el nombre de un color'; end if;
        insert into producto_variantes (producto_id, nombre, stock, codigo_barras, orden)
        values (v_id, trim(vv->>'nombre'), greatest(coalesce((vv->>'cantidad')::integer,0),0), nullif(trim(coalesce(vv->>'codigo_barras','')),''), v_o)
        on conflict (producto_id, lower(nombre)) do update
          set stock = producto_variantes.stock + excluded.stock,
              codigo_barras = coalesce(excluded.codigo_barras, producto_variantes.codigo_barras);
        v_o := v_o + 1;
      end loop;
    end if;

    if v_q > 0 then
      insert into movimientos_stock (producto_id, tipo, cantidad, stock_resultante, nota, usuario_id)
      values (v_id, 'entrada', v_q, v_stock, case when v_existia then 'Compra (suma de stock)' else 'Compra inicial' end, auth.uid());
    end if;

    v_out := v_out || jsonb_build_object('id', v_id, 'codigo', it->>'codigo', 'existia', v_existia);
    v_total := v_total + round(coalesce((it->>'precio_costo')::numeric, 0) * v_q, 2);
    v_n := v_n + 1; if v_n = 1 then v_nom1 := trim(it->>'nombre'); end if;
  end loop;
  -- Si se pidió, la compra queda registrada en Finanzas (tipo 'compra', no afecta la utilidad: es inventario)
  if p_pago is not null and coalesce((p_pago->>'registrar')::boolean, false) and v_total > 0 then
    v_prov := nullif(p_pago->>'proveedor_id', '')::uuid;
    insert into fin_movimientos (fecha, tipo, categoria, descripcion, monto, metodo, proveedor_id, referencia, creado_por)
    values (coalesce(nullif(p_pago->>'fecha','')::date, (now() at time zone 'America/El_Salvador')::date), 'compra', 'Mercadería',
            case when v_n = 1 then 'Compra: ' || v_nom1 else 'Compra de ' || v_n || ' productos' end,
            v_total, coalesce(nullif(p_pago->>'metodo',''), 'Efectivo'), v_prov, nullif(trim(p_pago->>'referencia'), ''), auth.uid());
  end if;
  return v_out;
end $$;

revoke execute on function registrar_compra(jsonb, jsonb) from public, anon;
grant execute on function registrar_compra(jsonb, jsonb) to authenticated;
