import crypto from 'node:crypto'
import type { Db } from './db'
import { dateOnly, estimateTotals, iso, money, roundMoney } from '../shared/format'
import type { CounterData, OrderDetail, OrderFilter, OrderSummary, OrderType, PlaceOrderInput, SyncStatus } from '../shared/types'
import { getPool, withTx } from './db'
import { exclusive } from './lock'

interface ItemRow { id: string; name: string; price: string; active: boolean; category_active: boolean }
interface VariantRow { id: string; menu_item_id: string; name: string; price: string; active: boolean }

function syncStatus(value: string): SyncStatus {
  return value === 'synced' || value === 'failed' ? value : 'pending'
}

function orderType(value: string): OrderType {
  return value === 'takeaway' || value === 'delivery' ? value : 'dine_in'
}

export async function loadCounter(): Promise<CounterData> {
  const pool = getPool()
  const [settings, categories, items, variants, tables, customers, addresses, busy] = await Promise.all([
    pool.query<{ name: string; tax_rate: string; default_delivery_fee: string; daily_discount_percent: string; daily_discount_date: string | null; receipt_footer: string }>(`
      select name, tax_rate, default_delivery_fee, daily_discount_percent, daily_discount_date::text, receipt_footer
      from restaurant_settings where id = 1`),
    pool.query<{ id: string; name: string; sort_order: number }>(`select id, name, sort_order from categories where active order by sort_order, name`),
    pool.query<{ id: string; category_id: string; name: string; description: string; price: string; image_url: string | null; sort_order: number }>(`
      select id, category_id, name, description, price, image_url, sort_order
      from menu_items where active order by sort_order, name`),
    pool.query<{ id: string; menu_item_id: string; name: string; price: string }>(`
      select id, menu_item_id, name, price from menu_item_variants where active order by name`),
    pool.query<{ id: string; name: string; capacity: number; sort_order: number }>(`
      select id, name, capacity, sort_order from restaurant_tables where active order by sort_order, name`),
    pool.query<{ id: string; name: string; phone: string }>(`select id, name, phone from customers order by created_at desc limit 1000`),
    pool.query<{ id: string; customer_id: string; label: string; full_address: string; area: string; landmark: string | null; instructions: string | null }>(`
      select id, customer_id, label, full_address, area, landmark, instructions from customer_addresses order by created_at desc limit 2000`),
    pool.query<{ table_id: string }>(`select table_id from orders where table_id is not null and status not in ('completed', 'cancelled')`),
  ])
  const setting = settings.rows[0]
  if (!setting) throw new Error('Restaurant settings are missing. Create the tables again.')
  return {
    settings: {
      name: setting.name,
      taxRate: money(setting.tax_rate),
      defaultDeliveryFee: money(setting.default_delivery_fee),
      dailyDiscountPercent: money(setting.daily_discount_percent),
      dailyDiscountDate: dateOnly(setting.daily_discount_date),
      receiptFooter: setting.receipt_footer,
    },
    categories: categories.rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order })),
    items: items.rows.map((row) => ({ id: row.id, categoryId: row.category_id, name: row.name, description: row.description, price: money(row.price), imageUrl: row.image_url, sortOrder: row.sort_order })),
    variants: variants.rows.map((row) => ({ id: row.id, menuItemId: row.menu_item_id, name: row.name, price: money(row.price) })),
    tables: tables.rows.map((row) => ({ id: row.id, name: row.name, capacity: row.capacity, sortOrder: row.sort_order })),
    customers: customers.rows,
    addresses: addresses.rows.map((row) => ({ id: row.id, customerId: row.customer_id, label: row.label, fullAddress: row.full_address, area: row.area, landmark: row.landmark, instructions: row.instructions })),
    busyTableIds: busy.rows.map((row) => row.table_id),
  }
}

