import type { Config } from '@tg-search/common'

import type { CoreContext } from './context'

import { createCoreContext } from './context'
import { afterConnectedStage, initStage, useEventHandlers } from './event-handler'

export interface ClientInstanceEventToCore {
  'core:cleanup': () => void
}

export interface ClientInstanceEventFromCore {
  'core:initialized': (data: { stage: 'basic' | 'after-connected' }) => void
  'core:error': (data: { error?: string | Error | unknown }) => void
}

export type ClientInstanceEvent = ClientInstanceEventFromCore & ClientInstanceEventToCore

export function createCoreInstance(config: Config): CoreContext {
  const ctx = createCoreContext()

  const { register: registerEventHandler } = useEventHandlers(ctx, config)
  registerEventHandler(initStage)
  registerEventHandler(afterConnectedStage)

  return ctx
}

export async function destroyCoreInstance(ctx: CoreContext) {
  // ctx.emitter.emit('auth:logout')
  ctx.emitter.emit('core:cleanup')
  ctx.emitter.removeAllListeners()
}
