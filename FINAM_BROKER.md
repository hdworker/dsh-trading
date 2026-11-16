# Finam Broker / MOEX Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить read-only рынок MOEX/Finam в левую торговую панель, чтобы каталог тикеров Finam можно было искать, добавлять в watchlist, открывать на графике и использовать в локальном backtest через тот же `MarketDataService`.

**Architecture:** Finam подключается как provider `finam` нового рынка `ru` (в UI отображается вкладка «Finam»). Connector реализует полный backend-каталог инструментов, отдельный bounded search для UI, ticker, klines и ticker subscription; host bridge публикует `/markets` и `/symbols`; существующие watchlist, chart, screener и `strategy_backtest` используют стандартные маршруты без отдельного обходного слоя. Execution/балансы/ордера в этот срез не входят.

**Tech Stack:** TypeScript, Cordis, `@dshtrading/api`, `MarketDataRegistry`, `@finam/trade-api` как внешний SDK/peer dependency, React, Vitest, existing DSH bridge and SSE watchlist sync.

**Integration direction:** Этот срез является началом полноценной брокерской интеграции, а не отдельным каталогом. После read-only market-data слоя следующий путь должен повторять существующие adapters: account/positions → open orders/fills → order state reconciliation → place/cancel/modify capabilities → dry-run, `OrderIntentLedger`, signed live-trading authority и approval gate. Ближайшие архитектурные образцы в репозитории: `connector-binance`, `connector-bybit`, `connector-okx`, `connector-alpaca`, `connector-ibkr`, `connector-qmt`, `connector-futu`, `connector-longbridge` и `connector-tiger`.

**Spec:** Этот файл является утверждённым кратким spec и implementation plan для первой read-only версии.

## Global Constraints

- Provider slug: `finam`; market slug: `ru`; UI label: `Finam`.
- Canonical symbol is provider-independent; initial MOEX mapping is `SBER.MOEX` ↔ Finam `SBER@MISX`.
- UI/bridge/backtest never expose Finam native symbols as the canonical stored symbol.
- First slice is read-only: no `TradeService`, order tools, account balances, positions, fills or live credentials in the UI.
- Finam credentials are resolved only on the host connector boundary; initial default reference is `FINAM_API_SECRET`; never store secrets in client state, watchlist, URL, tests or logs.
- Pin the official `@finam/trade-api` SDK version used by the adapter (initial target: `2.19.1`); do not leave the runtime dependency as an unbounded range.
- `listInstruments`, `getTicker`, `getKlines` and `subscribeTicker` must return canonical `ru` symbols.
- The UI follows mode A+: search/add in the sidebar, while the backend connector keeps a complete active-instrument catalog for `screener_run`; the full catalog is never rendered as a watchlist and is not bulk-quoted by the UI.
- `listInstruments()` is the full catalog interface; add the optional `searchInstruments?(query: string, limit?: number): Promise<InstrumentRef[]>` capability to the shared market-data interface so the bridge does not rely on an untyped duck-cast.
- `/symbols` must support server-side query filtering and a bounded result set; the client must not download an unbounded full catalog on every keystroke.
- Existing host-first watchlist semantics remain unchanged: write host first, update local mirror only after success.
- Charts consume `/klines`; strategy backtests consume the active market-data registry through `strategy_backtest`. No duplicate Finam data path.
- Data source, retrieved time, symbol mapping and incomplete/empty responses must remain distinguishable.
- No unrelated UI restyling or modification of existing crypto/us/cn/hk behavior.
- Each completed task ends with its focused verification and a Conventional Commit containing only the task's reviewed files; existing unrelated worktree changes must not be staged.

## Review Focus

1. **Market vocabulary:** `ru` must be accepted everywhere a market is validated; unknown-market errors must still reject arbitrary values.
2. **Native-to-canonical mapping:** `SBER@MISX`, `SBER.MOEX`, unknown MICs and duplicate assets must not create duplicate or wrong watchlist rows.
3. **Finam catalog size:** empty, paginated, duplicate, archived and malformed asset responses must fail closed or return an explicit empty/incomplete result without freezing the sidebar.
4. **Provider absence:** when Finam is not installed, `/markets` must omit `ru`; the UI must not show a permanently broken tab.
5. **Chart/backtest consistency:** the symbol selected from the Finam tab must be the same symbol accepted by `/klines` and `strategy_backtest`; all requests must use the active `finam` provider.

