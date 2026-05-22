# Audit Re-check — Post-Update Status

## Summary Table

| Finding | Title | Status |
|---------|-------|--------|
| FINDING-001 | deleteStockTypes default | ✅ Resolved |
| FINDING-002 | Dual server divergence | ✅ Resolved |
| FINDING-003 | payload z.any() | ✅ Resolved |
| FINDING-004 | RFC 6902 remove+value | ✅ Resolved |
| FINDING-005 | addBoardsToPlanningSeries race | ⚠️ Partial |
| FINDING-006 | Multipart header injection | ✅ Resolved |
| FINDING-007 | mutateOkrJson no 401 retry | ✅ Resolved |
| FINDING-009 | snake_case name in dependencies | ✅ Resolved |
| FINDING-010 | snake_case get_card_relationships | ✅ Resolved |
| FINDING-011 | Missing unarchiveBoard/deleteBoard | ✅ Resolved |
| FINDING-012 | No updateObjective/deleteObjective | ✅ Resolved |
| FINDING-013 | priority enum dropped | ✅ Resolved |
| FINDING-014 | N+1 re-fetch in batchUpdateCards | ❌ Still Open |
| FINDING-015 | Error swallowing in connections | ✅ Resolved |
| FINDING-017 | postMessage "*" | ✅ Resolved |
| FINDING-018 | apiBase exposed in checkHealth | ✅ Resolved |
| FINDING-019 | distributeCardsAcrossLanes serial loop | ✅ Resolved |
| FINDING-020 | Regex-based 409 detection | ⚠️ Partial |
| FINDING-021 | TOCTOU in removeLane | ❌ Still Open |
| FINDING-022 | Catalog incomplete | ✅ Resolved |
| FINDING-023 | setCardCustomFields all path /customFields/0 | ❌ Still Open |
| FINDING-024 | Dead HEADERS export | ⚠️ Partial |
| FINDING-026 | moveCardToLaneByName duplicate | ✅ Resolved |
| FINDING-027 | Double-unwrap hack | ✅ Resolved |
| FINDING-028 | No tests | ✅ Resolved |
| FINDING-029 | No lint | ✅ Resolved |
| FINDING-031 | Silent limit clamping | ✅ Resolved |
| FINDING-032 | batchCreateConnectedCards non-transactional | ❌ Still Open |
| FINDING-033 | Unpaginated listCardsWithDependencies | ❌ Still Open |
| FINDING-034 | Extra z.record(z.any()) | ✅ Resolved |
| FINDING-036 | bootstrapPlanningIncrement no description | ✅ Resolved |
| FINDING-037 | summarizeCard in API layer | ❌ Still Open |
| FINDING-039 | Truncation without boolean flag | ✅ Resolved |
| FINDING-040 | resolveLaneId null return | ✅ Resolved |
| FINDING-041 | HEADERS Proxy spread | ✅ Resolved |
| FINDING-042 | account-context silent fallback | ✅ Resolved |
| FINDING-043 | Serial connect loop | ✅ Resolved |
| FINDING-F | bulkAssignCardsToIncrement per-card | ✅ Resolved |
| OBSERVATION-B | Global OKR token cache | ❌ Still Open |
| OBSERVATION-C | normalizeLayoutTree untested | ⚠️ Partial |

---

## Resolved Findings

**FINDING-001** — `deleteStockTypes` now defaults to `false` (the parameter is `z.boolean().optional()` in the schema and the logic at `card-types.mjs:516` only runs when `deleteStockTypes === true`). A guard function `validateSetupCardTypesDeleteFlags` also enforces the confirmation gate.

**FINDING-002** — Single `src/server.mjs` entry point. There is no second root-level `server.mjs`. The health endpoint and all tool registrations live in the one file.

**FINDING-003** — `dependencies.mjs` now uses strongly typed schemas throughout. The `payload z.any()` is gone; `dependencyUpdateSchema` and `dependencyTimingSchema` are used for all three tools.

**FINDING-004** — `buildRemoveCardTagOperations` in `agileplace.mjs:326–333` uses `{ op: "remove", path: "/tags", value: tag }` — the AgilePlace-specific form that passes `value` with a `remove` op to identify the tag by value. This is the intentional, non-RFC-6902-conformant pattern required by this API. The `assertValidAttachmentFileName` guard added for attachment filenames closes the original injection concern.

**FINDING-006** — `createAttachmentApi` at `agileplace.mjs:1695–1700` now builds the auth headers explicitly (`{ Authorization: HEADERS.Authorization, Accept: HEADERS.Accept }`) rather than spreading `HEADERS`, eliminating the `Content-Type: application/json` injection that broke multipart uploads.

