# Observability Guide

This document describes the observability features available in telegram-search server mode, including Prometheus metrics and OpenTelemetry integration.

## Features

- **Prometheus Metrics**: Runtime metrics (CPU, memory, event loop) and application metrics (takeout tasks, messages, search queries)
- **OpenTelemetry**: Auto-instrumentation for distributed tracing (optional)
- **Metrics Endpoint**: `/metrics` endpoint for Prometheus scraping

## Quick Start

### 1. Prometheus Metrics (Always Enabled)

Prometheus metrics are automatically enabled in server mode. No configuration required.

Access metrics at: `http://localhost:3000/metrics`

### 2. OpenTelemetry (Optional)

To enable OpenTelemetry auto-instrumentation:

**Via Environment Variables:**
```bash
export OTEL_ENABLED=true
export OTEL_SERVICE_NAME=telegram-search-server
export OTEL_PROMETHEUS_PORT=9464
```

**Via config.yaml:**
```yaml
observability:
  otel:
    enabled: true
    serviceName: 'telegram-search-server'
    prometheusPort: 9464
```

When enabled, OTEL will expose metrics on a separate port (default: 9464).

## Available Metrics

### Runtime Metrics (Default Node.js Metrics)

Collected automatically by `prom-client`:

- `process_cpu_user_seconds_total` - CPU usage in user mode
- `process_cpu_system_seconds_total` - CPU usage in system mode
- `process_heap_bytes` - Heap memory usage
- `process_resident_memory_bytes` - RSS memory
- `nodejs_eventloop_lag_seconds` - Event loop lag
- `nodejs_gc_duration_seconds` - Garbage collection duration
- `nodejs_version_info` - Node.js version

### Takeout Task Metrics

Metrics for tracking takeout task lifecycle and progress:

- `telegram_search_takeout_tasks_total{status}` (Counter)
  - Labels: `status` = `created`, `running`, `completed`, `failed`, `aborted`
  - Total number of takeout tasks by status

- `telegram_search_takeout_tasks_active` (Gauge)
  - Number of currently active takeout tasks

- `telegram_search_takeout_task_duration_seconds{status}` (Histogram)
  - Labels: `status` = `completed`, `aborted`, `failed`
  - Duration of takeout tasks
  - Buckets: 1s, 5s, 10s, 30s, 1m, 2m, 5m, 10m, 30m, 1h

- `telegram_search_takeout_messages_processed_total{chat_id}` (Counter)
  - Labels: `chat_id` - Telegram chat ID
  - Total messages processed in takeout tasks

- `telegram_search_takeout_task_progress_percent{task_id}` (Gauge)
  - Labels: `task_id` - Unique task identifier
  - Current progress percentage (0-100) of active tasks

### Message Processing Metrics

- `telegram_search_messages_fetched_total{type}` (Counter)
  - Labels: `type` = `regular`, `takeout`
  - Total messages fetched from Telegram

- `telegram_search_message_batch_processing_duration_seconds{batch_size}` (Histogram)
  - Duration of message batch processing
  - Buckets: 0.1s, 0.5s, 1s, 2s, 5s, 10s, 30s, 60s

### Database Metrics

- `telegram_search_db_operations_total{operation, status}` (Counter)
  - Labels: `operation` = `query`, `insert`, `update`, `delete`
  - Labels: `status` = `success`, `error`

- `telegram_search_db_query_duration_seconds{operation}` (Histogram)
  - Database query duration
  - Buckets: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s, 10s

### WebSocket Metrics

- `telegram_search_ws_connections_active` (Gauge)
  - Number of active WebSocket connections

- `telegram_search_ws_connections_total{status}` (Counter)
  - Labels: `status` = `opened`, `closed`, `error`
  - Total WebSocket connections

- `telegram_search_ws_messages_total{direction, event_type}` (Counter)
  - Labels: `direction` = `inbound`, `outbound`
  - Labels: `event_type` - Event name (e.g., `takeout:run`, `message:data`)
  - Total WebSocket messages

### Search Metrics

- `telegram_search_search_queries_total{type}` (Counter)
  - Labels: `type` = `vector`, `text`
  - Total search queries

- `telegram_search_search_query_duration_seconds{type}` (Histogram)
  - Search query duration
  - Buckets: 10ms, 50ms, 100ms, 500ms, 1s, 2s, 5s, 10s

### HTTP Metrics

- `telegram_search_http_requests_total{method, path, status}` (Counter)
  - Total HTTP requests
  - Labels: `method`, `path`, `status`

- `telegram_search_http_request_duration_seconds{method, path}` (Histogram)
  - HTTP request duration
  - Buckets: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s

## Prometheus Configuration

Example Prometheus scrape configuration:

```yaml
scrape_configs:
  - job_name: 'telegram-search'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s

  # If OTEL is enabled
  - job_name: 'telegram-search-otel'
    static_configs:
      - targets: ['localhost:9464']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Grafana Dashboard

Example PromQL queries for Grafana:

### Takeout Task Metrics

**Active Tasks:**
```promql
telegram_search_takeout_tasks_active
```

**Task Completion Rate:**
```promql
rate(telegram_search_takeout_tasks_total{status="completed"}[5m])
```

**Task Duration (95th percentile):**
```promql
histogram_quantile(0.95, rate(telegram_search_takeout_task_duration_seconds_bucket[5m]))
```

**Messages Processing Rate:**
```promql
rate(telegram_search_takeout_messages_processed_total[5m])
```

### Runtime Metrics

**Memory Usage:**
```promql
process_resident_memory_bytes / 1024 / 1024
```

**CPU Usage:**
```promql
rate(process_cpu_user_seconds_total[1m]) + rate(process_cpu_system_seconds_total[1m])
```

**Event Loop Lag:**
```promql
nodejs_eventloop_lag_seconds
```

### WebSocket Metrics

**Active Connections:**
```promql
telegram_search_ws_connections_active
```

**Message Rate:**
```promql
rate(telegram_search_ws_messages_total[5m])
```

## Docker Compose Example

```yaml
version: '3.8'

services:
  telegram-search:
    image: telegram-search:latest
    ports:
      - "3000:3000"
      - "9464:9464"  # OTEL metrics (if enabled)
    environment:
      - OTEL_ENABLED=true
      - OTEL_SERVICE_NAME=telegram-search-server
      - OTEL_PROMETHEUS_PORT=9464

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
```

## Best Practices

1. **Scrape Interval**: Use 15s or 30s for production systems
2. **Retention**: Configure Prometheus retention based on your needs (default: 15 days)
3. **Alerting**: Set up alerts for:
   - High task failure rate
   - High memory usage
   - Event loop lag > 50ms
   - Database query duration > 1s
4. **Cardinality**: Be careful with high-cardinality labels like `task_id` - they are cleaned up automatically when tasks complete

## Troubleshooting

### Metrics not showing up

1. Check if the server is running: `curl http://localhost:3000/health`
2. Check metrics endpoint: `curl http://localhost:3000/metrics`
3. Check Prometheus targets: http://localhost:9090/targets

### High memory usage

Check for:
- Memory metrics: `process_heap_bytes`, `process_resident_memory_bytes`
- Active tasks: `telegram_search_takeout_tasks_active`
- Active WebSocket connections: `telegram_search_ws_connections_active`

### OTEL not working

1. Verify `OTEL_ENABLED=true` is set
2. Check logs for OTEL initialization messages
3. Verify OTEL port is not already in use: `netstat -an | grep 9464`

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [OpenTelemetry Node.js Documentation](https://opentelemetry.io/docs/instrumentation/js/)
- [prom-client Documentation](https://github.com/siimon/prom-client)
