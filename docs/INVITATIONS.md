# Activar invitaciones, membresías y wallet

Los cambios del repositorio requieren publicar el frontend, aplicar SQL y desplegar la función. No se han aplicado automáticamente al proyecto remoto.

1. En Supabase SQL Editor ejecuta `supabase/schema.sql` completo. Conserva las cuentas existentes. Debe existir previamente la cuenta `elkin56ty@gmail.com`, destinataria de los ingresos. El trigger nuevo rechaza cualquier alta sin una invitación válida entregada por la función del servidor, incluso si se llama directamente a signup.
2. En el proyecto actual de Apps Script pega el contenido completo de `apps-script/Code.gs` en `Code.gs` y copia `apps-script/appsscript.json` en el manifiesto del proyecto. Este único archivo `.gs` incluye el hook existente y el envío de invitaciones. Ejecuta `authorizeMailAccess` una vez y acepta los permisos para enviar correo y conectarse a Supabase. Después crea una versión nueva desde **Implementar → Administrar implementaciones → Editar → Nueva versión**, ejecutada como propietario y accesible para cualquiera. Mantén la misma URL `/exec`.
3. Publica el resultado de `npm run build` usando el procedimiento actual del proyecto. No desactives **Allow new users to sign up** en Auth: el trigger de `schema.sql` bloquea cualquier alta que no incluya un token vigente, de un solo uso y ligado al correo invitado. El login no muestra registro público.

El envío y la eliminación ya no usan una Edge Function. No necesitas desplegar `registration`, configurar `APPS_SCRIPT_MAIL_KEY`, `GALAXY_INVITATION_KEY`, `APP_REGISTRATION_URL` ni exponer una clave `service_role`. Apps Script valida el token mediante el RPC público limitado `get_registration_invitation`; nunca puede seleccionar otro destinatario ni crear invitaciones.

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
