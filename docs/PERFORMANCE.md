# Rendimiento

La migración elimina el cuello de botella principal: el transporte anterior consultaba Apps Script cada 0,9–1,9 segundos y repetía GET/POST para presencia, señales y chat.

Ahora:

- Presence y Broadcast mantienen un WebSocket persistente con Supabase Realtime.
- El centro de reuniones precalienta ese WebSocket y recupera automáticamente una partición diaria todavía no preparada.
- Crear una sala requiere una sola RPC; ya no repite `join_meeting` ni `get_current_user` antes de habilitar medios.
- Las señales WebRTC usan Broadcast sin confirmación por mensaje; las acciones persistentes mantienen confirmación mediante RPC/PostgreSQL.
- Mensajes y reacciones hacen una sola RPC transaccional y se propagan por Broadcast.
- Admisiones usan cambios de Postgres en tiempo real; existe un refresco de respaldo cada 15–20 segundos.
- Los índices cubren host/fecha, participante/estado, sala/estado y mensaje/fecha.
- La sesión JWT se persiste y renueva con el cliente oficial de Supabase.

La latencia final depende de la región del proyecto Supabase, la ubicación de los usuarios y la ruta WebRTC. El siguiente paso de medición es registrar p50/p95 de `join_meeting`, `post_meeting_message` y tiempo hasta Broadcast desde clientes en redes reales.

Black Galaxy Trade conserva un único scanner de servidor para todos los usuarios. El cron revisa disponibilidad cada 15 segundos y respeta la caché de 30 segundos del proveedor antes de invocar la Edge Function. Los resúmenes diarios se mantienen por diferencias cuando cambia una operación; consultar el panel no recuenta toda la tabla de operaciones.

El panel pasa de seis a tres consultas de respaldo por minuto visible; las notificaciones de cuatro a tres. Realtime entrega los avisos de scanner directamente sin una consulta adicional por destinatario y evento. Las ráfagas de TP se agrupan, no hay solicitudes simultáneas del mismo recurso, las pestañas ocultas detienen el respaldo y los fallos aplican espera progresiva hasta 60 segundos. El simulador se carga como módulo separado y sus controles no consultan Supabase.

Las visitas todavía consumen conexiones Realtime y lecturas; no existe un número de usuarios ilimitado ni una garantía de coste sin medir tráfico y el plan real. La revisión conserva cuotas OHLC, permisos y configuración de reuniones, pagos y mensajes.
