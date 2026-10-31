alter table config_negocio add column if not exists instagram text;
update config_negocio set nombre = 'DAYMARSV' where id = 1 and nombre = 'DAYMAR-SHOP';