---

## File Map

### New

- `packages/connector-finam/package.json` — connector package and official SDK peer dependency.
- `packages/connector-finam/README.md` — capability boundary, credentials, symbol mapping, ToS and read-only status.
- `packages/connector-finam/src/symbol.ts` — pure Finam native/canonical symbol mapping; no SDK, network or credentials.
- `packages/connector-finam/src/rest.ts` — Finam SDK/transport adapter, pagination, normalization and error mapping.
- `packages/connector-finam/src/index.ts` — `Config`, `FinamMarketDataService`, plugin export and provider slug.
- `packages/connector-finam/src/dataplane.ts` — host registration into `tradingMarketDataRegistry`.
- `packages/connector-finam/test/symbol.test.ts` — canonical/native mapping, round-trip and fail-closed cases.
- `packages/connector-finam/test/rest.test.ts` — auth/catalog/bar normalization and error cases.
- `packages/connector-finam/test/dataplane.test.ts` — loader/defaults and registry registration.
- `packages/connector-finam/test/connector.test.ts` — service contract and canonical symbols.
- `packages/ru/package.json` — new market bundle with explicit connector dependency.
- `packages/ru/cordis.patch.yml` — host dataplane row for Finam.
- `packages/ru/src/index.ts` — minimal bundle plugin entry; first slice is host-plane only and does not install an agent preset.

### Modify

- `packages/api/src/index.ts` — add the `ru` context market-data service augmentation and any market vocabulary type required by the existing contracts; do not add runtime logic.
- `packages/router/src/index.ts` — add `ru` to the market vocabulary only where the current typed market list requires it; preserve open provider strings and registry behavior.
- `packages/router/src/catalog.ts` — add `ru: []` or a small verified seed set; dynamic Finam catalog remains the source of truth.
- `packages/bot-api/src/bridge.ts` — add `ru` to `MarketId`, `MARKET_IDS`, `MARKET_SERVICE_KEYS`, market validation and `/markets`/`/symbols` test fixtures. Keep the existing 30-minute symbol cache and query filtering.
- `packages/bot-api/test/bridge.test.ts` — `/markets` and `/symbols?market=ru` behavior.
- `packages/bot-api/test/bridge-cache.test.ts` — catalog cache, query bypass and refresh behavior.
- `packages/strategies/src/plugin.ts` — add `ru: 'tradingRuMarketData'` to the legacy fallback map and verify registry-first resolution for `strategy_backtest` and `screener_run`; no Finam-specific strategy engine.
- `packages/strategies/test/engine.test.ts` or a new `packages/strategies/test/market-data-resolver.test.ts` — verify `ru` service resolution and backtest consumption of Finam-like klines.
- `packages/strategies/test/screener-run.test.ts` — verify the complete Finam catalog is the scan universe, the existing 500-instrument safety cap/truncation is reported, and 1d bars feed the indicator screener.
- `packages/client-ui-trading/src/client/types.ts` — add `ru` to `MarketId`.
- `packages/client-ui-trading/src/client/market-vocab.ts` — add `MARKET_TAB_KEY.ru`, `ru` input inference/normalization and no accidental fallback to US.
- `packages/client-ui-trading/src/client/contract.ts` — add `tab.finam` locale key.
- `packages/client-ui-trading/src/client/locales.ts` — add Russian/English labels for `tab.finam`.
- `packages/client-ui-trading/src/client/store.ts` — allow `ru` in selection/watchlist sanitization and persistence; keep arbitrary host rows compatible with existing open-market semantics.
- `packages/client-ui-trading/src/client/MarketSidebar.tsx` — include `ru` in dynamic search target markets and add-market cycling; keep tabs driven by `/markets`, not by a hardcoded always-visible Finam tab; do not render the complete market catalog as rows.
- `packages/client-ui-settings/src/client/trading-settings-controller.ts` — register Finam provider metadata and the `FINAM_API_SECRET` host-side fallback reference.
- `packages/client-ui-settings/src/client/MarketProviderPanel.tsx` — reuse the generic provider radio/credential card; no Finam-specific form.
- `packages/client-ui-settings/src/client/locales.ts` — add `market.ru`, `provider.finam` and the Finam secret field copy in zh/en.
- `packages/client-ui-settings/test/provider-registration.test.ts` and `credential-consumption.test.ts` — verify ru/finam registration, credential namespace and host-first secret resolution.
- `packages/watchlist/src/seeds.ts` — add an empty `ru` bucket so agent watchlist output and GUI market fallback use the same market vocabulary without inventing seed tickers.
- `packages/client-ui-trading/test/market-vocab.test.ts` — `ru` label and symbol normalization.
- `packages/client-ui-trading/test/market-sidebar.smoke.test.tsx` — Finam tab appears only when `/markets` returns `ru`; query suggestions add/select a canonical Finam symbol.
- `packages/client-ui-trading/test/host-watchlist-sync.test.ts` — host-first add/select round-trip for `ru`.
- `packages/watchlist/src/plugin.ts` — update descriptions/examples mentioning only `crypto|us|cn|hk`; no restrictive market whitelist should be introduced.
- `packages/watchlist/test/output-contract.test.ts` — watchlist output accepts and preserves `ru` rows.
- `pnpm-workspace.yaml` and installed profile overrides — add workspace/package overrides only where the repository's profile installation contract requires them.
- `docs/guides/symbol-vocabulary.md` — document canonical `ru`/MOEX form and Finam native mapping.
- `docs/guides/connector-playbook.md` or a focused Finam integration note — record capability boundary and evidence requirements.

