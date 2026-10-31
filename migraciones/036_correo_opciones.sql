-- Opciones de correo: copia a la dueña, envío automático, aviso de anulación y correo genérico
alter table config_correo add column if not exists copia_a text;
alter table config_correo add column if not exists auto_envio boolean not null default true;

create or replace function guardar_opciones_correo(p_copia text, p_auto boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_principal() then raise exception 'Solo el administrador principal puede configurar el correo'; end if;
  insert into config_correo (id, copia_a, auto_envio) values (1, nullif(trim(p_copia),''), coalesce(p_auto,true))
  on conflict (id) do update set copia_a = nullif(trim(p_copia),''), auto_envio = coalesce(p_auto,true), updated_at = now();
end $$;

create or replace function config_correo_estado() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('listo', coalesce(c.api_key is not null and c.remitente is not null, false),
                            'remitente', c.remitente, 'copia', c.copia_a, 'auto', coalesce(c.auto_envio, true))
  from (select 1) x left join config_correo c on c.id = 1;
$$;

-- Envío interno (no se expone): soporta SMTP2GO (api-), Brevo (xkeysib-) y Resend
create or replace function _correo_enviar(p_para text, p_asunto text, p_html text, p_pdf_b64 text, p_nombre text, p_bcc text) returns bigint
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
  return req;
end $$;
revoke execute on function _correo_enviar(text,text,text,text,text,text) from public, anon, authenticated;

create or replace function enviar_factura_correo(p_factura uuid, p_para text, p_asunto text, p_html text, p_pdf_b64 text, p_nombre text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare req bigint; v_copia text;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Sin permiso'; end if;
  if p_para is null or p_para !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  select copia_a into v_copia from config_correo where id = 1;
  req := _correo_enviar(p_para, p_asunto, p_html, p_pdf_b64, p_nombre, v_copia);
  update facturas set cliente_correo = p_para, correo_enviado_en = now() where id = p_factura;
  return req;
end $$;

-- Correo simple (recordatorios de pago, cierre de caja). p_copia = true envía copia a la dueña.
create or replace function enviar_correo_simple(p_para text, p_asunto text, p_html text, p_copia boolean default false) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_copia text;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Sin permiso'; end if;
  if p_para is null or p_para !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  if p_copia then select copia_a into v_copia from config_correo where id = 1; end if;
  return _correo_enviar(p_para, p_asunto, p_html, null, null, v_copia);
end $$;

-- Aviso automático al cliente cuando se anula una factura que ya se le había enviado
create or replace function trg_aviso_factura_anulada() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare neg text; num text; h text;
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' and new.cliente_correo is not null and new.correo_enviado_en is not null then
    begin
      select coalesce(nombre, 'DAYMARSV') into neg from config_negocio where id = 1;
      num := 'F-' || lpad(new.numero::text, 6, '0');
      h := '<div style="background:#f5f1f2;padding:20px 8px;font-family:Arial,Helvetica,sans-serif;color:#222"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:24px"><h2 style="margin:0 0 10px;color:#6B2D3E">' || coalesce(neg,'DAYMARSV') || '</h2><p style="font-size:15px">Te informamos que la factura <b>' || num || '</b> fue <b>anulada</b> y ya no tiene validez.</p><p style="font-size:14px;color:#444">Si tienes dudas, responde a este correo o escríbenos por WhatsApp.</p></div></div>';
      perform _correo_enviar(new.cliente_correo, 'Factura ' || num || ' anulada – ' || coalesce(neg,'DAYMARSV'), h, null, null, null);
    exception when others then
      null; -- un fallo del correo nunca debe impedir anular la factura
    end;
  end if;
  return new;
end $$;
drop trigger if exists aviso_factura_anulada on facturas;
create trigger aviso_factura_anulada after update of estado on facturas for each row execute function trg_aviso_factura_anulada();

revoke execute on function guardar_opciones_correo(text,boolean), enviar_correo_simple(text,text,text,boolean) from public, anon;
grant execute on function guardar_opciones_correo(text,boolean), enviar_correo_simple(text,text,text,boolean), enviar_factura_correo(uuid,text,text,text,text,text), config_correo_estado() to authenticated;
