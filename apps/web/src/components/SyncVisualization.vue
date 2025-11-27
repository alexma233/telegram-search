<script setup lang="ts">
import type { ChatSyncStats } from '@tg-search/core'
import type { CustomSeriesRenderItemParams, CustomSeriesRenderItemReturn } from 'echarts/types/dist/shared'

import VChart from 'vue-echarts'

import { CustomChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'rangeSelect', range: { start: number, end: number }): void
}>()

use([CanvasRenderer, CustomChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent])

const { t } = useI18n()

interface Props {
  stats?: ChatSyncStats
  loading?: boolean
  chatLabel?: string
}

/**
 * Selected range for sync (user clicks on unsynced regions)
 */
const selectedRange = defineModel<{ start: number, end: number } | null>('selectedRange', {
  default: null,
})

const isOpen = ref(true)
const chartRef = ref<InstanceType<typeof VChart> | null>(null)

function toggleOpen() {
  isOpen.value = !isOpen.value
}

/**
 * Represent regions as segments for the chart
 * Each segment has: start, end, type ('synced' | 'unsynced')
 */
interface ChartSegment {
  start: number
  end: number
  type: 'synced' | 'unsynced'
  count: number
}

/**
 * Calculate chart segments based on sync stats
 * This creates regions showing synced (green) and unsynced (gray) areas
 */
const chartSegments = computed<ChartSegment[]>(() => {
  if (!props.stats)
    return []

  const { firstMessageId, latestMessageId, syncedRanges, totalMessages } = props.stats

  // If no messages at all, return empty
  if (totalMessages === 0)
    return []

  const segments: ChartSegment[] = []

  // For simplicity, we assume message IDs range from 1 to totalMessages
  // The synced range is from firstMessageId to latestMessageId
  const minId = 1
  const maxId = totalMessages

  if (syncedRanges.length === 0 || (firstMessageId === 0 && latestMessageId === 0)) {
    // No synced messages - entire range is unsynced
    segments.push({
      start: minId,
      end: maxId,
      type: 'unsynced',
      count: totalMessages,
    })
  }
  else {
    // We have synced ranges - create segments for before, synced, and after

    // Before first synced message (older messages not synced)
    if (firstMessageId > minId) {
      segments.push({
        start: minId,
        end: firstMessageId - 1,
        type: 'unsynced',
        count: firstMessageId - minId,
      })
    }

    // Synced range
    segments.push({
      start: firstMessageId,
      end: latestMessageId,
      type: 'synced',
      count: latestMessageId - firstMessageId + 1,
    })

    // After latest synced message (newer messages not synced)
    if (latestMessageId < maxId) {
      segments.push({
        start: latestMessageId + 1,
        end: maxId,
        type: 'unsynced',
        count: maxId - latestMessageId,
      })
    }
  }

  return segments
})

/**
 * ECharts option for the range visualization
 * Uses custom series to render rectangular segments
 */
