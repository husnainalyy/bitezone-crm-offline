import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { PGlite } from '@electric-sql/pglite'
import type { AppStatus } from '../shared/types'
import { ensureDevice, readConfig, supabaseReady } from './config'

export interface QueryResult<T> {
  rows: T[]
  rowCount: number
}

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>
}

let opening: Promise<PGlite> | null = null
let tail: Promise<void> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn)
  tail = run.then(() => undefined, () => undefined)
  return run
}

function asResult<T>(result: { rows: T[]; rowCount?: number | null }): QueryResult<T> {
  return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length }
}

export function explainDb(error: unknown) {
  if (error instanceof Error && error.message && !/connect|ECONNREFUSED|password authentication/i.test(error.message)) return error
  return new Error('The orders saved on this computer could not be opened. Close BiteZone and open it again.')
}

async function rawDb() {
  if (!opening) {
    const dataDir = path.join(app.getPath('userData'), 'counter-data')
    fs.mkdirSync(dataDir, { recursive: true })
    opening = PGlite.create(dataDir).then(async (db) => {
      await ensureSchema(db)
      ensureDevice()
      return db
    })
  }
  return opening
}

async function ensureSchema(db: PGlite) {
  const check = await db.query<{ ready: boolean }>(`select to_regclass('public.orders') is not null as ready`)
  if (check.rows[0]?.ready) return
  const sql = fs.readFileSync(path.join(__dirname, '../../schema/local.sql'), 'utf8')
  await db.exec(sql)
}

export function getPool(): Db {
  return {
    query: (sql, params) => enqueue(async () => asResult(await (await rawDb()).query(sql, params))),
  }
}

export async function hasSchema() {
  const result = await getPool().query<{ ready: boolean }>(`select to_regclass('public.orders') is not null as ready`)
  return Boolean(result.rows[0]?.ready)
}

export function withTx<T>(fn: (client: Db) => Promise<T>) {
  return enqueue(async () => {
    const db = await rawDb()
    try {
      return await db.transaction(async (tx) => fn({
        query: async (sql, params) => asResult(await tx.query(sql, params)),
      }))
    } catch (error) {
      throw explainDb(error)
    }
  })
}

function asIso(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function getStatus(): Promise<AppStatus> {
  try {
    await rawDb()
    const meta = await getPool().query<{ pending: string | number; last_synced_at: unknown; last_error: string | null; name: string }>(`
      select
        (select count(*) from orders where origin = 'local' and sync_status in ('pending', 'failed')) as pending,
        (select last_synced_at from sync_state where id = 1) as last_synced_at,
        (select last_error from sync_state where id = 1) as last_error,
        (select name from restaurant_settings where id = 1) as name
    `)
    const row = meta.rows[0]
    const config = readConfig()
    return {
      configured: true,
      localConnected: true,
      schemaReady: true,
      localError: null,
      pendingCount: Number(row?.pending ?? 0),
      lastSyncedAt: asIso(row?.last_synced_at),
      lastError: row?.last_error ?? null,
      restaurantName: row?.name || 'BiteZone',
      supabaseReady: supabaseReady(config),
    }
  } catch (error) {
    return {
      configured: false,
      localConnected: false,
      schemaReady: false,
      localError: explainDb(error).message,
      pendingCount: 0,
      lastSyncedAt: null,
      lastError: null,
      restaurantName: 'BiteZone',
      supabaseReady: supabaseReady(readConfig()),
    }
  }
}

export function closeDb() {
  return enqueue(async () => {
    if (!opening) return
    const db = await opening
    opening = null
    await db.close()
  })
}
