alter table config_negocio add column if not exists condiciones text;
update config_negocio set
  eslogan = case when eslogan is null or eslogan = 'A Family Company' then 'TIENDA ONLINE' else eslogan end,
  instagram = coalesce(instagram, '@DAYMARSV'),
  condiciones = coalesce(condiciones, 'NO SE ACEPTAN CAMBIOS NI DEVOLUCIONES, A MENOS QUE EL PRODUCTO ESTÉ DAÑADO. PLAZO: 5 DÍAS POSTERIORES A LA COMPRA.'),
  pie = case when pie is null or pie = '¡Gracias por su compra!' then '¡GRACIAS POR SU COMPRA!' else pie end
where id = 1;
