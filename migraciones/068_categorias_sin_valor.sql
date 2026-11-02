-- Categorías que no se suman al "Valor del inventario"
alter table config_negocio add column if not exists cats_sin_valor text[] not null default '{}';
