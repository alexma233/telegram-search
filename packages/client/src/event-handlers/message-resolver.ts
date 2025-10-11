import type { ClientRegisterEventHandlerFn } from '.'

import { useLogger } from '@unbird/logg'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

export function registerMessageResolverEventHandlers(registerEventHandler: ClientRegisterEventHandlerFn) {
  const logger = useLogger('client:message-resolver')
  const { t } = useI18n()

  registerEventHandler('message:resolver:error', ({ resolverName, error, isRateLimited }) => {
    logger.withFields({ resolverName, error, isRateLimited }).warn('Message resolver error')

    // Show different error messages based on the type
    if (resolverName === 'embedding') {
      if (isRateLimited) {
        toast.error(t('sync.embeddingApiRateLimited'))
      }
      else {
        toast.error(t('sync.embeddingApiError', { error: error.message }))
      }
    }
    else if (resolverName === 'jieba') {
      toast.error(t('sync.jiebaTokenizationError', { error: error.message }))
    }
    else {
      toast.error(t('sync.resolverError', { resolver: resolverName, error: error.message }))
    }
  })
}
