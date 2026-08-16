# Rendimiento

La migración elimina el cuello de botella principal: el transporte anterior consultaba Apps Script cada 0,9–1,9 segundos y repetía GET/POST para presencia, señales y chat.

Ahora:

- Presence y Broadcast mantienen un WebSocket persistente con Supabase Realtime.
- Mensajes y reacciones hacen una sola RPC transaccional y se propagan por Broadcast.
- Admisiones usan cambios de Postgres en tiempo real; existe un refresco de respaldo cada 15–20 segundos.
- Los índices cubren host/fecha, participante/estado, sala/estado y mensaje/fecha.
- La sesión JWT se persiste y renueva con el cliente oficial de Supabase.

La latencia final depende de la región del proyecto Supabase, la ubicación de los usuarios y la ruta WebRTC. El siguiente paso de medición es registrar p50/p95 de `join_meeting`, `post_meeting_message` y tiempo hasta Broadcast desde clientes en redes reales.
