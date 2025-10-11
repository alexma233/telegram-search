import type { ClientRegisterEventHandlerFn } from '.'

import { useLogger } from '@unbird/logg'

import { useMessageResolverStore } from '../stores/useMessageResolver'

export function registerMessageResolverEventHandlers(registerEventHandler: ClientRegisterEventHandlerFn) {
  const logger = useLogger('client:message-resolver')

  registerEventHandler('message:resolver:error', ({ resolverName, error, isRateLimited }) => {
    logger.withFields({ resolverName, error, isRateLimited }).warn('Message resolver error')

    // Update the store with the error information
    const store = useMessageResolverStore()
    store.lastError = {
      resolverName,
      error: {
        message: error.message,
        name: error.name,
      },
      isRateLimited,
      timestamp: Date.now(),
    }
  })
}
