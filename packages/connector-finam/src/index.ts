/**
 * @dshtrading/connector-finam
 * Finam/MOEX read-only market-data connector.
 *
 * The SDK is loaded only at the host boundary. Tests inject a FinamApiExecutor,
 * so no credential or network call is needed to verify the market-data seam.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Disposable, Interval, InstrumentRef, Kline, MarketDataService, Ticker } from '@dshtrading/api'
import {
  FinamRestClient,
  type FinamApiExecutor,
  type FinamApiLike,
  type FinamRestOptions,
  TradingServiceError,
} from './rest.ts'

export * from './rest.ts'
export * from './symbol.ts'

export const name = 'dsh-trading-ru-connector-finam'
export const ROUTER_PROVIDER = 'finam'
export const TRADING_RU_MARKET_DATA_KEY = 'tradingRuMarketData'

export interface Config {
  /** Host dataplane activation; default false until the ru bundle enables it. */
  enabled: boolean
  /** Host-side credential reference. The secret value never enters client code. */
  secretRef: string
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(false).description('Activate the Finam read-only market-data connector'),
  secretRef: Schema.string().default('FINAM_API_SECRET').description('Host-side Finam Trade API secret reference'),
})

export const inject: string[] = []

export type FinamMarketDataClient = Pick<FinamRestClient, 'listInstruments' | 'getTicker' | 'getKlines'>

export interface SubscribeTickerOptions {
  readonly intervalMs?: number
}

export interface FinamMarketDataServiceOptions {
  readonly now?: () => number
  readonly catalogTtlMs?: number
}

const SUBSCRIBE_MIN_MS = 250
const SUBSCRIBE_DEFAULT_MS = 5_000
const DEFAULT_CATALOG_TTL_MS = 30 * 60 * 1000

export class FinamMarketDataService extends Service implements MarketDataService {
  private readonly client: FinamMarketDataClient
  private readonly now: () => number
  private readonly catalogTtlMs: number
  private catalog: { fetchedAt: number; instruments: InstrumentRef[] } | undefined
  private catalogInFlight: Promise<InstrumentRef[]> | undefined

  constructor(
    ctx: Context,
    client: FinamMarketDataClient,
    serviceName: string = TRADING_RU_MARKET_DATA_KEY,
    options: FinamMarketDataServiceOptions = {},
  ) {
    super(ctx, serviceName)
    this.client = client
    this.now = options.now ?? (() => Date.now())
    this.catalogTtlMs = Math.max(1, options.catalogTtlMs ?? DEFAULT_CATALOG_TTL_MS)
  }

  private async loadCatalog(): Promise<InstrumentRef[]> {
    const now = this.now()
    if (this.catalog !== undefined && now - this.catalog.fetchedAt < this.catalogTtlMs) return this.catalog.instruments
    if (this.catalogInFlight !== undefined) return this.catalogInFlight
    const request = this.client.listInstruments().then((instruments) => {
      const snapshot = { fetchedAt: this.now(), instruments: [...instruments] }
      this.catalog = snapshot
      return snapshot.instruments
    }).finally(() => {
      this.catalogInFlight = undefined
    })
    this.catalogInFlight = request
    return request
  }

  listInstruments(): Promise<InstrumentRef[]> {
    return this.loadCatalog()
  }

  async searchInstruments(query: string, limit = 20): Promise<InstrumentRef[]> {
    const normalized = query.trim().toLowerCase()
    if (normalized === '') return []
    const safeLimit = Math.max(1, Math.min(Math.floor(Number.isFinite(limit) ? limit : 20), 100))
    const catalog = await this.loadCatalog()
    return catalog.filter((instrument) =>
      instrument.symbol.toLowerCase().includes(normalized)
      || instrument.name?.toLowerCase().includes(normalized),
    ).slice(0, safeLimit)
  }

  getTicker(symbol: string): Promise<Ticker> {
    return this.client.getTicker(symbol)
  }

  getKlines(symbol: string, interval: Interval, limit?: number): Promise<Kline[]> {
    return this.client.getKlines(symbol, interval, limit)
  }

  subscribeTicker(symbol: string, cb: (ticker: Ticker) => void, options?: SubscribeTickerOptions): Disposable {
    const intervalMs = Math.max(options?.intervalMs ?? SUBSCRIBE_DEFAULT_MS, SUBSCRIBE_MIN_MS)
    const tick = (): void => {
      void this.getTicker(symbol).then(cb, () => {})
    }
    tick()
    const timer = setInterval(tick, intervalMs)
    return { dispose: () => clearInterval(timer) }
  }
}

export interface CredentialResolverLike {
  resolve(ref: string): Promise<{ value: string } | undefined>
}

export interface CredentialsContextLike {
  get(name: string, strict?: boolean): unknown
}

/** Resolve the long-lived secret only on the host side; errors contain the ref, never its value. */
export function createSecretProvider(ctx: CredentialsContextLike, ref: string): () => Promise<string> {
  return async () => {
    // Settings UI writes dshtrading.credentials.finam.secret; router is the
    // host-side owner and is consulted before the env-ref fallback.
    const router = ctx.get('tradingMarketRouter', false) as
      | { getCredential?(provider: string): Record<string, string> | undefined }
      | undefined
    const configured = router?.getCredential?.(ROUTER_PROVIDER)?.secret
    const resolver = ctx.get('credentials', false) as CredentialResolverLike | undefined
    const resolved = resolver === undefined ? undefined : await resolver.resolve(ref)
    const value = configured || resolved?.value || process.env[ref]
    if (value === undefined || value === '') {
      throw new TradingServiceError(
        'TRADING_CREDENTIALS_MISSING',
        `Finam: credential ref ${JSON.stringify(ref)} is not configured`,
      )
    }
    return value
  }
}

type OfficialSdk = {
  withTradeApi<Result>(options: { secret: string }, run: (api: FinamApiLike) => Promise<Result>): Promise<Result>
}

const FINAM_SDK_MODULE: string = '@finam/trade-api'

async function loadOfficialSdk(): Promise<OfficialSdk> {
  // Keep the package specifier dynamic so pure connector tests do not require a
  // secret or an installed runtime SDK; production host loading still resolves
  // exactly the pinned dependency from package.json.
  return await import(FINAM_SDK_MODULE) as unknown as OfficialSdk
}

/** Build the host-only executor that owns secret resolution and SDK lifecycle. */
export function createFinamApiExecutor(ctx: CredentialsContextLike, config: Config): FinamApiExecutor {
  const secret = createSecretProvider(ctx, config.secretRef)
  return async <Result>(run: (api: FinamApiLike) => Promise<Result>): Promise<Result> => {
    const secretValue = await secret()
    const sdk = await loadOfficialSdk()
    return sdk.withTradeApi({ secret: secretValue }, run)
  }
}

export function createFinamMarketDataService(
  ctx: Context,
  config: Config,
  clientOptions?: Omit<FinamRestOptions, 'withApi'> & { withApi?: FinamApiExecutor },
  serviceName: string = TRADING_RU_MARKET_DATA_KEY,
): FinamMarketDataService {
  const withApi = clientOptions?.withApi ?? createFinamApiExecutor(ctx, config)
  const client = new FinamRestClient({ ...clientOptions, withApi })
  return new FinamMarketDataService(ctx, client, serviceName, { now: clientOptions?.now })
}

/** Root plugin fallback; the market bundle uses the dedicated dataplane entry. */
export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return
  createFinamMarketDataService(ctx, config)
}
