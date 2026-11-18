-- 087 · Tareas del equipo: el administrador asigna tareas; cada persona ve y avanza las suyas
create table if not exists tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) between 1 and 120),
  detalle text check (detalle is null or length(detalle) <= 600),
  asignado_a uuid references profiles(id) on delete set null,
  creado_por uuid references profiles(id) on delete set null default auth.uid(),
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','hecha')),
  prioridad text not null default 'media' check (prioridad in ('baja','media','alta')),
  vence date,
  created_at timestamptz not null default now(),
  hecha_en timestamptz
);
create index if not exists tareas_asignado_idx on tareas (asignado_a, estado);
alter table tareas enable row level security;
drop policy if exists tareas_ver on tareas;
create policy tareas_ver on tareas for select to authenticated using (es_admin() or asignado_a = auth.uid());

create or replace function crear_tarea(p_titulo text, p_detalle text, p_asignado uuid, p_prioridad text default 'media', p_vence date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not es_admin() then raise exception 'Solo un administrador puede crear tareas'; end if;
  if coalesce(trim(p_titulo), '') = '' then raise exception 'Escribe un título'; end if;
  insert into tareas (titulo, detalle, asignado_a, creado_por, prioridad, vence)
  values (trim(p_titulo), nullif(trim(coalesce(p_detalle, '')), ''), p_asignado, auth.uid(), coalesce(p_prioridad, 'media'), p_vence) returning id into v;
  return v;
end $$;

create or replace function editar_tarea(p_id uuid, p_titulo text, p_detalle text, p_asignado uuid, p_prioridad text, p_vence date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede editar tareas'; end if;
  if coalesce(trim(p_titulo), '') = '' then raise exception 'Escribe un título'; end if;
  update tareas set titulo = trim(p_titulo), detalle = nullif(trim(coalesce(p_detalle, '')), ''), asignado_a = p_asignado, prioridad = coalesce(p_prioridad, 'media'), vence = p_vence where id = p_id;
end $$;

create or replace function estado_tarea(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_estado not in ('pendiente','en_curso','hecha') then raise exception 'Estado inválido'; end if;
  if not (es_admin() or exists (select 1 from tareas where id = p_id and asignado_a = auth.uid())) then raise exception 'Esa tarea no es tuya'; end if;
  update tareas set estado = p_estado, hecha_en = case when p_estado = 'hecha' then now() else null end where id = p_id;
end $$;

create or replace function eliminar_tarea(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede eliminar tareas'; end if;
  delete from tareas where id = p_id;
end $$;

revoke execute on function crear_tarea(text,text,uuid,text,date), editar_tarea(uuid,text,text,uuid,text,date), estado_tarea(uuid,text), eliminar_tarea(uuid) from public, anon;
grant execute on function crear_tarea(text,text,uuid,text,date), editar_tarea(uuid,text,text,uuid,text,date), estado_tarea(uuid,text), eliminar_tarea(uuid) to authenticated;
