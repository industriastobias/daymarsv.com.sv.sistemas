-- 094 · Aviso de anulación más completo (detalle de la factura) y en la misma conversación que la factura original

create or replace function _html_anulacion(p_factura uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare f facturas%rowtype; neg text; tel text; filas text; num text;
begin
  select * into f from facturas where id = p_factura;
  if not found then return null; end if;
  select coalesce(nullif(nombre,''),'DAYMARSV'), telefono into neg, tel from config_negocio where id = 1;
  neg := coalesce(neg, 'DAYMARSV');
  num := 'F-' || lpad(f.numero::text, 6, '0');
  select string_agg('<tr><td style="padding:7px 0;border-bottom:1px solid #eee;font-size:14px">' || i.cantidad || ' × ' || replace(replace(i.nombre,'<','&lt;'),'>','&gt;') ||
                    '</td><td style="padding:7px 0;border-bottom:1px solid #eee;font-size:14px;text-align:right;color:#888;text-decoration:line-through">$' || to_char(i.total, 'FM999990.00') || '</td></tr>', '' order by i.orden)
    into filas from factura_items i where i.factura_id = f.id;
  return '<div style="background:#f5f1f2;padding:20px 8px;font-family:Arial,Helvetica,sans-serif;color:#222"><div style="max-width:540px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">'
    || '<h2 style="margin:0 0 4px;color:#6B2D3E">' || neg || '</h2>'
    || '<div style="display:inline-block;margin:8px 0 14px;background:#fdecea;color:#b3261e;font-weight:700;font-size:13px;letter-spacing:1px;padding:5px 12px;border-radius:999px">FACTURA ANULADA</div>'
    || '<p style="font-size:15px;margin:0 0 14px">Hola' || coalesce(' ' || nullif(split_part(trim(coalesce(f.cliente_nombre,'')),' ',1),''), '') || ', te informamos que la factura <b style="white-space:nowrap">' || num || '</b> fue <b>anulada</b> y ya no tiene validez. No tienes que hacer nada más.</p>'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 6px;font-size:13px;color:#555">'
    || '<tr><td style="padding:3px 0">Factura</td><td style="text-align:right;color:#222;font-weight:700">' || num || '</td></tr>'
    || '<tr><td style="padding:3px 0">Fecha de la factura</td><td style="text-align:right;color:#222">' || to_char(f.fecha, 'DD/MM/YYYY') || '</td></tr>'
    || '<tr><td style="padding:3px 0">Anulada el</td><td style="text-align:right;color:#222">' || to_char(now() at time zone 'America/El_Salvador', 'DD/MM/YYYY') || '</td></tr>'
    || case when coalesce(f.cliente_nombre,'') <> '' then '<tr><td style="padding:3px 0">Cliente</td><td style="text-align:right;color:#222">' || replace(f.cliente_nombre,'<','&lt;') || '</td></tr>' else '' end
    || '</table>'
    || case when filas is not null then '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:10px 0 0">' || filas
         || '<tr><td style="padding:10px 0 0;font-weight:700">Total anulado</td><td style="padding:10px 0 0;text-align:right;font-weight:700;color:#b3261e">$' || to_char(f.total, 'FM999990.00') || '</td></tr></table>' else '' end
    || '<p style="font-size:14px;color:#555;margin:18px 0 0">Si tienes dudas, responde a este correo' || case when coalesce(tel,'') <> '' then ' o escríbenos al ' || tel else ' o escríbenos por WhatsApp' end || '.</p>'
    || '</div></div>';
end $$;

-- Asunto "Re: Tu factura F-… – Negocio": el correo de anulación queda en la misma conversación que la factura
create or replace function trg_aviso_factura_anulada() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare neg text; num text;
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' and new.cliente_correo is not null and new.correo_enviado_en is not null then
    begin
      select coalesce(nullif(nombre,''), 'DAYMARSV') into neg from config_negocio where id = 1;
      num := 'F-' || lpad(new.numero::text, 6, '0');
      perform _correo_enviar(new.cliente_correo, 'Re: Tu factura ' || num || ' – ' || coalesce(neg,'DAYMARSV'), _html_anulacion(new.id), null, null, null, 'anulacion', num);
    exception when others then null;
    end;
  end if;
  return new;
end $$;

-- Para mandar el aviso cuando la factura nunca se había enviado por correo
create or replace function enviar_aviso_anulacion(p_factura uuid, p_para text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare neg text; num text; f facturas%rowtype;
begin
  if not es_admin() then raise exception 'Solo un administrador puede enviar este aviso'; end if;
  if p_para is null or p_para !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  select * into f from facturas where id = p_factura;
  if not found then raise exception 'La factura no existe'; end if;
  select coalesce(nullif(nombre,''), 'DAYMARSV') into neg from config_negocio where id = 1;
  num := 'F-' || lpad(f.numero::text, 6, '0');
  update facturas set cliente_correo = coalesce(cliente_correo, trim(p_para)) where id = p_factura;
  return _correo_enviar(trim(p_para), 'Re: Tu factura ' || num || ' – ' || coalesce(neg,'DAYMARSV'), _html_anulacion(p_factura), null, null, null, 'anulacion', num);
end $$;
revoke execute on function enviar_aviso_anulacion(uuid, text) from public, anon;
grant execute on function enviar_aviso_anulacion(uuid, text) to authenticated;
revoke execute on function _html_anulacion(uuid) from public, anon, authenticated;
