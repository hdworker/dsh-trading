/**
 * Task 3: ru bundle and Finam host dataplane wiring.
 */
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as bundle from '../src/index.ts'

describe('ru bundle wiring', () => {
  it('用户：加载 ru bundle 时只提供 host-side no-op installer', () => {
    // Given the minimal first-slice bundle entry
    // When the bundle module is loaded
    // Then it has a stable installer name and no agent preset contract
    expect(bundle.name).toBe('dsh-trading-ru-installer')
    expect(bundle.apply).toBeTypeOf('function')
  })

  it('用户：检查 ru patch 时发现 Finam dataplane registry row 与 inject seam', async () => {
    // Given the bundle patch document
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

    // When the host patch is inspected
    // Then it inserts the bundle row and the enabled registry dataplane row
    expect(patch).toContain("id: dsh-trading-ru-installer")
    expect(patch).toContain("name: '@dshtrading/ru'")
    expect(patch).toContain("id: dsh-trading-ru-dataplane-finam")
    expect(patch).toContain("name: '@dshtrading/connector-finam/dataplane'")
    expect(patch).toContain("inject: ['tradingMarketDataRegistry']")
    expect(patch).toContain('enabled: true')
  })
})
