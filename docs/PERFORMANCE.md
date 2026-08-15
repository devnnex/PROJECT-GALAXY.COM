# Performance report

## Bottlenecks identified

Static tracing of the existing Google Sheets access paths found:

1. `getPublicConfig_()` requested settings individually. On a cold cache, its eight setting lookups could each perform a header read, a `TextFinder` scan and a row read.
2. `createReview_()` loaded matching order items and then called `findRecord_('Orders')` once per item: an N+1 pattern.
3. `grantOrderAccess_()` reloaded the complete `AccessGrants` sheet once for every item in an order.
4. `requireSession_()` updated `lastSeenAt` on every authenticated request, creating a read-modify-write even seconds after the prior request.
5. Concurrent frontend consumers had no in-flight request registry, so identical reads could be sent more than once.
6. There was no consolidated, permission-aware bootstrap endpoint or response-size/data-access telemetry.

## Changes applied

- `getSettingsMap_()` performs one batch read and caches the complete non-secret Settings table for 300 seconds. `updateSetting_()` invalidates it immediately.
- A request-local context deduplicates repeated record lookups and sheet-list reads. Operational data is not cached across requests, so financial and access data cannot become stale through this optimization.
- Reviews build an in-memory `ordersById` map. Access grants build one existing-grant set before their loop.
- Session activity writes are throttled to once per five minutes per active session. Expiration, revocation and authorization checks still execute on every request.
- `getBootstrapData` accepts an allowlisted `modules` array and returns only requested, authorized sections while preserving all old endpoints.
- The frontend reuses identical in-flight requests and gives bootstrap identity reads a 10-second cache. Authentication mutations clear that cache.
- Every API execution logs duration, sheet reads, sheet writes, request-cache hits and serialized response bytes.

## Before and after access complexity

| Path | Before | After |
| --- | --- | --- |
| Cold public configuration | Up to 8 independent setting searches; roughly 24 range/search operations in the worst code path | 1 Settings batch load (header + values), reused by every setting |
| Review purchase verification | 1 item-sheet load + one order search per matching item: `O(items)` searches | 1 Order load + 1 OrderItems load, then map lookup: `O(1)` sheet loads |
| Access grant creation | Full AccessGrants load inside each order-item iteration | 1 AccessGrants load and an in-memory key set |
| Session activity | 1 read-modify-write per authenticated request | At most 1 activity write per session every 5 minutes |
| K simultaneous identical frontend reads | K HTTP requests | 1 shared in-flight HTTP request |
| Initial modules requested independently | Up to one request per module | 1 `getBootstrapData` request for the allowlisted modules requested by that view |

These are code-path counts; actual milliseconds depend on spreadsheet size, Google execution locality and network latency. Runtime logs now provide the evidence required for deployment-specific comparisons.

## Cache safety

- Cross-request cache: Settings only, TTL 300 seconds, invalidated by the settings mutation endpoint.
- Request-local cache: records and sheet lists, discarded after the response.
- Frontend cache: authenticated bootstrap identity, TTL 10 seconds, cleared on login/register/logout.
- Payments, balances, access grants, orders and transaction confirmations are never cached across backend requests.

## Verification

- The generated backend contains 82 uniquely named functions and no duplicate declarations.
- The single `Code.gs` passes JavaScript syntax validation under the V8-compatible parser.
- Existing domain tests remain unchanged and pass.
- Production frontend build and the two-account WebRTC test remain available as regression checks.

Google Apps Script and Sheets cannot reproduce dedicated-database latency at high scale. The instrumentation should be used to decide when real traffic justifies migrating operational tables, without changing the API contract.
