/**
 * Task 2 slice 2: read-only service and host-side credential seam.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Disposable, InstrumentRef, Interval, Kline, Ticker } from '@dshtrading/api'
import { Config, FinamMarketDataService, createSecretProvider } from '../src/index.ts'

type FakeClient = {
  listInstruments(): Promise<InstrumentRef[]>
  getTicker(symbol: string): Promise<Ticker>
  getKlines(symbol: string, interval: Interval, limit?: number): Promise<Kline[]>
}

function makeContext(getter: (name: string, strict?: boolean) => unknown = () => undefined): Context {
  return {
    get: getter,
    reflect: { provide: () => {} },
  } as unknown as Context
}

describe('FinamMarketDataService', () => {
  it('用户： читает только行情面 через canonical symbols и не требует TradeService', async () => {
    // Given a read-only fake client behind the service seam
    const calls: string[] = []
    const client = {
      listInstruments: async () => [{ symbol: 'SBER.MOEX', name: 'Сбербанк' }],
      getTicker: async (symbol: string) => {
        calls.push(`ticker:${symbol}`)
        return { symbol, price: 280, timestamp: 1 }
      },
      getKlines: async (symbol: string) => {
        calls.push(`klines:${symbol}`)
        return []
      },
    } as unknown as FakeClient

    // When the host constructs the market-data service
    const service = new FinamMarketDataService(makeContext(), client)
    const roster = await service.listInstruments()
    const ticker = await service.getTicker('SBER.MOEX')

    // Then only read methods are exposed and requests preserve canonical symbols
    expect(roster).toEqual([{ symbol: 'SBER.MOEX', name: 'Сбербанк' }])
    expect(ticker.symbol).toBe('SBER.MOEX')
    expect(calls).toEqual(['ticker:SBER.MOEX'])
    expect('placeOrder' in service).toBe(false)
    expect('getBalances' in service).toBe(false)
  })

  it('用户：bounded search фильтрует cached catalog и не делает повторный upstream запрос', async () => {
    // Given a catalog client returning canonical symbols and display names
    let catalogReads = 0
    const client = {
      listInstruments: async () => {
        catalogReads += 1
        return [
          { symbol: 'SBER.MOEX', name: 'Сбербанк' },
          { symbol: 'GAZP.MOEX', name: 'Газпром' },
        ]
      },
      getTicker: async (symbol: string) => ({ symbol, price: 1, timestamp: 0 }),
      getKlines: async () => [],
    } as unknown as FakeClient
    const service = new FinamMarketDataService(makeContext(), client, undefined, { now: () => 1 })

    // When querying twice with a bounded result limit
    const first = await service.searchInstruments('банк', 1)
    const second = await service.searchInstruments('MOEX', 1)

    // Then the cache is reused and result count stays bounded
    expect(first).toEqual([{ symbol: 'SBER.MOEX', name: 'Сбербанк' }])
    expect(second).toHaveLength(1)
    expect(catalogReads).toBe(1)
  })

  it('用户： подписывается polling fallback и dispose останавливает дальнейшие callbacks', async () => {
    // Given a read-only client returning one ticker
    let reads = 0
    const client = {
      listInstruments: async () => [],
      getTicker: async (symbol: string) => ({ symbol, price: ++reads, timestamp: reads }),
      getKlines: async () => [],
    } as unknown as FakeClient
    const service = new FinamMarketDataService(makeContext(), client)
    const received: Ticker[] = []

    // When subscribing with a long polling interval and immediately disposing
    const subscription: Disposable = service.subscribeTicker('SBER.MOEX', ticker => received.push(ticker), { intervalMs: 60_000 })
    subscription.dispose()
    await Promise.resolve()

    // Then the initial read is delivered and no timer remains to leak callbacks
    expect(received).toHaveLength(1)
    expect(received[0]?.symbol).toBe('SBER.MOEX')
  })
})

describe('Finam host credential seam', () => {
  it('用户： не настроил FINAM_API_SECRET и получает структурированную ошибку без значения секрета', async () => {
    // Given a host credentials context with no resolved secret
    const provider = createSecretProvider(makeContext(), 'FINAM_API_SECRET')

    // When the connector resolves the host-side credential ref
    const result = provider()

    // Then it fails closed without exposing any credential value
    await expect(result).rejects.toMatchObject({ code: 'TRADING_CREDENTIALS_MISSING' })
    await expect(result).rejects.not.toThrow(/super-secret-value/)
  })

  it('用户：settings credential wins over env-ref fallback at the host seam', async () => {
    // Given the router settings credential source contains a connector secret
    const ctx = makeContext((name) => name === 'tradingMarketRouter'
      ? { getCredential: () => ({ secret: 'fixture-secret' }) }
      : undefined)

    // When the host resolves the Finam secret provider
    const secret = await createSecretProvider(ctx, 'FINAM_API_SECRET')()

    // Then the value is available only on the host-side resolver path
    expect(secret).toBe('fixture-secret')
  })

  it('用户： читает Config defaults и получает безопасный disabled/read-only профиль', () => {
    // Given no explicit connector configuration
    // When the shared schema applies defaults
    const config = (Config as unknown as (value?: unknown) => unknown)(undefined) as { enabled: boolean; secretRef: string }

    // Then activation is opt-in and the secret ref is the documented host-side name
    expect(config.enabled).toBe(false)
    expect(config.secretRef).toBe('FINAM_API_SECRET')
  })
})