### Explicitly not changed in the first slice

- Existing `connector-alpaca`, `connector-ibkr`, `connector-qmt`, crypto/us/cn/hk behavior.
- `TradeService` execution methods and live-trading approval flow.
- Holdings, balances and execution UI.
- Fundamentals/news for `ru`; these remain unavailable until a separate provider is selected.
- `packages/kit-ru` unless agent-facing Finam-specific skills/tools become part of a later task.

---

## Task 1: Lock the `ru` market and Finam symbol contract

**Status: complete.** Implemented in commit `ec258c65405fe8dd867a23d540eed7abe9cc4387`.

**Files:**
- Modify: `packages/api/src/index.ts`
- Modify: `packages/router/src/index.ts`
- Modify: `packages/router/src/catalog.ts`
- Modify: `docs/guides/symbol-vocabulary.md`
- Create: `packages/connector-finam/src/symbol.ts`
- Test: `packages/api/test/market-data-contract.test.ts`
- Test: `packages/router/test/market-vocabulary.test.ts`
- Test: `packages/connector-finam/test/symbol.test.ts`
- Modify: `packages/router/test/router.test.ts`
- Modify: `packages/router/test/tools.test.ts`

**Interfaces:**
- Adds the host Context seam `tradingRuMarketData: MarketDataService`; typed `MarketId` additions in bridge/client remain Tasks 4–5.
- Adds optional `MarketDataService.searchInstruments(query: string, limit?: number): Promise<InstrumentRef[]>`; `listInstruments()` remains the complete-universe method.
- Adds `canonicalFinamSymbol(input: string): string` and `nativeFinamSymbol(canonical: string): { ticker: string; mic: 'MISX' }` in connector-local code; the public canonical form is `TICKER.MOEX`.
- Adds router default `ru: { provider: 'finam' }`, the `finam` provider vocabulary entry, an empty `ru` static catalog bucket and `ru` cross-market catalog search support.

**Verification completed:**
- `pnpm --filter @dshtrading/api test` — 16 passed.
- `pnpm --filter @dshtrading/router test` — 40 passed.
- `pnpm exec vitest run packages/connector-finam/test/symbol.test.ts` — 4 passed.
- `pnpm --filter @dshtrading/api build` and `pnpm --filter @dshtrading/router build` — passed.
- `pnpm test:audit` — passed with no new test debt.

- [x] **Step 1: Write failing vocabulary tests** for `SBER@MISX`, `GAZP@MISX`, an unknown MIC, malformed symbols and canonical round-trip.
- [x] **Step 2: Run the focused vocabulary tests** and confirm the new `ru` path was absent/failing before implementation.
- [x] **Step 3: Add the `ru` type/catalog entries** without changing existing market inference behavior for crypto/us/cn/hk/futures/global.
- [x] **Step 4: Run API/router vocabulary tests** and confirm existing market cases remain green. Client vocabulary tests are deferred to Task 5 because no client files are changed in Task 1.

**Task 1 boundary:** only the pure mapping module was added under `packages/connector-finam`; the Finam SDK, REST transport, credentials, dataplane and execution surfaces remain untouched for Task 2+.

