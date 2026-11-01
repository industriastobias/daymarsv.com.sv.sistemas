-- Editar datos de un pedido en línea (mientras está nuevo) y borrar el historial
create or replace function editar_pedido_linea(p_id uuid, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_met text;
begin
  if not es_admin() then raise exception 'Solo un administrador puede editar pedidos'; end if;
  v_met := case when p_datos->>'metodo' = 'Transferencia' then 'Transferencia' else 'Efectivo' end;
  update pedidos_linea set
    cliente_nombre = left(nullif(trim(coalesce(p_datos->>'nombre','')),''),120),
    cliente_telefono = left(nullif(trim(coalesce(p_datos->>'telefono','')),''),20),
    cliente_correo = left(nullif(trim(coalesce(p_datos->>'correo','')),''),120),
    cliente_direccion = left(nullif(trim(coalesce(p_datos->>'direccion','')),''),300),
    nota = left(nullif(trim(coalesce(p_datos->>'nota','')),''),300),
    metodo = v_met,
    envio = least(greatest(coalesce(nullif(p_datos->>'envio','')::numeric, envio),0),50),
    total = total - envio + least(greatest(coalesce(nullif(p_datos->>'envio','')::numeric, envio),0),50)
  where id = p_id and estado = 'nuevo';
  if not found then raise exception 'El pedido no existe o ya fue atendido'; end if;
end $$;
revoke execute on function editar_pedido_linea(uuid, jsonb) from public, anon;
grant execute on function editar_pedido_linea(uuid, jsonb) to authenticated;

-- Borra pedidos ya atendidos (aceptados o rechazados). p_dias null = todos los atendidos. Los nuevos no se tocan,
-- salvo que se pase p_ids con ids concretos.
create or replace function borrar_pedidos_linea(p_dias integer default null, p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not es_admin() then raise exception 'Solo un administrador puede borrar pedidos'; end if;
  if p_ids is not null then
    delete from pedidos_linea where id = any(p_ids) and estado <> 'nuevo';
  else
    delete from pedidos_linea where estado <> 'nuevo' and (p_dias is null or created_at < now() - make_interval(days => p_dias));
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function borrar_pedidos_linea(integer, uuid[]) from public, anon;
grant execute on function borrar_pedidos_linea(integer, uuid[]) to authenticated;
