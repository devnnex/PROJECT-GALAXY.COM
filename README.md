# Project Galaxy

Plataforma React/Vite con autenticación, datos, salas y señalización en tiempo real sobre Supabase.

## Puesta en marcha

1. Abre **Supabase Dashboard → SQL Editor**, pega y ejecuta [`supabase/schema.sql`](supabase/schema.sql) completo.
2. En **Authentication → URL Configuration**, usa `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html` como `Site URL` y única Redirect URL, según la [guía de despliegue](docs/DEPLOYMENT.md).
3. En **Realtime Settings**, desactiva **Allow public access** para forzar las políticas de canales privados.
4. Mantén activados **Email** y **Confirm email**. Para enviar las confirmaciones sin dominio propio, despliega el Send Email Hook de `apps-script/Code.gs` siguiendo `docs/DEPLOYMENT.md`; Supabase continúa validando los tokens y Apps Script solo transporta el correo.
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

El artefacto público está minificado, no incluye sourcemaps ni archivos fuente y aplica una CSP restrictiva. Las contraseñas de reunión no se guardan en Web Storage; mensajes, moderación y cierre de salas se validan contra PostgreSQL antes de aceptarse desde Realtime. El CI añade auditoría del build, acciones fijadas por SHA, Dependabot y CodeQL. Consulta [SECURITY.md](SECURITY.md) y la [guía de despliegue](docs/DEPLOYMENT.md).

## Reuniones

Supabase Realtime Broadcast/Presence entrega señalización WebRTC, presencia, manos levantadas, emoji, chat y moderación sin el polling de Apps Script. PostgreSQL persiste salas, admisiones, invitaciones, mensajes y reacciones.

Supabase no incluye TURN. La Edge Function `turn-credentials` entrega credenciales efímeras de Cloudflare TURN a participantes admitidos, lo que cubre redes móviles y NAT restrictivos una vez configurados los secretos. Solo el administrador puede crear reuniones; las cuentas activas pueden entrar mediante invitación, código o calendario. Consulta [tiempo real](docs/REALTIME.md) y [despliegue](docs/DEPLOYMENT.md).

## Acceso y administración

`elkin56ty@gmail.com` es la identidad administrativa protegida por la allowlist del servidor. Las demás cuentas solo ven Reuniones, Calendario y Perfil; pueden entrar, aceptar o rechazar invitaciones, pero no crear salas ni eventos. La sección **Usuarios** permite al administrador suspender y reactivar cuentas. Una cuenta suspendida conserva una pantalla informativa bloqueada, mientras las RPC operativas rechazan su acceso.

Cada cuenta regular admite una sola sesión Supabase. Si aparece otra sesión de navegador o dispositivo mientras la primera sigue activa, ambas se invalidan y la cuenta puede volver a entrar tras la ventana de seguridad de 30 segundos. El administrador está exento para evitar un bloqueo operativo.

Los enlaces compartidos usan un token aleatorio almacenado solo como hash y nunca incluyen la contraseña de la sala. Tras autenticar o registrar al invitado, el servidor canjea el token y completa el ingreso. Las reuniones finalizadas pueden quitarse de **Mis reuniones**; su entrada de calendario se conserva siete días y luego se limpia automáticamente.

Al compartir pantalla desde la cuenta administrativa, el flujo obliga a definir al menos una zona de privacidad. Las zonas se dibujan en un canvas antes de enviar el video WebRTC, por lo que los asistentes no pueden retirar la cobertura desde la interfaz receptora.

## Pagos y Scanner

El checkout muestra la wallet y el QR de USDT TRC20/ERC20 seleccionados. La confirmación es manual y no controla el acceso a reuniones o LIVE. Scanner Power Elite está oculto para todas las cuentas excepto `elkin56ty@gmail.com`; su descarga se valida nuevamente en `scanner-download` y utiliza una URL firmada de 60 segundos desde el bucket privado `premium-downloads`. El archivo `.pine` está excluido de Git.
