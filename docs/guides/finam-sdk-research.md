# Исследование `@finam/trade-api` 2.19.1 для Task 2

**Дата проверки:** 2026-11-17 01:08 (UTC+03:00)
**Объект:** read-only connector Finam/MOEX для текущего репозитория `dsh-trading`.
**Ограничение:** исследованы только официальные материалы Finam/GitHub/npm и исходники текущего репозитория. Секреты не читались и не выводились.

## Итог в двух абзацах

Официальный исходный checkout с версией `2.19.1` найден в commit `162c579e3ed330722f085dfbda37b961fe8a42c3`. Node SDK — ESM-пакет с единственным конструктором `createTradeApi()`/обёрткой `withTradeApi()`, gRPC-транспортом и сгенерированными protobuf-методами. Для каталога правильный вызов — **`api.assets.allAssets()`**, а не `Assets.AllAssets`; для котировки — **`api.marketData.lastQuote()`**; для истории — **`api.marketData.bars()`**. `bars()` не имеет `limit` или cursor: период задаётся через `interval.startTime` (inclusive) и `interval.endTime` (exclusive).

Критический gap: опубликованный `@finam/trade-api@2.19.1` не обнаружен в публичном npm registry на момент проверки (`GET` возвращает 404), отсутствует в локальных `node_modules`/pnpm-lock/store. Поэтому ниже разделены факты, подтверждённые официальным commit/proto, и то, что нельзя подтвердить без installable tarball или read-only network smoke. Не следует подменять целевой пакет `@finam/grpc-tradeapi`: официальный репозиторий прямо отличает его от Node SDK с клиентом, auth и retry.

## 1. Доступность версии и локальная проверка

### F-01. Версия 2.19.1 есть в официальном исходнике, но артефакт npm не подтверждён

