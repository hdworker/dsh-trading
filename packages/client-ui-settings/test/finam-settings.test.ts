/**
 * Task 3: Finam settings metadata and credential namespace.
 */
import { describe, expect, it } from 'vitest'
import { PROVIDER_CREDENTIAL_SPECS, PROVIDER_LABELS } from '../src/client/trading-settings-controller.ts'

describe('Finam settings registration', () => {
  it('用户：在 Finam market settings 中看到 ru-only provider metadata', () => {
    // Given the provider catalog used by the generic MarketProviderPanel
    const finam = PROVIDER_LABELS.find(provider => provider.id === 'finam')

    // When the ru market provider options are built
    // Then Finam is commercial, ru-only and points to the host fallback ref
    expect(finam).toMatchObject({
      id: 'finam',
      env: 'FINAM_API_SECRET',
      type: 'commercial',
      markets: ['ru'],
    })
  })

  it('用户：сохраняет Finam secret в существующий dshtrading credentials namespace', () => {
    // Given the generic credential card specs
    const fields = PROVIDER_CREDENTIAL_SPECS.finam

    // When the settings panel resolves the Finam provider card
    // Then it writes one secret field named secret, not a new namespace or client token
    expect(fields).toEqual([
      expect.objectContaining({ key: 'secret', secret: true }),
    ])
  })
})
