# Telegram de Black Galaxy Trade

La integración usa la Bot API oficial y envío normal, con `allow_paid_broadcast: false`. Telegram no cobra por estos envíos dentro de sus límites; Supabase conserva sus cuotas de base de datos y funciones. No se usa un servicio de WhatsApp ni un proveedor de pago.

## Activación

1. Crear un bot con `/newbot` en @BotFather. Usar `/setuserpic` para asignarle `public/galaxy-notification.png` como imagen.
2. Añadirlo al grupo existente. Debe poder enviar mensajes; en un canal necesita permiso para publicar como administrador. No necesita leer todas las conversaciones ni desactivar la privacidad.
3. Guardar únicamente el token en `../.tools/telegram-bot-token.txt`, fuera del checkout. No subirlo a Git ni pegarlo en el chat.
4. Enviar `/start@usuario_del_bot` en el grupo para identificar el destino mediante `getUpdates`.
5. Ejecutar `node scripts/activate-scanner-telegram.mjs --enable`. Con varios destinos, indicar `--chat-id ID`. Opcionalmente usar `--token-file RUTA`.

El script comprueba el bot y el grupo con operaciones de lectura, instala solo esta migración y función, y configura secretos de servidor y Vault. No publica mensajes de prueba. La activación captura eventos posteriores; no reenvía señales antiguas. El token nunca forma parte del frontend, Git ni los argumentos del proceso. Los archivos de configuración temporales se retiran al terminar.

Para detener los envíos: `update public.scanner_telegram_settings set enabled=false where id;`. No afecta las señales ni las notificaciones de Galaxy. Aplicar la migración por sí sola instala la integración desactivada.

## Señales y reportes

Un trigger sobre `scanner_events` crea un único trabajo por evento canónico: entrada, TP1, TP2, TP3 y SL. El número de miembros conectados y las limpiezas del centro de notificaciones no cambian la cantidad de mensajes. Entrada, SL y los tres objetivos coinciden con el evento del scanner. Se respeta «SL tras TP · sin descuento».

El despacho se solicita al crear el evento, en la misma transacción que los avisos de Galaxy y Push. `pg_net` realiza el HTTP después del commit. El debounce dura un segundo y la recuperación revisa pendientes cada segundo: evita que un worker ya vacío deje bloqueado el próximo aviso durante 25 segundos. Los eventos tienen prioridad sobre reportes y fotos programadas; se conserva la separación de 3,1 segundos para respetar el límite oficial de 20 mensajes/minuto por grupo y se respeta `retry_after`. Telegram no bloquea el envío Push de Galaxy. Una llegada idéntica al milisegundo no puede garantizarse entre transportes distintos.

Los reportes se generan los lunes a las 08:00 y el día 1 a las 08:00, zona `America/Bogota`. El cron horario también recupera el reporte de la frontera vigente tras un fallo, con clave única por período. Semanal: lunes a domingo anterior; mensual: mes calendario anterior, incluyendo cambios de año. El primer reporte corresponde a una fecha programada posterior a la activación.

Cada reporte destaca la efectividad hist?rica, su muestra evaluada, los TP alcanzados y la mejor jornada, con un formato breve de PROJECT GALAXY. La efectividad usa `WIN / (WIN + SL)` y excluye no consideradas/abiertas. La mejor jornada muestra fecha, porcentaje y muestra; empates favorecen mayor muestra y luego fecha m?s antigua. Un per?odo sin resultados evaluables lo indica sin inventar una tasa.

Los resultados corresponden a señales **emitidas** en el período, con su estado registrado al corte; una operación todavía abierta puede evolucionar después. Los reportes ya enviados son snapshots. No se mezclan con recuentos de eventos TP ocurridos en el período sobre señales de otros días.

La simulación muestra salidas fijas TP1/TP2/TP3 con 0,10 lotes y 100 oz/lote (USD 50 por movimiento favorable de USD 5). Usa los agregados del simulador: objetivo no alcanzado sin ganancia; SL tras un TP previo sin descuento; SL inicial descontado. Sin costos ni promesas de rentabilidad. Solo se leen 7/31 filas diarias compartidas, sin reconstruir el historial por visitante.

## Fiabilidad y límites

Cola privada con RLS y RPC solo para `service_role`, leases de 60 segundos y confirmaciones ligadas al token del lease. La clave única evita duplicados por inserciones repetidas; trabajadores concurrentes no reclaman el mismo trabajo. La cadencia global de 3,1 segundos respeta el límite normal de un grupo. Se respeta `retry_after` y se reintentan fallos transitorios con backoff, hasta ocho intentos. Errores de permisos/destino se conservan como fallidos. Avisos con más de cinco minutos pendientes expiran para evitar entradas tardías; reportes expiran a los dos días.

Telegram no ofrece clave de idempotencia para `sendMessage`: si acepta un envío y se pierde su respuesta o la confirmación de base de datos, un reintento puede duplicarlo. No se promete entrega exactamente una vez ni simultaneidad absoluta entre Telegram y Push. La cola conserva estado y códigos, nunca tokens ni contenidos del grupo en logs. Los metadatos de trabajos finalizados se limpian a los 45 días; el registro canónico de operaciones se conserva.

Fuentes: https://core.telegram.org/bots/api#sendmessage y https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this

## Evidencia visual puntual

Los trabajos privados `PHOTO` reutilizan `next_attempt_at` y el dispatcher existente; las se?ales conservan prioridad. La imagen PNG se descarga del bucket privado `telegram-evidence`, se env?a con su explicaci?n y se retira tras confirmar la entrega. El texto admite hasta 1024 caracteres. No se a?ade otro cron ni almacenamiento p?blico; im?genes, credenciales y herramientas privadas de env?o puntual quedan fuera de Git.
