# Reuniones en tiempo real

Cada usuario admitido abre el canal privado `meeting:<uuid>`. Las políticas sobre `realtime.messages` verifican que `auth.uid()` tenga un registro `ADMITTED` antes de permitir recibir o emitir Broadcast/Presence.

El canal transporta ofertas, respuestas e ICE de WebRTC, estado de micrófono/cámara, mano levantada, reacciones, chat y moderación. Los mensajes también se escriben en PostgreSQL para recuperar historial tras recargar. La sala de espera escucha cambios autorizados de `meeting_participants` y conserva un refresco lento como recuperación.

La pantalla compartida solicita también audio al navegador. Cuando la fuente seleccionada entrega sonido, el cliente lo mezcla con el micrófono en una sola pista WebRTC para que ambos se escuchen simultáneamente. Chrome y Edge suelen ofrecerlo al compartir una pestaña y marcar **Compartir audio**; si el sistema operativo o navegador no entrega una pista de audio, la imagen continúa compartiéndose y la interfaz lo informa.

Al abrir el centro de reuniones, el cliente precalienta un canal privado `user:<uuid>`. Esto inicia el WebSocket y permite que Realtime prepare su partición diaria antes de crear o entrar a una sala. Las suscripciones aplican `setAuth()` explícitamente, reintentos cortos ante errores transitorios como `MissingPartition` y Broadcast sin `ack`, ya que PostgreSQL confirma por separado las operaciones persistentes. La política delega su comprobación a `can_access_realtime_topic`, una función `security definer` que evita encadenar varias políticas RLS durante cada alta del canal.

## Retención del chat de reuniones

El chat existe solamente mientras la reunión está activa. `end_meeting` cambia el estado y elimina sus mensajes dentro de la misma transacción; las reacciones desaparecen mediante `ON DELETE CASCADE`. El esquema también limpia mensajes históricos de reuniones ya finalizadas cuando se vuelve a ejecutar. Los perfiles, participantes, reuniones y notificaciones no se eliminan con esta política.

La creación del anfitrión utiliza una sola RPC: `create_meeting` devuelve también rol, admisión, ICE y mensajes iniciales. Cámara y micrófono pueden solicitar permiso tan pronto la RPC confirma la sala, mientras la señalización termina de conectarse en segundo plano.

## TURN no viene incluido

Supabase Realtime es señalización, no un relay multimedia TURN. STUN permite descubrir rutas directas, pero ciertos NAT, firewalls corporativos y redes móviles exigen TURN. Alternativas con capa gratuita o bajo costo cambian con el tiempo; evalúa un servicio administrado con credenciales efímeras o despliega coturn en una VM. Nunca guardes una contraseña TURN permanente en `runtime-config.js`.

Para más de 4–8 participantes, un mesh P2P multiplica carga de subida y CPU. Usa un SFU especializado para acercarte al comportamiento de Zoom en salas grandes.