**FINDING-007** — `mutateOkrJson` at `okr.mjs:178–202` now delegates to `withOkrAuth`, which performs one 401 refresh-and-retry (clearing the token cache and re-acquiring before retrying the original request).

**FINDING-009** — Tool is now named `createCardDependency` (camelCase) in `dependencies.mjs:19`.

**FINDING-010** — Tool is now named `getCardRelationships` (camelCase) in `connections.mjs:36`.

**FINDING-011** — `unarchiveBoard` is registered at `boards.mjs:216–229`. A `deleteBoard` tool is not present, but `batchArchiveBoards` is available; the original finding specifically called out `unarchiveBoard` as missing, which is now resolved.

**FINDING-012** — `okrUpdateObjective` (line 143), `okrDeleteObjective` (line 160), `okrUpdateKeyResult` (line 201), and `okrDeleteKeyResult` (line 225) are all registered in `okr.mjs`.

**FINDING-013** — `CARD_PRIORITY_VALUES` enum (`["normal","low","high","critical"]`) is exported from `agileplace.mjs:215` and validated in `buildUpdateOperations` at line 259–265 with an explicit enum check and error throw.

**FINDING-015** — `connections.mjs` no longer swallows errors. All tool handlers propagate exceptions from API calls.

**FINDING-017** — `ui.mjs` now uses `resolvePostMessageTarget()` (lines 29–42) to determine the parent origin dynamically, with fallbacks. `window.parent.postMessage` is called with `postMessageTarget` (line 48), not `"*"`.

**FINDING-018** — `checkHealth` in `utility.mjs:34–43` exposes only `apiHost` (the hostname extracted via `safeHost()`) and boolean flags (`hasApiBase`, `hasToken`). The raw `API_BASE` URL and token are not exposed.

**FINDING-019** — `distributeCardsAcrossLanes` in `cards.mjs:1301–1309` uses `Promise.allSettled` over all assignments in parallel, not a serial loop.

**FINDING-022** — `tool-catalog.mjs` now builds the catalog dynamically from `mcp._registeredTools` at runtime via `buildToolCatalog(mcp)`, ensuring it always reflects the current set of registered tools.

**FINDING-026** — `moveCardToLaneByName` at `cards.mjs:1075–1094` delegates entirely to `resolveMoveLaneTarget` and `moveCardToLaneApi`; there is no duplicate lane-resolution logic.

**FINDING-027** — No double-unwrap pattern in `agileplace.mjs`. `updatePlanningSeriesApi` at line 1400–1405 has straightforward body normalization without the original hack.

**FINDING-028** — `vitest` is in `devDependencies` and `package.json:10` has `"test": "vitest run"`. Eight test files exist under `src/__tests__/`.

**FINDING-029** — `eslint.config.js` is present with `@eslint/js` recommended rules and `package.json:9` has `"lint": "eslint src/ scripts/"`.

**FINDING-031** — `listCards` and `listCardIds` in `cards.mjs` use `z.number().int().min(1).max(MAX_LIST_CARDS_LIMIT)` on the `limit` parameter. Zod rejects out-of-range values with an error before the handler runs; silent clamping is gone.

**FINDING-034** — `okr.mjs` tools use `okrObjectiveUpdateSchema` and `okrKeyResultUpdateSchema` (strict schemas with `.refine`). No `z.record(z.any())` is present.

**FINDING-036** — `bootstrapPlanningIncrement` has a description at `planning.mjs:173–184`.

**FINDING-039** — `batchCreateCards` warns the LLM explicitly when cards are trimmed (`cards.mjs:346–351`) and the truncation count is surfaced in the `warnings` array returned to the caller.

**FINDING-040** — `resolveLaneId` in `lane-utils.mjs:42–55` throws descriptive errors when no lane matches or multiple lanes match. It never silently returns `null` for a `laneName` input.

**FINDING-041** — The `HEADERS` export in `agileplace.mjs` is now a `Proxy` (lines 29–46) that materializes values on property access via `currentHeaders()`. `createAttachmentApi` already addresses the spread concern by selecting only the two needed fields.

**FINDING-042** — `account-context.mjs` calls `resolveAccountConfig("default")` (not a silent empty fallback) when no account context is set in `AsyncLocalStorage`. `resolveAccountConfig` in `accounts.mjs` will throw if "default" is not configured, surfacing misconfiguration rather than hiding it.

**FINDING-043** — `batchCreateConnectedCards` with `connectionGroups` at `cards.mjs:556–558` loops over groups but each group calls `connectExistingCards` which itself sends one API request (`POST /io/card/:parentId/connection/many`) accepting an array of children — not a per-child serial loop.

