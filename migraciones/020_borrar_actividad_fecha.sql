-- 020 · Borrar actividad: opción de borrar solo lo anterior a una fecha (liberar espacio sin perder lo reciente)
drop function if exists borrar_actividad(boolean, boolean, text);
create or replace function borrar_actividad(p_cambios boolean, p_accesos boolean, p_confirmacion text, p_antes date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n1 int := 0; n2 int := 0; r jsonb := '{}'::jsonb; v_lim timestamptz;
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede borrar la actividad'; end if;
  if coalesce(p_confirmacion,'') <> 'BORRAR' then raise exception 'Falta la confirmación'; end if;
  if not (coalesce(p_cambios,false) or coalesce(p_accesos,false)) then raise exception 'No elegiste nada para borrar'; end if;
  v_lim := case when p_antes is null then null else (p_antes::timestamp at time zone 'America/El_Salvador') end;
  if p_cambios then delete from bitacora where v_lim is null or created_at < v_lim; get diagnostics n1 = row_count; r := r || jsonb_build_object('cambios', n1); end if;
  if p_accesos then delete from accesos where v_lim is null or created_at < v_lim; get diagnostics n2 = row_count; r := r || jsonb_build_object('accesos', n2); end if;
  insert into bitacora (usuario_id, usuario_nombre, tabla, accion, resumen)
  values (auth.uid(), (select nombre from profiles where id = auth.uid()), 'actividad', 'eliminar',
          'Borró la actividad' || case when p_antes is not null then ' anterior al ' || to_char(p_antes,'DD/MM/YYYY') else '' end
          || case when p_cambios then ' · ' || n1 || ' cambios' else '' end || case when p_accesos then ' · ' || n2 || ' inicios de sesión' else '' end);
  return r;
end $$;
revoke execute on function borrar_actividad(boolean, boolean, text, date) from public, anon;
grant execute on function borrar_actividad(boolean, boolean, text, date) to authenticated;
