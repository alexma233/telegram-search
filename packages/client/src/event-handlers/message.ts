import type { ClientRegisterEventHandlerFn } from '.'

import { useLogger } from '@guiiai/logg'

import { useAnnualReportStore } from '../stores/useAnnualReport'
import { useMessageStore } from '../stores/useMessage'

export function registerMessageEventHandlers(
  registerEventHandler: ClientRegisterEventHandlerFn,
) {
  registerEventHandler('message:data', ({ messages }) => {
    useMessageStore().pushMessages(messages)
  })

  registerEventHandler('message:unread-data', ({ messages }) => {
    useLogger('message:unread-data').debug('Received unread messages', messages)
  })

  registerEventHandler('message:summary-data', ({ mode, messages }) => {
    useLogger('message:summary-data').withFields({ mode, count: messages.length }).debug('Received summary messages')
  })

  registerEventHandler('message:annual-report:data', ({ stats }) => {
    useAnnualReportStore().setStats(stats)
  })
}
