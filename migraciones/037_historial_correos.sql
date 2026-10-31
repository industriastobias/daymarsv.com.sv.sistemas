-- Historial de correos enviados (lo que sale por correo desde el sistema)
create table if not exists correos_enviados (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  tipo text not null default 'otro',   -- factura | recordatorio | cierre | anulacion | otro
  para text not null,
  copia text,
  asunto text,
  ref text,
  con_pdf boolean default false,
  req_id bigint,
  estado text not null default 'pendiente', -- pendiente | enviado | error
  detalle text
);
create index if not exists correos_enviados_fecha on correos_enviados (created_at desc);
alter table correos_enviados enable row level security;
revoke all on correos_enviados from anon, authenticated;

drop function if exists _correo_enviar(text,text,text,text,text,text);
create or replace function _correo_enviar(p_para text, p_asunto text, p_html text, p_pdf_b64 text, p_nombre text, p_bcc text, p_tipo text default 'otro', p_ref text default null) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare c config_correo%rowtype; req bigint; body jsonb; hdr jsonb; url text; v_nom text; v_mail text; m text[]; bcc text;
begin
  select * into c from config_correo where id = 1;
  if c.api_key is null or c.remitente is null then raise exception 'El correo automático aún no está configurado (Datos del negocio)'; end if;
  bcc := nullif(trim(coalesce(p_bcc, '')), '');
  if bcc is not null and lower(bcc) = lower(p_para) then bcc := null; end if;
  m := regexp_match(c.remitente, '^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$');
  if m is not null then v_nom := nullif(m[1], ''); v_mail := m[2]; else v_nom := null; v_mail := trim(c.remitente); end if;
  if c.api_key like 'api-%' then
    url := 'https://api.smtp2go.com/v3/email/send';
    hdr := jsonb_build_object('Content-Type', 'application/json', 'X-Smtp2go-Api-Key', c.api_key, 'accept', 'application/json');
    body := jsonb_build_object('sender', c.remitente, 'to', jsonb_build_array(p_para), 'subject', p_asunto, 'html_body', p_html);
    if bcc is not null then body := body || jsonb_build_object('bcc', jsonb_build_array(bcc)); end if;
    if p_pdf_b64 is not null and p_pdf_b64 <> '' then
      body := body || jsonb_build_object('attachments', jsonb_build_array(jsonb_build_object('filename', p_nombre, 'fileblob', p_pdf_b64, 'mimetype', 'application/pdf')));
    end if;
  elsif c.api_key like 'xkeysib-%' or c.api_key like 'xsmtpsib-%' then
    url := 'https://api.brevo.com/v3/smtp/email';
    hdr := jsonb_build_object('api-key', c.api_key, 'Content-Type', 'application/json', 'accept', 'application/json');
    body := jsonb_build_object('sender', jsonb_build_object('name', coalesce(v_nom, 'DAYMARSV'), 'email', v_mail),
                               'to', jsonb_build_array(jsonb_build_object('email', p_para)), 'subject', p_asunto, 'htmlContent', p_html);
    if bcc is not null then body := body || jsonb_build_object('bcc', jsonb_build_array(jsonb_build_object('email', bcc))); end if;
    if p_pdf_b64 is not null and p_pdf_b64 <> '' then
      body := body || jsonb_build_object('attachment', jsonb_build_array(jsonb_build_object('name', p_nombre, 'content', p_pdf_b64)));
    end if;
  else
    url := 'https://api.resend.com/emails';
    hdr := jsonb_build_object('Authorization', 'Bearer ' || c.api_key, 'Content-Type', 'application/json');
    body := jsonb_build_object('from', c.remitente, 'to', jsonb_build_array(p_para), 'subject', p_asunto, 'html', p_html);
    if bcc is not null then body := body || jsonb_build_object('bcc', jsonb_build_array(bcc)); end if;
    if p_pdf_b64 is not null and p_pdf_b64 <> '' then
      body := body || jsonb_build_object('attachments', jsonb_build_array(jsonb_build_object('filename', p_nombre, 'content', p_pdf_b64)));
    end if;
  end if;
  select net.http_post(url := url, body := body, headers := hdr, timeout_milliseconds := 20000) into req;
  insert into correos_enviados (usuario_id, usuario_nombre, tipo, para, copia, asunto, ref, req_id, con_pdf)
    values (auth.uid(), (select nombre from profiles where id = auth.uid()), coalesce(p_tipo,'otro'), p_para, bcc, p_asunto, p_ref, req, coalesce(p_pdf_b64,'') <> '');
  return req;
