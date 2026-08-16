# Despliegue

## Supabase

1. Ejecuta `supabase/schema.sql` en SQL Editor. La transacción crea extensiones, tablas, índices, triggers, RPC, RLS, políticas Realtime y publicación de cambios.
2. En **Authentication → URL Configuration**, configura tanto `Site URL` como la única `Redirect URL` con `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html`.
3. En Realtime Settings desactiva **Allow public access**; los canales del cliente son privados y usan las políticas del SQL.
4. Crea dos cuentas de prueba y valida creación, sala de espera, admisión, mensajes y reacciones desde dos navegadores.
5. No desactives RLS y no publiques una clave `service_role`.

Para cambiar ICE, actualiza únicamente el valor JSON de `ice_servers`:

```sql
update public.app_settings
set value = '[{"urls":"stun:stun.l.google.com:19302"}]'::jsonb,
    updated_at = now()
where key = 'ice_servers';
```

Las credenciales TURN estáticas quedan expuestas a cualquier miembro admitido. En producción emite credenciales efímeras desde una Supabase Edge Function o desde el proveedor TURN.

## GitHub Pages de producción

`src/runtime-config.js` ya contiene la URL del proyecto y la anon key pública. El workflow `.github/workflows/deploy-pages.yml` ejecuta instalación bloqueada, pruebas y compilación. El artefacto público contiene únicamente el acceso raíz y la aplicación compilada bajo `dist/`; no publica código fuente, SQL ni archivos internos.

En GitHub abre **Settings → Pages → Build and deployment → Source** y selecciona **GitHub Actions**. Cada push a `main` desplegará después de aprobar todas las pruebas. La URL canónica será `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html`; la raíz redirige allí conservando parámetros de invitación y autenticación.

No agregues URLs locales, comodines ni dominios de preview a Supabase Auth para este despliegue. Si posteriormente conectas un dominio propio, cambia `Site URL`, la Redirect URL y `base` en `vite.config.js` antes de publicar.
