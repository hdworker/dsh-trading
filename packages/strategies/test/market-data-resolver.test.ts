/**
 * Task 6: ru legacy market-data resolver seam for backtest/screener consumers.
 */
import { describe, expect, it } from 'vitest'
import { fakeMarketService } from '@dshtrading/test-support'
import { createMarketDataResolver } from '../src/plugin.ts'

describe('strategy market-data resolver', () => {
  it('用户：ru backtest resolver falls back to tradingRuMarketData without registry', () => {
    // Given a legacy host exposing the new ru context key
    const service = fakeMarketService({ getKlines: async () => [] })
    const ctx = {
      get: (key: string) => key === 'tradingRuMarketData' ? service : undefined,
    }

    // When strategy_backtest/screener resolution asks for ru
    const resolved = createMarketDataResolver(ctx as never)('ru')

    // Then the same Finam market-data service is returned
    expect(resolved).toBe(service)
  })
})
