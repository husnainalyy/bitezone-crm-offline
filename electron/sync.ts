import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Db } from './db'
import { iso, money, orderLabel } from '../shared/format'
import type { SyncReport } from '../shared/types'
import { readConfig, supabaseReady } from './config'
import { getPool, withTx } from './db'
import { exclusive } from './lock'

interface Bootstrap {
  profile?: { role?: string }
  settings?: Record<string, unknown>
  categories?: Record<string, unknown>[]
  menu_items?: Record<string, unknown>[]
  variants?: Record<string, unknown>[]
  tables?: Record<string, unknown>[]
  customers?: Record<string, unknown>[]
  addresses?: Record<string, unknown>[]
  orders?: Record<string, unknown>[]
  order_items?: Record<string, unknown>[]
  deliveries?: Record<string, unknown>[]
}

function text(value: unknown) {
  return value == null ? null : String(value)
}

async function deactivateMissing(client: Db, table: 'categories' | 'menu_items' | 'menu_item_variants' | 'restaurant_tables', ids: string[]) {
  await client.query(`update ${table} set active = false where not (id = any(coalesce($1::uuid[], '{}')))`, [ids.length ? ids : null])
}

function errorText(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message) : 'Sync failed.'
  return message.replace(/^.*ERROR:\s*/i, '').split('\n')[0] || 'Sync failed.'
}

