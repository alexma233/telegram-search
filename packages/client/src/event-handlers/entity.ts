import type { ClientRegisterEventHandler } from '.'

import { useBridgeStore } from '../composables/useBridge'
import { useBootstrapStore } from '../stores/useBootstrap'

/**
 * Register entity-related client event handlers.
 */
export function registerEntityEventHandlers(
  registerEventHandler: ClientRegisterEventHandler,
) {
  registerEventHandler('entity:me:data', (data) => {
    const bridgeStore = useBridgeStore()
    const bootstrapStore = useBootstrapStore()

    const activeSession = bridgeStore.getActiveSession()
    if (activeSession)
      activeSession.me = data

    // Now that core has recorded the account and set currentAccountId,
    // signal frontend bootstrap that the account context is ready. This
    // will perform client-side post-bootstrap work (e.g. hydrate dialogs).
    bootstrapStore.markAccountReady()
  })
}
