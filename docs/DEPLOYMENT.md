# Despliegue

## Supabase

1. Ejecuta `supabase/schema.sql` en SQL Editor. La transacción crea extensiones, tablas, índices, triggers, RPC, RLS, políticas Realtime y publicación de cambios.
2. En **Authentication → URL Configuration**, configura tanto `Site URL` como la única `Redirect URL` con `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html`.
3. En Realtime Settings desactiva **Allow public access**; los canales del cliente son privados y usan las políticas del SQL.
4. Crea dos cuentas de prueba y valida creación, sala de espera, admisión, mensajes y reacciones desde dos navegadores.
5. No desactives RLS y no publiques una clave `service_role`.

Después de esta actualización vuelve a ejecutar `supabase/schema.sql`: la versión nueva incorpora la autorización rápida `can_access_realtime_topic`, el canal de precalentamiento por usuario y la respuesta completa de `create_meeting`. El archivo es idempotente y conserva los datos existentes.

El mismo script habilita las notificaciones accionables de reuniones. Una solicitud de sala de espera abre al anfitrión el modal **Aceptar ingreso / Rechazar**; una invitación abre al destinatario **Aceptar y entrar / Declinar**. La tabla `notifications` se agrega a `supabase_realtime` y el cliente mantiene sondeo de respaldo si el WebSocket se interrumpe.

Para cambiar ICE, actualiza únicamente el valor JSON de `ice_servers`:

```sql
update public.app_settings
set value = '[{"urls":"stun:stun.l.google.com:19302"}]'::jsonb,
    updated_at = now()
where key = 'ice_servers';
```

Las credenciales TURN estáticas quedan expuestas a cualquier miembro admitido. En producción emite credenciales efímeras desde una Supabase Edge Function o desde el proveedor TURN.

## GitHub Pages de producción

`src/runtime-config.js` ya contiene la URL del proyecto y la anon key pública. El workflow `.github/workflows/deploy-pages.yml` ejecuta instalación bloqueada, pruebas y compilación. El artefacto público contiene únicamente el acceso raíz y la aplicación compilada bajo `dist/`; no publica código fuente, SQL ni archivos internos.

En GitHub abre **Settings → Pages → Build and deployment → Source** y selecciona **GitHub Actions**. Cada push a `main` desplegará después de aprobar todas las pruebas. La URL canónica será `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html`; la raíz redirige allí conservando parámetros de invitación y autenticación.

No agregues URLs locales, comodines ni dominios de preview a Supabase Auth para este despliegue. Si posteriormente conectas un dominio propio, cambia `Site URL`, la Redirect URL y `base` en `vite.config.js` antes de publicar.

## Endurecimiento obligatorio

Después de actualizar el repositorio, vuelve a ejecutar `supabase/schema.sql` completo. Es idempotente y añade los comandos de moderación verificables, el límite de mensajes, la reanudación sin almacenar contraseñas y los privilegios restrictivos por defecto.

En **Authentication → Rate Limits**, conserva límites estrictos para registro, inicio de sesión, recuperación y verificación. En **Authentication → Attack Protection**, habilita CAPTCHA para registro, inicio de sesión y recuperación. Configura una longitud mínima de 10 caracteres y, si el plan lo permite, activa la detección de contraseñas filtradas.

En **Database → Security Advisor**, resuelve todas las alertas antes de cada lanzamiento. No desactives RLS ni concedas acceso directo de escritura a tablas operativas; el cliente debe escribir exclusivamente mediante las RPC autorizadas.

## Confirmación de correo mediante Apps Script

La confirmación sigue perteneciendo a Supabase Auth. El Web App de `apps-script/Code.gs` sustituye únicamente el transporte SMTP: recibe el token generado por el **Send Email Hook**, envía el mensaje con `MailApp` y el enlace confirma directamente contra Supabase. No desactives **Confirm email** y no agregues una `service_role` al script.

1. Crea un proyecto independiente en Google Apps Script y copia `apps-script/Code.gs` y `apps-script/appsscript.json`.
2. En **Project Settings → Script properties** agrega:
   - `GALAXY_HOOK_KEY`: secreto aleatorio de al menos 32 caracteres, distinto de cualquier clave de Supabase.
   - `SUPABASE_URL`: `https://xdsqtuubsptpzwadecha.supabase.co`.
   - `APP_REDIRECT_URL`: `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html`.
3. Ejecuta manualmente `authorizeMailAccess` una vez y acepta exclusivamente el permiso para enviar correo.
4. Usa **Deploy → New deployment → Web app**. Selecciona **Execute as: Me** y permite acceso a **Anyone**. Copia la URL terminada en `/exec`.
5. En **Authentication → Hooks**, crea **Send Email → HTTPS** con esta URL, sustituyendo el valor por el secreto real:

   ```text
   https://script.google.com/macros/s/DEPLOYMENT_ID/exec?hook_key=GALAXY_HOOK_KEY
   ```

6. Genera el secreto de firma solicitado por Supabase y activa el hook. Apps Script no expone los encabezados HTTP al `doPost`; por eso el endpoint valida además `hook_key`, el proyecto, UUID, destinatario, tipo de acción y hash del token.
7. Mantén habilitado el proveedor **Email** y **Confirm email**. Cuando el hook ya funcione, desactiva **Custom SMTP**: con el hook activo no se utiliza SMTP.
8. Registra una cuenta nueva y comprueba **Apps Script → Executions**, **Supabase → Auth Logs** y la bandeja de correo. El enlace debe volver a la URL canónica de GitHub Pages.

El script usa caché para evitar duplicados y revisa la cuota antes de enviar. Google limita actualmente las cuentas personales a 100 destinatarios diarios y las cuentas Workspace a 1.500; estas cuotas pueden cambiar. Además, Supabase exige que el hook HTTP termine en 5 segundos. Esta solución es adecuada para la etapa inicial, pero para volumen o disponibilidad garantizada migra a SMTP con dominio verificado o a una Edge Function con un proveedor transaccional.

La alternativa SMTP sigue disponible en `supabase/templates/confirmation.html`. Sus credenciales nunca deben añadirse a GitHub, `runtime-config.js` ni variables `VITE_*`.

El workflow ejecuta pruebas, build y `npm run security:check`. La publicación se detiene si aparecen sourcemaps, archivos fuente, una clave privilegiada, JavaScript inline o una CSP debilitada. CodeQL y Dependabot cubren análisis estático y actualizaciones de dependencias.

GitHub Pages no admite encabezados HTTP personalizados por repositorio. La CSP disponible en HTML protege scripts, conexiones y recursos, pero `frame-ancestors` solo funciona como encabezado. Para bloquear clickjacking a nivel HTTP, usa un dominio propio detrás de Cloudflare u otro alojamiento con encabezados configurables.