async function rememberGuest(client: Db, input: PlaceOrderInput) {
  if (input.orderType === 'dine_in' || !input.guest) return { customerId: null as string | null, addressId: null as string | null }
  const name = input.guest.name.trim()
  const phone = input.guest.phone.trim()
  if (!name && !phone && input.orderType !== 'delivery') return { customerId: null, addressId: null }
  if (!name || phone.length < 3) throw new Error('Enter the guest name and a phone number.')
  if (name.length > 120 || phone.length > 30) throw new Error('The guest name or phone is too long.')

  let customerId = input.guest.customerId
  const existing = customerId
    ? await client.query<{ id: string; name: string; phone: string }>(`select id, name, phone from customers where id = $1`, [customerId])
    : { rows: [] }
  const sameGuest = existing.rows[0] && existing.rows[0].name === name && existing.rows[0].phone === phone
  if (!sameGuest) {
    customerId = crypto.randomUUID()
    const operationId = crypto.randomUUID()
    const payload = { entity: 'customers', data: { id: customerId, name, phone } }
    await client.query(
      `insert into customers (id, name, phone, sync_status, client_operation_id, sync_payload) values ($1, $2, $3, 'pending', $4, $5::jsonb)`,
      [customerId, name, phone, operationId, JSON.stringify(payload)],
    )
  }

  if (input.orderType !== 'delivery') return { customerId, addressId: null }
  const address = input.guest.address.trim()
  const area = input.guest.area.trim()
  const landmark = input.guest.landmark.trim()
  const instructions = input.guest.instructions.trim()
  if (address.length < 3 || !area) throw new Error('Enter the delivery address and area.')
  if (address.length > 1000 || area.length > 160) throw new Error('The address or area is too long.')

  const saved = input.guest.addressId
    ? await client.query<{ id: string; full_address: string; area: string; landmark: string | null; instructions: string | null }>(
      `select id, full_address, area, landmark, instructions from customer_addresses where id = $1 and customer_id = $2`,
      [input.guest.addressId, customerId],
    )
    : { rows: [] }
  const current = saved.rows[0]
  const sameAddress = current && current.full_address === address && current.area === area && (current.landmark ?? '') === landmark && (current.instructions ?? '') === instructions
  if (sameAddress) return { customerId, addressId: current.id }

  const addressId = crypto.randomUUID()
  const operationId = crypto.randomUUID()
  const payload = { entity: 'addresses', data: { id: addressId, customer_id: customerId, label: 'Home', full_address: address, area, landmark: landmark || null, instructions: instructions || null } }
  await client.query(
    `insert into customer_addresses (id, customer_id, label, full_address, area, landmark, instructions, sync_status, client_operation_id, sync_payload)
     values ($1, $2, 'Home', $3, $4, $5, $6, 'pending', $7, $8::jsonb)`,
    [addressId, customerId, address, area, landmark || null, instructions || null, operationId, JSON.stringify(payload)],
  )
  return { customerId, addressId }
}

