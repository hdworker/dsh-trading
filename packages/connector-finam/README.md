# @dshtrading/connector-finam

Read-only Finam/MOEX market-data connector for the `ru` market.

## Capability boundary

- Provider: `finam`
- Market: `ru`
- Canonical symbols: `TICKER.MOEX` (for example `SBER.MOEX`)
- Finam native symbols (`SBER@MISX`) are used only inside the connector request seam.
- Implements market data only: active instrument catalog, bounded search, ticker, klines and polling-based ticker subscription.
- Does **not** register `TradeService`, order tools, balances, positions, fills or execution endpoints.

## Credentials

The official `@finam/trade-api@2.19.1` SDK is loaded only on the host connector boundary. The default host-side credential reference is `FINAM_API_SECRET`.

The secret value must not enter client state, watchlists, URLs, tests or logs. Missing credentials fail with `TRADING_CREDENTIALS_MISSING`.

## SDK and data source

The adapter uses the official Finam Trade API Node SDK and its gRPC services:

- `assets.allAssets({ cursor, onlyActive })` for the complete instrument catalog;
- `marketData.lastQuote({ symbol })` for the latest quote;
- `marketData.bars({ symbol, timeframe, interval })` for historical candles;
- `marketData.subscribeQuote(...)` is available in the upstream SDK, while the first GUI slice uses a bounded REST polling subscription fallback.

The SDK package is pinned to `2.19.1`; the connector deliberately does not advertise `klineCapabilities` until a smoke check verifies timestamp semantics and conservative returned depth.

## Read-only safety

No `orders` SDK surface is imported or called. The connector never places, cancels or modifies an order.

## Symbol mapping

`canonicalFinamSymbol('SBER@MISX')` returns `SBER.MOEX`.
`nativeFinamSymbol('SBER.MOEX')` returns `{ ticker: 'SBER', mic: 'MISX' }`.
Unknown MICs and malformed symbols fail closed with `TRADING_UNSUPPORTED_SYMBOL`.

## License / terms

Finam Trade API usage is subject to Finam's current API terms and account permissions. This package does not redistribute market data or credentials.
