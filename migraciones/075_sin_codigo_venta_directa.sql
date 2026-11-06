-- 075 · Las ventas directas (tipo "inmediata", las del mostrador) no llevan número de pedido.
-- Solo lo reciben las que se atienden a distancia: contra entrega, entrega pendiente y cobro pendiente.
create or replace function _ventas_codigo_trg() returns trigger language plpgsql as $$
begin
  if coalesce(new.tipo,'inmediata') = 'inmediata' then new.codigo := null;
  elsif new.codigo is null or new.codigo = '' then new.codigo := _codigo_unico(); end if;
  return new;
end $$;
-- si una venta cambia de tipo (por ejemplo, se edita), el número aparece o se quita
create or replace function _ventas_codigo_upd() returns trigger language plpgsql as $$
begin
  if coalesce(new.tipo,'inmediata') = 'inmediata' then new.codigo := null;
  elsif new.codigo is null or new.codigo = '' then new.codigo := _codigo_unico(); end if;
  return new;
end $$;
drop trigger if exists ventas_codigo_upd on ventas;
create trigger ventas_codigo_upd before update of tipo on ventas for each row execute function _ventas_codigo_upd();

update ventas set codigo = null, seguimiento = null, seguimiento_en = null where coalesce(tipo,'inmediata') = 'inmediata' and (codigo is not null or seguimiento is not null);
update ventas set codigo = _codigo_unico() where coalesce(tipo,'inmediata') <> 'inmediata' and codigo is null;
