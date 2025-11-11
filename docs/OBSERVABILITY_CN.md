# 可观测性指南

本文档介绍 telegram-search 服务器模式中的可观测性特性，包括 Prometheus 指标和 OpenTelemetry 集成。

## 功能特性

- **Prometheus 指标**: 运行时指标（CPU、内存、事件循环）和应用指标（takeout 任务、消息、搜索查询）
- **OpenTelemetry**: 自动化分布式追踪（可选）
- **指标端点**: `/metrics` 端点用于 Prometheus 采集

## 快速开始

### 1. Prometheus 指标（默认启用）

Prometheus 指标在服务器模式下自动启用，无需配置。

访问指标: `http://localhost:3000/metrics`

### 2. OpenTelemetry（可选）

启用 OpenTelemetry 自动化工具:

**通过环境变量:**
```bash
export OTEL_ENABLED=true
export OTEL_SERVICE_NAME=telegram-search-server
export OTEL_PROMETHEUS_PORT=9464
```

**通过 config.yaml:**
```yaml
observability:
  otel:
    enabled: true
    serviceName: 'telegram-search-server'
    prometheusPort: 9464
```

启用后，OTEL 将在独立端口（默认: 9464）暴露指标。

## 可用指标

### Takeout 任务指标

- `telegram_search_takeout_tasks_total{status}` - 按状态统计的 takeout 任务总数
- `telegram_search_takeout_tasks_active` - 当前活跃的 takeout 任务数
- `telegram_search_takeout_task_duration_seconds{status}` - Takeout 任务持续时间
- `telegram_search_takeout_messages_processed_total{chat_id}` - 已处理的消息总数
- `telegram_search_takeout_task_progress_percent{task_id}` - 任务进度百分比（0-100）

### WebSocket 指标

- `telegram_search_ws_connections_active` - 活跃的 WebSocket 连接数
- `telegram_search_ws_connections_total{status}` - WebSocket 连接总数
- `telegram_search_ws_messages_total{direction, event_type}` - WebSocket 消息总数

### HTTP 指标

- `telegram_search_http_requests_total{method, path, status}` - HTTP 请求总数
- `telegram_search_http_request_duration_seconds{method, path}` - HTTP 请求持续时间

### 数据库指标

- `telegram_search_db_operations_total{operation, status}` - 数据库操作总数
- `telegram_search_db_query_duration_seconds{operation}` - 数据库查询持续时间

### 运行时指标

- `process_cpu_user_seconds_total` - 用户态 CPU 使用时间
- `process_cpu_system_seconds_total` - 系统态 CPU 使用时间
- `process_heap_bytes` - 堆内存使用量
- `process_resident_memory_bytes` - RSS 内存
- `nodejs_eventloop_lag_seconds` - 事件循环延迟
- `nodejs_gc_duration_seconds` - 垃圾回收持续时间

## Prometheus 配置示例

```yaml
scrape_configs:
  - job_name: 'telegram-search'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s

  # 如果启用了 OTEL
  - job_name: 'telegram-search-otel'
    static_configs:
      - targets: ['localhost:9464']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Grafana 查询示例

### Takeout 任务指标

**活跃任务数:**
```promql
telegram_search_takeout_tasks_active
```

**任务完成速率:**
```promql
rate(telegram_search_takeout_tasks_total{status="completed"}[5m])
```

**任务持续时间（95 分位数）:**
```promql
histogram_quantile(0.95, rate(telegram_search_takeout_task_duration_seconds_bucket[5m]))
```

**消息处理速率:**
```promql
rate(telegram_search_takeout_messages_processed_total[5m])
```

### 运行时指标

**内存使用量:**
```promql
process_resident_memory_bytes / 1024 / 1024
```

**CPU 使用率:**
```promql
rate(process_cpu_user_seconds_total[1m]) + rate(process_cpu_system_seconds_total[1m])
```

**事件循环延迟:**
```promql
nodejs_eventloop_lag_seconds
```

## Docker Compose 示例

```yaml
version: '3.8'

services:
  telegram-search:
    image: telegram-search:latest
    ports:
      - "3000:3000"
      - "9464:9464"  # OTEL 指标（如果启用）
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

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## 最佳实践

1. **采集间隔**: 生产环境使用 15s 或 30s
2. **数据保留**: 根据需求配置 Prometheus 保留时间（默认: 15 天）
3. **告警配置**: 建议设置以下告警:
   - 任务失败率过高
   - 内存使用率过高
   - 事件循环延迟 > 50ms
   - 数据库查询时间 > 1s
4. **基数控制**: 注意高基数标签如 `task_id` - 任务完成时会自动清理

## 故障排查

### 指标未显示

1. 检查服务器运行状态: `curl http://localhost:3000/health`
2. 检查指标端点: `curl http://localhost:3000/metrics`
3. 检查 Prometheus 目标: http://localhost:9090/targets

### 内存使用过高

检查:
- 内存指标: `process_heap_bytes`, `process_resident_memory_bytes`
- 活跃任务: `telegram_search_takeout_tasks_active`
- WebSocket 连接: `telegram_search_ws_connections_active`

### OTEL 无法工作

1. 确认设置了 `OTEL_ENABLED=true`
2. 检查日志中的 OTEL 初始化消息
3. 确认 OTEL 端口未被占用: `netstat -an | grep 9464`

## 相关资源

- [Prometheus 文档](https://prometheus.io/docs/)
- [OpenTelemetry Node.js 文档](https://opentelemetry.io/docs/instrumentation/js/)
- [prom-client 文档](https://github.com/siimon/prom-client)
