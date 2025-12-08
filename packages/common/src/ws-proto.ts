import { Reader, Writer } from 'protobufjs/minimal'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const DEFAULT_MAX_DATA_BYTES = 1024 * 1024

export interface WsProtoEnvelope<T = unknown> {
  type: string
  data?: T
}

export type WsMessageDropReason = 'oversize' | 'stringify_error'

export interface SerializeWsMessageOptions {
  maxDataBytes?: number
  onDrop?: (info: { type: string, length: number; reason: WsMessageDropReason }) => void
}

export type WsProtoInput = Uint8Array | ArrayBuffer | string

export function serializeWsMessage(
  message: WsProtoEnvelope,
  options?: SerializeWsMessageOptions,
): Uint8Array {
  const writer = Writer.create()
  writer.uint32(10).string(message.type)

  if (message.data !== undefined) {
    let payload: Uint8Array | undefined

    try {
      payload = textEncoder.encode(JSON.stringify(message.data))
    }
    catch {
      options?.onDrop?.({ type: message.type, reason: 'stringify_error', length: 0 })
      payload = undefined
    }

    const limit = options?.maxDataBytes ?? DEFAULT_MAX_DATA_BYTES
    if (payload && payload.byteLength > limit) {
      options?.onDrop?.({ type: message.type, reason: 'oversize', length: payload.byteLength })
      payload = undefined
    }

    if (payload) {
      writer.uint32(18).bytes(payload)
    }
  }

  return writer.finish()
}

export function deserializeWsMessage<T = unknown>(input: WsProtoInput): WsProtoEnvelope<T> {
  const reader = Reader.create(normalizeInput(input))
  const envelope: WsProtoEnvelope<T> = { type: '' }

  while (reader.pos < reader.len) {
    const tag = reader.uint32()
    switch (tag >>> 3) {
      case 1:
        envelope.type = reader.string()
        break
      case 2: {
        const rawData = reader.bytes()
        if (rawData.length > 0) {
          try {
            envelope.data = JSON.parse(textDecoder.decode(rawData))
          }
          catch (error) {
            throw new Error('Invalid protobuf payload')
          }
        }
        break
      }
      default:
        reader.skipType(tag & 7)
        break
    }
  }

  return envelope
}

function normalizeInput(input: WsProtoInput): Uint8Array {
  if (typeof input === 'string') {
    return textEncoder.encode(input)
  }

  if (input instanceof Uint8Array) {
    return input
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input)
  }

  throw new Error('Unsupported protobuf payload type')
}
