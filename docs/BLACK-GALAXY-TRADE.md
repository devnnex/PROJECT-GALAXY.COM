# Black Galaxy Trade

Scanner de servidor para XAUUSD en 5 minutos. Funciona en Supabase, sin alertas de TradingView ni un PC conectado. La interfaz reutiliza el acceso y las notificaciones privadas de Galaxy. No abre órdenes en un broker.

## Cálculo y registro

El motor conserva las fórmulas originales: HL2, ATR de Wilder de 10 períodos, multiplicador 3 y condiciones BUY/SELL del SuperTrend. La primera señal observada se retiene inmediatamente: no espera el cierre de la vela. Entrada, SL inicial y TP1/TP2/TP3 quedan fijos. El tamaño de pip es 0.01 y el paso es 500 pips, como en el indicador entregado.

- Cada TP se registra y notifica una sola vez, en su precio exacto.
- Un SL inicial antes de cualquier TP cierra como pérdida e impide TP posteriores.
- Si ya hubo un TP y después se toca el SL, se informa el toque como «SL tras TP · sin descuento»: conserva el resultado ganador, sin pérdida descontada.
- TP3 termina la operación. Un SL posterior ya no se registra para ella.
- Una señal opuesta sin TP ni SL sustituye la anterior sin resultado, excluida de la efectividad.
- Efectividad = ganadas cerradas / (ganadas cerradas + SL). Las operaciones abiertas y las descartadas no entran en ese porcentaje.
- Las sumas de distancias de TP conservan la regla anterior; no representan rentabilidad de una cuenta ni cierres parciales reales.

Los resultados empiezan al activar este servicio. El histórico descargado solo prepara ATR y bandas; no se publica como si fueran operaciones reales anteriores. La interfaz muestra las 40 operaciones más recientes y los totales de todo el registro del servidor. Una señal pendiente puede alcanzar TP1/TP2 antes de cerrar: sus objetivos aparecen marcados mientras sigue en seguimiento.

## Fuente gratuita y precisión

Se usa [Gold API](https://gold-api.com/faqs), oro spot XAU expresado en USD. El precio actual no requiere clave; para OHLC se necesita una clave gratuita en el secreto de Supabase `GOLD_API_KEY`. La [tarifa gratuita](https://gold-api.com/pricing) permite diez consultas históricas por hora. La carga inicial usa nueve velas completas y el OHLC de la vela actual para preparar ATR(10), evitando esperar 50–55 minutos reuniendo cotizaciones.

El estado y la cuota consumida se guardan en PostgreSQL. Un reinicio normal reutiliza ese estado. La carga histórica se repite solo si falta estado o se detectan velas perdidas; si ya se consumió la cuota gratuita, queda pendiente de recuperación sin inventar velas ni contratar un plan de pago.

**No es una copia exacta del feed de TradingView.** La fuente gratuita publica una muestra cada 30 segundos. Puede omitir una mecha que toque un nivel y regrese entre dos muestras. Otra fuente, la cantidad de histórico inicial y los precios de cada broker también pueden modificar ATR, bandas y señales. El código no acredita objetivos ni pérdidas que no haya observado. Para coincidencia tick a tick haría falta la misma fuente y el mismo histórico de TradingView. No hay una promesa de esa equivalencia con este plan gratuito.

Los precios vencidos, futuros, mal formados o fuera de orden se rechazan. Las invocaciones se coordinan mediante un lease; estado, operaciones, eventos y cola de avisos se confirman en una sola transacción. Los eventos y señales tienen claves únicas para evitar duplicados.

## Notificaciones y sonido

Se envían avisos de BUY, SELL, TP1, TP2, TP3 y toque del SL a las cuentas registradas activas según las reglas de acceso existentes. Invitados y cuentas suspendidas quedan excluidos; la elegibilidad se comprueba también al enviar trabajos pendientes. Los avisos de trading que llevan más de cinco minutos sin enviarse no se entregan como si fueran actuales.

En Galaxy abierto, toca **Activar sonido** dentro de Black Galaxy Trade. Se reproduce una confirmación y se recuerda la preferencia en ese dispositivo. Señal, TP y SL tienen tonos distintos. El navegador puede exigir una nueva interacción para reanudar el audio tras abrir la app: [política de reproducción](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

Con la app cerrada se reutiliza Web Push, con icono, vibración y solicitud de sonido nativo. Permisos, volumen, modo silencio y concentración dependen del teléfono/sistema operativo. La web no puede imponer un sonido personalizado ni anular esos ajustes: [opciones de notificación](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification). En iPhone se necesita la PWA instalada y permiso de notificaciones, como en el sistema existente.

## Despliegue

1. Iniciar sesión con el Supabase CLI en la cuenta administradora del proyecto Galaxy `xdsqtuubsptpzwadecha`.
2. Guardar la clave gratuita de Gold API en **Edge Functions → Secrets**, nombre `GOLD_API_KEY`.
3. Ejecutar `ACTIVAR-SCANNER.ps1`, o `node scripts/activate-scanner.mjs --enable`. Sin `--enable` prepara y comprueba el servidor sin activar un stream nuevo.
4. Publicar el frontend mediante el workflow de GitHub Pages existente.

El activador aplica únicamente la migración nueva, configura un secreto de comunicación privado, despliega `scanner-signals` y comprueba una cotización real desde Supabase. No modifica claves VAPID, mensajes, reuniones ni pagos. Los secretos temporales se crean fuera del repositorio y se eliminan al terminar. No se envían avisos sintéticos a miembros para probar el servicio.

## Operación

Consulta administrativa, sin exponer secretos:

```sql
select enabled, provider, tracking_started_at, updated_at, last_error,
       runtime->'lastQuoteAt' as last_quote_at
from public.scanner_streams where id='xauusd-5m';

select side,status,outcome,created_at from public.scanner_trades order by created_at desc limit 20;
```

Pausar el análisis conserva todo el historial:

```sql
update public.scanner_streams set enabled=false where id='xauusd-5m';
```

Los parámetros se conservan fijos en esta entrega. Cambiar proveedor, temporalidad o parámetros mientras existen operaciones abiertas requiere una migración deliberada del estado; no se debe editar el JSON de configuración a mitad de una operación.

## Verificación

Las pruebas cubren fórmulas ATR/RMA y bandas anteriores, señales intravela, precios fijos, el retroceso BUY de la captura que no debía marcar SL, objetivos múltiples, cortos/largos, operaciones descartadas, duplicados, cronología, cuotas gratuitas, precios vencidos, transacciones, destinatarios, permisos y sonido. Se revisó el componente en Chromium a 1440 y 390 píxeles, incluyendo filtros, activación del audio, avisos y ausencia de desbordamientos. Los datos de esa prueba visual son locales y no forman parte del historial publicado.
