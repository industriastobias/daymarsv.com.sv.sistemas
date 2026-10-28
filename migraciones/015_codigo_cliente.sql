-- 015 · Código exclusivo para cada cliente (CL-0001, CL-0002…), automático al crearlo
create sequence if not exists cliente_seq;
alter table clientes add column if not exists codigo text;

-- Los clientes que ya existen reciben su código en orden de creación
do $$
declare r record;
begin
  for r in select id from clientes where codigo is null order by created_at, id loop
    update clientes set codigo = 'CL-' || lpad(nextval('cliente_seq')::text, 4, '0') where id = r.id;
  end loop;
end $$;

create unique index if not exists clientes_codigo_uq on clientes (codigo);

create or replace function trg_cliente_codigo() returns trigger language plpgsql as $$
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    new.codigo := 'CL-' || lpad(nextval('cliente_seq')::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists cliente_codigo on clientes;
create trigger cliente_codigo before insert on clientes for each row execute function trg_cliente_codigo();

-- El código no se puede cambiar después
create or replace function trg_cliente_codigo_fijo() returns trigger language plpgsql as $$
begin
  if old.codigo is not null and new.codigo is distinct from old.codigo then new.codigo := old.codigo; end if;
  return new;
end $$;
drop trigger if exists cliente_codigo_fijo on clientes;
create trigger cliente_codigo_fijo before update on clientes for each row execute function trg_cliente_codigo_fijo();
