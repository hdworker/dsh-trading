import type { Context } from '@deepseek-ai/cordis'
import type { MarketDataService } from '@dshtrading/api'
import {
  Config,
  createFinamMarketDataService,
  TRADING_RU_MARKET_DATA_KEY,
  type Config as FinamConfig,
} from './index.ts'

/** Host loader injection is supplied by the bundle patch; registry lookup stays duck-typed. */
export const inject: string[] = []
export { Config, TRADING_RU_MARKET_DATA_KEY }

const withDefaults = (value: unknown): FinamConfig => (Config as unknown as (value: unknown) => FinamConfig)(value)

interface MarketDataRegistryLike {
  register(market: string, provider: string, service: MarketDataService): () => void
}

function resolveMarketDataRegistry(ctx: Context): MarketDataRegistryLike | undefined {
  const candidate = (ctx as unknown as { get?: (key: string, strict?: boolean) => unknown }).get?.('tradingMarketDataRegistry', false)
  return candidate === undefined ? undefined : candidate as MarketDataRegistryLike
}

export interface DataplaneOptions {
  readonly createService?: (ctx: Context, config: FinamConfig, serviceName: string) => MarketDataService
}

function serviceFactory(ctx: Context, config: FinamConfig, serviceName: string, options?: DataplaneOptions): MarketDataService {
  return options?.createService?.(ctx, config, serviceName)
    ?? createFinamMarketDataService(ctx, config, undefined, serviceName)
}

/** Register only the read-only ru/finam market-data service. */
export function apply(ctx: Context, config: FinamConfig = withDefaults(undefined), options?: DataplaneOptions): void {
  if (!config.enabled) return

  const registry = resolveMarketDataRegistry(ctx)
  if (registry === undefined) {
    // Backward-compatible host path for deployments without the registry.
    serviceFactory(ctx, config, TRADING_RU_MARKET_DATA_KEY, options)
    return
  }

  const isolated = ctx.isolate(TRADING_RU_MARKET_DATA_KEY)
  const service = serviceFactory(isolated, config, TRADING_RU_MARKET_DATA_KEY, options)
  ctx.effect(() => registry.register('ru', 'finam', service))
}
