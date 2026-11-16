import Schema from '@deepseek-ai/schemastery'

/** Host-only bundle entry; no agent preset is installed in the first slice. */
export const name = 'dsh-trading-ru-installer'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(): void {}
