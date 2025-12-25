import type { DatabaseConfig } from './config-schema'

export function getDatabaseDSN(database: DatabaseConfig): string {
  return database.url || `postgres://${database.user}:${database.password}@${database.host}:${database.port}/${database.database}`
}

interface MinioConnectionOptions {
  endPoint: string
  port: number
  useSSL: boolean
}

export function parseMinioDSN(dsn: string): MinioConnectionOptions {
  const url = new URL(dsn)

  const endPoint = url.hostname
  const port = Number(url.port)
  const useSSL = url.protocol === 'https:'

  if (!port || !endPoint) {
    throw new Error('Invalid Minio DSN')
  }

  return {
    endPoint,
    port,
    useSSL,
  }
}
