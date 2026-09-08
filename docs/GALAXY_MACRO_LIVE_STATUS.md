# Estado de Galaxy Macro Live

Última actualización: 2026-09-07

## Estado actual

`IMPLEMENTED_INACTIVE`

El módulo, la migración, los seis motores deterministas, Supabase Realtime, la interfaz y el worker están implementados. La integración de producción permanece deliberadamente inactiva hasta disponer de una licencia de Trading Economics. En este estado la interfaz debe indicar `DISCONNECTED` y nunca generar una señal con datos simulados.

El simulador es exclusivamente una herramienta interna de pruebas: no se conecta a Supabase, no escribe registros y no alimenta la interfaz de producción.

## Pendiente para activarlo en el futuro

No es necesario modificar el código de la aplicación. Solamente se debe completar la infraestructura siguiente:

1. Confirmar que `supabase/migrations/202609070001_galaxy_macro_live.sql` fue ejecutada una vez en el proyecto Supabase existente.
2. Contratar acceso de Trading Economics que incluya Economic Calendar REST y Calendar Streaming.
3. Crear una **nueva** Secret key de Supabase para el worker. No reutilizar ninguna clave que haya sido compartida previamente por chat.
4. Desplegar una sola instancia always-on usando `worker/Dockerfile`.
5. Crear estas variables en el gestor **Environment / Secrets** del proveedor de alojamiento:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `TRADING_ECONOMICS_CLIENT_KEY`
   - `TRADING_ECONOMICS_CLIENT_SECRET`
6. Verificar que la salud cambie a `FEED CONNECTED`, que se carguen próximos eventos reales y que Realtime actualice la interfaz sin refrescarla.

## Reglas de seguridad para la activación

- No escribir valores reales en `.env.example`, `worker/.env.example`, `src/runtime-config.js`, `schema.sql` ni archivos versionados.
- No crear variables backend con prefijo `VITE_`.
- No enviar Secret keys por chat, correo, capturas o URLs.
- Si una clave fue compartida, eliminarla y crear otra antes de desplegar.
- Sin `Forecast` de consenso válido, el motor debe conservar `NO_SIGNAL / MISSING_FORECAST`.

## Referencias preparadas

- Plantilla de nombres: `worker/.env.example`
- Contenedor del worker: `worker/Dockerfile`
- Migración incremental: `supabase/migrations/202609070001_galaxy_macro_live.sql`
- Esquema consolidado: `supabase/schema.sql`
- Operación completa: `docs/GALAXY_MACRO_LIVE.md`
