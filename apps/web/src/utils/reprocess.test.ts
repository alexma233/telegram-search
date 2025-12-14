import { describe, expect, it } from 'vitest'

import { buildMessageReprocessBatches } from './reprocess'

describe('buildMessageReprocessBatches', () => {
  it('chunks ranges into batches', () => {
    const batches = buildMessageReprocessBatches([{ start: 1, end: 5 }], 2)
    expect(batches).toEqual([[1, 2], [3, 4], [5]])
  })

  it('respects maxMessages cap across ranges', () => {
    const batches = buildMessageReprocessBatches([{ start: 10, end: 20 }], 4, 5)
    expect(batches).toEqual([[10, 11, 12, 13], [14]])
  })

  it('handles reversed ranges safely', () => {
    const batches = buildMessageReprocessBatches([{ start: 5, end: 3 }], 3)
    expect(batches).toEqual([[3, 4, 5]])
  })
})
