-- Se descarta el envío automático por la API de WhatsApp (se mantiene el envío manual desde el celular)
drop function if exists enviar_recordatorio_wa(uuid, text);
drop function if exists estado_recordatorio_wa(bigint);
drop function if exists obtener_whatsapp();
drop function if exists guardar_whatsapp(text, text, text, text, boolean);
drop table if exists recordatorios_wa;
drop table if exists whatsapp_config;   -- aquí podía quedar guardado el token de Meta