- **Source grade:** S — официальный исходник Finam и npm registry.
- **Verdict:** mixed / implementation-blocking gap.
- **Anchor:** [официальный commit 2.19.1](https://github.com/FinamWeb/finam-trade-api/commit/162c579e3ed330722f085dfbda37b961fe8a42c3); [package.json этого commit](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/package.json#L1-L49); [npm metadata URL](https://registry.npmjs.org/@finam%2ftrade-api).
- **Finding:** официальный `sdk/node/package.json` содержит `name: "@finam/trade-api"`, `version: "2.19.1"`, но официальный GitHub commit message также говорит, что consumer lockfiles создаются после того, как пакет впервые попадёт в npm. В текущем registry запросы к `@finam/trade-api` и `@finam/trade-api/2.19.1` возвращают HTTP 404. Официальный список releases содержит 2.19.0 и следующие релизы, но отдельный опубликованный 2.19.1 release/tag не найден.
- **Рекомендация:** declaration в connector package может быть pinned ровно к `2.19.1`, но runtime install нельзя считать выполненным до появления проверяемого npm tarball/официального release. Не заменять его на `@finam/grpc-tradeapi` или текущую 2.24.x без отдельного решения.

### Локальное состояние репозитория

Проверены `node_modules`, `node_modules/.pnpm`, `pnpm-lock.yaml`, `node_modules/.pnpm/lock.yaml`, `node_modules/.package-map.json` и pnpm store path `C:\Users\Сергей\AppData\Local\pnpm\store\v11`: ссылки/записи `@finam/trade-api` отсутствуют. В npm cache обнаружена только запись для raw-пакета `@finam/grpc-tradeapi`; это не целевой SDK. В текущем рабочем дереве Task 2 добавляет pinned dependency declaration и host-side adapter, но pnpm resolution останавливается на registry 404 до появления installable SDK.

### Локальная сборка официального checkout

Официальный репозиторий был checkout-нут в `C:\Temp\finam-trade-api-2.19.1` на commit `162c579e3ed330722f085dfbda37b961fe8a42c3`. После `npm ci` в `sdk/node` bindings сгенерированы из официального `proto/` вручную через Windows-compatible launcher, потому что upstream `generate_proto.sh` вызывает Unix launcher и не запускается напрямую на Windows. `tsc -p tsconfig.json` прошёл; runtime exports `createTradeApi`, `withTradeApi`, `assets` и `marketData` проверены. Сгенерированные SDK-файлы не копировались в dsh-trading и не вендорились.

Официальные docs URL `https://tradeapi.finam.ru/docs/` при чтении перенаправили на `https://api.finam.ru/docs/` и вернули 404/минимальную shell-страницу; страница токенов также отдала только shell. Поэтому для точных API-фактов использованы официальный commit, protobuf и сгенерирующий скрипт, а не догадки по веб-странице.

## 2. Точные package exports и генерация типов

### F-02. Public export map

- **Source grade:** S.
- **Verdict:** supported for source checkout; published `.d.ts` not independently install-tested because npm gap выше.
- **Anchor:** [official `sdk/node/package.json`](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/package.json#L13-L49); [root `src/index.ts`](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/index.ts#L1-L22).
- **Exact subpaths:** `.`, `./accounts`, `./assets`, `./auth`, `./corporate-actions`, `./market-data`, `./metrics`, `./orders`, `./reports`.
- **Root runtime/type exports:**
  - `GrpcStatus` (alias `nice-grpc.Status`);
  - `createTradeApi`, `withTradeApi`;
  - `DEFAULT_ENDPOINT`, `DEFAULT_RETRY_POLICY`;
  - types `RetryPolicy`, `TradeApi`, `TradeApiOptions`;
  - `TradeApiError`, `AuthError`, `PermissionDeniedError`, `RateLimitError`, `InvalidArgumentError`, `NotFoundError`, `ServiceUnavailableError`, `DeadlineExceededError`, `InternalError`, `toTradeApiError`.
- **Read-only relevant subpath exports:** wrappers use `export *` from generated service modules. Exact generated names needed by Task 2 include:
  - `@finam/trade-api/assets`: `AssetsServiceDefinition`, `AssetsServiceClient`, `AssetsServiceImplementation`, `AllAssetsRequest`, `AllAssetsResponse`, `Asset`, `GetAssetRequest`, `GetAssetResponse`, `DeepPartial`, plus generated `MessageFns`/enum converters and other asset messages.
  - `@finam/trade-api/market-data`: `MarketDataServiceDefinition`, `MarketDataServiceClient`, `MarketDataServiceImplementation`, `TimeFrame`, `BarsRequest`, `BarsResponse`, `Bar`, `QuoteRequest`, `QuoteResponse`, `Quote`, `SubscribeQuoteRequest`, `SubscribeQuoteResponse`, `SubscribeBarsRequest`, `SubscribeBarsResponse`, `StreamError`, `DeepPartial`, plus generated orderbook/trade messages and converters.
- **Important:** there is no public `Assets.AllAssets` namespace/class in the Node SDK. The generated service client property is `api.assets`, and the generated lower-camel method is `api.assets.allAssets(...)`.

Generated bindings are intentionally not committed by Finam. The official generator uses `ts-proto` with `forceLong=bigint`, `importSuffix=.js`, `outputServices=nice-grpc`, `outputServices=generic-definitions`, and `useExactTypes=false`; this is why the exact generated method casing and types above are reproducible from the official proto rather than invented. See [official generator](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/scripts/generate_proto.sh#L20-L50).

### F-03. Generated data representation

- **Source grade:** S.
- **Verdict:** supported.
- **Anchor:** [official Node README](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/README.md#L158-L168); [decimal proto](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/google/type/decimal.proto); [official generator options](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/scripts/generate_proto.sh#L35-L45).
- **Finding:** protobuf timestamps are exposed as `Date`; int64 fields as `bigint`; `google.type.Decimal` is `{ value: string }`. Generated client request parameters use `DeepPartial`, but keep cursor values as `bigint` (`0n`) for deterministic code.
- **Recommendation:** parse decimal `.value` strictly, reject missing/malformed/non-finite values, then convert only at the DSH `number` boundary. Never turn an absent Decimal into numeric zero. The DSH `Kline`/`Ticker` contracts require numbers, so retain the original provider value only in local error context, never in logs if it might contain sensitive request data.

## 3. Client creation, credentials and lifecycle

### F-04. There is no `Credentials` constructor/object in the SDK

- **Source grade:** S.
- **Verdict:** supported.
- **Anchor:** [official client implementation](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/client.ts#L13-L35); [official README quick start](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/README.md#L26-L83).
- **Exact options:**

```ts
import { createTradeApi, withTradeApi } from '@finam/trade-api'

const api = await createTradeApi({
  secret: hostResolvedSecret,
  // optional: sourceAppId, endpoint, retry, channelOptions, insecure, onRenewalError
})
try {
  // use api.assets / api.marketData only
} finally {
  await api.close()
}

await withTradeApi({ secret: hostResolvedSecret }, async ({ assets, marketData }) => {
  // bounded read-only work
})
```

- `secret` is required and is sent in the Auth RPC body; `sourceAppId` defaults to an empty string.
- `DEFAULT_ENDPOINT` is `api.finam.ru:443`; TLS is default. `insecure` is explicitly for a local test server and must not be used in production.
- `createTradeApi()` performs initial JWT auth before resolving. It starts JWT-renewal streaming in the background; `close()` aborts renewal and closes the channel. `withTradeApi()` closes in `finally`.
- All authorized services receive the current `authorization` metadata; the auth client is deliberately built without that header. `getToken()` exists but must not cross the host/UI boundary.

**Task 2 credential recommendation:** resolve only the ref `FINAM_API_SECRET` (or a configurable ref) in host-side `dataplane`/service code through the repository credentials seam; never put the secret, JWT, account IDs or resolved value in client state, watchlist, URL, tests, error text or logs. A missing ref should fail with `TRADING_CREDENTIALS_MISSING`, not register a fake public provider or return an empty catalog as if it were valid.

## 4. Assets catalog and pagination

### F-05. `Assets.AllAssets` equivalent and exact request/response

- **Source grade:** S.
- **Verdict:** supported.
- **Anchor:** [AssetsService and RPC](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/assets/assets_service.proto#L86-L143); [AllAssets request/response](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/assets/assets_service.proto#L301-L333); [official README service table](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/README.md#L116-L134).
- **Exact call:**

```ts
const page = await api.assets.allAssets({
  cursor: 0n,
  onlyActive: true,
  onlyDisabled: false,
})
// page.assets: Asset[]
// page.nextCursor: bigint
```

- `AllAssets` is the current, paginated RPC. The older `Assets` RPC exists as `api.assets.assets({})` but is marked deprecated in the official proto/generated client; do not use it for a complete universe.
- `Asset` fields are exactly `symbol`, `id`, `ticker`, `mic`, `isin`, `type`, `name`, `isArchived`. `symbol` is provider-native `ticker@mic` (example `SBER@MISX`).
- `AllAssets` is documented as all instruments, including indicative and archived. `onlyActive=true` filters active/non-archived instruments; `onlyDisabled=true` selects archived instruments. The response does not contain a page-size field or an explicit equity/tradable enum.

### F-06. Cursor semantics

- **Source grade:** S.
- **Verdict:** supported for cursor protocol; adapter safety policy is repository recommendation.
- **Anchor:** [proto cursor comments](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/assets/assets_service.proto#L311-L333); [HTTP/OpenAPI cursor type](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/docs/swagger/api.swagger.json#L683-L757).
- **Semantics:** first request uses cursor 0/omits it; subsequent request uses the previous response's `nextCursor`; `nextCursor` is the `sec_id` of the last instrument in the current page; `0` or absent means final page. REST/OpenAPI represents int64 cursor as a string; generated TypeScript represents it as `bigint`.
- **Recommended loop:**
  1. start `cursor=0n`, `onlyActive=true`, `onlyDisabled=false`;
  2. enforce a hard page/asset budget;
  3. collect only validated pages;
  4. stop on `nextCursor === 0n`;
  5. reject a repeated cursor, a non-advancing cursor, malformed `assets`, or a budget exhaustion as incomplete/upstream error rather than looping forever;
  6. stable-dedupe by current canonical symbol after `canonicalFinamSymbol(asset.symbol)`.
- No official page-size parameter exists. Do not invent `limit`, `page`, or offset semantics.

### F-07. Tradable MOEX equities are not fully identifiable from `AllAssets` alone

- **Source grade:** S.
- **Verdict:** insufficient / open gap.
- **Anchor:** [Asset fields](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/assets/assets_service.proto#L505-L522); [GetAssetParams and `is_tradable`](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/assets/assets_service.proto#L403-L444).
- **Finding:** `Asset.type` is an unconstrained string; the official 2.19.1 proto does not publish a stock/equity type vocabulary. `Asset` has `isArchived` but no `isTradable`. `GetAssetParamsResponse` has `isTradable`, but its request requires `symbol` and `accountId`; using it for every catalog item would require account context and would cross the intended read-only market-data boundary.
- **Recommendation:** first filter `mic === 'MISX'` (case-normalized), `isArchived === false`, and canonicalize through the already implemented [repository mapper](../../packages/connector-finam/src/symbol.ts#L1-L54). Do **not** claim “equity” or “tradable” from an undocumented `type` string. Keep the catalog result explicitly `active-MISX` until official type values and a credentialed smoke test establish a safe equity/tradability predicate. If the product requires strict tradable-only semantics, block that acceptance criterion pending an official contract or network evidence.

## 5. Market data: ticker, bars and streams

### F-08. Latest ticker

- **Source grade:** S.
- **Verdict:** supported.
- **Anchor:** [MarketDataService RPCs](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/marketdata/marketdata_service.proto#L90-L188); [Quote fields](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/marketdata/marketdata_service.proto#L342-L402); [official README method table](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/README.md#L116-L134).
- **Exact call:**

```ts
const response = await api.marketData.lastQuote({ symbol: 'SBER@MISX' })
const quote = response.quote // Quote | undefined
```

- `QuoteResponse` has `symbol` and optional `quote`.
- `Quote` has optional Decimal fields `ask`, `askSize`, `bid`, `bidSize`, `last`, `lastSize`, `volume`, `turnover`, `open`, `high`, `low`, `close`, `change`, `openInterest`; `timestamp` is a protobuf timestamp exposed as `Date`; `isDataSnapshot` is boolean.
- Official comment says ask/bid are 0 when there is no active side and `change = last - close`. Do not treat absent `quote` or absent `last` as price 0. Map `last` to DSH `Ticker.price`; map timestamp to epoch ms; map bid/ask/volume only when present and valid. `prevClose`/`changePercent` are derivable from `close`/`change` only when the denominator is nonzero; otherwise leave optional fields absent.

### F-09. Historical candles

- **Source grade:** S.
- **Verdict:** supported for endpoint and fields; DSH `limit`/`closeTime` semantics need adapter policy and network verification.
- **Anchor:** [Bars RPC and HTTP mapping](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/marketdata/marketdata_service.proto#L90-L119); [Bars request/response and Bar fields](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/marketdata/marketdata_service.proto#L222-L260); [OpenAPI interval semantics](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/docs/swagger/api.swagger.json#L1606-L1699).
- **Exact call:**

```ts
const response = await api.marketData.bars({
  symbol: 'SBER@MISX',
  timeframe: TimeFrame.TIME_FRAME_D,
  interval: {
    startTime: startDate, // inclusive
    endTime: endDate,     // exclusive
  },
})
// response.bars: Bar[]
```

- `BarsRequest` has only `symbol`, `timeframe`, `interval`; there is no provider `limit`, `page`, or cursor.
- `Bar` contains `timestamp`, optional Decimal `open/high/low/close/volume`, and `isDataSnapshot`. The proto does not provide a separate close timestamp.
- Implement DSH `getKlines(..., limit)` by deriving a bounded date interval, calling `bars()` once, validating/sorting ascending, and taking the newest `limit` valid bars. Do not claim that Finam itself accepted a count parameter.
- `openTime` should be the provider bar timestamp only after the network spike confirms that timestamp is the bar start. DSH requires `closeTime`, but Finam 2.19.1 does not send one; deriving it from a nominal timeframe or the next bar is an adapter convention and must be covered by an explicit test/documented limitation, not silently presented as provider data.

### F-10. Streams and cancellation

- **Source grade:** S.
- **Verdict:** supported for API shape; reliability/reconnect behavior unverified.
- **Anchor:** [official README stream example and cancellation](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/README.md#L85-L107); [stream RPCs and response error](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/marketdata/marketdata_service.proto#L178-L188); [SubscribeQuote fields](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/marketdata/marketdata_service.proto#L282-L294).
- **Exact shape:** `api.marketData.subscribeQuote({ symbols: ['SBER@MISX'] }, { signal })` returns `AsyncIterable<SubscribeQuoteResponse>`. Each response contains `quote: Quote[]` and optional `error: StreamError` (`code: number`, `description: string`). `subscribeBars` is also available.
- SDK README explicitly says streams are **not automatically retried**; the application decides how to resume without duplicates. For the first UI slice, use bounded REST polling behind `Disposable`, or implement an `AbortController`-owned stream with explicit reconnect/backoff and tests. Do not claim reliable streaming until a real network spike verifies it.

## 6. Supported interval vocabulary

### F-11. Official Finam `TimeFrame` values

- **Source grade:** S.
- **Verdict:** supported.
- **Anchor:** [official TimeFrame enum](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/marketdata/marketdata_service.proto#L192-L220); [DSH Interval and capability contract](../../packages/api/src/index.ts#L24-L40).

| DSH `Interval` | Finam enum | Official documented history depth |
|---|---|---|
| `1m` | `TIME_FRAME_M1` | 7 days |
| `5m` | `TIME_FRAME_M5` | 30 days |
| `15m` | `TIME_FRAME_M15` | 30 days |
| `30m` | `TIME_FRAME_M30` | 30 days |
| `1h` | `TIME_FRAME_H1` | 30 days |
| `2h` | `TIME_FRAME_H2` | 30 days |
| `4h` | `TIME_FRAME_H4` | 30 days |
| `8h` | `TIME_FRAME_H8` | 30 days |
| `1d` | `TIME_FRAME_D` | 365 days |
| `1w` | `TIME_FRAME_W` | 365×5 days |
| `1M` | `TIME_FRAME_MN` | 365×5 days |

`TIME_FRAME_QR` (quarter, documented as 365×5 days) exists in Finam but has no corresponding value in the current DSH `Interval` union, so it must not be exposed through `MarketDataService` without a separate contract change. DSH values `3m`, `6h`, `12h`, `3d` and `TIME_FRAME_UNSPECIFIED` have no Finam 2.19.1 mapping and must fail before network with `TRADING_UNSUPPORTED_INTERVAL`.

The documented depths are calendar-day windows, not guaranteed returned bar counts. Do not convert them into an unverified `maxBars` number for `klineCapabilities()`. Either omit the optional capability declaration until smoke evidence establishes a conservative count or declare only values backed by measured provider behavior.

## 7. HTTP/gRPC behavior and error mapping

### F-12. Official transport/error facts

- **Source grade:** S.
- **Verdict:** supported; some HTTP descriptions are internally inconsistent and require conservative mapping.
- **Anchor:** [SDK error classes/status mapping](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/errors.ts#L3-L60); [SDK retry policy](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/internal/retry.ts#L4-L31); [market-data OpenAPI responses](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/docs/swagger/api.swagger.json#L1606-L1651); [assets OpenAPI responses](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/docs/swagger/api.swagger.json#L683-L723).

| Upstream/gRPC condition | SDK class | Task 2 adapter recommendation |
|---|---|---|
| 401 / `UNAUTHENTICATED` | `AuthError` | `TRADING_AUTH_FAILED`; never retry |
| permission denied | `PermissionDeniedError` | `TRADING_AUTH_FAILED` or `TRADING_UPSTREAM_ERROR`, retain typed cause; no dedicated DSH permission code |
| 400 / `INVALID_ARGUMENT` | `InvalidArgumentError` | local unsupported interval/symbol before call; otherwise `TRADING_UPSTREAM_ERROR` with redacted details |
| 404 / `NOT_FOUND` | `NotFoundError` | `TRADING_SYMBOL_NOT_FOUND` only after operation/context proves it is an instrument miss; otherwise upstream error |
| 429 / `RESOURCE_EXHAUSTED` | `RateLimitError` | `TRADING_RATE_LIMITED`, bounded caller backoff |
| 500 / `INTERNAL` | `InternalError` | `TRADING_UPSTREAM_ERROR` |
| 503 / `UNAVAILABLE` | `ServiceUnavailableError` | SDK retries unary calls by default; after final failure, `TRADING_UPSTREAM_ERROR` (server was reached) |
| 504 / `DEADLINE_EXCEEDED` | `DeadlineExceededError` | `TRADING_UPSTREAM_ERROR` with timeout cause; do not convert to empty data |
| transport/non-`ClientError` failure | generic `TradeApiError` or original error | `TRADING_NETWORK` only for actual transport/timeout failure; preserve `cause` internally |

The official OpenAPI advertises a **200 requests/minute** limit, plus 401/404/429/500/503/504 and a default gRPC status response. The Node SDK default retry policy is four total unary attempts (three retries), exponential backoff starting at 200 ms and capped at 5 s, and retries only `UNAVAILABLE`. Streams are not auto-retried.

There is an official ambiguity: the market-data proto describes 404 as “instrument not found”, while generated OpenAPI path responses often describe 404 as “account not found in token”. Therefore do not map every 404 to `TRADING_SYMBOL_NOT_FOUND`; use local catalog validation and retain the SDK `code/path/details` as cause. The DSH error vocabulary and distinction between symbol miss, upstream HTTP error and network error are defined in [current API contract](../../packages/api/src/index.ts#L899-L968).

## 8. How to keep Task 2 read-only

### F-13. The official root client contains execution clients; no SDK read-only mode was found

- **Source grade:** S.
- **Verdict:** supported limitation / insufficient for a hard exclusion guarantee.
- **Anchor:** [official service client assembly](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/internal/services.ts#L31-L62); [package `./orders` export](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/package.json#L42-L49); [official orders RPCs](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/orders/orders_service.proto#L78-L128).
- **Finding:** `createTradeApi()` always assembles `auth`, `accounts`, `assets`, `corporateActions`, `marketData`, `orders`, `reports`, and `metrics` clients. It does not expose `readOnly: true` or a service-selection option. No network call is made merely by constructing the `orders` client, but `TradeApi` still has an `orders` property with execution methods.
- **Required implementation boundary:**
  1. import only root client plus `@finam/trade-api/assets` and `@finam/trade-api/market-data` types/runtime enum;
  2. never import `@finam/trade-api/orders`, `accounts`, or `reports` in connector code;
  3. keep the SDK object private and expose a local `ReadOnlyFinamApi`/`FinamMarketDataService`, not `TradeApi`, to the rest of DSH;
  4. use only `assets.allAssets`, `marketData.lastQuote`, `marketData.bars` and, if verified, `marketData.subscribeQuote`; do not call `api.orders`, `api.accounts`, `api.reports` or account discovery;
  5. dataplane registers only `(ru, finam)` in `tradingMarketDataRegistry`; it must not register `TradeService`, `tradingRuTrade`, order tools, balances, positions, fills or execution UI;
  6. add static/tests that fail if execution subpath imports, order method names, TradeService registration or order endpoints appear.
- **Hard-exclusion gap:** because the official root SDK still wires an `orders` client internally, a requirement that the compiled dependency contain no execution client cannot be met by the public `createTradeApi()` API. Do not claim that it is. If a hard transport-level prohibition is required, request an official read-only SDK/service-selection option or separately build a narrowly scoped client from the official auth/assets/market-data generated definitions; that would be a new design and must not be improvised in Task 2.

## 9. Exact implementation plan against this repository

### 9.1 Package and lifecycle

1. Keep current [canonical symbol mapper](../../packages/connector-finam/src/symbol.ts#L1-L54): public `TICKER.MOEX`, connector-native `TICKER@MISX`; do not duplicate mapping.
2. Keep the exact pinned runtime dependency declaration `@finam/trade-api: 2.19.1`; first prove install and generated declarations in CI once the registry exposes the package. Do not vendor generated SDK files.
3. Use a host-only credential resolver for `FINAM_API_SECRET`. Create one long-lived SDK client per connector service/config, cache it behind a promise, and `await api.close()` on service/dataplane dispose. Avoid authenticating once per ticker request.
4. Do not expose `getToken()` or the raw `TradeApi` object. `sourceAppId` may remain omitted unless Finam gives DSH a documented application id.

### 9.2 Catalog

1. Loop `api.assets.allAssets({ cursor, onlyActive: true, onlyDisabled: false })`.
2. Apply page budget, repeated/non-advancing cursor guard and malformed-page validation.
3. Filter normalized `mic === 'MISX'` and `isArchived === false`; canonicalize `asset.symbol` using `canonicalFinamSymbol`, preserve only canonical symbols in `InstrumentRef` and UI.
4. Stable-dedupe by canonical symbol; preserve first verified display name.
5. Return/throw an explicit incomplete/upstream result on budget exhaustion or malformed pages. Never freeze the sidebar and never render the full backend catalog wholesale.
6. Cache the complete catalog for `listInstruments()` and implement bounded `searchInstruments(query, limit)` over that cache. Enforce a small result limit.
7. Keep “tradable MOEX equity” as an acceptance gap until official type/tradability evidence exists.

### 9.3 Quote and bars

1. Convert `SBER.MOEX` to `SBER@MISX` only immediately before SDK calls.
2. `getTicker`: call `lastQuote`, require a valid `quote.last.value`, map Date→epoch ms, parse optional Decimal fields, and return canonical `Ticker.symbol`.
3. `getKlines`: map only the 11 supported DSH intervals in §6; derive a bounded inclusive/exclusive Date interval from the official depth; call `bars`; validate all required OHLCV fields; sort ascending; take the newest requested `limit`.
4. Do not claim a provider count limit or exact `closeTime` until network evidence verifies them. Unsupported interval must fail locally with `TRADING_UNSUPPORTED_INTERVAL`.
5. Start `subscribeTicker` as bounded REST polling if stream lifecycle is not yet proven. If using `subscribeQuote`, own the AbortController, inspect `StreamError`, and implement reconnect outside the SDK.

### 9.4 Error and test matrix

Add focused tests with no credentials/network for:

- native/canonical symbol request payloads;
- `AllAssets` pages with `0n`, next cursor, empty final page, repeated cursor, non-advancing cursor and malformed assets;
- nested Decimal and Date normalization, absent quote/last, invalid numeric text and empty bars;
- every interval mapping plus rejection of `3m`, `6h`, `12h`, `3d`, quarter and unspecified;
- `AuthError`, `RateLimitError`, `InvalidArgumentError`, `NotFoundError`, `ServiceUnavailableError`, `DeadlineExceededError` and generic transport error mapping;
- no secret/JWT/account id in messages, logs, fixtures or client/UI state;
- no `TradeService` registration and no orders/account/reports imports or calls.

A later real-network spike, using a user-provided read-only secret outside this research note, must verify one asset page/cursor, one native ticker, one daily bar range, at least one intraday interval, invalid symbol behavior, timestamp semantics and stream/poll cancellation. It must not call `PlaceOrder`, `CancelOrder`, `PlaceSLTPOrder`, order streams, or any other execution endpoint.

## 10. Unknowns that must stay explicit

1. Installable npm tarball and integrity for `@finam/trade-api@2.19.1` are unavailable; exact published `.d.ts` and runtime package contents are not verified.
2. No official asset `type` vocabulary or account-free `isTradable` signal is present in the inspected 2.19.1 proto.
3. `AllAssets` server page size and maximum number of pages are undocumented.
4. `Bar.timestamp` open/close meaning, timezone/session interpretation and DSH `closeTime` equivalent are not explicit.
5. Exact provider behavior for empty bars, delayed quotes, permission failures and 404 detail is not network-verified; OpenAPI descriptions are inconsistent for 404.
6. `StreamError.code` vocabulary, stream heartbeat, disconnect and reconnect semantics are not documented in the inspected source.
7. The public SDK has no read-only service-selection constructor; root-client construction therefore cannot be described as a hard execution-endpoint exclusion.
8. Official web docs were not usable as a primary evidence surface during this run (redirect/404/shell), so no additional claims are made from them.

## Sources

### Official Finam primary sources

- [Node SDK package manifest, commit 2.19.1](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/package.json)
- [Node SDK README](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/README.md)
- [Client creation/lifecycle source](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/client.ts)
- [Root exports](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/index.ts)
- [Service assembly](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/internal/services.ts)
- [Auth renewal](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/internal/auth.ts)
- [Retry policy](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/internal/retry.ts)
- [Typed errors](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/sdk/node/src/errors.ts)
- [Assets protobuf contract](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/assets/assets_service.proto)
- [Market-data protobuf contract](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/marketdata/marketdata_service.proto)
- [Auth protobuf contract](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/auth/auth_service.proto)
- [Orders protobuf contract](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/proto/grpc/tradeapi/v1/orders/orders_service.proto)
- [Generated REST/OpenAPI description](https://github.com/FinamWeb/finam-trade-api/blob/162c579e3ed330722f085dfbda37b961fe8a42c3/docs/swagger/api.swagger.json)
- [Official release list](https://github.com/FinamWeb/finam-trade-api/releases)
- [npm registry metadata checked for target](https://registry.npmjs.org/@finam%2ftrade-api)

### Current repository primary sources

- [Task 2 plan and boundaries](../../FINAM_BROKER.md#L135-L165)
- [Finam canonical/native symbol mapping](../../packages/connector-finam/src/symbol.ts#L1-L54)
- [MarketDataService, interval, registry and error contracts](../../packages/api/src/index.ts#L24-L40) · [MarketDataService](../../packages/api/src/index.ts#L711-L825) · [errors](../../packages/api/src/index.ts#L899-L968) · [registry](../../packages/api/src/index.ts#L1030-L1063)
- [Connector playbook: read-only boundary and dataplane conventions](connector-playbook.md#L56-L80) · [registration](connector-playbook.md#L127-L180)

## Final implementation decision

**Do not implement against an invented or substitute Finam API.** The implementation can be prepared around the verified source shape above, but dependency installation, generated declaration verification, tradable-equity filtering, bar timestamp/close-time policy and real error/stream behavior remain explicit gates. The first safe slice is a host-only `MarketDataService` using `allAssets` + `lastQuote` + `bars`, canonical `TICKER.MOEX` output, host-side secret resolution, bounded caching/pagination, typed error mapping, and no DSH execution service.
