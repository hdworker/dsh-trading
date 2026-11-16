/**
 * Finam read-only market-data adapter.
 *
 * This module is deliberately independent from the SDK package at test time:
 * callers inject a `withApi` executor, while the host-side plugin supplies the
 * official `@finam/trade-api` client and resolves the secret.
 */
import type { InstrumentRef, Interval, Kline, Ticker, TradingErrorCode } from '@dshtrading/api'
import { canonicalFinamSymbol, nativeFinamSymbol, FinamSymbolError } from './symbol.ts'

export type FinamDecimal = { readonly value?: string } | string | number | undefined
export type FinamTimestamp = Date | number | string | undefined

export interface FinamAssetRecord {
  readonly symbol?: string
  readonly ticker?: string
  readonly mic?: string
  readonly type?: string
  readonly name?: string
  readonly isArchived?: boolean
}

export interface FinamAllAssetsRequest {
  readonly cursor: bigint
  readonly onlyActive: boolean
  readonly onlyDisabled: boolean
}

export interface FinamAllAssetsResponse {
  readonly assets?: readonly FinamAssetRecord[]
  readonly nextCursor?: bigint | number | string
}

export interface FinamQuoteRecord {
  readonly symbol?: string
  readonly timestamp?: FinamTimestamp
  readonly last?: FinamDecimal
  readonly bid?: FinamDecimal
  readonly ask?: FinamDecimal
  readonly volume?: FinamDecimal
  readonly close?: FinamDecimal
}

export interface FinamQuoteRequest {
  readonly symbol: string
}

export interface FinamQuoteResponse {
  readonly symbol?: string
  readonly quote?: FinamQuoteRecord
}

export interface FinamBarRecord {
  readonly timestamp?: FinamTimestamp
  readonly open?: FinamDecimal
  readonly high?: FinamDecimal
  readonly low?: FinamDecimal
  readonly close?: FinamDecimal
  readonly volume?: FinamDecimal
}

export interface FinamBarsRequest {
  readonly symbol: string
  readonly timeframe: number
  readonly interval: {
    readonly startTime: Date
    readonly endTime: Date
  }
}

export interface FinamBarsResponse {
  readonly symbol?: string
  readonly bars?: readonly FinamBarRecord[]
}

export interface FinamApiLike {
  readonly assets: {
    allAssets(request: FinamAllAssetsRequest): Promise<FinamAllAssetsResponse>
  }
  readonly marketData: {
    lastQuote(request: FinamQuoteRequest): Promise<FinamQuoteResponse>
    bars(request: FinamBarsRequest): Promise<FinamBarsResponse>
  }
}

export type FinamApiExecutor = <Result>(run: (api: FinamApiLike) => Promise<Result>) => Promise<Result>

export interface FinamRestOptions {
  readonly withApi: FinamApiExecutor
  readonly now?: () => number
  readonly maxAssetPages?: number
}

export class TradingServiceError extends Error {
  readonly code: TradingErrorCode

