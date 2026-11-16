/**
 * Task 2 slice 3: Finam host dataplane registration contract.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { MarketDataService } from '@dshtrading/api'
import { Config } from '../src/index.ts'
import { apply, TRADING_RU_MARKET_DATA_KEY } from '../src/dataplane.ts'

function makeService(): MarketDataService {
  return {
    getTicker: async symbol => ({ symbol, price: 1, timestamp: 0 }),
    getKlines: async () => [],
    subscribeTicker: () => ({ dispose: () => {} }),
  }
}

function makeContext(registry?: { register: (market: string, provider: string, service: MarketDataService) => () => void }) {
  let cleanup: (() => void) | undefined
  const ctx = {
    get: (key: string) => key === 'tradingMarketDataRegistry' ? registry : undefined,
    isolate: () => ctx,
    effect: (callback: () => unknown) => { cleanup = callback() as (() => void) },
    reflect: { provide: () => {} },
  } as unknown as Context
  return { ctx, cleanup: () => cleanup?.() }
}

describe('Finam dataplane', () => {
  it('用户： отключает connector и не регистрирует рынок', () => {
    // Given an explicitly disabled connector configuration
    let constructed = 0
    const registry = { register: () => { constructed += 1; return () => {} } }
    const { ctx } = makeContext(registry)

    // When the loader applies the dataplane
    apply(ctx, { enabled: false, secretRef: 'FINAM_API_SECRET' }, {
      createService: () => { constructed += 1; return makeService() },
    })

    // Then no service or registry entry is created
    expect(constructed).toBe(0)
  })

  it('用户： включает connector и регистрирует ru/finam в market-data registry', () => {
    // Given an active router registry and an injected fake service factory
    const calls: Array<{ market: string; provider: string; service: MarketDataService }> = []
    const registry = {
      register: (market: string, provider: string, service: MarketDataService) => {
        calls.push({ market, provider, service })
        return () => { calls.length = 0 }
      },
    }
    const { ctx, cleanup } = makeContext(registry)
    const service = makeService()

    // When the loader applies an enabled dataplane
    apply(ctx, { enabled: true, secretRef: 'FINAM_API_SECRET' }, {
      createService: (_ctx, _config, serviceName) => {
        expect(serviceName).toBe(TRADING_RU_MARKET_DATA_KEY)
        return service
      },
    })
    const active = calls[0]

    // Then the canonical market/provider pair is registered and cleanup is wired
    expect(active?.market).toBe('ru')
    expect(active?.provider).toBe('finam')
    expect(active?.service).toBe(service)
    cleanup()
    expect(calls).toHaveLength(0)
  })

  it('用户： загружает Config defaults с безопасным disabled состоянием', () => {
    // Given no explicit loader configuration
    // When the dataplane schema applies defaults
    const config = (Config as unknown as (value?: unknown) => Config)(undefined)

    // Then the host does not activate a credentialed connector implicitly
    expect(config.enabled).toBe(false)
    expect(config.secretRef).toBe('FINAM_API_SECRET')
  })
})
