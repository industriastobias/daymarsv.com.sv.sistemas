-- 102 · Los vendedores deben abrir la caja para poder vender (pedido del dueño).
-- Los administradores solo ven el aviso y pueden vender sin abrirla.
-- Se revisa al crear una venta. No afecta pedidos de la tienda en línea (no hay usuario del sistema)
-- ni procesos automáticos.
create or replace function ventas_exigir_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and not es_admin()
     and exists (select 1 from profiles where id = auth.uid() and activo)
     and not exists (select 1 from caja_aperturas where cerrada_en is null) then
    raise exception 'Primero abre la caja para poder vender (Punto de venta → Hoy → Abrir caja)';
  end if;
  return new;
end $$;
revoke all on function ventas_exigir_caja() from public, anon;

drop trigger if exists ventas_exigir_caja on ventas;
create trigger ventas_exigir_caja before insert on ventas for each row execute function ventas_exigir_caja();