end $$;
revoke execute on function _correo_enviar(text,text,text,text,text,text,text,text) from public, anon, authenticated;

create or replace function enviar_factura_correo(p_factura uuid, p_para text, p_asunto text, p_html text, p_pdf_b64 text, p_nombre text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare req bigint; v_copia text; v_num text;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Sin permiso'; end if;
  if p_para is null or p_para !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  select copia_a into v_copia from config_correo where id = 1;
  select 'F-' || lpad(numero::text, 6, '0') into v_num from facturas where id = p_factura;
  req := _correo_enviar(p_para, p_asunto, p_html, p_pdf_b64, p_nombre, v_copia, 'factura', v_num);
  update facturas set cliente_correo = p_para, correo_enviado_en = now() where id = p_factura;
  return req;
end $$;

drop function if exists enviar_correo_simple(text,text,text,boolean);
create or replace function enviar_correo_simple(p_para text, p_asunto text, p_html text, p_copia boolean default false, p_tipo text default 'otro', p_ref text default null) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_copia text;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Sin permiso'; end if;
  if p_para is null or p_para !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  if p_copia then select copia_a into v_copia from config_correo where id = 1; end if;
  return _correo_enviar(p_para, p_asunto, p_html, null, null, v_copia, p_tipo, p_ref);
end $$;

-- el aviso de anulación ahora queda en el historial
create or replace function trg_aviso_factura_anulada() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare neg text; num text; h text;
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' and new.cliente_correo is not null and new.correo_enviado_en is not null then
    begin
      select coalesce(nombre, 'DAYMARSV') into neg from config_negocio where id = 1;
      num := 'F-' || lpad(new.numero::text, 6, '0');
      h := '<div style="background:#f5f1f2;padding:20px 8px;font-family:Arial,Helvetica,sans-serif;color:#222"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:24px"><h2 style="margin:0 0 10px;color:#6B2D3E">' || coalesce(neg,'DAYMARSV') || '</h2><p style="font-size:15px">Te informamos que la factura <b>' || num || '</b> fue <b>anulada</b> y ya no tiene validez.</p><p style="font-size:14px;color:#444">Si tienes dudas, responde a este correo o escríbenos por WhatsApp.</p></div></div>';
      perform _correo_enviar(new.cliente_correo, 'Factura ' || num || ' anulada – ' || coalesce(neg,'DAYMARSV'), h, null, null, null, 'anulacion', num);
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;

-- Lista el historial y actualiza el estado de los envíos recientes (pg_net guarda la respuesta unas horas)
create or replace function historial_correos(p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if not es_admin() then raise exception 'Solo un administrador puede ver el historial de correos'; end if;
  for r in select c.id, h.status_code, h.content from correos_enviados c join net._http_response h on h.id = c.req_id where c.estado = 'pendiente' loop
    update correos_enviados set estado = case when r.status_code between 200 and 299 then 'enviado' else 'error' end,
           detalle = case when r.status_code between 200 and 299 then null else left(coalesce(r.content,''), 300) end where id = r.id;
  end loop;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id, created_at, usuario_nombre, tipo, para, copia, asunto, ref, con_pdf, estado, detalle from correos_enviados order by created_at desc limit greatest(1, least(p_limit, 500))) x), '[]'::jsonb);
end $$;

revoke execute on function historial_correos(int), enviar_correo_simple(text,text,text,boolean,text,text) from public, anon;
grant execute on function historial_correos(int), enviar_correo_simple(text,text,text,boolean,text,text), enviar_factura_correo(uuid,text,text,text,text,text) to authenticated;
