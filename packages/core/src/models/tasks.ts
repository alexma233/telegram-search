import type { CoreTaskData, CoreTaskType } from '../types/task'

import { Ok } from '@unbird/result'
import { and, desc, eq, inArray } from 'drizzle-orm'

import { withDb } from '../db'
import { tasksTable } from '../schemas/tasks'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted'

export interface DBTask {
  id: string
  task_id: string
  type: CoreTaskType
  status: TaskStatus
  progress: number
  last_message: string | null
  last_error: string | null
  metadata: unknown
  created_at: number
  updated_at: number
  completed_at: number | null
}

/**
 * Save or update a task in the database
 */
export async function saveTask<T extends CoreTaskType>(taskData: Omit<CoreTaskData<T>, 'abortController'>) {
  const dbTask = {
    task_id: taskData.taskId,
    type: taskData.type,
    status: determineStatus(taskData.progress, taskData.lastError),
    progress: taskData.progress,
    last_message: taskData.lastMessage ?? null,
    last_error: taskData.lastError ?? null,
    metadata: taskData.metadata,
    created_at: taskData.createdAt.getTime(),
    updated_at: taskData.updatedAt.getTime(),
    completed_at: taskData.progress === 100 ? taskData.updatedAt.getTime() : null,
  }

  return withDb(async db =>
    db
      .insert(tasksTable)
      .values(dbTask)
      .onConflictDoUpdate({
        target: tasksTable.task_id,
        set: {
          status: dbTask.status,
          progress: dbTask.progress,
          last_message: dbTask.last_message,
          last_error: dbTask.last_error,
          metadata: dbTask.metadata,
          updated_at: dbTask.updated_at,
          completed_at: dbTask.completed_at,
        },
      })
      .returning(),
  )
}

/**
 * Get a task by task_id
 */
export async function getTaskByTaskId(taskId: string) {
  const result = await withDb(async db =>
    db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.task_id, taskId))
      .limit(1),
  )

  const rows = result.expect('Failed to get task by task ID')
  return Ok(rows.length > 0 ? rows[0] as DBTask : null)
}

/**
 * Get all tasks of a specific type
 */
export async function getTasksByType(type: CoreTaskType) {
  const result = await withDb(async db =>
    db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.type, type))
      .orderBy(desc(tasksTable.created_at)),
  )

  const rows = result.expect('Failed to get tasks by type')
  return Ok(rows as DBTask[])
}

/**
 * Get tasks by status
 */
export async function getTasksByStatus(statuses: TaskStatus[]) {
  const result = await withDb(async db =>
    db
      .select()
      .from(tasksTable)
      .where(inArray(tasksTable.status, statuses))
      .orderBy(desc(tasksTable.created_at)),
  )

  const rows = result.expect('Failed to get tasks by status')
  return Ok(rows as DBTask[])
}

/**
 * Get resumable tasks (pending or running)
 */
export async function getResumableTasks(type?: CoreTaskType) {
  const result = await withDb(async (db) => {
    return db
      .select()
      .from(tasksTable)
      .where(
        type
          ? and(
              inArray(tasksTable.status, ['pending', 'running']),
              eq(tasksTable.type, type),
            )
          : inArray(tasksTable.status, ['pending', 'running']),
      )
      .orderBy(desc(tasksTable.created_at))
  })

  const rows = result.expect('Failed to get resumable tasks')
  return Ok(rows as DBTask[])
}

/**
 * Delete a task by task_id
 */
export async function deleteTask(taskId: string) {
  return withDb(async db =>
    db
      .delete(tasksTable)
      .where(eq(tasksTable.task_id, taskId))
      .returning(),
  )
}

/**
 * Delete completed or failed tasks older than specified timestamp
 */
export async function cleanupOldTasks(olderThanMs: number) {
  return withDb(async db =>
    db
      .delete(tasksTable)
      .where(
        and(
          inArray(tasksTable.status, ['completed', 'failed', 'aborted']),
          eq(tasksTable.updated_at, olderThanMs),
        ),
      )
      .returning(),
  )
}

/**
 * Determine task status based on progress and error
 */
function determineStatus(progress: number, lastError?: string): TaskStatus {
  if (lastError) {
    if (lastError === 'Task aborted') {
      return 'aborted'
    }
    return 'failed'
  }
  if (progress === 100) {
    return 'completed'
  }
  if (progress > 0) {
    return 'running'
  }
  return 'pending'
}