## Task 2: Build the Finam read-only connector

**Status: implementation complete; runtime SDK installation is blocked by upstream package availability.**

The official SDK README and repository source confirm the `@finam/trade-api@2.19.1` interface (`createTradeApi`/`withTradeApi`, `assets.allAssets`, `marketData.lastQuote`, `marketData.bars`). The pinned official checkout at commit `162c579e3ed330722f085dfbda37b961fe8a42c3` was locally generated/type-checked and its exports were verified without copying generated files into this repository. The current npm registry query for that exact package/version returns `ERR_PNPM_FETCH_404`, so the host-runtime install and real network evidence remain pending an accessible published package or approved registry/tarball source.

The current code intentionally exposes an active-MISX catalog, not a claimed “tradable equity” universe: the official 2.19.1 proto has no documented `Asset.type` vocabulary or account-free `isTradable` field. Strict equity/tradability filtering remains an explicit acceptance gap.

**Files:**
- Create: `packages/connector-finam/package.json`
- Create: `packages/connector-finam/README.md`
- Reuse: `packages/connector-finam/src/symbol.ts` (Task 1 canonical/native mapping; do not duplicate it)
- Create: `packages/connector-finam/src/rest.ts`
- Create: `packages/connector-finam/src/index.ts`
- Create: `packages/connector-finam/src/dataplane.ts`
- Test: `packages/connector-finam/test/rest.test.ts`, `dataplane.test.ts`, `connector.test.ts`
- Research: `docs/guides/finam-sdk-research.md`

**Interfaces:**
- `FinamMarketDataService implements MarketDataService`.
- `listInstruments(): Promise<InstrumentRef[]>` returns the complete active-MISX catalog with canonical symbols and display names; strict equity/tradability filtering remains an explicit evidence gap before claiming the screener universe.
- Optional internal `searchInstruments(query: string, limit: number): Promise<InstrumentRef[]>` serves bounded UI search; it is not the canonical full-catalog interface and must not change watchlist symbols.
- `getTicker(symbol: string): Promise<Ticker>`.
- `getKlines(symbol: string, interval: Interval, limit?: number): Promise<Kline[]>`.
- `subscribeTicker(symbol: string, cb: (ticker: Ticker) => void, options?: { intervalMs?: number }): Disposable`.
- Optional `getOrderbook` and `getRecentTrades` are exposed only if the official SDK path is verified in the same slice.

- [x] **Step 1: Add parser/transport tests** with fixtures for paginated assets, native `ticker@mic` request payloads (reusing the completed Task 1 mapping), nested decimal values, timestamps, empty pages, duplicate cursors and malformed responses. Typed error mapping is covered separately; HTTP/network smoke remains blocked by SDK availability.
- [x] **Step 2: Run connector tests to establish the failing REST/service contract; keep the completed symbol mapping tests green.** Direct Vitest execution is green.
- [ ] **Step 3: Add and install the pinned official `@finam/trade-api@2.19.1` runtime dependency.** The exact declaration is present in `packages/connector-finam/package.json`, but npm/pnpm currently returns `ERR_PNPM_FETCH_404`.
- [x] **Step 4: Implement credentials through the host-side ref seam**; resolve `FINAM_API_SECRET` only in host code and never in client/UI modules.
- [x] **Step 5: Implement bounded asset pagination** using `api.assets.allAssets({ cursor, onlyActive, onlyDisabled })`, canonical mapping, stable cursor guards and active-MISX filtering. Strict equity/tradability filtering remains open because the official proto does not define a safe account-free predicate.
- [x] **Step 6: Implement ticker/K-line normalization** with exact decimal parsing, official timeframe mapping, provider timestamps, empty response semantics and `TRADING_*` error mapping.
- [x] **Step 7: Implement active-MISX catalog retrieval** with stable deduplication, bounded refresh/cache and no wholesale UI rendering. Strict equity/tradability filtering remains an evidence gap.
- [x] **Step 8: Implement bounded `searchInstruments(query, limit)`** over the cached catalog with a hard result limit.
- [ ] **Step 9: Implement `klineCapabilities()`** only after network evidence verifies timestamp semantics and conservative returned depth. The connector intentionally does not advertise capabilities yet.
- [x] **Step 10: Implement ticker subscription with cancellation boundaries** using bounded REST polling; no stream reliability claim is made.
- [x] **Step 11: Run focused connector tests and a no-credentials test**; direct connector tests pass with 18 tests and the hygiene audit reports no new debt.

