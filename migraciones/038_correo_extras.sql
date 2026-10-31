-- Extras opcionales del correo de factura
alter table config_negocio add column if not exists codigo_correo text;
alter table config_negocio add column if not exists url_tienda text;
alter table config_negocio add column if not exists url_resena text;
alter table config_negocio add column if not exists correo_novedades boolean not null default true;
