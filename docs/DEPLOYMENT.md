# Deployment

## Web client

1. Set `API_URL` in `src/runtime-config.js` to the Apps Script Web App `/exec` URL.
2. Run `npm install`, `npm test`, then `npm run build`.
3. Publish `dist/` on an HTTPS static host. Camera, display capture and service workers require a secure context (localhost is allowed for development).

## Apps Script

1. Create an Apps Script project. You may bind it to a Google Spreadsheet or let the backend create its own spreadsheet automatically.
2. Copy only `apps-script/Code.gs` into the Apps Script editor as the project's `Code.gs`. It already contains every backend module. The optional `appsscript.json` contains the manifest settings.
3. Optionally set `SPREADSHEET_ID` to use a particular spreadsheet. `PASSWORD_PEPPER` and `MEETING_TOKEN_SECRET` are generated automatically and retained in Script Properties; never replace them after users or a signaling deployment exist.
4. Deploy as **Web app**, execute as the owner, and choose the narrowest access policy compatible with the product. The API still authenticates every protected action itself.
5. Accept the requested Google permissions as the deploying owner, then open the `/exec?action=health` URL once. That first request creates the spreadsheet when absent, creates every required sheet and column, seeds settings, and provisions `PASSWORD_PEPPER`.
6. Set the `/exec` URL as `API_URL` in `src/runtime-config.js` and rebuild the client.

On later releases, the backend compares a fingerprint of the declared schema and adds any missing sheets or columns automatically. It does not delete existing data or rotate `PASSWORD_PEPPER`.

When backend source changes, run `npm run build:apps-script`. This regenerates the single deployable file from `backend-src/*.js`.

Payment networks are disabled by default. Enable one only after configuring its contract, destination, provider adapter and signed webhook verification.