  constructor(code: TradingErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'TradingServiceError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

/** Official Finam timeframe enum values from proto/grpc/tradeapi/v1/marketdata. */
export const FINAM_TIMEFRAME: ReadonlyMap<Interval, number> = new Map([
  ['1m', 1],
  ['5m', 5],
  ['15m', 9],
  ['30m', 11],
  ['1h', 12],
  ['2h', 13],
  ['4h', 15],
  ['8h', 17],
  ['1d', 19],
  ['1w', 20],
  ['1M', 21],
])

const INTERVAL_MS: ReadonlyMap<Interval, number> = new Map([
  ['1m', 60_000],
  ['5m', 5 * 60_000],
  ['15m', 15 * 60_000],
  ['30m', 30 * 60_000],
  ['1h', 60 * 60_000],
  ['2h', 2 * 60 * 60_000],
  ['4h', 4 * 60 * 60_000],
  ['8h', 8 * 60 * 60_000],
  ['1d', 86_400_000],
  ['1w', 7 * 86_400_000],
  ['1M', 30 * 86_400_000],
])

const DEFAULT_MAX_ASSET_PAGES = 100

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : ''
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'unknown upstream error'
}

/** Map official SDK typed errors without copying credentials into the error surface. */
export function mapFinamError(error: unknown, operation: string): TradingServiceError | FinamSymbolError {
  if (error instanceof TradingServiceError || error instanceof FinamSymbolError) return error
  const name = errorName(error)
  if (name === 'RateLimitError') return new TradingServiceError('TRADING_RATE_LIMITED', `Finam ${operation}: rate limited`)
  if (name === 'AuthError' || name === 'PermissionDeniedError') {
    return new TradingServiceError('TRADING_AUTH_FAILED', `Finam ${operation}: authentication failed`)
  }
  if (name === 'NotFoundError') {
    return new TradingServiceError('TRADING_SYMBOL_NOT_FOUND', `Finam ${operation}: symbol not found`)
  }
  if (name === 'ServiceUnavailableError' || name === 'DeadlineExceededError') {
    return new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam ${operation}: service unavailable`)
  }
  if (name === 'InvalidArgumentError') {
    return new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam ${operation}: invalid upstream request`)
  }
  return new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam ${operation}: ${errorMessage(error)}`)
}

function asFiniteNumber(value: FinamDecimal, field: string): number | undefined {
  if (value === undefined) return undefined
  const raw = typeof value === 'object' && value !== null ? value.value : value
  if (raw === undefined || raw === '') return undefined
  const number = Number(raw)
  if (!Number.isFinite(number)) {
    throw new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam: invalid decimal field ${field}`)
  }
  return number
}

function requiredNumber(value: FinamDecimal, field: string): number {
  const number = asFiniteNumber(value, field)
  if (number === undefined) throw new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam: missing decimal field ${field}`)
  return number
}

function timestampMs(value: FinamTimestamp, field: string): number {
  const number = value instanceof Date
    ? value.getTime()
    : typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Date.parse(value)
        : Number.NaN
  if (!Number.isFinite(number)) throw new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam: invalid timestamp field ${field}`)
  return number < 10_000_000_000 ? number * 1000 : number
}

function bigintCursor(value: bigint | number | string | undefined): bigint {
  if (value === undefined) return 0n
  try {
    return typeof value === 'bigint' ? value : BigInt(value)
  } catch {
    throw new TradingServiceError('TRADING_UPSTREAM_ERROR', 'Finam assets: malformed next_cursor')
  }
}

function nativeSymbol(input: string): string {
  const canonical = canonicalFinamSymbol(input)
  const native = nativeFinamSymbol(canonical)
  return `${native.ticker}@${native.mic}`
}

function instrumentFromAsset(asset: FinamAssetRecord): InstrumentRef | undefined {
  // The official Asset message always carries `symbol`; do not synthesize a
  // request identity from partial ticker/MIC fields because that can create a
  // wrong watchlist row when a malformed page is returned.
  const raw = asset.symbol
  if (raw === undefined || asset.isArchived === true) return undefined
  // The 2.19.1 proto exposes `type` as an unconstrained string and does not
  // publish a tradable-equity vocabulary. Keep this slice explicitly scoped
  // to active MISX assets; do not invent a type predicate.
  let canonical: string
  try {
    canonical = canonicalFinamSymbol(raw)
  } catch {
    return undefined
  }
  const name = asset.name?.trim()
  if (name === undefined || name === '') return undefined
  return { symbol: canonical, name }
}

export class FinamRestClient {
  private readonly withApi: FinamApiExecutor
  private readonly now: () => number
  private readonly maxAssetPages: number

  constructor(options: FinamRestOptions) {
    this.withApi = options.withApi
    this.now = options.now ?? (() => Date.now())
    this.maxAssetPages = Math.max(1, Math.floor(options.maxAssetPages ?? DEFAULT_MAX_ASSET_PAGES))
  }

