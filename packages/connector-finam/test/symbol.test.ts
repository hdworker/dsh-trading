/**
 * Task 1: Finam native/canonical symbol vocabulary.
 */
import { describe, expect, it } from 'vitest'

import { canonicalFinamSymbol, FinamSymbolError, nativeFinamSymbol } from '../src/symbol.ts'

describe('Finam MOEX symbol mapping', () => {
  it('用户：规范化 MISX 原生符号后得到 provider-independent MOEX 符号', () => {
    // Given native MISX symbols
    // When canonicalizing them
    // Then they become provider-independent MOEX symbols
    expect(canonicalFinamSymbol(' SBER@MISX ')).toBe('SBER.MOEX')
    expect(canonicalFinamSymbol('gazp@misx')).toBe('GAZP.MOEX')
  })

  it('用户：转换 canonical MOEX 符号时得到显式 native ticker 与 MIC', () => {
    // Given a canonical MOEX symbol
    // When converting it for Finam
    // Then the native ticker and MIC are explicit
    expect(nativeFinamSymbol('SBER.MOEX')).toEqual({ ticker: 'SBER', mic: 'MISX' })
    expect(nativeFinamSymbol('gazp.moex')).toEqual({ ticker: 'GAZP', mic: 'MISX' })
  })

  it('用户：往返转换任一已接受表示时保持 canonical identity', () => {
    // Given either accepted representation
    // When round-tripping
    // Then the canonical identity is stable
    const canonical = canonicalFinamSymbol('SBER@MISX')
    const native = nativeFinamSymbol(canonical)

    expect(canonicalFinamSymbol(`${native.ticker}@${native.mic}`)).toBe(canonical)
  })

  it('用户：映射未知 MIC 或 malformed symbol 时以 unsupported-symbol code fail closed', () => {
    // Given an unknown MIC or malformed symbol
    // When mapping it
    // Then it fails closed with the shared unsupported-symbol code
    for (const value of ['SBER@MOEX', 'SBER.MICEX', 'SBER', 'SBER@MISX@EXTRA', '']) {
      expect(() => canonicalFinamSymbol(value)).toThrow(FinamSymbolError)
      expect(() => canonicalFinamSymbol(value)).toThrow(expect.objectContaining({ code: 'TRADING_UNSUPPORTED_SYMBOL' }))
    }

    expect(() => nativeFinamSymbol('SBER.MICEX')).toThrow(expect.objectContaining({ code: 'TRADING_UNSUPPORTED_SYMBOL' }))
  })
})