**Task 2 verification gap:** direct `tsdown` build passes and all offline tests pass, but `pnpm install`/workspace-filtered commands cannot resolve the pinned SDK from the current public npm registry. Real SDK runtime and network evidence must be run once an installable official tarball/registry source is available.

## Task 3: Register Finam in a `ru` market bundle

**Files:**
- Create: `packages/ru/package.json`
- Create: `packages/ru/cordis.patch.yml`
- Create: `packages/ru/src/index.ts`
- No `packages/ru/assets/preset` files in the first GUI/backtest slice; agent-facing `ru` tools/preset are a later task.
- Modify: profile overrides required by `pnpm-workspace.yaml`.
- Test: bundle/dataplane loader tests and a new `packages/ru/test/bundle-wiring.test.ts`.

**Interfaces:**
- Host patch registers `@dshtrading/connector-finam/dataplane` with `inject: ['tradingMarketDataRegistry']`.
- The minimal `packages/ru/src/index.ts` entry is a no-op bundle plugin; no agent preset is installed in this slice.
- Dataplane registers `('ru', 'finam', service)` and does not register a trade service in this slice.
- Default route is disabled unless `markets.ru.provider=finam` and the bundle is installed.

**Settings integration plan (Task 3, existing `dshtrading` seam):**

1. Add `{ id: 'finam', label: 'provider.finam', url: 'https://api.finam.ru', env: 'FINAM_API_SECRET', type: 'commercial', markets: ['ru'] }` to `PROVIDER_LABELS`. The `env` value is a host fallback/reference label, not a browser-side secret.
2. Add `PROVIDER_CREDENTIAL_SPECS.finam` with one field `{ key: 'secret', secret: true }` (stored under `dshtrading.credentials.finam.secret`), plus zh/en `field.label.finamSecret` / `field.placeholder.finamSecret` copy. Reuse the generic `MarketProviderPanel` credential card; do not create a Finam-specific settings component.
3. Keep route selection and credentials as separate writes: `setProvider('ru', 'finam')` mutates `markets.ru.provider`; `setCredential('finam', { secret })` writes the host settings credential. Both use the existing revision-fenced `ConfigForm` path.
4. Resolve credentials host-first in the connector: `router.getCredential('finam')?.secret` → credentials/ref resolver → `process.env[secretRef]`. The value, JWT, account IDs and raw SDK client never cross into client state, URL, watchlist or logs.
5. Add settings tests for provider registration (`ru` only), `FINAM_API_SECRET` metadata, redacted/configured credential state, settings-over-env precedence and missing-secret fail-closed behavior. Add a dataplane test proving the selected `finam` service is the only `ru` market-data registration and no trade registration exists.
6. Acceptance requires the settings card to show Finam only under the ru/Finam market tab, persist route and credential independently, and report unavailable credentials honestly without making `/markets` appear active when the bundle is absent.

- [ ] **Step 1: Add failing loader tests** for missing `Config` defaults, provider registration and `enabled=false`.
- [ ] **Step 2: Run the focused bundle tests and confirm failure.**
- [ ] **Step 3: Generate the connector shape from `scripts/new-connector.mjs` conventions and add the explicit `ru` host dataplane row.**
- [ ] **Step 4: Register `ru/finam` with cleanup on unload and preserve the existing router no-fallback rule.**
- [ ] **Step 5: Add the provider label and `FINAM_API_SECRET` reference to the existing settings controller without exposing the secret value to client code.**
- [ ] **Step 6: Run `pnpm connector-dataplane:check` and the focused bundle/settings tests.**

## Task 4: Expose `/markets` and `/symbols` to the client

**Files:**
- Modify: `packages/bot-api/src/bridge.ts`
- Test: `packages/bot-api/test/bridge.test.ts`
- Test: `packages/bot-api/test/bridge-cache.test.ts`

**Interfaces:**
- `GET /dshtrading/api/markets` includes `{ id: 'ru', provider: 'finam' }` only when the service is installed and active.
- `GET /dshtrading/api/symbols?market=ru` returns the bounded catalog response used by the active UI path; the complete catalog remains an internal provider result for screening.
- `GET /dshtrading/api/symbols?market=ru&query=sber` returns only matching symbol/name rows through `searchInstruments` or a cached full-catalog filter.
- `screener_run(market='ru')` consumes the complete `listInstruments()` universe, subject to the existing scan pool/deadline guard and explicit `truncated` result.

