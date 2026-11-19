# Continuidad de reuniones y navegación móvil

El audio remoto vive en un portal directo a `document.body`, fuera de la sección que Galaxy oculta al navegar. Cambiar de sección no desmonta ni oculta los elementos de reproducción. Los eventos de pista nueva, reactivación, pausa, visibilidad y retorno recuperan la reproducción; respuestas antiguas de `play()` no sustituyen el estado del intento vigente. Un bloqueo de autoplay conserva el botón para activar sonido.

El transporte mantiene la voz procesada en primer plano y selecciona la captura original cuando la pestaña está oculta o el `AudioContext` está suspendido/interrumpido. La selección también se aplica al entrar, cambiar de dispositivo y terminar de compartir pantalla. Un cambio de estado del procesador recupera la pista adecuada, sin depender solo de `visibilitychange`. La comprobación periódica es local y no consulta Supabase. Los mute voluntarios y los del anfitrión se copian a la captura original; nunca se vuelve a habilitar un micrófono silenciado por una recuperación.

El mezclador de pantalla mantiene como alternativa la captura original de micrófono, independiente de Web Audio. En navegadores que exponen Audio Session se solicita `play-and-record` durante la reunión y se restaura el tipo anterior al terminar.

La ausencia temporal de Presence no cierra un WebRTC conectado. Se vuelve a comprobar a los 15 segundos hasta que la presencia vuelve o el transporte deja de estar conectado; la salida real, el reemplazo de sesión, la moderación y el cierre de la reunión conservan sus controles. No se agregan broadcasts de heartbeat por participante.

El menú móvil conserva su diseño y portal fuera de contenedores. Un controlador de Visual Viewport corrige el desfase medido al moverse la barra del navegador, con un máximo de una actualización por frame y sin estado React ni red. No acumula traslaciones, restaura el comportamiento nativo al ampliar con zoom y elimina sus listeners al desmontar.

Validación: pruebas de selección/recuperación/mute y sesiones de audio; regresiones de Presence con temporizadores; geometría con scroll, cambio de tamaño y barras móviles en Chromium y WebKit. Prueba WebRTC local con dos receptores simultáneos, navegación interna, otra pestaña y suspensión/recuperación del procesador. El WebKit disponible en Windows no expone WebRTC/Web Audio, por lo que sus comprobaciones cubren la navegación y se requiere un dispositivo Apple real para confirmar audio en Safari/iOS.

No existe una garantía web absoluta contra una suspensión impuesta por iOS/Android, cierre del navegador, pérdida de red, permisos revocados o una llamada que tome el dispositivo de audio. Estos cambios corrigen interrupciones controladas por la aplicación y recuperan el audio cuando el navegador lo permite. No se solicita captura nueva sin la autorización existente del usuario.

Referencias: https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/state y https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
