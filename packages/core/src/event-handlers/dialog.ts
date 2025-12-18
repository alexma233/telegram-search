import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'
import type { DialogService } from '../services'

export function registerDialogEventHandlers(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:dialog:event')

  return (dialogService: DialogService) => {
    ctx.emitter.on('dialog:fetch', async () => {
      logger.verbose('Fetching dialogs')

      const dialogs = (await dialogService.fetchDialogs()).expect('Failed to fetch dialogs')

      // Get current account ID from context
      const accountId = ctx.getCurrentAccountId()

      ctx.emitter.emit('storage:record:dialogs', { dialogs, accountId })
    })

    // dialog:avatar:fetch handler removed in favor of unified avatar:fetch
  }
}
