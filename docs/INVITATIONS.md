# Activar invitaciones, membresías y wallet

Los cambios del repositorio requieren publicar el frontend, aplicar SQL y desplegar la función. No se han aplicado automáticamente al proyecto remoto.

1. En Supabase SQL Editor ejecuta `supabase/schema.sql` completo. Conserva las cuentas existentes. Debe existir previamente la cuenta `elkin56ty@gmail.com`, destinataria de los ingresos. El trigger nuevo rechaza cualquier alta sin una invitación válida entregada por la función del servidor, incluso si se llama directamente a signup.
2. En el proyecto actual de Apps Script pega el contenido completo de `apps-script/Code.gs` en `Code.gs`. Este único archivo incluye el hook existente y el envío de invitaciones; no necesitas otro archivo `.gs`. Configura estas propiedades del script:
   - `GALAXY_INVITATION_KEY`: un secreto aleatorio de al menos 32 caracteres, exclusivo para este envío.
   - `APP_REGISTRATION_URL`: URL HTTPS pública exacta de la aplicación, por ejemplo `https://tu-sitio/dist/index.html`, sin fragmento ni parámetros.
   Las propiedades del hook de Auth existente se conservan. Publica una nueva versión de la aplicación web, ejecutada como propietario y accesible para cualquiera; la clave compartida autentica cada solicitud de invitación. Autoriza MailApp con la cuenta remitente.
3. Configura los secretos de Supabase para la función:
   La URL `/exec` de Apps Script ya está configurada en la constante `APPS_SCRIPT_MAIL_URL`, en la primera línea de `supabase/functions/registration/index.ts`. No necesitas crear un secreto para esta URL. Si cambia, edita esa línea y vuelve a desplegar la función.
   - `APPS_SCRIPT_MAIL_KEY`: el mismo valor que `GALAXY_INVITATION_KEY`.
   - `APP_REGISTRATION_URL`: exactamente la misma URL que en Apps Script.
   - `APP_ALLOWED_ORIGINS`: orígenes del frontend separados por comas, sin rutas.
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son las variables del entorno de Edge Functions. Ninguna clave privilegiada va en Vite ni en Apps Script.
4. Despliega `supabase functions deploy registration`. Su configuración `verify_jwt = false` permite aceptar invitaciones sin sesión; enviar y eliminar exigen JWT válido, sesión vigente y rol ADMIN dentro de la función y SQL.
5. Publica el resultado de `npm run build` usando el procedimiento actual del proyecto. Puedes desactivar adicionalmente **Allow new users to sign up** en Auth; las invitaciones usan la API administrativa del servidor y el login de cuentas existentes se conserva.

## Comportamiento

- Usuarios permite elegir correo, plan/badge y referente antes de enviar. Reenviar a un correo revoca su invitación previa. Se conserva el precio y duración del plan al emitirla.
- El enlace contiene un token aleatorio de 256 bits en el fragmento, no en la query. La base de datos guarda su hash. Solo es válido durante 420 segundos desde la creación y se consume una vez, con bloqueo de fila y activación/contabilidad atómicas. Abrir el enlace no lo consume; completar el registro sí.
- No se permite cambiar el correo invitado ni elegir membresía o referente desde el formulario público. Poseer el enlace acredita acceso al correo; Apps Script solo transporta el mensaje, sin crear cuentas ni administrar fondos.
- Al completar el registro comienza el plazo de la membresía. El propietario recibe 100%, o 90% si existe referente; este recibe 10%. Si el propietario es también el referente, ambas partidas suman 100% en su wallet.
- Son saldos contables de membresías que el administrador da por confirmadas al invitar. No hay verificación automática de una transferencia ni envío de USDT a wallets externas. El flujo de pagos manuales existente se conserva.
- Wallet se actualiza cada 15 segundos y muestra partidas, importe base, plan, miembro y vencimiento. Perfil mantiene el contador por segundo. Los planes existentes de usuarios antiguos no generan créditos retroactivos.
- Eliminar pide confirmación para la cuenta elegida, protege administradores y borra Auth, perfil, foto y datos asociados. Las partidas de otros beneficiarios se conservan sin la identidad del usuario eliminado, para no alterar sus balances; se conserva el vencimiento histórico. No se reversan comisiones ya acreditadas.
- Apps Script utiliza MailApp y está sujeto a su cuota diaria. Si no se confirma el envío, se revoca el enlace y la UI permite intentar nuevamente.

## Comprobación en el entorno desplegado

Con dos correos de prueba autorizados, comprueba registro sin referente y con referente (80 → 80; 80 → 72 + 8), plan/badge y contador, rechazo del mismo enlace una segunda vez y después de siete minutos, rechazo de signup directo, aislamiento de wallet entre cuentas y eliminación completa. No envíes invitaciones a personas reales solo para probar.

Referencias: [Supabase createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [gestión de usuarios](https://supabase.com/docs/guides/auth/managing-user-data), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [cuotas de Apps Script](https://developers.google.com/apps-script/guides/services/quotas).
