/**
 * Finam/MOEX symbol vocabulary.
 *
 * Consumer-facing symbols stay provider-independent (`SBER.MOEX`). Finam's
 * native `SBER@MISX` spelling is translated only at the connector seam.
 */

export const FINAM_NATIVE_MIC = 'MISX' as const
export const FINAM_CANONICAL_SUFFIX = '.MOEX' as const

export class FinamSymbolError extends Error {
  readonly code = 'TRADING_UNSUPPORTED_SYMBOL' as const

  constructor(message: string) {
    super(message)
    this.name = 'FinamSymbolError'
  }
}

const TICKER = '[A-Z0-9]{1,16}'
const NATIVE_PATTERN = new RegExp(`^(${TICKER})@${FINAM_NATIVE_MIC}$`)
const CANONICAL_PATTERN = new RegExp(`^(${TICKER})\\${FINAM_CANONICAL_SUFFIX}$`)

function unsupported(raw: string): FinamSymbolError {
  return new FinamSymbolError(
    `Finam: unsupported MOEX symbol ${JSON.stringify(raw)}; expected TICKER.MOEX or TICKER@MISX`,
  )
}

function canonicalTicker(raw: string): string | undefined {
  const trimmed = raw.trim().toUpperCase()
  const native = NATIVE_PATTERN.exec(trimmed)
  if (native !== null) return native[1]
  const canonical = CANONICAL_PATTERN.exec(trimmed)
  if (canonical !== null) return canonical[1]
  return undefined
}

/** Convert Finam native or canonical input to the canonical MOEX symbol. */
export function canonicalFinamSymbol(raw: string): string {
  if (typeof raw !== 'string') throw unsupported(String(raw))
  const ticker = canonicalTicker(raw)
  if (ticker === undefined) throw unsupported(raw)
  return `${ticker}${FINAM_CANONICAL_SUFFIX}`
}

/** Convert a canonical MOEX symbol to the Finam native ticker/MIC pair. */
export function nativeFinamSymbol(canonical: string): { ticker: string; mic: typeof FINAM_NATIVE_MIC } {
  if (typeof canonical !== 'string') throw unsupported(String(canonical))
  const trimmed = canonical.trim().toUpperCase()
  const match = CANONICAL_PATTERN.exec(trimmed)
  if (match === null) throw unsupported(canonical)
  return { ticker: match[1] as string, mic: FINAM_NATIVE_MIC }
}
