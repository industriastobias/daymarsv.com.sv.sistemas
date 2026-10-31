-- Envío de facturas por correo (Resend) desde la base de datos con pg_net
create extension if not exists pg_net with schema extensions;

alter table facturas add column if not exists cliente_correo text;
alter table facturas add column if not exists correo_enviado_en timestamptz;

create table if not exists config_correo (
  id int primary key default 1 check (id = 1),
  api_key text,
  remitente text,
  updated_at timestamptz default now()
);
alter table config_correo enable row level security;
revoke all on config_correo from anon, authenticated;

create or replace function guardar_config_correo(p_key text, p_remitente text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede configurar el correo'; end if;
  insert into config_correo (id, api_key, remitente) values (1, nullif(p_key,''), nullif(p_remitente,''))
  on conflict (id) do update set
    api_key = coalesce(nullif(p_key,''), config_correo.api_key),
    remitente = coalesce(nullif(p_remitente,''), config_correo.remitente),
    updated_at = now();
end $$;

create or replace function config_correo_estado() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('listo', coalesce(api_key is not null and remitente is not null, false), 'remitente', remitente)
  from (select 1) x left join config_correo c on c.id = 1;
$$;

create or replace function enviar_factura_correo(p_factura uuid, p_para text, p_asunto text, p_html text, p_pdf_b64 text, p_nombre text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare c config_correo%rowtype; req bigint; body jsonb;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Sin permiso'; end if;
  if p_para is null or p_para !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  select * into c from config_correo where id = 1;
  if c.api_key is null or c.remitente is null then raise exception 'El correo automático aún no está configurado (Datos del negocio)'; end if;
  body := jsonb_build_object('from', c.remitente, 'to', jsonb_build_array(p_para), 'subject', p_asunto, 'html', p_html);
  if p_pdf_b64 is not null and p_pdf_b64 <> '' then
    body := body || jsonb_build_object('attachments', jsonb_build_array(jsonb_build_object('filename', p_nombre, 'content', p_pdf_b64)));
  end if;
  select net.http_post(url := 'https://api.resend.com/emails', body := body,
    headers := jsonb_build_object('Authorization', 'Bearer ' || c.api_key, 'Content-Type', 'application/json'),
    timeout_milliseconds := 20000) into req;
  update facturas set cliente_correo = p_para, correo_enviado_en = now() where id = p_factura;
  return req;
end $$;

create or replace function estado_envio_correo(p_req bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'Sin permiso'; end if;
  select status_code, content into r from net._http_response where id = p_req;
  if not found then return jsonb_build_object('estado', 'pendiente'); end if;
  return jsonb_build_object('estado', case when r.status_code between 200 and 299 then 'ok' else 'error' end, 'codigo', r.status_code, 'detalle', left(r.content, 300));
end $$;

revoke execute on function guardar_config_correo(text,text), config_correo_estado(), enviar_factura_correo(uuid,text,text,text,text,text), estado_envio_correo(bigint) from public, anon;
grant execute on function guardar_config_correo(text,text), config_correo_estado(), enviar_factura_correo(uuid,text,text,text,text,text), estado_envio_correo(bigint) to authenticated;
