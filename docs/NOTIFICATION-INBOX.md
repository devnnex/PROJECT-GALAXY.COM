# Centro de notificaciones

La campana abre un panel glass morado con un fondo atenuado, mayor contraste y texto legible. Al abrir, una sola llamada confirma la lectura de todos los avisos actuales de la cuenta y limpia sus registros del buzón. Los últimos 100 se conservan solo en memoria mientras el panel permanece abierto, para que se puedan consultar y abrir sus enlaces. Al cerrar, esa lectura temporal se descarta; no se guarda en Web Storage.

La RPC existente `mark_all_notifications_read()` devuelve `updated`, `cleared`, `readAt` y `notifications`. La lectura y limpieza usan un único `DELETE … RETURNING` sobre `notifications` con `user_id = require_user()`. El snapshot conserva los metadatos de reuniones e invitaciones necesarios para las acciones existentes. La cascada elimina únicamente los trabajos Push que dependen de esos avisos; las tablas de operaciones, eventos, mensajes, reuniones, invitaciones, membresías y suscripciones Push conservan sus registros.

Los avisos que llegan después de la lectura siguen pendientes. Abrir uno de ellos o pulsar **Leer novedades** confirma el siguiente lote. Los avisos flotantes ya consultados se retiran, mientras las señales y resultados canónicos siguen en Black Galaxy Trade.

El controlador agrupa solicitudes repetidas y evita que una respuesta antigua de polling o un Push tardío resuciten avisos limpiados. También conserva las llegadas Realtime posteriores al inicio de una consulta. Los IDs recientes de scanner se confirman aunque queden fuera de los 100 avisos mostrados. La memoria está limitada a 100 registros visibles y 1.000 IDs de deduplicación por sesión.

Si la confirmación falla, se restaura la vista pendiente local y se ofrece reintentar. Cerrar el panel mientras hay una petición no lo vuelve a abrir cuando llega la respuesta. La navegación por teclado se limita al diálogo, Escape lo cierra y el foco vuelve a la campana. Los efectos de entrada/sincronización respetan movimiento reducido.

## Publicación

Aplicar primero `supabase/migrations/20261118190000_notification_inbox_read_and_clear.sql` al proyecto configurado y publicar después el frontend con el workflow existente. Aplicar la migración solo instala la función; no recorre ni limpia buzones durante el despliegue. Cada limpieza sucede cuando el usuario confirma su lectura. El esquema completo también incorpora esta función.

La limpieza evita acumular avisos ya consultados y sus trabajos de envío, sin programar consultas adicionales por cada aviso ni modificar el scanner. Los avisos de cuentas que todavía no los han abierto permanecen disponibles.
