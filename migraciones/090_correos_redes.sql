-- 090 · Todos los correos llevan al final botones de Instagram, TikTok y WhatsApp
create or replace function _correo_enviar(p_para text, p_asunto text, p_html text, p_pdf_b64 text, p_nombre text, p_bcc text, p_tipo text default 'otro', p_ref text default null) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_html text; v_redes text; c config_correo%rowtype; req bigint; body jsonb; hdr jsonb; url text; v_nom text; v_mail text; m text[]; bcc text;
begin
  -- Todos los correos terminan con los botones de redes sociales (Instagram, TikTok y WhatsApp)
  v_redes := '<!--redes--><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto 8px;border-collapse:collapse"><tr><td colspan="3" style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7b6a70;padding-bottom:8px">Síguenos y escríbenos</td></tr><tr><td style="padding:4px"><a href="https://instagram.com/daymarsv" target="_blank" style="display:inline-block;background:#6B2D3E;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:18px;padding:9px 14px;border-radius:999px;white-space:nowrap"><img src="https://industriastobias.github.io/daymarsv.com.sv.sistemas/img/redes/instagram.png" width="16" height="16" alt="" style="vertical-align:middle;border:0;margin:0 6px 2px 0">Instagram</a></td><td style="padding:4px"><a href="https://www.tiktok.com/@daymarsv" target="_blank" style="display:inline-block;background:#6B2D3E;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:18px;padding:9px 14px;border-radius:999px;white-space:nowrap"><img src="https://industriastobias.github.io/daymarsv.com.sv.sistemas/img/redes/tiktok.png" width="16" height="16" alt="" style="vertical-align:middle;border:0;margin:0 6px 2px 0">TikTok</a></td><td style="padding:4px"><a href="https://wa.me/50366711569" target="_blank" style="display:inline-block;background:#6B2D3E;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:18px;padding:9px 14px;border-radius:999px;white-space:nowrap"><img src="https://industriastobias.github.io/daymarsv.com.sv.sistemas/img/redes/whatsapp.png" width="16" height="16" alt="" style="vertical-align:middle;border:0;margin:0 6px 2px 0">WhatsApp</a></td></tr></table>';
  v_html := coalesce(p_html, '');
  if position('<!--redes-->' in v_html) = 0 then
    if v_html ~* '</body>' then v_html := regexp_replace(v_html, '</body>', v_redes || '</body>', 'i');
    else v_html := v_html || v_redes; end if;
  end if;
  select * into c from config_correo where id = 1;
  if c.api_key is null or c.remitente is null then raise exception 'El correo automático aún no está configurado (Datos del negocio)'; end if;
  bcc := nullif(trim(coalesce(p_bcc, '')), '');
  -- Todo correo va con copia a la dueña (copia_a), salvo las promociones
  if bcc is null and coalesce(p_tipo,'otro') <> 'promocion' then bcc := nullif(trim(coalesce(c.copia_a,'')),''); end if;
  if bcc is not null and lower(bcc) = lower(p_para) then bcc := null; end if;
  m := regexp_match(c.remitente, '^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$');
  if m is not null then v_nom := nullif(m[1], ''); v_mail := m[2]; else v_nom := null; v_mail := trim(c.remitente); end if;
  if c.api_key like 'api-%' then
    url := 'https://api.smtp2go.com/v3/email/send';
    hdr := jsonb_build_object('Content-Type', 'application/json', 'X-Smtp2go-Api-Key', c.api_key, 'accept', 'application/json');
    body := jsonb_build_object('sender', c.remitente, 'to', jsonb_build_array(p_para), 'subject', p_asunto, 'html_body', v_html);
    if bcc is not null then body := body || jsonb_build_object('bcc', jsonb_build_array(bcc)); end if;
    if p_pdf_b64 is not null and p_pdf_b64 <> '' then
      body := body || jsonb_build_object('attachments', jsonb_build_array(jsonb_build_object('filename', p_nombre, 'fileblob', p_pdf_b64, 'mimetype', 'application/pdf')));
    end if;
  elsif c.api_key like 'xkeysib-%' or c.api_key like 'xsmtpsib-%' then
    url := 'https://api.brevo.com/v3/smtp/email';
    hdr := jsonb_build_object('api-key', c.api_key, 'Content-Type', 'application/json', 'accept', 'application/json');
    body := jsonb_build_object('sender', jsonb_build_object('name', coalesce(v_nom, 'DAYMARSV'), 'email', v_mail),
                               'to', jsonb_build_array(jsonb_build_object('email', p_para)), 'subject', p_asunto, 'htmlContent', v_html);
    if bcc is not null then body := body || jsonb_build_object('bcc', jsonb_build_array(jsonb_build_object('email', bcc))); end if;
    if p_pdf_b64 is not null and p_pdf_b64 <> '' then
      body := body || jsonb_build_object('attachment', jsonb_build_array(jsonb_build_object('name', p_nombre, 'content', p_pdf_b64)));
    end if;
  else
    url := 'https://api.resend.com/emails';
    hdr := jsonb_build_object('Authorization', 'Bearer ' || c.api_key, 'Content-Type', 'application/json');
    body := jsonb_build_object('from', c.remitente, 'to', jsonb_build_array(p_para), 'subject', p_asunto, 'html', v_html);
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
