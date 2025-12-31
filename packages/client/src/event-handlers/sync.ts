import type { ClientRegisterEventHandlerFn } from './index'

import { useAccountStore } from '../stores/useAccount'

export function registerSyncEventHandlers(registerEventHandler: ClientRegisterEventHandlerFn) {
  registerEventHandler('sync:status', (data) => {
    const accountStore = useAccountStore()
    accountStore.syncStatus = data.status
  })
}
