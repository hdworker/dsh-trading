/**
 * Task 1: shared MarketDataService optional search capability.
 *
 * The runtime assertion exercises the intended callable shape; expectTypeOf keeps
 * the public TypeScript seam pinned when the package is type-checked.
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Disposable, InstrumentRef, Interval, Kline, MarketDataService, Ticker } from '@dshtrading/api'

const disposable: Disposable = { dispose: () => {} }
const ticker: Ticker = { symbol: 'SBER.MOEX', price: 1, timestamp: 0 }
const bars: Kline[] = []

const searchableService = {
  getTicker: async (_symbol: string) => ticker,
  getKlines: async (_symbol: string, _interval: Interval, _limit?: number) => bars,
  subscribeTicker: (_symbol: string, _cb: (value: Ticker) => void) => disposable,
  searchInstruments: async (query: string, limit?: number): Promise<InstrumentRef[]> => [
    { symbol: query.toUpperCase(), name: 'Sberbank' },
  ].slice(0, limit ?? 8),
} satisfies MarketDataService

describe('MarketDataService optional search capability', () => {
  it('用户：可搜索行情实现调用有界检索能力后返回 InstrumentRef 行', async () => {
    // Given a searchable market-data implementation
    // When querying the optional capability
    // Then it returns bounded InstrumentRef rows
    expectTypeOf<MarketDataService>().toHaveProperty('searchInstruments')
    expectTypeOf(searchableService.searchInstruments).toEqualTypeOf<NonNullable<MarketDataService['searchInstruments']>>()

    const result = await searchableService.searchInstruments('sber', 1)
    expect(result).toEqual([{ symbol: 'SBER', name: 'Sberbank' }])
  })
})
