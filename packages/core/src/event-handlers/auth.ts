import type { CoreContext } from '../context'
import type { ConnectionService, SessionService } from '../services'

import { useLogger } from '@guiiai/logg'

export function registerBasicEventHandlers(ctx: CoreContext) {
  const { emitter } = ctx
  const logger = useLogger('core:auth:event')

  return (
    configuredConnectionService: ConnectionService,
    sessionService: SessionService,
  ) => {
    emitter.on('auth:login', async ({ phoneNumber }) => {
      const session = (await sessionService.loadSession(phoneNumber)).expect('Failed to load session')

      logger.withFields({ session }).verbose('Loaded session')

      await configuredConnectionService.login({ phoneNumber, session })
      logger.verbose('Logged in to Telegram')
    })

    emitter.on('auth:logout', async (data) => {
      const phoneNumber = data?.phoneNumber
      logger.withFields({ phoneNumber }).verbose('Logging out from Telegram')
      const client = ctx.getClient()
      if (client) {
        await configuredConnectionService.logout(client)
        ctx.setClient(undefined)
      }
      
      // Clean the session file if phoneNumber is provided
      if (phoneNumber) {
        await sessionService.cleanSession(phoneNumber)
      }
      
      emitter.emit('auth:disconnected')
      logger.verbose('Logged out from Telegram successfully')
    })
  }
}
