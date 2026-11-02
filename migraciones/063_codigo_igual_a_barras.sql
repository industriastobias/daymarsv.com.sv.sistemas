-- Una sola vez: el código interno de cada producto pasa a ser igual a su código de barras (ya regenerado),
-- para que ya no se vean los códigos viejos de la tienda. Solo si los códigos de barras ya se regeneraron.
do $$
begin
  if exists (select 1 from marcas_unicas where clave = 'codigos_barras')
     and not exists (select 1 from marcas_unicas where clave = 'codigos_internos') then
    -- los emparejamientos de pedidos viejos apuntan al código nuevo
    update tienda_equivalencias e set codigo_sistema = p.codigo_barras
      from productos p
     where p.codigo = e.codigo_sistema and coalesce(p.codigo_barras,'') <> '' and p.codigo <> p.codigo_barras;
    update productos set codigo = codigo_barras
     where coalesce(codigo_barras,'') <> '' and codigo <> codigo_barras and activo;
    insert into marcas_unicas (clave) values ('codigos_internos');
  end if;
end $$;
