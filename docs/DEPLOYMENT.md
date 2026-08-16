# Despliegue

## Supabase

1. Ejecuta `supabase/schema.sql` en SQL Editor. La transacción crea extensiones, tablas, índices, triggers, RPC, RLS, políticas Realtime y publicación de cambios.
2. En **Authentication → URL Configuration**, configura tanto `Site URL` como la única `Redirect URL` con `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html`.
3. En Realtime Settings desactiva **Allow public access**; los canales del cliente son privados y usan las políticas del SQL.
4. Crea dos cuentas de prueba y valida creación, sala de espera, admisión, mensajes y reacciones desde dos navegadores.
5. No desactives RLS y no publiques una clave `service_role`.

Después de esta actualización vuelve a ejecutar `supabase/schema.sql`: la versión nueva incorpora la autorización rápida `can_access_realtime_topic`, el canal de precalentamiento por usuario y la respuesta completa de `create_meeting`. El archivo es idempotente y conserva los datos existentes.

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

## Correo de confirmación con marca PROJECT GALAXY

1. Abre **Authentication → Email Templates → Confirm signup**.
2. Usa el asunto `Confirma tu acceso a PROJECT GALAXY`.
3. Copia íntegramente `supabase/templates/confirmation.html` en el editor y guarda. La variable `{{ .ConfirmationURL }}` debe permanecer intacta.
4. Abre la configuración de **Authentication → SMTP Settings**, activa SMTP personalizado y establece **Sender name** como `PROJECT GALAXY`.
5. Usa una dirección verificada de tu dominio, por ejemplo `no-reply@auth.tudominio.com`, y configura SPF, DKIM y DMARC con el proveedor de correo.
6. Envía una confirmación de prueba y valida en escritorio y móvil que el remitente, asunto, botón y redirección sean correctos.

La plantilla controla el diseño y el asunto; el nombre/dominio del remitente solo cambia mediante SMTP personalizado. Las credenciales SMTP pertenecen exclusivamente a Supabase Dashboard: no deben añadirse a GitHub, `runtime-config.js` ni variables `VITE_*`. Desactiva el seguimiento de enlaces del proveedor SMTP para evitar que modifique el enlace de confirmación.

El workflow ejecuta pruebas, build y `npm run security:check`. La publicación se detiene si aparecen sourcemaps, archivos fuente, una clave privilegiada, JavaScript inline o una CSP debilitada. CodeQL y Dependabot cubren análisis estático y actualizaciones de dependencias.

GitHub Pages no admite encabezados HTTP personalizados por repositorio. La CSP disponible en HTML protege scripts, conexiones y recursos, pero `frame-ancestors` solo funciona como encabezado. Para bloquear clickjacking a nivel HTTP, usa un dominio propio detrás de Cloudflare u otro alojamiento con encabezados configurables.
