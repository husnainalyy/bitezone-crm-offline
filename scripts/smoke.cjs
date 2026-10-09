const { app } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitezone-counter-'))
app.setPath('userData', dir)

app.whenReady().then(async () => {
  const { getPool, getStatus, closeDb } = require('../dist-electron/electron/db')
  const { loadCounter, placeOrder, getOrder, listOrders, discardOrder } = require('../dist-electron/electron/catalog')
  const status = await getStatus()
  if (!status.schemaReady || !status.localConnected) throw new Error(`status not ready ${JSON.stringify(status)}`)
  const pool = getPool()
  await pool.query(`insert into categories (id, name, sort_order, active) values ('11111111-1111-4111-8111-111111111111', 'Burgers', 1, true) on conflict (id) do nothing`)
  await pool.query(`insert into menu_items (id, category_id, name, price, active) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Zinger', 650, true) on conflict (id) do nothing`)
  await pool.query(`insert into menu_item_variants (id, menu_item_id, name, price, active) values ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', 'Large', 750, true) on conflict (id) do nothing`)
  await pool.query(`insert into restaurant_tables (id, name, capacity, active) values ('33333333-3333-4333-8333-333333333333', 'Table 1', 4, true) on conflict (id) do nothing`)
  const counter = await loadCounter()
  if (!counter.items.length || !counter.tables.length) throw new Error('menu did not load')
  const placed = await placeOrder({
    orderType: 'dine_in',
    tableId: '33333333-3333-4333-8333-333333333333',
    notes: 'no onion',
    discountMode: 'amount',
    discountValue: 50,
    deliveryFee: 0,
    lines: [{ menuItemId: '22222222-2222-4222-8222-222222222222', variantId: '55555555-5555-4555-8555-555555555555', quantity: 2, notes: 'extra sauce' }],
    guest: null,
  })
  const order = await getOrder(placed.id)
  if (order.total !== 1450) throw new Error(`expected total 1450, got ${order.total}`)
  if (order.syncStatus !== 'pending') throw new Error('order should be waiting to sync')
  await closeDb()
  const again = await getStatus()
  const reopened = await listOrders('open')
  if (again.pendingCount !== 1 || !reopened.some((row) => row.id === placed.id)) throw new Error('order did not survive close')
  await discardOrder(placed.id)
  const after = await getStatus()
  if (after.pendingCount !== 0) throw new Error(`pending count ${after.pendingCount}`)
  console.log('SMOKE_OK', order.total)
  await closeDb()
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
