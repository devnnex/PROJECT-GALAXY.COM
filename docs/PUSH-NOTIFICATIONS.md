# Activación de perfiles y notificaciones

Esta actualización solo añade edición administrativa de nombre/foto, avisos Web Push y actualización automática de la PWA. El `push` a GitHub publica el frontend; Supabase necesita activar el backend una vez.

## Opción recomendada: un archivo para activar todo

Desde la carpeta del proyecto en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\ACTIVAR-NOTIFICACIONES.ps1
```

Requiere Node.js 22 o superior. También reconoce el Node portátil de `GALAXY-Tools` existente en este equipo.

El archivo solicita, con entrada oculta, un **Access Token de la cuenta Supabase** con acceso administrativo al proyecto `xdsqtuubsptpzwadecha`. Puedes crearlo en [Supabase → Account → Access Tokens](https://supabase.com/dashboard/account/tokens). No es la clave pública `anon` de la app. El token se transmite a Node por entrada estándar, se usa en memoria y no se escribe en archivos, argumentos del proceso ni GitHub. Puedes revocarlo al terminar.

El activador aplica la migración, crea las claves VAPID una sola vez, configura los secretos de Edge Functions y Vault, despliega `push-notifications` y comprueba la tarea programada. Puede volver a ejecutarse: conserva las claves VAPID existentes para que los dispositivos sigan suscritos. No envía notificaciones de prueba a usuarios ni cambia datos de pagos o reuniones.

## Si prefieres ejecutar SQL manualmente

Para habilitar **Usuarios → Editar**, ejecuta completo en **Supabase → SQL Editor**:

`supabase/migrations/20261105100000_admin_profiles_and_push.sql`

Ese SQL prepara también la cola de notificaciones. **El SQL por sí solo no despliega el servicio de envío**. Para completar Web Push, usa el activador anterior o configura manualmente:

1. Genera una pareja VAPID para Web Push. Conserva la clave privada; no la publiques ni la cambies después de registrar dispositivos.
2. En los secretos de Edge Functions configura `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y un `PUSH_DISPATCH_SECRET` aleatorio.
3. Despliega `supabase/functions/push-notifications/index.ts` junto con `delivery.js`, con `verify_jwt=false`. La función exige el secreto privado `x-galaxy-push-secret`; nunca acepta el `anon` como autorización de envío.
4. En Vault guarda `galaxy_push_dispatch_secret` con ese mismo secreto y `galaxy_push_dispatch_url` con `https://xdsqtuubsptpzwadecha.supabase.co/functions/v1/push-notifications`. Guarda la pareja VAPID como `galaxy_vapid_public_key` y `galaxy_vapid_private_key` para que el activador pueda reutilizarla.
5. En `public.app_settings`, la clave `web_push` debe tener `value={"publicKey":"TU_CLAVE_PUBLICA_VAPID"}` y `is_secret=false`. Comprueba que exista y esté activa la tarea `galaxy-web-push` en Cron.

## Comportamiento y comprobación

- Solo `elkin56ty@gmail.com` con cuenta administrativa activa puede editar nombres y fotos. No se modifican correo, rol, usuario, membresía ni acceso. Se pueden editar también cuentas suspendidas.
- El primer clic o interacción de teclado tras iniciar sesión solicita el permiso nativo cuando todavía no existe. Si ya se concedió, el dispositivo se registra automáticamente. Si se rechazó, la app no insiste. El navegador exige consentimiento; ningún código puede concederlo en silencio. En iPhone/iPad Web Push requiere una PWA instalada y un sistema compatible.
- Tus mensajes privados generan un aviso solo para su destinatario. La vista previa respeta la eliminación y los recibos de lectura del mensaje original. Las reuniones nuevas se anuncian cuando están disponibles; las programadas se comprueban cada minuto. Las salas finalizadas, vencidas y bloqueadas no se anuncian.
- Las notificaciones usan el icono de Galaxy, vibración y acciones cuando el sistema lo admite. Su apariencia final y el sonido los controla el sistema operativo. Al pulsarlas se abre la conversación o reunión correspondiente, validando la cuenta destinataria.
- Al cerrar sesión se retira la suscripción de ese dispositivo. La cola reintenta los errores temporales y elimina suscripciones vencidas. No se envían avisos a cuentas suspendidas o invitadas.
- Las versiones futuras se detectan al hacer clic o volver a la app; la comprobación se limita a una por minuto. La recarga espera si hay una reunión conectándose/en curso, un diálogo abierto o texto en un formulario. No requiere reinstalar ni un botón de actualización.
- Una instancia que permanezca abierta con el código anterior todavía no tiene el detector nuevo: recibe esta primera versión al volver a abrir/cargar la app, sin reinstalar. No se puede añadir un manejador de clic al JavaScript antiguo que ya está ejecutándose.

Después de activar: entra con el administrador, edita un usuario de prueba, permite notificaciones en el dispositivo destinatario y envíale un mensaje real. Comprueba con la PWA en segundo plano. Verifica también una reunión inmediata y una programada. Las pruebas locales usan PostgreSQL embebido y un backend simulado en navegador; la entrega real requiere este paso de activación y un dispositivo con permiso concedido.
