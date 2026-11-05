-- 069 · Borrar solo las filas de actividad que se marquen (solo el administrador principal)
create or replace function borrar_actividad_ids(p_tabla text, p_ids uuid[], p_confirmacion text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede borrar la actividad'; end if;
  if coalesce(p_confirmacion,'') <> 'BORRAR' then raise exception 'Falta la confirmación'; end if;
  if p_tabla not in ('bitacora','accesos') then raise exception 'Tabla no válida'; end if;
  if p_ids is null or array_length(p_ids,1) is null then raise exception 'No elegiste nada para borrar'; end if;
  if p_tabla = 'bitacora' then delete from bitacora where id = any(p_ids);
  else delete from accesos where id = any(p_ids); end if;
  get diagnostics n = row_count;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
  values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'actividad', 'eliminar',
          'Borró ' || n || case when p_tabla = 'bitacora' then ' cambios elegidos' else ' inicios de sesión elegidos' end);
  return n;
end $$;
revoke execute on function borrar_actividad_ids(text, uuid[], text) from public, anon;
grant execute on function borrar_actividad_ids(text, uuid[], text) to authenticated;