  private async call<Result>(operation: string, run: (api: FinamApiLike) => Promise<Result>): Promise<Result> {
    try {
      return await this.withApi(run)
    } catch (error) {
      throw mapFinamError(error, operation)
    }
  }

  async listInstruments(): Promise<InstrumentRef[]> {
    const result = new Map<string, InstrumentRef>()
    const seenCursors = new Set<string>()
    let cursor = 0n

    for (let page = 0; page < this.maxAssetPages; page += 1) {
      const response = await this.call('assets.allAssets', api => api.assets.allAssets({ cursor, onlyActive: true, onlyDisabled: false }))
      for (const asset of response.assets ?? []) {
        const instrument = instrumentFromAsset(asset)
        if (instrument !== undefined && !result.has(instrument.symbol)) result.set(instrument.symbol, instrument)
      }

      const next = bigintCursor(response.nextCursor)
      if (next === 0n) return [...result.values()]
      const key = String(next)
      if (seenCursors.has(key)) {
        throw new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam assets: repeated pagination cursor ${key}`)
      }
      seenCursors.add(key)
      cursor = next
    }

    throw new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam assets: pagination exceeded ${this.maxAssetPages} pages`)
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const canonical = canonicalFinamSymbol(symbol)
    const native = nativeSymbol(canonical)
    const response = await this.call('marketData.lastQuote', api => api.marketData.lastQuote({ symbol: native }))
    const quote = response.quote
    if (quote === undefined) throw new TradingServiceError('TRADING_UPSTREAM_ERROR', `Finam ticker ${canonical}: missing quote`)
    const timestamp = timestampMs(quote.timestamp, 'quote.timestamp')
    const price = requiredNumber(quote.last, 'quote.last')
    const bid = asFiniteNumber(quote.bid, 'quote.bid')
    const ask = asFiniteNumber(quote.ask, 'quote.ask')
    const volume = asFiniteNumber(quote.volume, 'quote.volume')
    const prevClose = asFiniteNumber(quote.close, 'quote.close')
    return {
      symbol: canonical,
      price,
      timestamp,
      ...(bid !== undefined && bid > 0 ? { bid } : {}),
      ...(ask !== undefined && ask > 0 ? { ask } : {}),
      ...(volume !== undefined ? { volume } : {}),
      ...(prevClose !== undefined ? { prevClose } : {}),
    }
  }

  async getKlines(symbol: string, interval: Interval, limit = 100): Promise<Kline[]> {
    const timeframe = FINAM_TIMEFRAME.get(interval)
    const duration = INTERVAL_MS.get(interval)
    if (timeframe === undefined || duration === undefined) {
      throw new TradingServiceError('TRADING_UNSUPPORTED_INTERVAL', `Finam klines: unsupported interval ${String(interval)}`)
    }
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new TradingServiceError('TRADING_EXCHANGE_ERROR', `Finam klines: limit must be a positive integer`)
    }
    const canonical = canonicalFinamSymbol(symbol)
    const native = nativeSymbol(canonical)
    const endTime = new Date(this.now())
    const startTime = new Date(endTime.getTime() - duration * limit)
    const response = await this.call('marketData.bars', api => api.marketData.bars({
      symbol: native,
      timeframe,
      interval: { startTime, endTime },
    }))
    const bars = (response.bars ?? []).map((bar): Kline => {
      const openTime = timestampMs(bar.timestamp, 'bar.timestamp')
      return {
        openTime,
        closeTime: openTime + duration - 1,
        open: requiredNumber(bar.open, 'bar.open'),
        high: requiredNumber(bar.high, 'bar.high'),
        low: requiredNumber(bar.low, 'bar.low'),
        close: requiredNumber(bar.close, 'bar.close'),
        volume: requiredNumber(bar.volume, 'bar.volume'),
      }
    })
    bars.sort((a, b) => a.openTime - b.openTime)
    return bars.slice(-limit)
  }
}