- [ ] **Step 1: Add tests for installed, missing, empty, query-filtered and cached `ru` catalog responses.**
- [ ] **Step 2: Run bridge tests and confirm the missing route/type failures.**
- [ ] **Step 3: Extend `MarketId`, `MARKET_IDS` and `MARKET_SERVICE_KEYS` with `ru` and keep the existing 30-minute full-catalog cache semantics.**
- [ ] **Step 4: Make `/symbols?query=...` call the typed optional `searchInstruments` capability when available, otherwise filter the cached complete catalog locally.**
- [ ] **Step 5: Verify the bridge does not silently fall back from `finam` to another provider.**
- [ ] **Step 6: Verify query requests never cause full-catalog rendering or N-symbol quote polling in the client.**
- [ ] **Step 7: Run the bridge test subset.**

## Task 5: Wire the Finam tab and watchlist flow

**Files:**
- Modify: `packages/client-ui-trading/src/client/types.ts`
- Modify: `packages/client-ui-trading/src/client/market-vocab.ts`
- Modify: `packages/client-ui-trading/src/client/contract.ts`
- Modify: `packages/client-ui-trading/src/client/locales.ts`
- Modify: `packages/client-ui-trading/src/client/store.ts`
- Modify: `packages/client-ui-trading/src/client/MarketSidebar.tsx`
- Modify: `packages/router/src/catalog.ts`
- Modify: `packages/watchlist/src/plugin.ts` descriptions/examples only.
- Test: `market-vocab.test.ts`, `symbol-catalog.test.ts`, `market-sidebar.smoke.test.tsx`, `host-watchlist-sync.test.ts`, `watchlist/output-contract.test.ts`.

**Interfaces:**
- `MarketSidebar` remains data-driven: `tabs` comes from `/markets`; no always-visible Finam tab when the bundle is absent.
- `fetchSymbols('ru', query)` feeds the existing suggestion list.
- Selecting `SBER.MOEX` calls the existing host-first `selectInstrument`; adding calls the existing host-first watchlist path.
- The row displays the Finam-provided name and canonical symbol; no native `@MIC` code is shown to the user.

- [ ] **Step 1: Add failing tests** for `ru` tab appearance, search, add, select, persistence and removal.
- [ ] **Step 2: Add `ru` to type/vocabulary/store whitelists and locale labels.**
- [ ] **Step 3: Add `ru` to the sidebar's dynamic catalog prefetch/search targets and add-market cycle; do not add a second Finam-specific search component.**
- [ ] **Step 4: Verify a selected Finam row survives reload through host watchlist sync and produces the same `market:symbol` key in groups/pins.**
- [ ] **Step 5: Run the focused client UI tests.**

## Task 6: Make charts, backtests and screeners consume Finam data

**Files:**
- Modify if required: `packages/strategies/src/plugin.ts`
- Test: `packages/strategies/test/market-data-resolver.test.ts` or existing backtest test.
- Test: `packages/client-ui-trading/test/market-sidebar.smoke.test.tsx` or chart-stage bridge test.
- Test: `packages/bot-api/test/bridge.test.ts` for `/klines?market=ru`.

**Interfaces:**
- Chart path: `fetchKlines('ru', 'SBER.MOEX', interval, limit)` → `/klines` → active `finam` `MarketDataService.getKlines`.
- Backtest path: `strategy_backtest({ market: 'ru', symbol: 'SBER.MOEX', interval: '1d'|'5m'|'1m', ... })` → registry-first market-data resolver → same Finam service.
- Screener path: `screener_run({ market: 'ru', ... })` → complete Finam `listInstruments()` universe → bounded per-symbol `getKlines(symbol, '1d', ...)` → existing pure screener evaluator; output preserves `scanned`, `failed`, `truncated` and deadline semantics.
- Provider/source metadata remains available in bridge responses where the existing contract already exposes it.

