-- Renombra la función para no chocar con regenerar_codigos_barras(p_longitud) que ya existía.
drop function if exists regenerar_codigos_barras();
create or replace function regenerar_codigos_barras_una_vez() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; v_new text; n_p int := 0; n_v int := 0; intentos int;
begin
  if not es_principal() then raise exception 'Solo el administrador principal'; end if;
  if exists (select 1 from marcas_unicas where clave = 'codigos_barras') then
    raise exception 'Los códigos de barras ya se regeneraron una vez';
  end if;
  create temp table _usados on commit drop as
    select codigo_barras as c from productos where codigo_barras is not null
    union select codigo_barras from producto_variantes where codigo_barras is not null
    union select codigo from productos;
  create unique index on _usados (c);

  for r in select id from productos order by created_at, id loop
    intentos := 0;
    loop
      v_new := (10000000 + floor(random() * 90000000))::bigint::text;
      exit when not exists (select 1 from _usados where c = v_new);
      intentos := intentos + 1;
      if intentos > 500 then raise exception 'No se pudo generar un código único'; end if;
    end loop;
    insert into _usados values (v_new);
    update productos set codigo_barras = v_new where id = r.id;
    n_p := n_p + 1;
  end loop;

  for r in select id from producto_variantes order by producto_id, orden, id loop
    intentos := 0;
    loop
      v_new := (10000000 + floor(random() * 90000000))::bigint::text;
      exit when not exists (select 1 from _usados where c = v_new);
      intentos := intentos + 1;
      if intentos > 500 then raise exception 'No se pudo generar un código único'; end if;
    end loop;
    insert into _usados values (v_new);
    update producto_variantes set codigo_barras = v_new where id = r.id;
    n_v := n_v + 1;
  end loop;

  insert into marcas_unicas (clave) values ('codigos_barras');
  return jsonb_build_object('productos', n_p, 'variantes', n_v);
end $$;
revoke all on function regenerar_codigos_barras_una_vez() from public;
grant execute on function regenerar_codigos_barras_una_vez() to authenticated;
