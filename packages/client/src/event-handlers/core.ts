import type { ClientRegisterEventHandlerFn } from '.'

export function registerCoreEventHandlers(
  registerEventHandler: ClientRegisterEventHandlerFn,
) {
  registerEventHandler('core:initialized', ({ stage }) => {
    // eslint-disable-next-line no-console
    console.log('[CoreEvent] Core initialized:', stage)
  })
}
