# Galaxy Macro Live

Este módulo vive dentro del lobby de **Reuniones**. Supabase conserva Auth, PostgreSQL y Realtime; `worker/index.js` mantiene el WebSocket de Trading Economics, sincroniza el calendario REST y escribe con una clave backend `sb_secret_*` (también se acepta la variable heredada `SUPABASE_SERVICE_ROLE_KEY`). El navegador nunca recibe las credenciales del proveedor ni la clave privilegiada.

## Despliegue

1. Ejecuta `supabase/migrations/202609070001_galaxy_macro_live.sql` en SQL Editor. `supabase/schema.sql` contiene el mismo bloque para instalaciones completas.
2. Crea un servicio always-on desde `worker/Dockerfile`.
3. Configura las variables de `worker/.env.example` en el gestor de secretos del servicio. Ninguna variable backend debe comenzar por `VITE_`.
4. Mantén una sola instancia activa. La deduplicación de payload protege reconexiones, pero una sola instancia evita evaluaciones simultáneas innecesarias.

Las claves reales no se guardan en ningún archivo que vaya a Git. El archivo `worker/.env.example` documenta exclusivamente los nombres que deben crearse en el panel **Environment / Secrets** del proveedor donde se despliegue el contenedor.

El primer arranque hace una precarga REST de Estados Unidos, descubre y guarda `ticker/symbol` cuando un alias exacto coincide, se conecta a `wss://stream.tradingeconomics.com/` y se suscribe a `calendar`. En los logs debe aparecer `Trading Economics stream connected and calendar subscribed.`; en la interfaz debe cambiar el estado a `FEED CONNECTED`. Los logs son JSON y eliminan campos cuyo nombre pueda contener secretos.

## Reconciliación y salud

El worker sincroniza por REST al arrancar, después de cada reconexión y cada cinco minutos. Así recupera releases ocurridos durante una caída y refresca Previous, Forecast, TEForecast, Importance, CalendarId, Ticker, Symbol y horario. El mensaje streaming tiene prioridad para `forecast_live`; el snapshot anterior queda en `forecast_pre_release`.

El backoff es 1, 2, 4, 8, 15 y 30 segundos. Si dejan de llegar keepalives durante el umbral configurado, el feed pasa a `STALE DATA`, se cierra el socket y se reconecta. La UI nunca presenta `LIVE` con el feed desconectado o stale.

## Simulación sin producción

El simulador `worker/simulate-release.js` ejecuta solamente la función pura `evaluateMacroRelease`. No crea un cliente Supabase, no escribe en producción y no alimenta la interfaz. Permanece disponible como herramienta interna de pruebas hasta activar el proveedor real.

Para backtesting, importa `evaluateMacroRelease` desde `worker/macro/engine.js` y proporciona componentes históricos normalizados junto con una copia del registry. La señal no usa LLM ni sustituye consenso con TEForecast.

## Seguridad y operación

- Rota inmediatamente cualquier clave `sb_secret_*` o `service_role` que llegue a un chat, log, captura o variable pública.
- El worker debe ejecutarse en un proveedor con reinicio automático y almacenamiento de secretos.
- Los usuarios normales no tienen permisos de escritura sobre tablas macro ni lectura sobre raw events/configuración.
- El panel administrativo permite editar pesos, thresholds, aliases, requeridos y ventanas. El worker recarga las ventanas en la siguiente sincronización REST.
- Trading Economics requiere una suscripción con acceso a Calendar Streaming y REST; sin credenciales reales la conexión no puede validarse contra el proveedor.

Fuentes de protocolo: [Economic Calendar Streaming](https://docs.tradingeconomics.com/economic_calendar/streaming/), [Economic Calendar Snapshot](https://docs.tradingeconomics.com/economic_calendar/snapshot/) y [Calendar response fields](https://docs.tradingeconomics.com/economic_calendar/schema/).

El estado exacto y los únicos pasos pendientes de activación se conservan en `docs/GALAXY_MACRO_LIVE_STATUS.md`.
