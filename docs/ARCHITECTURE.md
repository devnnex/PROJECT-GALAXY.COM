# Arquitectura

El navegador usa tres servicios de Supabase:

- **Auth** administra contraseñas, JWT, renovación y revocación de sesiones.
- **Postgres** guarda perfiles, wallets, reuniones, participantes, invitaciones, mensajes, reacciones y notificaciones.
- **Realtime** transporta presencia y señalización WebRTC con canales privados autorizados por RLS.

Audio, video y pantalla viajan directamente entre navegadores mediante WebRTC; no atraviesan PostgreSQL. Las mutaciones de negocio llaman funciones RPC que obtienen la identidad exclusivamente desde `auth.uid()`. Las tablas tienen RLS y el rol `anon` no posee acceso directo.

El esquema e índices están en [`supabase/schema.sql`](../supabase/schema.sql). `src/services/api.js` es la frontera de negocio, `src/services/supabase.js` crea un único cliente, y `src/services/meetingClient.js` implementa Presence, Broadcast y el mesh WebRTC.

La arquitectura mesh es adecuada para salas pequeñas. Para grupos grandes o grabación centralizada hace falta un SFU; cambiar Apps Script por Supabase mejora control, persistencia y señalización, pero no convierte el producto en la infraestructura multimedia distribuida de Zoom.
