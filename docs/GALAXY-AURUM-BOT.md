# Galaxy Aurum Bot · M5

Segunda estrategia de Black Galaxy Trade, aprobada como adaptación del EA `XAUUSD_Ruptura_Rangos_M1_M5_777` v1.12 sobre el feed gratuito actual. Opus 5.5 conserva su motor, historial, TP y criterio de efectividad. La nueva estrategia tiene tablas, estado, eventos y agregados propios.

## Reglas

- M5; canal de 20 velas completas anteriores a la vela de señal. La vela de señal se excluye del canal.
- BUY cuando el cierre supera el techo más $0,05; SELL cuando cae por debajo del suelo menos $0,05. No se aplica filtro de altura de rango, igual que el parámetro cero del archivo.
- Entrada en la vela siguiente, antes de sus primeros 20 segundos, con cotización reciente y todavía al otro lado de la ruptura. Una muestra o recepción tardía no genera una entrada atrasada.
- Una posición por esta estrategia. No se limita ni sustituye una operación de Opus.
- SL inicial a $10, redondeado por dirección a $0,01. BE desde avance de $5; trailing a $5 del precio, mejorando al menos $0,10 con la tolerancia del archivo. Nunca retrocede.
- No hay TP1/TP2/TP3 ni cierre obligatorio a +$15. Los eventos publicados son entrada, activación de BE y cierre. El SL vigente se actualiza en Galaxy sin enviar un mensaje por cada pequeño ajuste.

El precio de entrada/salida es la muestra observada. Una muestra que salta el SL no se convierte artificialmente en un fill a ese SL. El resultado cerrado puede ser positivo, negativo o cero; activar BE no garantiza un cierre sin pérdida ante un salto. No se acreditan mechas ni recorridos no observados.

No abre órdenes. Volumen, patrimonio, margen, spread, permisos, filling y reintentos de broker del EA no pueden reproducirse sin una cuenta y su bid/ask. La adaptación usa Gold API cada 30 segundos; por eso sus velas, entradas y stops pueden diferir de MT5. El usuario eligió explícitamente esta modalidad sin PC conectado.

## Preparación y continuidad

Se reúne historial observado: 20 velas de rango más una vela de señal. La primera vela incompleta se descarta; no se gastan más consultas OHLC ni se publican entradas históricas. La preparación requiere aproximadamente 105 minutos de velas continuas, más la parte restante de una primera vela incompleta. Un hueco de más de 60 segundos reinicia el canal, conservando el seguimiento de la posición existente y los resultados registrados.

El servidor comparte la cotización que ya obtiene Opus; no existe otro cron ni petición al proveedor por visitante. El estado de Ruptura tiene lease propio y confirmación atómica. Su fallo no revierte la transacción de Opus. Los agregados diarios se actualizan incrementalmente; las visitas consultan resúmenes y las listas recientes. El análisis completo solo se pide al abrirlo o cambiar su revisión; editar las fechas no consulta la base de datos.

## Estadísticas

Ruptura: **positivas / (positivas + SL + BE)**. Los BE cuentan como evaluados con resultado cero; las abiertas quedan fuera. Opus conserva **WIN / (WIN + SL)** y su regla de SL tras TP. No se combinan porcentajes ni historiales de ambos motores. Se muestran muestra, mejores/menores años, meses y días, agrupación mensual/anual y filtro de fechas. Los empates priorizan mayor muestra y luego fecha más antigua. Los períodos se calculan en `America/Bogota` según fecha de entrada.

## Telegram e imágenes

Cada mensaje identifica `💎 OPUS 5.5 · M5` o `💠 GALAXY AURUM BOT · M5`. Las nuevas entradas de ambas estrategias incluyen el banner galáctico BUY/SELL y sus propios niveles. Los avisos de seguimiento son texto para conservar rapidez y evitar imágenes repetidas en cada ajuste.

Las ilustraciones de `assets/telegram` se generan una vez, se guardan en almacenamiento privado y se reutiliza el `file_id` de Telegram después del primer envío confirmado, como recomienda la [Bot API oficial](https://core.telegram.org/bots/api#sending-files). Los reportes semanales/mensuales de cada estrategia conservan su clave de deduplicación y horario: lunes/día 1, 08:00 Bogotá. Incluyen imagen PNG de sus datos y explicación centrada en efectividad. No se usa generación de IA por envío, navegador externo ni servicio de screenshots. El renderizado utiliza el patrón de [OG images de Supabase](https://supabase.com/docs/guides/functions/examples/og-image).

Las imágenes de reporte se generan en memoria; las dos ilustraciones estáticas se conservan para reutilizarlas. No se activan paid broadcasts. Esto evita servicios de pago adicionales; no elimina las cuotas del alojamiento o los límites de la Bot API.

## Actualización

Con la CLI autenticada en el proyecto configurado, ejecutar `node scripts/update-range-strategy.mjs --enable`. El script aplica únicamente la nueva migración, prepara las ilustraciones privadas, despliega `scanner-signals` y `scanner-telegram` y comprueba el renderizador en la Edge Function antes de activar Ruptura. No publica señales sintéticas ni reinicia Opus. Después publicar el frontend mediante el workflow existente.

Sin `--enable` prepara los recursos y conserva el estado actual. Pausar Ruptura: `update public.range_scanner_state set enabled=false where id;`. Los activadores de Telegram y la actualización habitual del scanner reaplican la integración nueva después de las migraciones anteriores para mantener la elegibilidad Push y los reportes de ambas estrategias.