export function placeOrder(input: PlaceOrderInput) {
  return exclusive(() => withTx(async (client) => {
    if (!input.lines.length) throw new Error('Add at least one item.')
    if (input.lines.length > 100) throw new Error('An order can have at most 100 lines.')
    const ids = [...new Set(input.lines.map((line) => line.menuItemId))]
    const items = await client.query<ItemRow>(`
      select mi.id, mi.name, mi.price, mi.active, c.active as category_active
      from menu_items mi join categories c on c.id = mi.category_id
      where mi.id = any($1::uuid[])
      for update of mi`, [ids])
    const variants = await client.query<VariantRow>(`
      select id, menu_item_id, name, price, active from menu_item_variants
      where menu_item_id = any($1::uuid[]) for update`, [ids])
    const byItem = new Map(items.rows.map((row) => [row.id, row]))
    const priced = input.lines.map((line) => {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) throw new Error('Quantity must be a whole number from 1 to 999.')
      const item = byItem.get(line.menuItemId)
      if (!item?.active || !item.category_active) throw new Error('A menu item is no longer available. Sync, then choose it again.')
      const choices = variants.rows.filter((row) => row.menu_item_id === item.id && row.active)
      let price = money(item.price)
      let variantName: string | null = null
      if (line.variantId) {
        const variant = choices.find((row) => row.id === line.variantId)
        if (!variant) throw new Error(`Choose an available option for ${item.name}.`)
        price = money(variant.price)
        variantName = variant.name
      } else if (choices.length) {
        throw new Error(`Choose an option for ${item.name}.`)
      }
      return { ...line, name: item.name, variantName, price, notes: line.notes.trim().slice(0, 1000) }
    })

    let tableId: string | null = null
    if (input.orderType === 'dine_in' && input.tableId) {
      const table = await client.query<{ id: string }>(`select id from restaurant_tables where id = $1 and active for update`, [input.tableId])
      if (!table.rows[0]) throw new Error('That table is not available.')
      const busy = await client.query(`select 1 from orders where table_id = $1 and status not in ('completed', 'cancelled')`, [input.tableId])
      if (busy.rowCount) throw new Error('That table already has an open order.')
      tableId = input.tableId
    }

    const guest = await rememberGuest(client, input)
    const settings = await client.query<{ tax_rate: string }>(`select tax_rate from restaurant_settings where id = 1`)
    const taxRate = money(settings.rows[0]?.tax_rate)
    const subtotal = roundMoney(priced.reduce((sum, line) => sum + line.price * line.quantity, 0))
    const requested = input.discountMode === 'percent'
      ? roundMoney(subtotal * Math.min(100, Math.max(0, Number(input.discountValue) || 0)) / 100)
      : roundMoney(Math.max(0, Number(input.discountValue) || 0))
    if (requested > subtotal) throw new Error('The discount cannot be more than the subtotal.')
    const fee = input.orderType === 'delivery' ? roundMoney(Math.max(0, Number(input.deliveryFee) || 0)) : 0
    const totals = estimateTotals(priced.map((line) => ({ quantity: line.quantity, price: line.price })), requested, taxRate, fee)
    const notes = input.notes.trim().slice(0, 2000)
    const orderId = crypto.randomUUID()
    const operationId = crypto.randomUUID()
    const payload: Record<string, unknown> = {
      id: orderId,
      order_type: input.orderType,
      order_source: input.orderType === 'delivery' ? 'phone' : 'admin',
      table_id: tableId,
      customer_id: guest.customerId,
      notes,
      discount_amount: totals.discount,
      delivery_fee: fee,
      items: priced.map((line) => ({ menu_item_id: line.menuItemId, variant_id: line.variantId, quantity: line.quantity, notes: line.notes, expected_price: line.price })),
    }
    if (input.orderType === 'delivery' && input.guest) {
      payload.address_id = guest.addressId
      payload.address_snapshot = input.guest.address.trim()
      payload.phone_snapshot = input.guest.phone.trim()
      payload.area_snapshot = input.guest.area.trim()
      payload.landmark_snapshot = input.guest.landmark.trim()
      payload.instructions_snapshot = input.guest.instructions.trim()
    }
    const localNumber = await client.query<{ n: string }>(`select nextval('local_order_number_seq') as n`)
    await client.query(
      `insert into orders (
        id, local_number, order_type, order_source, table_id, customer_id, status, subtotal, discount_amount,
        tax_amount, tax_rate, delivery_fee, total, notes, sync_status, client_operation_id, payload, origin
      ) values ($1,$2,$3,$4,$5,$6,'placed',$7,$8,$9,$10,$11,$12,$13,'pending',$14,$15::jsonb,'local')`,
      [orderId, Number(localNumber.rows[0]?.n ?? 1), input.orderType, payload.order_source, tableId, guest.customerId, totals.subtotal, totals.discount, totals.tax, taxRate, fee, totals.total, notes || null, operationId, JSON.stringify(payload)],
    )
    for (const line of priced) {
      await client.query(
        `insert into order_items (id, order_id, menu_item_id, variant_id, item_name, variant_name, unit_price, quantity, line_total, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [crypto.randomUUID(), orderId, line.menuItemId, line.variantId, line.name, line.variantName, line.price, line.quantity, roundMoney(line.price * line.quantity), line.notes || null],
      )
    }
    if (input.orderType === 'delivery' && input.guest) {
      await client.query(
        `insert into deliveries (id, order_id, address_snapshot, phone_snapshot, area_snapshot, landmark_snapshot, instructions_snapshot)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [crypto.randomUUID(), orderId, input.guest.address.trim(), input.guest.phone.trim(), input.guest.area.trim(), input.guest.landmark.trim() || null, input.guest.instructions.trim() || null],
      )
    }
    return { id: orderId }
  }))
}

const summarySql = `
  select o.id, o.local_number, o.order_number, o.order_type, o.status, o.payment_status, o.total,
         o.sync_status, o.sync_error, o.origin, o.created_at, t.name as table_name, c.name as customer_name
  from orders o
  left join restaurant_tables t on t.id = o.table_id
  left join customers c on c.id = o.customer_id`

