-- Envío de facturas por correo: Brevo (clave que empieza con xkeysib-) o Resend (clave re_...)
create or replace function enviar_factura_correo(p_factura uuid, p_para text, p_asunto text, p_html text, p_pdf_b64 text, p_nombre text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare c config_correo%rowtype; req bigint; body jsonb; hdr jsonb; url text; v_nom text; v_mail text; m text[];
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Sin permiso'; end if;
  if p_para is null or p_para !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  select * into c from config_correo where id = 1;
  if c.api_key is null or c.remitente is null then raise exception 'El correo automático aún no está configurado (Datos del negocio)'; end if;
  m := regexp_match(c.remitente, '^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$');
  if m is not null then v_nom := nullif(m[1], ''); v_mail := m[2]; else v_nom := null; v_mail := trim(c.remitente); end if;
  if c.api_key like 'xkeysib-%' or c.api_key like 'xsmtpsib-%' then
    url := 'https://api.brevo.com/v3/smtp/email';
    hdr := jsonb_build_object('api-key', c.api_key, 'Content-Type', 'application/json', 'accept', 'application/json');
    body := jsonb_build_object('sender', jsonb_build_object('name', coalesce(v_nom, 'DAYMARSV'), 'email', v_mail),
                               'to', jsonb_build_array(jsonb_build_object('email', p_para)),
                               'subject', p_asunto, 'htmlContent', p_html);
    if p_pdf_b64 is not null and p_pdf_b64 <> '' then
      body := body || jsonb_build_object('attachment', jsonb_build_array(jsonb_build_object('name', p_nombre, 'content', p_pdf_b64)));
    end if;
  else
    url := 'https://api.resend.com/emails';
    hdr := jsonb_build_object('Authorization', 'Bearer ' || c.api_key, 'Content-Type', 'application/json');
    body := jsonb_build_object('from', c.remitente, 'to', jsonb_build_array(p_para), 'subject', p_asunto, 'html', p_html);
    if p_pdf_b64 is not null and p_pdf_b64 <> '' then
      body := body || jsonb_build_object('attachments', jsonb_build_array(jsonb_build_object('filename', p_nombre, 'content', p_pdf_b64)));
    end if;
  end if;
  select net.http_post(url := url, body := body, headers := hdr, timeout_milliseconds := 20000) into req;
  update facturas set cliente_correo = p_para, correo_enviado_en = now() where id = p_factura;
  return req;
end $$;
