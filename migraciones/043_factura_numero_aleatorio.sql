-- Número de factura aleatorio (6 cifras), nunca repetido. Las facturas existentes conservan su número.
create or replace function _factura_numero_aleatorio() returns trigger
language plpgsql security definer set search_path = public as $$
declare n bigint; i integer := 0;
begin
  loop
    n := 100000 + floor(random() * 900000)::bigint;
    exit when not exists (select 1 from facturas where numero = n);
    i := i + 1;
    if i > 50 then n := 1000000 + floor(random() * 9000000)::bigint; exit when not exists (select 1 from facturas where numero = n); end if;
    if i > 200 then raise exception 'No se pudo generar un número de factura'; end if;
  end loop;
  new.numero := n;
  return new;
end $$;
drop trigger if exists facturas_numero_aleatorio on facturas;
create trigger facturas_numero_aleatorio before insert on facturas
  for each row execute function _factura_numero_aleatorio();
