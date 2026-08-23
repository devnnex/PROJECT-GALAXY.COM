# Reuniones en tiempo real

Cada usuario admitido abre el canal privado `meeting:<uuid>`. Las políticas sobre `realtime.messages` verifican que `auth.uid()` tenga un registro `ADMITTED` antes de permitir recibir o emitir Broadcast/Presence.

El canal transporta ofertas, respuestas e ICE de WebRTC, estado de micrófono/cámara, mano levantada, reacciones, chat y moderación. Los mensajes también se escriben en PostgreSQL para recuperar historial tras recargar. La sala de espera escucha cambios autorizados de `meeting_participants` y conserva un refresco lento como recuperación.

La pantalla compartida solicita también audio al navegador. Cuando la fuente seleccionada entrega sonido, el cliente lo mezcla con el micrófono en una sola pista WebRTC para que ambos se escuchen simultáneamente. Chrome y Edge suelen ofrecerlo al compartir una pestaña y marcar **Compartir audio**; si el sistema operativo o navegador no entrega una pista de audio, la imagen continúa compartiéndose y la interfaz lo informa.

El audio de cada participante se reproduce en una capa independiente de las cuadrículas y de la presentación. Por eso no se desmonta al comenzar una pantalla compartida. `MeetingStudio` permanece montado durante la navegación interna y muestra una barra compacta al visitar Marketplace, Membresías u otra sección; WebRTC, Realtime, el micrófono y el audio remoto continúan activos hasta pulsar **Salir** o **Finalizar**.

La reunión activa y la preferencia de cámara/micrófono se guardan por usuario. Tras recargar, el cliente consulta nuevamente el acceso, reconstruye WebRTC/Realtime, recupera el chat y vuelve a solicitar los medios que estaban activos. Las anotaciones de una presentación remota se solicitan al presentador para reconstruir la vista. La captura de pantalla no puede reanudarse silenciosamente: Safari, Chrome y los demás navegadores exigen una nueva acción y autorización del usuario, por lo que la reunión continúa y la interfaz pide volver a compartir.

## Ciclo de invitaciones

Cada invitación conserva estado `PENDING`, `ACCEPTED` o `DECLINED`, la hora en que el destinatario vio el modal y el número de intentos. El panel del anfitrión consulta este estado mientras permanece abierto y distingue **modal pendiente**, **visto sin responder**, **rechazado** y **dentro**. Una invitación rechazada habilita **Reinvitar**; al hacerlo se crea una notificación vigente, se reinician las marcas de vista/respuesta y el modal reaparece al destinatario. La aceptación o el rechazo también genera una notificación para el anfitrión.

## Presentaciones móviles y colaboración

La captura se decide por capacidad (`navigator.mediaDevices.getDisplayMedia`) y no por el nombre del navegador. En escritorios compatibles se abre siempre el selector protegido del sistema. Cuando un navegador móvil no expone esa API, la interfaz lo explica y ofrece la cámara trasera como presentación para documentos, pizarras o una pantalla física. Una aplicación web no puede concederse captura de otras aplicaciones ni inyectar clics o teclado en el sistema operativo; para control remoto nativo sería necesario desarrollar una app instalada con las APIs y permisos de iOS/Android.

Sobre cualquier presentación funciona una capa colaborativa normalizada y táctil. El presentador puede dibujar, elegir color y limpiar. Otro participante debe solicitar **Dibujar** o **Control guiado**; el presentador recibe un modal y puede autorizar o rechazar. El permiso dura solo durante esa presentación. Los clientes ignoran trazos, punteros, concesiones o limpiezas que no provengan del presentador o de un participante autorizado, y limitan frecuencia y tamaño para evitar abuso del canal Realtime.

Al abrir el centro de reuniones, el cliente precalienta un canal privado `user:<uuid>`. Esto inicia el WebSocket y permite que Realtime prepare su partición diaria antes de crear o entrar a una sala. Las suscripciones aplican `setAuth()` explícitamente, reintentos cortos ante errores transitorios como `MissingPartition` y Broadcast sin `ack`, ya que PostgreSQL confirma por separado las operaciones persistentes. La política delega su comprobación a `can_access_realtime_topic`, una función `security definer` que evita encadenar varias políticas RLS durante cada alta del canal.

## Retención del chat de reuniones

El chat existe solamente mientras la reunión está activa. `end_meeting` cambia el estado y elimina sus mensajes dentro de la misma transacción; las reacciones desaparecen mediante `ON DELETE CASCADE`. El esquema también limpia mensajes históricos de reuniones ya finalizadas cuando se vuelve a ejecutar. Los perfiles, participantes, reuniones y notificaciones no se eliminan con esta política.

Una reunión finalizada puede reiniciarse únicamente por su creador. El reinicio conserva sala, título, contraseña y código, pero elimina invitados, participantes anteriores, comandos y notificaciones de esa sesión; solamente el creador vuelve como anfitrión admitido. La canasta elimina definitivamente la sala cuando la usa el creador. Para otro participante, la misma acción solo retira la reunión finalizada de su historial personal y no borra el registro del anfitrión.

La creación del anfitrión utiliza una sola RPC: `create_meeting` devuelve también rol, admisión, ICE y mensajes iniciales. Cámara y micrófono pueden solicitar permiso tan pronto la RPC confirma la sala, mientras la señalización termina de conectarse en segundo plano.

## TURN efímero para redes móviles y NAT restrictivo

Supabase Realtime es señalización, no un relay multimedia TURN. El cliente invoca `turn-credentials`, que valida la cuenta, la reunión y la admisión antes de obtener credenciales temporales de Cloudflare TURN. Las credenciales largas permanecen en Supabase Vault y el navegador recibe únicamente las efímeras. Si la función no está desplegada, la sala muestra **WebRTC sin relay**.

Para más de 4–8 participantes, un mesh P2P multiplica carga de subida y CPU. Usa un SFU especializado para acercarte al comportamiento de Zoom en salas grandes.
