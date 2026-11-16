/**
 * Task 2 slice 1: Finam SDK response normalization at the connector seam.
 */
import { describe, expect, it } from 'vitest'
import type {
  FinamAllAssetsRequest,
  FinamAllAssetsResponse,
  FinamApiLike,
  FinamBarsRequest,
  FinamBarsResponse,
  FinamQuoteRequest,
  FinamQuoteResponse,
} from '../src/rest.ts'
import { FinamRestClient, mapFinamError } from '../src/rest.ts'

const DAY_MS = 86_400_000
const NOW = Date.parse('2026-01-10T00:00:00.000Z')

function decimal(value: string) {
  return { value }
}

interface Harness {
  client: FinamRestClient
  assets: FinamAllAssetsRequest[]
  quotes: FinamQuoteRequest[]
  bars: FinamBarsRequest[]
}

function makeHarness(options: {
  pages?: FinamAllAssetsResponse[]
  quote?: FinamQuoteResponse
  bars?: FinamBarsResponse
} = {}): Harness {
  const assets: FinamAllAssetsRequest[] = []
  const quotes: FinamQuoteRequest[] = []
  const bars: FinamBarsRequest[] = []
  let pageIndex = 0
  const api: FinamApiLike = {
    assets: {
      allAssets: async (request) => {
        assets.push(request)
        const page = options.pages?.[pageIndex]
        pageIndex += 1
        return page ?? { assets: [], nextCursor: 0n }
      },
    },
    marketData: {
      lastQuote: async (request) => {
        quotes.push(request)
        return options.quote ?? { symbol: request.symbol, quote: undefined }
      },
      bars: async (request) => {
        bars.push(request)
        return options.bars ?? { symbol: request.symbol, bars: [] }
      },
    },
  }

  return {
    client: new FinamRestClient({
      withApi: async <T>(run: (value: FinamApiLike) => Promise<T>) => run(api),
      now: () => NOW,
    }),
    assets,
    quotes,
    bars,
  }
}

describe('FinamRestClient.listInstruments', () => {
  it('用户：получает полный активный MISX catalog без дублей и native symbols', async () => {
    // Given paginated AllAssets responses containing active, archived, non-MOEX and duplicate rows
    const harness = makeHarness({
      pages: [
        {
          assets: [
            { symbol: 'SBER@MISX', ticker: 'SBER', mic: 'MISX', type: 'STOCK', name: 'Сбербанк', isArchived: false },
            { symbol: 'SBER@MISX', ticker: 'SBER', mic: 'MISX', type: 'STOCK', name: 'Сбербанк duplicate', isArchived: false },
            { symbol: 'AAPL@XNAS', ticker: 'AAPL', mic: 'XNAS', type: 'STOCK', name: 'Apple', isArchived: false },
            { symbol: 'OLD@MISX', ticker: 'OLD', mic: 'MISX', type: 'STOCK', name: 'Old', isArchived: true },
            { symbol: 'BOND@MISX', ticker: 'BOND', mic: 'MISX', type: 'BOND', name: 'Bond', isArchived: false },
          ],
          nextCursor: 42n,
        },
        {
          assets: [
            { symbol: 'GAZP@MISX', ticker: 'GAZP', mic: 'MISX', type: 'EQUITY', name: 'Газпром', isArchived: false },
            { ticker: 'BROKEN', mic: 'MISX', type: 'STOCK', name: 'Broken', isArchived: false },
          ],
          nextCursor: 0n,
        },
      ],
    })

    // When the connector builds the complete catalog
    const instruments = await harness.client.listInstruments()

    // Then it returns stable canonical rows and follows the provider cursor
    expect(instruments).toEqual([
      { symbol: 'SBER.MOEX', name: 'Сбербанк' },
      { symbol: 'BOND.MOEX', name: 'Bond' },
      { symbol: 'GAZP.MOEX', name: 'Газпром' },
    ])
    expect(harness.assets).toEqual([
      { cursor: 0n, onlyActive: true, onlyDisabled: false },
      { cursor: 42n, onlyActive: true, onlyDisabled: false },
    ])
  })

  it('用户： получает повторяющийся cursor от провайдера и видит fail-closed ошибку', async () => {
    // Given provider pages that repeat the same non-zero cursor
    const harness = makeHarness({
      pages: [
        { assets: [], nextCursor: 7n },
        { assets: [], nextCursor: 7n },
      ],
    })

    // When the connector detects the repeated cursor
    const result = harness.client.listInstruments()

    // Then it rejects instead of looping indefinitely
    await expect(result).rejects.toMatchObject({ code: 'TRADING_UPSTREAM_ERROR' })
  })
})