interface SummaryRow {
  id: string
  local_number: number
  order_number: string | null
  order_type: string
  status: string
  payment_status: string
  total: string
  sync_status: string
  sync_error: string | null
  origin: 'local' | 'server'
  created_at: Date
  table_name: string | null
  customer_name: string | null
}

function toSummary(row: SummaryRow): OrderSummary {
  return {
    id: row.id,
    localNumber: row.local_number,
    orderNumber: row.order_number == null ? null : Number(row.order_number),
    orderType: orderType(row.order_type),
    status: row.status,
    paymentStatus: row.payment_status,
    total: money(row.total),
    syncStatus: syncStatus(row.sync_status),
    syncError: row.sync_error,
    origin: row.origin,
    createdAt: iso(row.created_at),
    tableName: row.table_name,
    customerName: row.customer_name,
  }
}

export async function listOrders(filter: OrderFilter): Promise<OrderSummary[]> {
  const where = filter === 'open'
    ? `where o.status not in ('completed', 'cancelled')`
    : filter === 'unsynced'
      ? `where o.origin = 'local' and o.sync_status in ('pending', 'failed')`
      : ''
  const result = await getPool().query<SummaryRow>(`${summarySql} ${where} order by o.created_at desc limit 300`)
  return result.rows.map(toSummary)
}

export async function getOrder(id: string): Promise<OrderDetail> {
  const result = await getPool().query<SummaryRow & {
    notes: string | null
    subtotal: string
    discount_amount: string
    tax_amount: string
    delivery_fee: string
    customer_phone: string | null
    address_snapshot: string | null
    area_snapshot: string | null
    landmark_snapshot: string | null
    instructions_snapshot: string | null
    phone_snapshot: string | null
  }>(`
    ${summarySql.replace('c.name as customer_name', 'c.name as customer_name, c.phone as customer_phone, d.address_snapshot, d.area_snapshot, d.landmark_snapshot, d.instructions_snapshot, d.phone_snapshot, o.notes, o.subtotal, o.discount_amount, o.tax_amount, o.delivery_fee')}
    left join deliveries d on d.order_id = o.id
    where o.id = $1
  `, [id])
  const row = result.rows[0]
  if (!row) throw new Error('That order is not on this computer.')
  const settings = await getPool().query<{ name: string; phone: string; address: string; receipt_footer: string }>(
    `select name, phone, address, receipt_footer from restaurant_settings where id = 1`,
  )
  const setting = settings.rows[0]
  const items = await getPool().query<{ id: string; item_name: string; variant_name: string | null; unit_price: string; quantity: number; line_total: string; notes: string | null }>(
    `select id, item_name, variant_name, unit_price, quantity, line_total, notes from order_items where order_id = $1`,
    [id],
  )
  return {
    ...toSummary(row),
    notes: row.notes ?? '',
    subtotal: money(row.subtotal),
    discount: money(row.discount_amount),
    tax: money(row.tax_amount),
    deliveryFee: money(row.delivery_fee),
    customerPhone: row.phone_snapshot || row.customer_phone,
    address: row.address_snapshot,
    area: row.area_snapshot,
    landmark: row.landmark_snapshot,
    instructions: row.instructions_snapshot,
    restaurantName: setting?.name || 'BiteZone',
    restaurantPhone: setting?.phone || '',
    restaurantAddress: setting?.address || '',
    receiptFooter: setting?.receipt_footer || 'Thank you. Visit again.',
    items: items.rows.map((item) => ({ id: item.id, name: item.item_name, variantName: item.variant_name, unitPrice: money(item.unit_price), quantity: item.quantity, lineTotal: money(item.line_total), notes: item.notes ?? '' })),
  }
}

export function discardOrder(id: string) {
  return exclusive(() => withTx(async (client) => {
    const existing = await client.query<{ customer_id: string | null; origin: string; sync_status: string }>(
      `select customer_id, origin, sync_status from orders where id = $1 for update`,
      [id],
    )
    const order = existing.rows[0]
    if (!order) return
    if (order.origin !== 'local' || order.sync_status === 'synced') throw new Error('This order is already in the online CRM. Change it there.')
    await client.query(`delete from orders where id = $1`, [id])
    if (!order.customer_id) return
    const stillUsed = await client.query(`select 1 from orders where customer_id = $1`, [order.customer_id])
    if (stillUsed.rowCount) return
    await client.query(`delete from customers where id = $1 and sync_status = 'pending'`, [order.customer_id])
  }))
}
