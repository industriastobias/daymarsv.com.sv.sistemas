-- 019 · Solo el administrador principal puede borrar la actividad (cambios y/o inicios de sesión)
create or replace function borrar_actividad(p_cambios boolean, p_accesos boolean, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n1 int := 0; n2 int := 0; r jsonb := '{}'::jsonb;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede borrar la actividad'; end if;
  if coalesce(p_confirmacion,'') <> 'BORRAR' then raise exception 'Falta la confirmación'; end if;
  if not (coalesce(p_cambios,false) or coalesce(p_accesos,false)) then raise exception 'No elegiste nada para borrar'; end if;
  if p_cambios then delete from bitacora where true; get diagnostics n1 = row_count; r := r || jsonb_build_object('cambios', n1); end if;
  if p_accesos then delete from accesos where true; get diagnostics n2 = row_count; r := r || jsonb_build_object('accesos', n2); end if;
  -- queda constancia de quién borró y cuándo
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
  values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'actividad', 'eliminar',
          'Borró la actividad' || case when p_cambios then ' · ' || n1 || ' cambios' else '' end || case when p_accesos then ' · ' || n2 || ' inicios de sesión' else '' end);
  return r;
end $$;
revoke execute on function borrar_actividad(boolean, boolean, text) from public, anon;
grant execute on function borrar_actividad(boolean, boolean, text) to authenticated;
