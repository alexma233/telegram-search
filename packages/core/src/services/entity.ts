// eslint-disable-next-line unicorn/prefer-node-protocol
import type { Buffer } from 'buffer'

import type { Result } from '@unbird/result'

import type { CoreContext } from '../context'

import { Ok } from '@unbird/result'

import { downloadProfilePhoto } from '../utils/avatar'
import { resolveEntity } from '../utils/entity'

export interface CoreBaseEntity {
  id: string
  name: string
  avatarBytes?: Buffer
}

export interface CoreUserEntity extends CoreBaseEntity {
  type: 'user'
  username: string
}

export interface CoreChatEntity extends CoreBaseEntity {
  type: 'chat'
}

export interface CoreChannelEntity extends CoreBaseEntity {
  type: 'channel'
}

export type CoreEntity = CoreUserEntity | CoreChatEntity | CoreChannelEntity

export interface EntityEventToCore {
  'entity:me:fetch': () => void
  'entity:avatar:fetch': (data: { entityId: string }) => void
}

export interface EntityEventFromCore {
  'entity:me:data': (data: CoreUserEntity) => void
  'entity:avatar:data': (data: { entityId: string, avatarBytes?: Buffer }) => void
}

export type EntityEvent = EntityEventFromCore & EntityEventToCore

export type EntityService = ReturnType<typeof createEntityService>

export function createEntityService(ctx: CoreContext) {
  const { getClient, emitter } = ctx

  async function getEntity(uid: string) {
    const user = await getClient().getEntity(uid)
    return user
  }

  async function getMeInfo(): Promise<Result<CoreUserEntity>> {
    const apiUser = await getClient().getMe()
    const result = resolveEntity(apiUser).expect('Failed to resolve entity') as CoreUserEntity

    // Download avatar
    const avatarBytes = await downloadProfilePhoto(getClient(), apiUser)
    if (avatarBytes) {
      result.avatarBytes = avatarBytes
    }

    emitter.emit('entity:me:data', result)
    return Ok(result)
  }

  async function fetchEntityAvatar(entityId: string): Promise<Buffer | undefined> {
    const entity = await getEntity(entityId)
    const avatarBytes = await downloadProfilePhoto(getClient(), entity)

    emitter.emit('entity:avatar:data', { entityId, avatarBytes })
    return avatarBytes
  }

  return {
    getEntity,
    getMeInfo,
    fetchEntityAvatar,
  }
}
