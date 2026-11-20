# Galaxy Aurum Bot · M5

Segunda estrategia de Black Galaxy Trade, aprobada como adaptación del EA `XAUUSD_Ruptura_Rangos_M1_M5_777` v1.12 sobre el feed gratuito actual. Opus 5.5 conserva su motor, historial, TP y criterio de efectividad. La nueva estrategia tiene tablas, estado, eventos y agregados propios.

## Reglas

- M5; canal de 20 velas completas anteriores a la vela de señal. La vela de señal se excluye del canal.
- BUY cuando el cierre supera el techo más $0,05; SELL cuando cae por debajo del suelo menos $0,05. No se aplica filtro de altura de rango, igual que el parámetro cero del archivo.
- Entrada en la vela siguiente, antes de sus primeros 20 segundos, con cotización reciente y todavía al otro lado de la ruptura. Una muestra o recepción tardía no genera una entrada atrasada.
- Una posición por esta estrategia. No se limita ni sustituye una operación de Opus.
- SL inicial a $10, redondeado por dirección a $0,01. El SL pasa a positivo solo desde +$10 de movimiento favorable; trailing a $5 del precio, mejorando al menos $0,10. Nunca retrocede.
- No hay TP1/TP2/TP3 ni cierre obligatorio a +$15. Se publica la entrada, un único aviso breve de beneficio protegido y el cierre. Los siguientes ajustes del trailing no generan mensajes.

El SL Profit se evalúa al nivel protegido de la señal: BUY con SL por encima de entrada o SELL con SL por debajo de entrada cuenta como WIN, incluso con protección mínima. Se conservan `observedExit` y `observedNet` para distinguir la siguiente muestra del precio frente al resultado teórico de la señal (`accountingBasis: STOP_LEVEL`); no se afirma una ejecución de broker. Los cierres exactamente en la entrada son BE excluidos; los negativos sin SL Profit son pérdidas. La migración reconcilia también los SL Profit anteriores de la regla de $5 y sus agregados, sin reenviar señales.

No abre órdenes. Volumen, patrimonio, margen, spread, permisos, filling y reintentos de broker del EA no pueden reproducirse sin una cuenta y su bid/ask. La adaptación usa Gold API cada 30 segundos; por eso sus velas, entradas y stops pueden diferir de MT5. El usuario eligió explícitamente esta modalidad sin PC conectado.

## Preparación y continuidad

Se reúne historial observado: 20 velas de rango más una vela de señal. La primera vela incompleta se descarta; no se gastan más consultas OHLC ni se publican entradas históricas. La preparación requiere aproximadamente 105 minutos de velas continuas, más la parte restante de una primera vela incompleta. Un hueco de más de 60 segundos reinicia el canal, conservando el seguimiento de la posición existente y los resultados registrados.

El servidor comparte la cotización que ya obtiene Opus; no existe otro cron ni petición al proveedor por visitante. El estado de Ruptura tiene lease propio y confirmación atómica. Su fallo no revierte la transacción de Opus. Los agregados diarios se actualizan incrementalmente; las visitas consultan resúmenes y las listas recientes. El análisis completo solo se pide al abrirlo o cambiar su revisión; editar las fechas no consulta la base de datos.

## Estadísticas

Aurum: **WIN / (WIN + SL)**. Los BE exactos y las abiertas quedan fuera del porcentaje y los BE tienen su categoría de excluidas. Opus conserva su regla de SL tras TP. No se combinan porcentajes ni historiales. La misma fórmula se aplica al resumen, análisis, mejores períodos y reportes de Telegram. Los períodos se calculan en `America/Bogota` según fecha de entrada.

## Telegram e imágenes

Cada mensaje identifica su estrategia. Opus conserva los banners BUY/SELL; Aurum usa su propio robot dorado y nombre visible, con caché independiente `AURUM`. Las entradas indican dirección, entrada y SL. El aviso de protección indica el nuevo SL y avance protegido; los cierres indican SL Profit o pérdida. Los avisos de seguimiento usan texto breve, sin imágenes repetidas por ajuste.

Las ilustraciones de `assets/telegram` se generan una vez, se guardan en almacenamiento privado y se reutiliza el `file_id` de Telegram después del primer envío confirmado, como recomienda la [Bot API oficial](https://core.telegram.org/bots/api#sending-files). Los reportes semanales/mensuales de cada estrategia conservan su clave de deduplicación y horario: lunes/día 1, 08:00 Bogotá. Incluyen imagen PNG de sus datos y explicación centrada en efectividad. No se usa generación de IA por envío, navegador externo ni servicio de screenshots. El renderizado utiliza el patrón de [OG images de Supabase](https://supabase.com/docs/guides/functions/examples/og-image).

Las imágenes de reporte se generan en memoria; las dos ilustraciones estáticas se conservan para reutilizarlas. No se activan paid broadcasts. Esto evita servicios de pago adicionales; no elimina las cuotas del alojamiento o los límites de la Bot API.

## Actualización

Para una instalación ya configurada, ejecutar `node scripts/update-trade-delivery.mjs`. Aplica la migración de controles/latencia, prepara la imagen privada de Aurum y despliega `scanner-signals` y `scanner-telegram`. Con `--correct-history` corrige los mensajes existentes de cierres SL Profit; no envía mensajes nuevos. Publicar después el frontend mediante el workflow existente.

Solo `elkin56ty@gmail.com`, con rol ADMIN activo, recibe los interruptores dentro de Black Galaxy Trade. Las RPC vuelven a validar esa identidad contra Auth. Cada interruptor cambia `signals_enabled`: pausa entradas y consume candidatos pendientes; conserva el feed, historial y seguimiento de operaciones abiertas. La publicación se serializa con el cambio para impedir entradas que estuvieran calculándose al pausar.