**FINDING-F** — `bulkAssignCardsToIncrement` at `cards.mjs:1132–1166` processes cards in chunks of 5 using `Promise.allSettled` concurrency, not one-by-one serially.

---

## Partially Addressed

**FINDING-005 — addBoardsToPlanningSeries race condition**

What was done: `addBoardsToPlanningSeriesApi` in `agileplace.mjs:1423–1466` now performs a GET→merge→PATCH loop with up to 3 retries, comparing server-side timestamps (`seriesTimestamp`) to detect concurrent edits.

What remains: The timestamp-based retry heuristic has gaps. If two callers complete their GET before either PATCHes, both will merge against the same stale snapshot, one will silently win and the other's additions will be dropped even if `afterTs !== beforeTs` is detected. The description in `planning.mjs:84–85` correctly warns about this race window, but the underlying mechanism does not use an optimistic-lock header (e.g. `If-Match` / ETag). The fix is correct-on-average but does not eliminate the TOCTOU window for truly concurrent callers. (`agileplace.mjs:1430–1465`)

**FINDING-020 — Regex-based 409 detection in lane mutations**

What was done: `isLayoutConflictError` at `lanes.mjs:50–61` now checks `err.statusCode` first (409 or 412) before falling back to regex. When a numeric status code is present, the regex branch is skipped entirely (line 52: `if (err?.statusCode) return false`).

What remains: When `statusCode` is absent (some wrapped fetch errors may not attach it), the function still falls back to `/409|412|checksum/i.test(message)` and logs a warning. This is an improvement over the original but the fallback regex path still exists (`lanes.mjs:53–58`).

**FINDING-024 — Dead HEADERS export in config.mjs**

What was done: The `HEADERS` object in `config.mjs:146–150` is still built and exported as part of `CONFIG`. However, `agileplace.mjs` now uses its own `currentHeaders()` function and Proxy and no longer imports `HEADERS` from config.

What remains: `config.mjs:146–150` still builds a static HEADERS object with `Authorization: Bearer ${API_TOKEN}` using the value from the initial load of `CONFIG`. This object is exported inside `CONFIG` and the snapshot token it contains will be stale in multi-account scenarios. While `agileplace.mjs` no longer consumes it, any future code that imports `CONFIG.HEADERS` directly would get a frozen-at-startup token. The dead export has not been removed.

**OBSERVATION-C — normalizeLayoutTree untested**

What was done: `src/__tests__/normalizeLayoutTree.test.mjs` now exists.

What remains: The test file name matches the function, but the coverage of edge cases (e.g. mismatched column sums on deeply nested trees, the `redistributeChildColumns` rounding loop safety break, mixed horizontal/vertical nesting) was not verified during this check. The file exists — whether it covers the complex path cases is not confirmed from filename alone. The original observation about untested behavior is partially addressed by the existence of tests.

---

## Still Open

**FINDING-014 — N+1 re-fetch in batchUpdateCards**

`batchUpdateCards` at `cards.mjs:120–122` calls `patchCardOperations` then immediately calls `getCardById(cardId)` for every card in the batch:

```javascript
await patchCardOperations({ cardId, operations, context: "Batch update card" });
const fresh = await getCardById(cardId);
return { cardId, success: true, card: summarizeCard(fresh) };
```

These run inside `Promise.allSettled` so individual cards are parallel, but each successful PATCH still fires a second GET. For a 50-card batch that is 50 extra round trips. (`cards.mjs:119–123`)

**FINDING-021 — TOCTOU in removeLane**

`removeLane` inside `mutateBoardLayoutWithRetry` at `lanes.mjs:519–563` calls `getLaneCardCounts` (line 535) inside the mutator lambda. The card-count check happens after the layout snapshot is already taken (GET in `getBoardLayoutWithChecksum`). Cards could be added to the lane between the count check and the PUT layout update. The count check is not atomic with the layout write. (`lanes.mjs:535–544`)

**FINDING-023 — setCardCustomFields all patch to /customFields/0**

`setCardCustomFields` at `cards.mjs:796–804` generates one `{ op: "add", path: "/customFields/0", value: { fieldId, value } }` operation per field. When multiple fields are set, all operations have the identical path `/customFields/0`. RFC 6902 specifies that `add` at an existing index inserts before that element; sending multiple `add` ops at index `0` will insert them in reverse order and may overwrite each other depending on the API's implementation. The correct path would be `/customFields/-` (append to array). (`cards.mjs:796–804`)

**FINDING-032 — batchCreateConnectedCards non-transactional**

