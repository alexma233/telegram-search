import { describe, expect, it } from 'vitest'

import { getMetrics, metricsRegistry, takeoutTasksActive, takeoutTasksTotal } from './metrics'

describe('observability metrics', () => {
  it('should have a metrics registry', () => {
    expect(metricsRegistry).toBeDefined()
  })

  it('should export takeout task metrics', () => {
    expect(takeoutTasksTotal).toBeDefined()
    expect(takeoutTasksActive).toBeDefined()
  })

  it('should increment takeout task counter', () => {
    // Just verify the method works without error
    expect(() => takeoutTasksTotal.inc({ status: 'created' })).not.toThrow()
  })

  it('should update takeout task active gauge', () => {
    // Just verify the methods work without error
    expect(() => takeoutTasksActive.inc()).not.toThrow()
    expect(() => takeoutTasksActive.dec()).not.toThrow()
  })

  it('should return metrics in Prometheus format', async () => {
    const metrics = await getMetrics()
    expect(metrics).toContain('# HELP')
    expect(metrics).toContain('# TYPE')
    expect(metrics).toContain('telegram_search_takeout_tasks_total')
  })
})