- [ ] **Step 1: Add a fake Finam service to prove chart klines and strategy backtest resolve the same canonical symbol.**
- [ ] **Step 2: Verify no execution service is required for chart/backtest operation.**
- [ ] **Step 3: Verify `TRADING_UNSUPPORTED_INTERVAL`, `TRADING_SYMBOL_NOT_FOUND`, empty bars and rate-limit errors remain distinguishable.**
- [ ] **Step 4: Verify `screener_run(market='ru')` uses the full catalog without rendering or bulk-quoting it; safety caps and truncation are visible to the caller.**
- [ ] **Step 5: Run strategy, screener and bridge tests.**

## Task 7: Begin the full broker-integration path

**Files:**
- Modify: `packages/connector-finam/README.md`
- Modify: `docs/guides/connector-playbook.md` only if the generic capability checklist needs a Finam-specific clarification.
- Test plan only in this slice: `packages/connector-finam/test/` retains explicit absence tests for TradeService registration.

- [ ] **Step 1: Record the next adapter seam** for account/positions/open-orders/fills without implementing it: the future module must satisfy the existing `TradeService` interface and `OrderIntentLedger` policy.
- [ ] **Step 2: Record the capability order**: account reads → order state/fills → cancel → place → modify/replace, with each capability independently verified against Finam contracts.
- [ ] **Step 3: Record the safety invariants**: dry-run default, signed live authority, approval gate, intent persisted before network, no synthetic order IDs and reconciliation after ambiguous responses.
- [ ] **Step 4: Explicitly keep this first slice read-only** and verify the dataplane never registers `tradingRuTrade`.

## Task 8: Real network evidence and acceptance

**Files:**
- Create: `spikes/impl-finam/README.md`
- Create: `spikes/impl-finam/r3-real-network-verify.mjs` or repository-equivalent spike script.
- Create: `spikes/impl-finam/EVIDENCE.md` (never include secrets).
- Modify: `packages/connector-finam/README.md` with verified capability limits only.

- [ ] **Step 1: Run unauthenticated/public capability checks only where Finam permits them.**
- [ ] **Step 2: With user-provided read-only credentials, verify token exchange, asset pagination, one ticker, one K-line interval and one invalid symbol.**
- [ ] **Step 3: Record source, provider symbol, canonical symbol, interval, response time and error code; redact secrets and account identifiers.**
- [ ] **Step 4: Verify the same canonical symbol appears in `/symbols`, watchlist, chart and `strategy_backtest`.**
- [ ] **Step 5: Run relevant package tests, `pnpm build` for changed packages and the connector/dataplane gates.**
- [ ] **Step 6: Do not call any place/cancel/order endpoint in this plan.**

## Acceptance Checklist

- [ ] With no `ru` bundle installed, the existing screenshot layout and tabs are unchanged.
- [ ] With the `ru`/Finam bundle installed, a `Finam` tab appears between US and China tabs.
- [ ] The tab can search Finam asset names and native ticker aliases but stores canonical symbols.
- [ ] Selecting a row opens the same central chart path as existing markets.
- [ ] `strategy_backtest` can backtest a Finam canonical symbol using Finam klines.
- [ ] `screener_run(market='ru')` can build a Finam universe, scan its bounded pool and report truncation/failures honestly.
- [ ] Watchlist add/select/remove/group/pin survive host-first synchronization and reload.
- [ ] Empty catalog, unavailable credentials, rate limits, malformed pages and missing provider produce honest empty/error states.
- [ ] No execution capability is registered or exposed in the first slice.
- [ ] Existing crypto/us/cn/hk tests and UI behavior remain unchanged.

## Answer to the data-availability question

Да. После выполнения Tasks 2–6 данные Finam будут доступны в трёх местах через один источник:

1. **Список тикеров:** `/symbols?market=ru` → bounded Finam search/catalog path.
2. **Графики:** `/klines?market=ru&symbol=...` → Finam `getKlines`.
3. **Бэктесты:** `strategy_backtest(market='ru', symbol=...)` → `MarketDataRegistry` → тот же Finam `getKlines`.
4. **Скринер:** `screener_run(market='ru')` → полный backend-каталог Finam → daily klines → existing screener engine; UI при этом не рендерит весь каталог.

То есть отдельного «Finam-графика», «Finam-бэктеста» или отдельного скринера не будет: будет новый рынок `ru`, стандартный provider `finam` и начало полноценного broker-adapter пути по образцу Bybit/Binance/OKX, Alpaca/IBKR, QMT/Futu/Longbridge/Tiger.
