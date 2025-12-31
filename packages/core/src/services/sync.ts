import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'

import { Api } from 'telegram'

import { accountModels } from '../models/accounts'

export function createSyncService(
  ctx: CoreContext,
  logger: Logger,
) {
  logger = logger.withContext('core:sync:service')

  /**
   * Performs a catch-up sync using Telegram's state machine.
   * This is called on reconnect or startup to fill gaps.
   */
  async function catchUp() {
    const client = ctx.getClient()
    const accountId = ctx.getCurrentAccountId()
    const db = ctx.getDB()

    const account = (await accountModels.findAccountByUUID(db, accountId)).orUndefined()
    if (!account) {
      logger.error('Failed to find account for sync')
      return
    }

    if (account.pts === 0) {
      logger.log('Bootstrapping account state from Telegram')
      try {
        const state = await client.invoke(new Api.updates.GetState())
        await accountModels.updateAccountState(db, accountId, {
          pts: state.pts,
          qts: state.qts,
          seq: state.seq,
          date: state.date,
          lastSyncAt: Date.now(),
        })
        logger.withFields({ pts: state.pts }).log('Account state bootstrapped')
      }
      catch (error) {
        ctx.withError(error, 'Failed to bootstrap account state')
      }
      return
    }

    logger.withFields({ pts: account.pts }).log('Starting catch-up sync')

    let currentPts = account.pts
    let currentQts = account.qts
    let currentSeq = account.seq
    let currentDate = account.date

    while (true) {
      try {
        const difference = await client.invoke(
          new Api.updates.GetDifference({
            pts: currentPts,
            qts: currentQts,
            date: currentDate,
          }),
        )

        if (difference instanceof Api.updates.DifferenceEmpty) {
          logger.verbose('Sync complete: No differences')
          break
        }

        if (difference instanceof Api.updates.DifferenceTooLong) {
          logger.warn('Sync gap too large (DifferenceTooLong). Falling back to takeout.')
          ctx.emitter.emit('takeout:run', { chatIds: [], increase: true, syncOptions: {} })
          break
        }

        const messages = 'newMessages' in difference ? difference.newMessages : []
        if (messages.length > 0) {
          logger.withFields({ count: messages.length }).log('Syncing messages from difference batch')
          ctx.emitter.emit('message:process', {
            messages: messages.filter((m): m is Api.Message => m instanceof Api.Message),
            isTakeout: false,
          })
        }

        const nextState = 'state' in difference ? difference.state : undefined
        if (nextState) {
          currentPts = nextState.pts
          currentQts = nextState.qts
          currentSeq = nextState.seq
          currentDate = nextState.date

          await accountModels.updateAccountState(db, accountId, {
            pts: currentPts,
            qts: currentQts,
            seq: currentSeq,
            date: currentDate,
            lastSyncAt: Date.now(),
          })
        }

        if (difference instanceof Api.updates.Difference) {
          logger.verbose('Sync complete: Final batch processed')
          break
        }

        logger.verbose('Difference slice received, continuing sync...')
      }
      catch (error) {
        ctx.withError(error, 'Catch-up sync failed')
        break
      }
    }
  }

  return {
    catchUp,
  }
}

export type SyncService = ReturnType<typeof createSyncService>