const chartOption = computed(() => {
  if (!props.stats || chartSegments.value.length === 0) {
    return {
      xAxis: { type: 'value' as const, show: false },
      yAxis: { type: 'category' as const, show: false },
      series: [],
    }
  }

  const maxId = props.stats.totalMessages
  const segments = chartSegments.value

  // Convert segments to data format for custom series
  // Each item: [startId, endId, type, count]
  const data = segments.map((seg, index) => [seg.start, seg.end, seg.type, seg.count, index])

  return {
    tooltip: {
      trigger: 'item' as const,
      formatter: (params: unknown) => {
        const p = params as { data: [number, number, string, number, number] }
        if (!p.data)
          return ''
        const [start, end, type, count] = p.data
        const typeLabel = type === 'synced' ? t('sync.syncedRange') : t('sync.unsyncedRange')
        return `
          <div style="padding: 8px;">
            <div style="font-weight: 600; margin-bottom: 4px;">${typeLabel}</div>
            <div>${t('sync.rangeStart', { id: start.toLocaleString() })}</div>
            <div>${t('sync.rangeEnd', { id: end.toLocaleString() })}</div>
            <div style="margin-top: 4px; color: #888;">${count.toLocaleString()} ${t('sync.totalMessages').toLowerCase()}</div>
            ${type === 'unsynced' ? `<div style="margin-top: 8px; color: #3b82f6; font-size: 12px;">${t('sync.clickToSelectRange')}</div>` : ''}
          </div>
        `
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'value' as const,
      name: 'Message ID',
      nameLocation: 'center' as const,
      nameGap: 30,
      min: 1,
      max: maxId,
      axisLabel: {
        formatter: (value: number) => {
          if (value >= 1000000)
            return `${(value / 1000000).toFixed(1)}M`
          if (value >= 1000)
            return `${(value / 1000).toFixed(0)}K`
          return value.toString()
        },
      },
    },
    yAxis: {
      type: 'category' as const,
      data: [t('sync.syncProgress')],
      axisLabel: {
        show: false,
      },
      axisTick: {
        show: false,
      },
    },
    dataZoom: [
      {
        type: 'inside' as const,
        xAxisIndex: 0,
        start: 0,
        end: 100,
      },
      {
        type: 'slider' as const,
        xAxisIndex: 0,
        height: 20,
        bottom: 0,
        start: 0,
        end: 100,
      },
    ],
    series: [
      {
        type: 'custom' as const,
        renderItem: (_params: CustomSeriesRenderItemParams, api: { value: (dim: number) => number, coord: (val: [number, number]) => [number, number], size: (val: [number, number]) => [number, number] }): CustomSeriesRenderItemReturn => {
          const start = api.value(0)
          const end = api.value(1)
          const type = api.value(2) as unknown as string

          const startCoord = api.coord([start, 0])
          const endCoord = api.coord([end, 0])
          const height = api.size([0, 1])[1] * 0.6

          const isSynced = type === 'synced'
          const isSelected = selectedRange.value
            && start >= selectedRange.value.start
            && end <= selectedRange.value.end

          let color: string
          if (isSynced) {
            color = 'rgba(34, 197, 94, 0.8)' // Green for synced
          }
          else if (isSelected) {
            color = 'rgba(59, 130, 246, 0.8)' // Blue for selected
          }
          else {
            color = 'rgba(156, 163, 175, 0.6)' // Gray for unsynced
          }

          return {
            type: 'rect',
            shape: {
              x: startCoord[0],
              y: startCoord[1] - height / 2,
              width: endCoord[0] - startCoord[0],
              height,
              r: 4,
            },
            style: {
              fill: color,
              stroke: isSynced ? 'rgba(34, 197, 94, 1)' : isSelected ? 'rgba(59, 130, 246, 1)' : 'rgba(156, 163, 175, 0.8)',
              lineWidth: 1,
            },
            emphasis: {
              style: {
                fill: isSynced ? 'rgba(34, 197, 94, 1)' : 'rgba(59, 130, 246, 0.9)',
                stroke: isSynced ? 'rgba(22, 163, 74, 1)' : 'rgba(37, 99, 235, 1)',
                lineWidth: 2,
              },
            },
          }
        },
        data,
        encode: {
          x: [0, 1],
        },
      },
    ],
  }
})

/**
 * Handle chart click event to select unsynced ranges
 */
function handleChartClick(params: unknown) {
  const p = params as { data?: [number, number, string, number, number] }
  if (!p.data)
    return

  const [start, end, type] = p.data

  // Only allow selecting unsynced ranges
  if (type !== 'unsynced')
    return

  selectedRange.value = { start, end }
  emit('rangeSelect', { start, end })
}

/**
 * Clear selected range
 */
function clearSelection() {
  selectedRange.value = null
}

const syncPercentage = computed(() => {
  if (!props.stats || props.stats.totalMessages === 0)
    return 0
  return Math.round((props.stats.syncedMessages / props.stats.totalMessages) * 100)
})

// Clear selection when stats change (different chat selected)
watch(() => props.stats?.chatId, () => {
  selectedRange.value = null
})
</script>

<template>
  <div class="space-y-3">
    <button
      type="button"
      class="w-full flex items-center justify-between text-left"
      @click="toggleOpen"
    >
      <div class="space-y-1">
        <h3 class="text-base text-foreground font-semibold">
          {{ t('sync.syncVisualization') }}
        </h3>
        <p v-if="props.chatLabel" class="text-xs text-muted-foreground">
          {{ props.chatLabel }}
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span v-if="stats" class="text-xs text-muted-foreground">
          {{ t('sync.syncProgress') }}:
          <span class="text-foreground font-medium">{{ syncPercentage }}%</span>
        </span>
        <span
          :class="isOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="h-4 w-4 text-muted-foreground transition-transform duration-200"
        />
      </div>
    </button>

    <Transition name="collapse-vertical">
      <div v-show="isOpen" class="space-y-4">
        <!-- Skeleton while loading chat stats -->
        <div v-if="loading && !stats" class="space-y-4">
          <div class="grid grid-cols-3 gap-4">
            <div class="h-16 animate-pulse rounded-lg bg-muted" />
            <div class="h-16 animate-pulse rounded-lg bg-muted" />
            <div class="h-16 animate-pulse rounded-lg bg-muted" />
          </div>

          <div class="space-y-2">
            <div class="h-4 w-24 animate-pulse rounded bg-muted" />
            <div class="h-3 w-full animate-pulse rounded-full bg-muted" />
          </div>

          <div class="h-32 animate-pulse rounded-lg bg-muted" />
        </div>

        <div v-else-if="stats" class="space-y-4">
          <!-- Stats Summary -->
          <div class="grid grid-cols-3 gap-4">
            <div class="rounded-lg bg-muted p-4 text-center">
              <div class="text-2xl text-foreground font-bold">
                {{ stats.totalMessages.toLocaleString() }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ t('sync.totalMessages') }}
              </div>
            </div>
            <div class="rounded-lg bg-green-100 p-4 text-center dark:bg-green-900/20">
              <div class="text-2xl text-green-700 font-bold dark:text-green-400">
                {{ stats.syncedMessages.toLocaleString() }}
              </div>
              <div class="text-xs text-green-600 dark:text-green-500">
                {{ t('sync.syncedMessages') }}
              </div>
            </div>
            <div class="rounded-lg bg-gray-100 p-4 text-center dark:bg-gray-800">
              <div class="text-2xl text-gray-700 font-bold dark:text-gray-300">
                {{ Math.max(0, stats.totalMessages - stats.syncedMessages).toLocaleString() }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">
                {{ t('sync.unsyncedMessages') }}
              </div>
            </div>
          </div>

          <!-- Message ID Range Info -->
          <div v-if="stats.firstMessageId > 0" class="flex flex-wrap items-center gap-4 rounded-lg bg-muted/50 px-4 py-3 text-sm">
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-sm bg-green-500" />
              <span class="text-muted-foreground">{{ t('sync.syncedRange') }}:</span>
              <span class="text-foreground font-medium">
                {{ stats.firstMessageId.toLocaleString() }} - {{ stats.latestMessageId.toLocaleString() }}
              </span>
            </div>
            <div v-if="selectedRange" class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-sm bg-blue-500" />
              <span class="text-muted-foreground">{{ t('sync.selectedRange') }}:</span>
              <span class="text-foreground font-medium">
                {{ selectedRange.start.toLocaleString() }} - {{ selectedRange.end.toLocaleString() }}
              </span>
              <button
                type="button"
                class="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click.stop="clearSelection"
              >
                <span class="i-lucide-x h-3 w-3" />
              </button>
            </div>
          </div>

          <!-- Range Chart -->
          <div class="h-40 rounded-lg border bg-card p-2">
            <VChart
              ref="chartRef"
              :option="chartOption"
              autoresize
              @click="handleChartClick"
            />
          </div>

          <!-- Legend -->
          <div class="flex flex-wrap items-center justify-center gap-6 text-xs">
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-sm bg-green-500" />
              <span class="text-muted-foreground">{{ t('sync.syncedMessages') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-sm bg-gray-400" />
              <span class="text-muted-foreground">{{ t('sync.unsyncedMessages') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-sm bg-blue-500" />
              <span class="text-muted-foreground">{{ t('sync.selectedRange') }}</span>
            </div>
          </div>
        </div>

        <div v-else class="py-8 text-center text-sm text-muted-foreground">
          {{ t('sync.selectChats') }}
        </div>
      </div>
    </Transition>
  </div>
</template>
