-- 083 · Se eliminan las reseñas de la tienda (tabla y funciones)
drop function if exists tienda_resena_enviar(text, integer, text);
drop function if exists tienda_resenas();
drop table if exists resenas_tienda;
