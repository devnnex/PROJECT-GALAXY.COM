# Reuniones en tiempo real

Cada usuario admitido abre el canal privado `meeting:<uuid>`. Las políticas sobre `realtime.messages` verifican que `auth.uid()` tenga un registro `ADMITTED` antes de permitir recibir o emitir Broadcast/Presence.

El canal transporta ofertas, respuestas e ICE de WebRTC, estado de micrófono/cámara, mano levantada, reacciones, chat y moderación. Los mensajes también se escriben en PostgreSQL para recuperar historial tras recargar. La sala de espera escucha cambios autorizados de `meeting_participants` y conserva un refresco lento como recuperación.

## TURN no viene incluido

Supabase Realtime es señalización, no un relay multimedia TURN. STUN permite descubrir rutas directas, pero ciertos NAT, firewalls corporativos y redes móviles exigen TURN. Alternativas con capa gratuita o bajo costo cambian con el tiempo; evalúa un servicio administrado con credenciales efímeras o despliega coturn en una VM. Nunca guardes una contraseña TURN permanente en `runtime-config.js`.

Para más de 4–8 participantes, un mesh P2P multiplica carga de subida y CPU. Usa un SFU especializado para acercarte al comportamiento de Zoom en salas grandes.
