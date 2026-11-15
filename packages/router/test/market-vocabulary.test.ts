/**
 * Task 1: ru market vocabulary and Finam routing seam.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_MARKETS, PROVIDER_VOCABULARY } from '../src/index.js'
import { searchAllMarkets, setDynamicCatalog, SYMBOL_CATALOG, type CatalogMarket } from '../src/catalog.ts'

describe('ru market vocabulary', () => {
  it('用户：读取 Finam 路由默认值时选择 ru/finam', () => {
    // Given the Finam route is configured
    // When reading router defaults
    // Then ru selects finam
    expect(DEFAULT_MARKETS.ru).toEqual({ provider: 'finam' })
    expect(PROVIDER_VOCABULARY).toContain('finam')
  })

  it('用户：读取静态目录时 ru 保持空桶而不虚构 Finam ticker', () => {
    // Given the static catalog has no invented Finam tickers
    // When reading catalog seeds
    // Then ru is an explicit empty bucket
    expect(Object.keys(SYMBOL_CATALOG).sort()).toContain('ru')
    expect(SYMBOL_CATALOG.ru).toEqual([])
  })

  it('用户：搜索动态 Finam 目录行时保留 ru 市场 id', () => {
    // Given a dynamic Finam catalog row
    // When searching all markets
    // Then the row is returned with the ru market id
    setDynamicCatalog('ru' as CatalogMarket, [{ symbol: 'SBER.MOEX', name: 'Сбербанк' }])

    expect(searchAllMarkets('SBER', 8)).toContainEqual(expect.objectContaining({
      market: 'ru',
      symbol: 'SBER.MOEX',
      name: 'Сбербанк',
    }))
  })
})
