# Registro privado y bienvenida de Telegram

El botón **Telegram privado** de Black Galaxy Trade abre un panel con tres pasos: abrir el bot, confirmar la identidad en Galaxy y solicitar ingreso. No hay una invitación global en el frontend ni consultas de acceso antes de abrir el panel.

Cada cuenta registrada con membresía activa tiene una fila privada. Un token aleatorio temporal de 15 minutos abre el bot mediante `/start`; el bot propone su identidad, pero todavía no la vincula definitivamente. El usuario debe confirmar esa identidad desde su sesión autenticada de Galaxy. La doble confirmación evita que un enlace de inicio reenviado o abierto con la cuenta equivocada vincule una identidad sin que el titular Galaxy la acepte.

Las restricciones únicas permiten una sola identidad de Telegram por cuenta Galaxy y una sola cuenta Galaxy por identidad de Telegram. Las identidades confirmadas no se sustituyen desde el cliente. Antes de confirmar se puede rechazar la propuesta y empezar de nuevo. No equivale a verificar una persona física frente a múltiples cuentas; el control es por cuenta autenticada de ambas plataformas.

La invitación dura diez minutos y requiere solicitud. Se aprueba solo cuando coinciden la identidad confirmada, la invitación personal vigente y el acceso activo en Galaxy. Reenviar la invitación no autoriza a otra identidad. Se revoca después de aprobar; una salida conserva la vinculación y requiere una invitación nueva para volver con la misma cuenta. La creación y las actualizaciones del webhook usan leases y deduplicación para evitar carreras y repetir bienvenidas.

La bienvenida no enlaza el perfil de la persona: «💜 ¡Bienvenido/a a PROJECT GALAXY! Soy PowerEliteBot, tu compañero de Black Galaxy Trade. Aquí recibirás señales y reportes. ¡Qué gusto tenerte con nosotros! 🚀». Se envía una vez por identidad verificada, aunque Telegram repita un evento de ingreso. Se reutiliza la cola privada; entradas, TP y SL conservan prioridad sobre las bienvenidas. Las indicaciones de vinculación se envían al chat privado que inició la persona, nunca al grupo.

## Activación

Con el token privado ya configurado, ejecutar `node scripts/activate-telegram-community.mjs --chat-id ID`. El script valida que el grupo sea privado y que el bot pueda invitar y moderar; instala únicamente esta migración, actualiza el despachador y despliega `telegram-access` y `telegram-community`. Solo agrega el secreto privado `TELEGRAM_WEBHOOK_SECRET`. Configura el webhook y deshabilita las invitaciones directas de miembros no administradores, conservando los demás permisos de conversación y los miembros actuales.

El propietario debe revocar los enlaces anteriores creados por otros administradores: el bot no controla las invitaciones ajenas. Para este despliegue, el propietario confirmó que ya estaban revocadas. Los ingresos nuevos no registrados que lleguen por una invitación manual o antigua se retiran; no se recorre ni expulsa a los miembros existentes al activar. Los administradores y bots quedan fuera de esa retirada automática.

Los eventos anteriores a la activación se ignoran. Las conversaciones ordinarias se descartan sin consultas de base de datos ni persistir su contenido. Los registros de webhook se conservan siete días; las propuestas no confirmadas vencidas se limpian al día siguiente. La consulta del panel se limita a mientras está abierto y visible, con recuperación al volver a la pestaña, y se detiene al cerrar. Las tablas privadas carecen de lectura para `anon` y `authenticated`; las RPC públicas solo trabajan con el usuario autenticado y las operaciones administrativas son exclusivas del servidor. No se recopilan teléfonos.

## Privacidad de Telegram

Se conserva el grupo privado con conversación, según la elección del propietario. Un grupo no puede impedir que sus autores sean identificables ni bloquear mensajes privados entre usuarios desde el bot. Telegram ofrece «Ocultar miembros» para grupos de al menos cien integrantes, pero quienes escriben siguen visibles. Un canal tendría suscriptores ocultos, con una dinámica diferente; este cambio no convierte el grupo en canal ni afirma anonimato.

Fuentes: https://core.telegram.org/bots/api#createchatinvitelink y https://telegram.org/blog/hidden-media-zero-storage-profile-pics#hiding-group-members