describe('FinamRestClient.getTicker', () => {
  it('用户： получает nested decimal quote и видит canonical ticker', async () => {
    // Given an official-shaped quote response with decimal wrappers and a provider timestamp
    const harness = makeHarness({
      quote: {
        symbol: 'SBER@MISX',
        quote: {
          timestamp: new Date(NOW),
          last: decimal('280.12'),
          bid: decimal('280.10'),
          ask: decimal('280.14'),
          volume: decimal('123456.5'),
          close: decimal('279.90'),
        },
      },
    })

    // When requesting a canonical symbol
    const ticker = await harness.client.getTicker('SBER.MOEX')

    // Then the request uses native Finam spelling while output stays canonical
    expect(ticker).toEqual({
      symbol: 'SBER.MOEX',
      price: 280.12,
      bid: 280.1,
      ask: 280.14,
      volume: 123456.5,
      prevClose: 279.9,
      timestamp: NOW,
    })
    expect(harness.quotes).toEqual([{ symbol: 'SBER@MISX' }])
  })

  it('用户： получает quote без last price и видит upstream error вместо цены zero', async () => {
    // Given a quote response whose required last field is absent
    const harness = makeHarness({ quote: { symbol: 'SBER@MISX', quote: undefined } })

    // When requesting the ticker
    const result = harness.client.getTicker('SBER.MOEX')

    // Then the connector fails closed and never fabricates price zero
    await expect(result).rejects.toMatchObject({ code: 'TRADING_UPSTREAM_ERROR' })
  })
})

describe('Finam error mapping', () => {
  it('用户：映射官方 SDK typed errors 时保留 DSH error vocabulary и не раскрывает source message', () => {
    // Given official SDK error class names with a sensitive source message
    const cases = [
      ['AuthError', 'TRADING_AUTH_FAILED'],
      ['PermissionDeniedError', 'TRADING_AUTH_FAILED'],
      ['RateLimitError', 'TRADING_RATE_LIMITED'],
      ['NotFoundError', 'TRADING_SYMBOL_NOT_FOUND'],
      ['InvalidArgumentError', 'TRADING_UPSTREAM_ERROR'],
      ['ServiceUnavailableError', 'TRADING_UPSTREAM_ERROR'],
      ['DeadlineExceededError', 'TRADING_UPSTREAM_ERROR'],
    ] as const

    // When the connector maps each upstream error
    const mapped = cases.map(([name, code]) => {
      const error = new Error('secret-value')
      error.name = name
      return mapFinamError(error, 'test')
    })

    // Then only stable DSH codes/messages cross the adapter seam
    expect(mapped.map(error => error.code)).toEqual(cases.map(([, code]) => code))
    expect(mapped.every(error => !error.message.includes('secret-value'))).toBe(true)
  })
})

describe('FinamRestClient.getKlines', () => {
  it('用户： получает daily bars и приводит decimals/timestamps в Kline', async () => {
    // Given three provider bars and a fixed connector clock
    const harness = makeHarness({
      bars: {
        symbol: 'SBER@MISX',
        bars: [
          { timestamp: new Date(NOW - 2 * DAY_MS), open: decimal('270'), high: decimal('275'), low: decimal('268'), close: decimal('273'), volume: decimal('100') },
          { timestamp: new Date(NOW - DAY_MS), open: decimal('273'), high: decimal('279'), low: decimal('272'), close: decimal('278'), volume: decimal('120') },
          { timestamp: new Date(NOW), open: decimal('278'), high: decimal('281'), low: decimal('277'), close: decimal('280'), volume: decimal('140') },
        ],
      },
    })

    // When requesting the last two daily candles
    const klines = await harness.client.getKlines('SBER.MOEX', '1d', 2)

    // Then output is ascending, bounded and uses the shared Kline contract
    expect(klines).toEqual([
      { openTime: NOW - DAY_MS, closeTime: NOW - 1, open: 273, high: 279, low: 272, close: 278, volume: 120 },
      { openTime: NOW, closeTime: NOW + DAY_MS - 1, open: 278, high: 281, low: 277, close: 280, volume: 140 },
    ])
    expect(harness.bars).toHaveLength(1)
    expect(harness.bars[0]).toMatchObject({ symbol: 'SBER@MISX', timeframe: 19 })
    expect(harness.bars[0]?.interval.startTime).toEqual(new Date(NOW - 2 * DAY_MS))
    expect(harness.bars[0]?.interval.endTime).toEqual(new Date(NOW))
  })

  it('用户： запрашивает неподдержанный interval и получает TRADING_UNSUPPORTED_INTERVAL', async () => {
    // Given a connector with the official Finam timeframe vocabulary
    const harness = makeHarness()

    // When requesting an interval absent from that vocabulary
    const result = harness.client.getKlines('SBER.MOEX', '3m', 10)

    // Then no upstream request is needed and the error remains distinguishable
    await expect(result).rejects.toMatchObject({ code: 'TRADING_UNSUPPORTED_INTERVAL' })
    expect(harness.bars).toHaveLength(0)
  })
})