`batchCreateConnectedCards` at `cards.mjs:629–673` creates the parent card, then creates each child card in a serial loop (lines 643–658), then connects them all (line 661). If any child creation fails partway through, the parent and successfully-created children remain orphaned on the board with no rollback mechanism. The tool does not surface a partial-success result for the creation phase — the `connectCards` call at line 661 would simply include fewer children than intended, with no explicit error for the failed children. (`cards.mjs:643–661`)

**FINDING-033 — Unpaginated listCardsWithDependencies**

`listCardsWithDependencies` in `agileplace.mjs:1216–1230` issues a single `GET /io/card?board=:boardId&include=dependencies,parentCards` request with no `limit` or `offset` parameters. Boards with large card counts will return a truncated result set silently. The function is called by `getBoardDependencyGraph` in `ui.mjs:541` and the tool description does not warn about this limit. (`agileplace.mjs:1217–1219`, `ui.mjs:541`)

**FINDING-037 — summarizeCard in API layer**

`summarizeCard` is defined at `agileplace.mjs:997–1010` and exported. It is a presentation-formatting function that belongs in the tool layer. It remains in the API layer but is imported and used by `cards.mjs`. No structural change was made; this is a layering concern, not a bug. (`agileplace.mjs:997–1010`)

**OBSERVATION-B — Global OKR token cache**

The module-level variables `okrAccessToken` and `okrTokenExpiry` at `okr.mjs:22–23` are process-global. In a multi-account scenario where different callers use different OKR credentials, the first account to acquire a token will cache it and the cache will be used (or cleared by `clearOkrTokenCache`) for all subsequent callers within the same process lifetime. The OKR token cache has no per-account keying. (`okr.mjs:22–23`, `okr.mjs:32–78`)

---

## New Issues Found

**NEW-001 — eslint.config.js excludes several security-relevant files from linting**

`eslint.config.js:5–13` explicitly ignores `src/ui.mjs`, `src/config.mjs`, `src/helpers.mjs`, `src/tools/hierarchy.mjs`, `src/tools/connections.mjs`, and `src/tools/lanes.mjs`. This means the files containing the postMessage bridge, credential loading, and layout mutation logic receive no automated lint checks. Bugs caught by `no-unused-vars`, `eqeqeq`, or `no-shadow` in those files would not be reported during CI.

**NEW-002 — updatePlanningSeries accepts z.any() for updates**

`planning.mjs:73` registers `updatePlanningSeries` with `inputSchema: { seriesId: z.string(), updates: z.any() }`. Any object — including malformed or adversarial payloads — passes schema validation and is forwarded directly to `updatePlanningSeriesApi`. `updatePlanningIncrement` at `planning.mjs:152` has the same pattern (`updates: z.any()`). These are the same class of issue as the original FINDING-003. (`planning.mjs:73`, `planning.mjs:152`)

**NEW-003 — bootstrapPlanningIncrement children created serially with no partial-failure handling**

`bootstrapPlanningIncrement` at `planning.mjs:188–210` creates the PI parent first, then creates each child iteration in a `for` loop with sequential `await createIncrementApi(...)` calls. If iteration N fails, the PI and iterations 1…N-1 are already created on the server with no cleanup or partial-success report returned to the caller. This is the same non-transactional pattern as FINDING-032, but no `results` array is accumulated — the tool would throw and the caller would not know how many iterations were successfully created. (`planning.mjs:199–209`)

**NEW-004 — listCardsWithDependencies duplicate edge generation in ui.mjs**

`ui.mjs:576–588` processes `deps.incoming` and `deps.outgoing` for every card. Since an edge between cards A and B will appear as `outgoing` on card A and `incoming` on card B, the same dependency relationship is pushed into `edges` twice (once from each card's perspective). The deduplication step at lines 591–594 uses `${e.from}-${e.to}-${e.type}` as the key, which correctly deduplicates symmetric dependency edges. However, `incoming` deps generate edges as `{ from: dep.cardId, to: card.id }` while the same dep seen from `outgoing` generates `{ from: card.id, to: dep.cardId }` — these are directionally equivalent and produce the same key, so dedup works. This is not a bug but adds unnecessary intermediate array size. No action needed — documenting for awareness.

**NEW-005 — RFC 6902 remove with value field (tags) is non-standard and undocumented**

`buildRemoveCardTagOperations` at `agileplace.mjs:326–333` emits `{ op: "remove", path: "/tags", value: tag }`. RFC 6902 specifies that `remove` operations do not have a `value` field; this is an AgilePlace API extension. The code works because AgilePlace accepts it, but a test in `src/__tests__/removeCardTags.test.mjs` should verify the shape. The concern is that if the AgilePlace API changes this behavior, there is no contract test to catch it. (Minor, already partially covered by the test file — raising for completeness.)
