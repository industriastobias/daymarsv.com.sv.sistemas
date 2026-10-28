-- Recordatorios de cobro por WhatsApp (API oficial de Meta, plantilla con imagen)
create extension if not exists pg_net;

create table if not exists whatsapp_config (
  id integer primary key default 1 check (id = 1),
  phone_id text,
  token text,
  plantilla text not null default 'recordatorio_pago',
  idioma text not null default 'es',
  imagen_defecto text not null default 'https://industriastobias.github.io/daymarsv.com.sv.sistemas/logo.png',
  activo boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into whatsapp_config (id) values (1) on conflict do nothing;
alter table whatsapp_config enable row level security;   -- sin políticas: solo las funciones de abajo la leen (el token nunca sale al navegador)

create table if not exists recordatorios_wa (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references ventas(id) on delete cascade,
  telefono text not null,
  request_id bigint,
  creado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists recordatorios_wa_venta_idx on recordatorios_wa (venta_id, created_at desc);
alter table recordatorios_wa enable row level security;
drop policy if exists ver_recordatorios on recordatorios_wa;
create policy ver_recordatorios on recordatorios_wa for select to authenticated using (es_usuario_activo());

create or replace function obtener_whatsapp() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c whatsapp_config%rowtype;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  select * into c from whatsapp_config where id = 1;
  return jsonb_build_object('configurado', c.activo and coalesce(c.token,'') <> '' and coalesce(c.phone_id,'') <> '',
    'phone_id', case when es_admin() then c.phone_id end, 'plantilla', c.plantilla, 'idioma', c.idioma,
    'tiene_token', coalesce(c.token,'') <> '', 'activo', c.activo);
end $$;

create or replace function guardar_whatsapp(p_phone_id text, p_token text, p_plantilla text, p_idioma text, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo un administrador puede configurar WhatsApp'; end if;
  update whatsapp_config set
    phone_id = coalesce(nullif(trim(p_phone_id),''), phone_id),
    token = coalesce(nullif(trim(p_token),''), token),
    plantilla = coalesce(nullif(trim(p_plantilla),''), plantilla),
    idioma = coalesce(nullif(trim(p_idioma),''), idioma),
    activo = coalesce(p_activo, activo), updated_at = now()
  where id = 1;
end $$;

create or replace function enviar_recordatorio_wa(p_venta uuid, p_telefono text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  c whatsapp_config%rowtype; v ventas%rowtype; tel text; img text; prods text; nid bigint; neg text; pid uuid;
  m text; body jsonb;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  select * into c from whatsapp_config where id = 1;
  if not c.activo or coalesce(c.token,'') = '' or coalesce(c.phone_id,'') = '' then raise exception 'WhatsApp no está configurado todavía'; end if;
  select * into v from ventas where id = p_venta;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.tipo <> 'cobro_pendiente' or v.estado <> 'pendiente' then raise exception 'Esta venta no tiene saldo pendiente'; end if;
  tel := regexp_replace(coalesce(p_telefono,''), '\D', '', 'g');
  if length(tel) = 8 then tel := '503' || tel; end if;
  if length(tel) < 10 or length(tel) > 15 then raise exception 'El número de teléfono no es válido'; end if;

  select string_agg(vi.cantidad || '× ' || coalesce(vi.nombre, p.nombre, 'Producto'), ', ')
    into prods from venta_items vi left join productos p on p.id = vi.producto_id where vi.venta_id = p_venta;
  prods := left(regexp_replace(coalesce(prods,'Productos'), '\s+', ' ', 'g'), 300);

  select producto_id into pid from venta_items where venta_id = p_venta and producto_id is not null limit 1;
  select coalesce((select url from producto_imagenes where producto_id = pid and url is not null order by orden limit 1), (select foto_url from productos where id = pid))
    into img;
  img := coalesce(nullif(img,''), c.imagen_defecto);
  select coalesce(nombre, 'DAYMAR-SHOP') into neg from config_negocio where id = 1;

  m := '$';
  body := jsonb_build_object('messaging_product', 'whatsapp', 'to', tel, 'type', 'template',
    'template', jsonb_build_object('name', c.plantilla, 'language', jsonb_build_object('code', c.idioma),
      'components', jsonb_build_array(
        jsonb_build_object('type','header','parameters', jsonb_build_array(jsonb_build_object('type','image','image', jsonb_build_object('link', img)))),
        jsonb_build_object('type','body','parameters', jsonb_build_array(
          jsonb_build_object('type','text','text', left(regexp_replace(coalesce(v.cliente_nombre,'cliente'), '\s+', ' ', 'g'), 60)),
          jsonb_build_object('type','text','text', coalesce(neg,'DAYMAR-SHOP')),
          jsonb_build_object('type','text','text', prods),
          jsonb_build_object('type','text','text', m || to_char(v.subtotal, 'FM999990.00')),
          jsonb_build_object('type','text','text', m || to_char(v.abonado, 'FM999990.00')),
          jsonb_build_object('type','text','text', m || to_char(v.pendiente_monto, 'FM999990.00')),
          jsonb_build_object('type','text','text', to_char(v.created_at at time zone 'America/El_Salvador', 'DD/MM/YYYY'))
        )))));

  select net.http_post(
    url := 'https://graph.facebook.com/v21.0/' || c.phone_id || '/messages',
    body := body,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || c.token),
    timeout_milliseconds := 10000) into nid;
  insert into recordatorios_wa (venta_id, telefono, request_id, creado_por) values (p_venta, tel, nid, auth.uid());
  return nid;
end $$;

create or replace function estado_recordatorio_wa(p_request bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; msg text;
begin
  if not es_usuario_activo() then raise exception 'Sin permiso'; end if;
  select status_code, content, error_msg into r from net._http_response where id = p_request;
  if not found then return jsonb_build_object('estado','pendiente'); end if;
  if r.status_code between 200 and 299 then return jsonb_build_object('estado','enviado'); end if;
  begin msg := (r.content::jsonb)->'error'->>'message'; exception when others then msg := null; end;
  return jsonb_build_object('estado','error','detalle', left(coalesce(msg, r.error_msg, 'Error ' || coalesce(r.status_code::text,'desconocido')), 300));
end $$;

revoke execute on function obtener_whatsapp() from public, anon;
revoke execute on function guardar_whatsapp(text,text,text,text,boolean) from public, anon;
revoke execute on function enviar_recordatorio_wa(uuid,text) from public, anon;
revoke execute on function estado_recordatorio_wa(bigint) from public, anon;
grant execute on function obtener_whatsapp() to authenticated;
grant execute on function guardar_whatsapp(text,text,text,text,boolean) to authenticated;
grant execute on function enviar_recordatorio_wa(uuid,text) to authenticated;
grant execute on function estado_recordatorio_wa(bigint) to authenticated;
