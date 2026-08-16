# Project Galaxy

Plataforma React/Vite con autenticación, datos, salas y señalización en tiempo real sobre Supabase.

## Puesta en marcha

1. Abre **Supabase Dashboard → SQL Editor**, pega y ejecuta [`supabase/schema.sql`](supabase/schema.sql) completo.
2. En **Authentication → URL Configuration**, usa `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html` como `Site URL` y única Redirect URL, según la [guía de despliegue](docs/DEPLOYMENT.md).
3. En **Realtime Settings**, desactiva **Allow public access** para forzar las políticas de canales privados.
4. Decide en **Authentication → Providers → Email** si exigirás confirmación de correo. El cliente soporta ambos modos.
5. Comprueba `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `src/runtime-config.js`.
6. Instala, valida y compila:

```bash
npm install
npm test
npm run build
```

Para desarrollo usa `npm run dev`. Para probar la compilación estática usa `npm run serve-root`.

## Seguridad

La anon key de Supabase es una credencial pública diseñada para el navegador. La protección real está en Supabase Auth, funciones `security definer`, permisos explícitos y Row Level Security. No añadas nunca la `service_role` al repositorio ni al frontend.

La clave JWT `anon` suministrada funciona con este cliente. Supabase está migrando proyectos hacia claves `sb_publishable_...`; cuando el panel te ofrezca una, reemplázala sin cambiar el esquema ni la API.

## Reuniones

Supabase Realtime Broadcast/Presence entrega señalización WebRTC, presencia, manos levantadas, emoji, chat y moderación sin el polling de Apps Script. PostgreSQL persiste salas, admisiones, invitaciones, mensajes y reacciones.

Supabase no incluye TURN. El SQL deja `ice_servers` configurado con STUN; para redes restrictivas agrega credenciales TURN de corta duración mediante un proveedor TURN o una Edge Function. Consulta [tiempo real](docs/REALTIME.md).
