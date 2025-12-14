import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'
import type { AccountSettingsService } from '../services/account-settings'

export function registerAccountSettingsEventHandlers(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:account-settings:event')

  return (configService: AccountSettingsService) => {
    ctx.emitter.on('config:fetch', async () => {
      logger.verbose('Getting config')

      configService.fetchAccountSettings()
    })

    ctx.emitter.on('config:update', async ({ accountSettings }) => {
      logger.verbose('Saving config')

      await configService.setAccountSettings(accountSettings)
    })
  }
}
