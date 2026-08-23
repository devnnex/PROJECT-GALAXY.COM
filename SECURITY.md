# Seguridad

## Reportar una vulnerabilidad

No publiques detalles explotables en un issue. Utiliza **Security → Report a vulnerability** en GitHub para abrir un reporte privado con impacto, pasos de reproducción y evidencia mínima.

## Modelo de seguridad

- El navegador y su contenido son un entorno público. La URL y la clave `anon` identifican el proyecto, pero no conceden privilegios elevados.
- Toda autorización de datos se decide en PostgreSQL mediante grants, RLS y RPC autenticadas.
- Nunca se admite una clave `service_role`, `sb_secret_*`, contraseña de base de datos o secreto TURN permanente en el cliente.
- El artefacto de producción está minificado, no contiene sourcemaps y aplica una CSP restrictiva.
- Dependabot, pruebas de seguridad, auditoría del build y CodeQL se ejecutan de forma continua.

## Límites del alojamiento actual

GitHub Pages entrega archivos estáticos públicos y no permite definir todos los encabezados HTTP por repositorio. La CSP se aplica mediante `<meta>`, pero `frame-ancestors` requiere un encabezado HTTP. Para protección completa contra clickjacking, coloca el sitio detrás de Cloudflare u otro hosting que permita `Content-Security-Policy: frame-ancestors 'none'` y `Permissions-Policy`.
