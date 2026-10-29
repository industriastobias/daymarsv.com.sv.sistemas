-- Borrar un conteo físico ya terminado o cancelado (no cambia el stock; los movimientos de stock se conservan)
create or replace function inventario_borrar(p_inv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede borrar conteos'; end if;
  if exists (select 1 from inventarios where id = p_inv and estado = 'abierto') then
    raise exception 'Un conteo abierto no se puede borrar: termínalo o cancélalo primero';
  end if;
  delete from inventarios where id = p_inv;
  if not found then raise exception 'No se encontró ese conteo'; end if;
end $$;
revoke execute on function inventario_borrar(uuid) from public, anon;
grant execute on function inventario_borrar(uuid) to authenticated;
