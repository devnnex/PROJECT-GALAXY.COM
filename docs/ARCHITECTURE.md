# Project Galaxy — Architecture

## Product boundaries

The platform is split into replaceable layers:

1. **Web client** — React/Vite, responsive shell, progressive enhancement and media capture.
2. **Business API** — Google Apps Script routes requests, validates sessions and permissions, and orchestrates Sheets.
3. **Data** — Google Sheets is the initial structured store. Files belong in object/Drive storage, never cells.
4. **Real time** — WebRTC with authenticated Apps Script polling by default; an optional WebSocket transport reduces signaling latency. TURN/SFU remain external requirements when network topology or room size demands them.
5. **Payments** — `CryptoPaymentProvider` adapters verify TRC20/ERC20 through a configured provider or trusted RPC/indexer. The UI cannot confirm money.

## Frontend structure

- `src/config.js`: replaceable brand and feature configuration.
- `src/services/api.js`: remote-only API boundary for Apps Script authentication and data.
- `src/App.jsx`: route state and global command/navigation surfaces.
- `src/components`: reusable UI and media workflows.
- `src/pages`: feature pages; heavy media code is isolated for later lazy loading.

## Data model

Every table has an opaque ID, ISO timestamps and a schema version. Financial records are append-oriented. Important relations:

- User → Sessions / Profile / Wallet / Orders / AccessGrants
- Product → Seller(User) / Reviews / OrderItems
- Order → OrderItems / Payment / Commission / AccessGrant
- Meeting → MeetingParticipants
- Post → Comments / Likes

The complete sheet registry and headers live in the `Config` section of `apps-script/Code.gs` (maintained from `backend-src/Config.js`). The first Web App request creates or migrates the database automatically. A schema fingerprint triggers later migrations that add missing sheets and columns without deleting or reordering existing data.

## API contract

`doGet` and `doPost` accept an `action`. Responses use `{ ok, data, error, requestId }`. Session identity is derived from a bearer/session token, never a client user ID or role. Initial actions:

- Auth: `register`, `login`, `logout`, `me`
- Catalog: `getProducts`, `getProduct`
- Commerce: `createOrder`, `createPayment`, `verifyPayment`, `getOrders`, `getWallet`
- Meetings: `createMeeting`, `joinMeeting`
- Operations: `health`, `initializeDatabase` (admin-only after bootstrap)

## Security model

- Passwords use per-user salt and repeated SHA-256 in Apps Script. A dedicated backend should migrate to Argon2id/bcrypt; Apps Script lacks memory-hard primitives.
- Random opaque session tokens are stored as hashes, expire, and can be revoked.
- Authorization is evaluated server-side against the session and resource ownership.
- Mutations accept idempotency keys. Payments also enforce unique provider ID and transaction hash.
- Webhooks require provider-specific signature verification, timestamp tolerance and replay protection before mutation.
- Spreadsheet locks protect financial critical sections. Security logs exclude tokens, passwords and secrets.
- Browser output is rendered as text; no untrusted HTML injection.

## WebRTC and custom-area sharing

The browser first grants a display track through `getDisplayMedia()`. Native APIs do not universally let a site choose an arbitrary desktop rectangle. Custom-area mode therefore previews the authorized track, lets the user resize a rectangle, draws only that source area to a capped-rate canvas, and publishes `canvas.captureStream()` through WebRTC. Stopping either source or processed track tears down both. Production group calls need an SFU and configured TURN.

This design follows the current standards boundary:

- The [W3C Screen Capture specification](https://www.w3.org/TR/screen-capture/) requires the user agent to let the user choose the display surface; app constraints cannot restrict that source selection, and the native capture track must not crop its output.
- [W3C Region Capture](https://www.w3.org/TR/mediacapture-region/) is a Working Draft for cropping a captured browser surface to a tagged DOM element. It is not a universal arbitrary-desktop-rectangle API.
- [Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/) defines `HTMLCanvasElement.captureStream()`, yielding a video track with the canvas dimensions. This is the interoperable processing boundary used by the custom-area flow.

## Crypto boundary

The backend creates orders from stored product price/currency/seller data. A provider adapter returns a payment request. Confirmation requires network, configured USDT contract, destination, amount, confirmations, timestamp and unused transaction hash to match. Access is granted only in the same locked, idempotent server transition that marks payment `CONFIRMED`.

No seed phrase or private key is accepted or stored.

## Delivery phases

1. Brand, design system, landing, auth boundary, shell, database initialization.
2. Dashboard, profile, feed and marketplace.
3. Orders, verified crypto adapters, wallet and commissions.
4. Meetings, signaling integration, WebRTC and custom-area sharing.
5. Streaming, realtime chat and notifications.
6. Admin, finance, security and analytics.
7. Performance, security audit and production QA.

The repository includes a cohesive vertical prototype across these areas, but production payment confirmation and multiparty transport remain deliberately unavailable until their external providers are configured.
