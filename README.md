# Project Galaxy

An original, black-and-violet digital ecosystem prototype with a modular Google Apps Script backend.

## Run locally

```bash
npm install
npm run dev
```

También puede abrirse directamente con **Open Live Server** sobre el `index.html` de la raíz. Este archivo dirige a la compilación estática incluida en `dist/`.

Para comprobar localmente el mismo comportamiento sin la extensión:

```bash
npm run serve-root
```

Authentication is remote-only and uses the Apps Script Web App configured in `src/runtime-config.js`. If that URL is absent, authentication fails closed instead of storing local users. See [architecture](docs/ARCHITECTURE.md) and [deployment](docs/DEPLOYMENT.md).

Real multi-account audio meetings use the Apps Script HTTP signaling fallback when `SIGNALING_URL` is empty. Presence, voice meters, host controls, chat, reactions and optional WebSocket deployment are documented in [realtime meetings](docs/REALTIME.md).

## Single-file Apps Script backend

Deploy only `apps-script/Code.gs`. It contains all 18 backend modules in one file. Do not upload `backend-src/*.js` to Apps Script; those files are the maintainable source used to regenerate `Code.gs`:

```bash
npm run build:apps-script
```

Performance changes and measurements are documented in [performance report](docs/PERFORMANCE.md).

## Verification

```bash
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
npm run visual-check
```

Después de modificar el código fuente, ejecuta `npm run build` antes de usar Live Server o publicar el branch. La compilación usa rutas relativas, por lo que funciona en GitHub Pages aunque el proyecto se publique bajo `/nombre-del-repositorio/`.

## GitHub Pages desde main

1. Sube la raíz completa, incluyendo `dist/` y `.nojekyll`.
2. En **Settings → Pages**, selecciona **Deploy from a branch**.
3. Selecciona `main` y la carpeta `/(root)`.

GitHub abrirá el `index.html` raíz y cargará `dist/index.html`. No es necesario modificar rutas con el nombre del repositorio.

## Honest integration status

- Browser camera, microphone and screen capture call native media APIs.
- Custom-area sharing performs real canvas cropping and returns a processed `MediaStream` track.
- Small-room WebRTC signaling works through Apps Script. Restrictive networks may still require TURN, and larger rooms require an SFU.
- TRC20/ERC20 payments fail closed until a reviewed provider adapter, token contract, destination and webhook verifier are configured.
- No private keys, seed phrases or frontend secrets are stored.
