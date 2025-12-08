import type { FromCoreEvent, ToCoreEvent } from '@tg-search/core'
import type { Peer } from 'crossws'

import { useLogger } from '@guiiai/logg'
import { serializeWsMessage } from '@tg-search/common'

export interface WsEventFromServer {
  'server:connected': (data: { sessionId: string, accountReady: boolean }) => void
}

export interface WsEventFromClient {
  'server:event:register': (data: { event: keyof WsEventToClient }) => void
}

export type WsEventToServer = ToCoreEvent & WsEventFromClient
export type WsEventToClient = FromCoreEvent & WsEventFromServer

export type WsEventToServerData<T extends keyof WsEventToServer> = Parameters<WsEventToServer[T]>[0]
export type WsEventToClientData<T extends keyof WsEventToClient> = Parameters<WsEventToClient[T]>[0]

export type WsMessageToClient = {
  [T in keyof WsEventToClient]: {
    type: T
    data: WsEventToClientData<T>
  }
}[keyof WsEventToClient]

export type WsMessageToServer = {
  [T in keyof WsEventToServer]: {
    type: T
    data: WsEventToServerData<T>
  }
}[keyof WsEventToServer]

const MAX_EVENT_DATA_BYTES = 1024 * 1024

export function sendWsEvent<T extends keyof WsEventToClient>(
  peer: Peer,
  event: T,
  data: WsEventToClientData<T>,
) {
  const payload = serializeWsMessage(
    { type: event, data },
    {
      maxDataBytes: MAX_EVENT_DATA_BYTES,
      onDrop: ({ length }) => {
        useLogger().withFields({ type: event, length }).warn('Dropped event data')
      },
    },
  )

  peer.send(payload)
}