async function reachable(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    await fetch(url, { method: 'HEAD', signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function pull(client: Db, data: Bootstrap) {
  const settings = data.settings
  if (!settings) throw new Error('The online restaurant settings could not be read.')
  await client.query(
    `insert into restaurant_settings (id, name, phone, address, default_delivery_fee, tax_rate, daily_discount_percent, daily_discount_date, receipt_footer, version)
     values (1, $1, $2, $3, $4, $5, $6, $7::date, $8, $9)
     on conflict (id) do update set
       name = excluded.name, phone = excluded.phone, address = excluded.address,
       default_delivery_fee = excluded.default_delivery_fee, tax_rate = excluded.tax_rate,
       daily_discount_percent = excluded.daily_discount_percent, daily_discount_date = excluded.daily_discount_date,
       receipt_footer = excluded.receipt_footer, version = excluded.version, updated_at = now()`,
    [
      text(settings.name) || 'BiteZone',
      text(settings.phone) ?? '',
      text(settings.address) ?? '',
      money(settings.default_delivery_fee),
      money(settings.tax_rate),
      money(settings.daily_discount_percent),
      text(settings.daily_discount_date),
      text(settings.receipt_footer) || 'Thank you for choosing BiteZone.',
      Number(settings.version ?? 1),
    ],
  )

  const categories = data.categories ?? []
  for (const row of categories) {
    await client.query(
      `insert into categories (id, name, sort_order, active) values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order, active = excluded.active`,
      [row.id, row.name, Number(row.sort_order ?? 0), Boolean(row.active)],
    )
  }
  await deactivateMissing(client, 'categories', categories.map((row) => String(row.id)))

  const categoryIds = new Set(categories.map((row) => String(row.id)))
  const items = data.menu_items ?? []
  const itemIds = new Set<string>()
  for (const row of items) {
    if (!categoryIds.has(String(row.category_id))) continue
    itemIds.add(String(row.id))
    await client.query(
      `insert into menu_items (id, category_id, name, description, price, image_url, active, sort_order, track_inventory, version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (id) do update set category_id = excluded.category_id, name = excluded.name, description = excluded.description,
         price = excluded.price, image_url = excluded.image_url, active = excluded.active, sort_order = excluded.sort_order,
         track_inventory = excluded.track_inventory, version = excluded.version`,
      [row.id, row.category_id, row.name, text(row.description) ?? '', money(row.price), text(row.image_url), Boolean(row.active), Number(row.sort_order ?? 0), Boolean(row.track_inventory), Number(row.version ?? 1)],
    )
  }
  await deactivateMissing(client, 'menu_items', items.map((row) => String(row.id)))

  const variants = data.variants ?? []
  for (const row of variants) {
    if (!itemIds.has(String(row.menu_item_id))) continue
    await client.query(
      `insert into menu_item_variants (id, menu_item_id, name, price, active) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set menu_item_id = excluded.menu_item_id, name = excluded.name, price = excluded.price, active = excluded.active`,
      [row.id, row.menu_item_id, row.name, money(row.price), Boolean(row.active)],
    )
  }
  await deactivateMissing(client, 'menu_item_variants', variants.map((row) => String(row.id)))

  const tables = data.tables ?? []
  for (const row of tables) {
    await client.query(
      `insert into restaurant_tables (id, name, capacity, active, sort_order, version) values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set name = excluded.name, capacity = excluded.capacity, active = excluded.active, sort_order = excluded.sort_order, version = excluded.version`,
      [row.id, row.name, Number(row.capacity ?? 4), Boolean(row.active), Number(row.sort_order ?? 0), Number(row.version ?? 1)],
    )
  }
  await deactivateMissing(client, 'restaurant_tables', tables.map((row) => String(row.id)))

  for (const row of data.customers ?? []) {
    await client.query(
      `insert into customers (id, name, phone, alternate_phone, notes, version, sync_status, created_at)
       values ($1,$2,$3,$4,$5,$6,'synced',$7)
       on conflict (id) do update set name = excluded.name, phone = excluded.phone, alternate_phone = excluded.alternate_phone,
         notes = excluded.notes, version = excluded.version, sync_status = 'synced'
       where customers.sync_status <> 'pending'`,
      [row.id, row.name, row.phone, text(row.alternate_phone), text(row.notes), Number(row.version ?? 1), iso(row.created_at)],
    )
  }
  for (const row of data.addresses ?? []) {
    await client.query(
      `insert into customer_addresses (id, customer_id, label, full_address, area, landmark, instructions, sync_status, created_at)
       select $1,$2,$3,$4,$5,$6,$7,'synced',$8
       where exists (select 1 from customers where id = $2)
       on conflict (id) do update set customer_id = excluded.customer_id, label = excluded.label, full_address = excluded.full_address,
         area = excluded.area, landmark = excluded.landmark, instructions = excluded.instructions, sync_status = 'synced'
       where customer_addresses.sync_status <> 'pending'`,
      [row.id, row.customer_id, text(row.label) || 'Home', row.full_address, text(row.area) ?? '', text(row.landmark), text(row.instructions), iso(row.created_at)],
    )
  }

  const applied: string[] = []
  for (const row of data.orders ?? []) {
    const saved = await client.query<{ id: string }>(
      `insert into orders (
         id, local_number, order_number, order_type, order_source, table_id, customer_id, status, subtotal, discount_amount,
         tax_amount, tax_rate, delivery_fee, total, payment_status, paid_amount, notes, version, sync_status, origin, created_at, updated_at, completed_at
       ) values ($1,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'synced','server',$18,$19,$20)
       on conflict (id) do update set
         order_number = excluded.order_number, status = excluded.status, subtotal = excluded.subtotal, discount_amount = excluded.discount_amount,
         tax_amount = excluded.tax_amount, tax_rate = excluded.tax_rate, delivery_fee = excluded.delivery_fee, total = excluded.total,
         payment_status = excluded.payment_status, paid_amount = excluded.paid_amount, notes = excluded.notes, version = excluded.version,
         sync_status = 'synced', sync_error = null, updated_at = excluded.updated_at, completed_at = excluded.completed_at
       where orders.sync_status <> 'pending'
       returning id`,
      [
        row.id, row.order_number == null ? null : Number(row.order_number), row.order_type, row.order_source, text(row.table_id), text(row.customer_id),
        text(row.status) || 'placed', money(row.subtotal), money(row.discount_amount), money(row.tax_amount), money(row.tax_rate), money(row.delivery_fee), money(row.total),
        text(row.payment_status) || 'unpaid', money(row.paid_amount), text(row.notes), Number(row.version ?? 1), iso(row.created_at), iso(row.updated_at), row.completed_at ? iso(row.completed_at) : null,
      ],
    )
    if (saved.rows[0]) applied.push(saved.rows[0].id)
  }

  if (applied.length) {
    const appliedItems = (data.order_items ?? []).filter((row) => applied.includes(String(row.order_id)))
    await client.query(`delete from order_items where order_id = any($1::uuid[])`, [applied])
    for (const row of appliedItems) {
      await client.query(
        `insert into order_items (id, order_id, menu_item_id, variant_id, item_name, variant_name, unit_price, quantity, line_total, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [row.id, row.order_id, text(row.menu_item_id), text(row.variant_id), row.item_name, text(row.variant_name), money(row.unit_price), Number(row.quantity), money(row.line_total), text(row.notes)],
      )
    }
    const appliedDeliveries = (data.deliveries ?? []).filter((row) => applied.includes(String(row.order_id)))
    await client.query(`delete from deliveries where order_id = any($1::uuid[])`, [applied])
    for (const row of appliedDeliveries) {
      await client.query(
        `insert into deliveries (id, order_id, address_snapshot, phone_snapshot, area_snapshot, landmark_snapshot, instructions_snapshot, status, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.id, row.order_id, row.address_snapshot, row.phone_snapshot, text(row.area_snapshot), text(row.landmark_snapshot), text(row.instructions_snapshot), text(row.status) || 'pending', iso(row.created_at)],
      )
    }
  }
  return { menuItems: items.length, tables: tables.length, ordersPulled: applied.length }
}

async function operation(supabase: SupabaseClient, deviceId: string, userId: string, operationId: string, type: string, payload: unknown) {
  const { data, error } = await supabase.rpc('process_operation', {
    p_client_operation_id: operationId,
    p_device_id: deviceId,
    p_type: type,
    p_payload: payload,
    p_actor_user_id: userId,
  })
  if (error) throw error
  return data as Record<string, unknown> | null
}

async function push(supabase: SupabaseClient, deviceId: string, userId: string) {
  const pool = getPool()
  const waiting = await pool.query<{ id: string; local_number: number; order_number: string | null; client_operation_id: string; payload: Record<string, unknown>; customer_id: string | null }>(`
    select id, local_number, order_number, client_operation_id, payload, customer_id
    from orders
    where origin = 'local' and sync_status in ('pending', 'failed')
    order by created_at asc`)
  let ordersPushed = 0
  const failures: SyncReport['failures'] = []
  for (const order of waiting.rows) {
    const label = orderLabel(order.order_number == null ? null : Number(order.order_number), order.local_number)
    try {
      if (order.customer_id) {
        const customer = await pool.query<{ sync_status: string; client_operation_id: string | null; sync_payload: Record<string, unknown> | null }>(
          `select sync_status, client_operation_id, sync_payload from customers where id = $1`,
          [order.customer_id],
        )
        const guest = customer.rows[0]
        if (guest && guest.sync_status !== 'synced' && guest.client_operation_id && guest.sync_payload) {
          await operation(supabase, deviceId, userId, guest.client_operation_id, 'save_entity', guest.sync_payload)
          await pool.query(`update customers set sync_status = 'synced' where id = $1`, [order.customer_id])
        }
        const addressId = text(order.payload?.address_id)
        if (addressId) {
          const address = await pool.query<{ sync_status: string; client_operation_id: string | null; sync_payload: Record<string, unknown> | null }>(
            `select sync_status, client_operation_id, sync_payload from customer_addresses where id = $1`,
            [addressId],
          )
          const saved = address.rows[0]
          if (saved && saved.sync_status !== 'synced' && saved.client_operation_id && saved.sync_payload) {
            await operation(supabase, deviceId, userId, saved.client_operation_id, 'save_entity', saved.sync_payload)
            await pool.query(`update customer_addresses set sync_status = 'synced' where id = $1`, [addressId])
          }
        }
      }
      const result = await operation(supabase, deviceId, userId, order.client_operation_id, 'create_order', order.payload)
      await pool.query(
        `update orders set
           sync_status = 'synced', sync_error = null,
           order_number = coalesce($2, order_number),
           status = coalesce($3, status),
           subtotal = coalesce($4, subtotal),
           discount_amount = coalesce($5, discount_amount),
           tax_amount = coalesce($6, tax_amount),
           total = coalesce($7, total),
           payment_status = coalesce($8, payment_status),
           version = coalesce($9, version),
           updated_at = now()
         where id = $1`,
        [
          order.id,
          result?.order_number == null ? null : Number(result.order_number),
          text(result?.status),
          result?.subtotal == null ? null : money(result.subtotal),
          result?.discount_amount == null ? null : money(result.discount_amount),
          result?.tax_amount == null ? null : money(result.tax_amount),
          result?.total == null ? null : money(result.total),
          text(result?.payment_status),
          result?.version == null ? null : Number(result.version),
        ],
      )
      ordersPushed += 1
    } catch (error) {
      const message = errorText(error)
      await pool.query(`update orders set sync_status = 'failed', sync_error = $2, updated_at = now() where id = $1`, [order.id, message])
      failures.push({ id: order.id, label, message })
    }
  }
  return { ordersPushed, failures }
}

export function syncNow() {
  return exclusive(async (): Promise<SyncReport> => {
    const config = readConfig()
    if (!config || !supabaseReady(config)) throw new Error('Online sync is not set up yet. A manager opens Online sync and saves the website login once.')
    const online = await reachable(config.supabase.url)
    if (!online) {
      return { online: false, message: 'This computer is offline. Orders stay saved here until you sync.', menuItems: 0, tables: 0, ordersPulled: 0, ordersPushed: 0, failures: [] }
    }
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    try {
      const auth = await supabase.auth.signInWithPassword({ email: config.supabase.email, password: config.supabase.password })
      if (auth.error || !auth.data.user) throw new Error('The online admin email or password was rejected.')
      const boot = await supabase.rpc('restaurant_bootstrap', { p_order_id: null })
      if (boot.error) throw boot.error
      const data = boot.data as Bootstrap
      const role = data.profile?.role
      if (role !== 'admin' && role !== 'super_admin') throw new Error('Sync needs an admin account from the online CRM.')
      const pulled = await withTx((client) => pull(client, data))
      const pushed = await push(supabase, config.deviceId, auth.data.user.id)
      const summary = pushed.failures.length
        ? `${pushed.failures.length} order${pushed.failures.length === 1 ? '' : 's'} could not be sent.`
        : pushed.ordersPushed
          ? `${pushed.ordersPushed} order${pushed.ordersPushed === 1 ? '' : 's'} sent. Menu, tables, and customer names are up to date.`
          : 'Menu, tables, and customer names are up to date. Nothing was waiting to send.'
      await getPool().query(`update sync_state set last_synced_at = now(), last_error = $1 where id = 1`, [pushed.failures.length ? summary : null])
      return { online: true, message: summary, ...pulled, ...pushed }
    } catch (error) {
      const message = errorText(error)
      await getPool().query(`update sync_state set last_error = $1 where id = 1`, [message]).catch(() => undefined)
      throw new Error(message)
    } finally {
      await supabase.auth.signOut().catch(() => undefined)
    }
  })
}
