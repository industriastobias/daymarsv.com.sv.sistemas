-- Clientes: más datos y quién los creó. Se puede correr más de una vez.
alter table clientes
  add column if not exists documento text,
  add column if not exists direccion text,
  add column if not exists creado_por uuid default auth.uid();
create index if not exists clientes_nombre_idx on clientes (lower(nombre));
