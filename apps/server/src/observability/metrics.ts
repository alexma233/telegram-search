import type { Registry } from 'prom-client'

import process from 'node:process'

import { useLogger } from '@guiiai/logg'
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from 'prom-client'

const logger = useLogger('observability:metrics')

// Default registry for all metrics
export const metricsRegistry: Registry = register

// ============================================================================
// Runtime Metrics
// ============================================================================

// Collect default Node.js metrics (memory, CPU, event loop, etc.)
export function initDefaultMetrics() {
  collectDefaultMetrics({
    register: metricsRegistry,
    prefix: 'telegram_search_',
    labels: { app: 'telegram-search-server' },
  })
  logger.log('Default runtime metrics initialized')
}

// ============================================================================
// Takeout Task Metrics
// ============================================================================

/**
 * Counter for total takeout tasks by status
 * Labels: status (created, running, completed, failed, aborted)
 */
export const takeoutTasksTotal = new Counter({
  name: 'telegram_search_takeout_tasks_total',
  help: 'Total number of takeout tasks by status',
  labelNames: ['status'],
  registers: [metricsRegistry],
})

/**
 * Gauge for currently active takeout tasks
 */
export const takeoutTasksActive = new Gauge({
  name: 'telegram_search_takeout_tasks_active',
  help: 'Number of currently active takeout tasks',
  registers: [metricsRegistry],
})

/**
 * Histogram for takeout task duration in seconds
 */
export const takeoutTaskDuration = new Histogram({
  name: 'telegram_search_takeout_task_duration_seconds',
  help: 'Duration of takeout tasks in seconds',
  labelNames: ['status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600], // 1s to 1h
  registers: [metricsRegistry],
})

/**
 * Counter for total messages processed in takeout tasks
 */
export const takeoutMessagesProcessed = new Counter({
  name: 'telegram_search_takeout_messages_processed_total',
  help: 'Total number of messages processed in takeout tasks',
  labelNames: ['chat_id'],
  registers: [metricsRegistry],
})

/**
 * Gauge for current takeout task progress (0-100)
 */
export const takeoutTaskProgress = new Gauge({
  name: 'telegram_search_takeout_task_progress_percent',
  help: 'Current progress of takeout tasks in percentage',
  labelNames: ['task_id'],
  registers: [metricsRegistry],
})

// ============================================================================
// Message Processing Metrics
// ============================================================================

/**
 * Counter for total messages fetched
 */
export const messagesFetched = new Counter({
  name: 'telegram_search_messages_fetched_total',
  help: 'Total number of messages fetched from Telegram',
  labelNames: ['type'], // 'regular' or 'takeout'
  registers: [metricsRegistry],
})

/**
 * Histogram for message batch processing duration
 */
export const messageBatchProcessingDuration = new Histogram({
  name: 'telegram_search_message_batch_processing_duration_seconds',
  help: 'Duration of message batch processing in seconds',
  labelNames: ['batch_size'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [metricsRegistry],
})

// ============================================================================
// Storage/Database Metrics
// ============================================================================

/**
 * Counter for database operations
 */
export const dbOperations = new Counter({
  name: 'telegram_search_db_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'status'], // operation: query, insert, update, delete; status: success, error
  registers: [metricsRegistry],
})

/**
 * Histogram for database query duration
 */
export const dbQueryDuration = new Histogram({
  name: 'telegram_search_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [metricsRegistry],
})

// ============================================================================
// WebSocket Connection Metrics
// ============================================================================

/**
 * Gauge for active WebSocket connections
 */
export const wsConnectionsActive = new Gauge({
  name: 'telegram_search_ws_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [metricsRegistry],
})

/**
 * Counter for total WebSocket connections
 */
export const wsConnectionsTotal = new Counter({
  name: 'telegram_search_ws_connections_total',
  help: 'Total number of WebSocket connections',
  labelNames: ['status'], // 'opened', 'closed', 'error'
  registers: [metricsRegistry],
})

/**
 * Counter for WebSocket messages
 */
export const wsMessages = new Counter({
  name: 'telegram_search_ws_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['direction', 'event_type'], // direction: 'inbound', 'outbound'
  registers: [metricsRegistry],
})

// ============================================================================
// Search Metrics
// ============================================================================

/**
 * Counter for search queries
 */
export const searchQueries = new Counter({
  name: 'telegram_search_search_queries_total',
  help: 'Total number of search queries',
  labelNames: ['type'], // 'vector', 'text'
  registers: [metricsRegistry],
})

/**
 * Histogram for search query duration
 */
export const searchQueryDuration = new Histogram({
  name: 'telegram_search_search_query_duration_seconds',
  help: 'Duration of search queries in seconds',
  labelNames: ['type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
})

// ============================================================================
// HTTP Request Metrics
// ============================================================================

/**
 * Counter for HTTP requests
 */
export const httpRequests = new Counter({
  name: 'telegram_search_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [metricsRegistry],
})

/**
 * Histogram for HTTP request duration
 */
export const httpRequestDuration = new Histogram({
  name: 'telegram_search_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [metricsRegistry],
})

// ============================================================================
// Custom Runtime Metrics (Additional to defaults)
// ============================================================================

/**
 * Gauge for process uptime in seconds
 */
export const processUptime = new Gauge({
  name: 'telegram_search_process_uptime_seconds',
  help: 'Process uptime in seconds',
  registers: [metricsRegistry],
  collect() {
    this.set(process.uptime())
  },
})

/**
 * Initialize all metrics
 */
export function initMetrics() {
  initDefaultMetrics()
  logger.log('All metrics initialized')
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return await metricsRegistry.metrics()
}
