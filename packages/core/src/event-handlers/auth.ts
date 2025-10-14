import type { CoreContext } from '../context'
import type { ConnectionService, SessionService } from '../services'

import { useLogger } from '@unbird/logg'

export function registerBasicEventHandlers(ctx: CoreContext) {
  const { emitter } = ctx
  const logger = useLogger('core:auth:event')

  return (
    configuredConnectionService: ConnectionService,
    sessionService: SessionService,
  ) => {
    logger.log('Registering auth:login event handler')

    emitter.on('auth:login', async ({ phoneNumber }) => {
      logger.log('AUTH:LOGIN EVENT RECEIVED!', { phoneNumber })
      // eslint-disable-next-line no-debugger
      debugger

      try {
        logger.log('Loading session for', { phoneNumber })
        const session = (await sessionService.loadSession(phoneNumber)).expect('Failed to load session')

        logger.withFields({ session }).verbose('Loaded session')

        logger.log('Calling connectionService.login')
        await configuredConnectionService.login({ phoneNumber, session })
        logger.verbose('Logged in to Telegram')
      }
      catch (error) {
        logger.withError(error).error('Failed to handle auth:login')
        throw error
      }
    })

    logger.log('auth:login handler registered successfully')

    emitter.on('auth:logout', async () => {
      logger.verbose('Logged out from Telegram')
      const client = ctx.getClient()
      if (client) {
        await configuredConnectionService.logout(client)
      }
    })

    logger.log('All auth handlers registered')
  }
}
