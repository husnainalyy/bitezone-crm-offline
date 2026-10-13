import type { AppStatus, ConfigForm, ConfigInput, CounterData, DaySales, DesktopApi, OrderDetail, OrderFilter, OrderSnapshot, OrderSummary, PlaceOrderInput, UpdateOrderInput } from '@shared/types'
import { businessDate, estimateTotals, formatMoney, money, orderItemName, roundMoney } from '@shared/format'

const burger = '6d5b6a30-4c1a-4c1a-8c1a-6d5b6a304c1a'
const drink = '7e6c7b41-5d2b-4d2b-9d2b-7e6c7b415d2b'
const table1 = '11111111-1111-4111-8111-111111111111'
const table2 = '22222222-2222-4222-8222-222222222222'

const counter: CounterData = {
  settings: { name: 'BiteZone', taxRate: 0, defaultDeliveryFee: 150, dailyDiscountPercent: 0, dailyDiscountDate: null, receiptFooter: 'Thank you' },
  categories: [
    { id: 'c1', name: 'Burgers', sortOrder: 1 },
    { id: 'c-fries', name: 'Fries', sortOrder: 2 },
    { id: 'c-nuggets', name: 'Nuggets', sortOrder: 3 },
    { id: 'c2', name: 'Drinks', sortOrder: 4 },
  ],
  items: [
    { id: burger, categoryId: 'c1', name: 'Zinger Burger', description: '', price: 650, imageUrl: null, sortOrder: 1 },
    { id: 'item-fries-half', categoryId: 'c-fries', name: 'Half', description: '', price: 150, imageUrl: null, sortOrder: 1 },
    { id: 'item-fries-full', categoryId: 'c-fries', name: 'Full', description: '', price: 300, imageUrl: null, sortOrder: 2 },
    { id: 'item-nuggets-half', categoryId: 'c-nuggets', name: 'Half', description: '', price: 250, imageUrl: null, sortOrder: 1 },
    { id: drink, categoryId: 'c2', name: 'Cold Drink', description: '', price: 180, imageUrl: null, sortOrder: 1 },
  ],
  variants: [
    { id: 'v-small', menuItemId: drink, name: 'Regular', price: 180 },
    { id: 'v-large', menuItemId: drink, name: 'Large', price: 250 },
  ],
  tables: [
    { id: table1, name: 'Table 1', capacity: 4, sortOrder: 1 },
    { id: table2, name: 'Table 2', capacity: 2, sortOrder: 2 },
  ],
  customers: [{ id: 'cust-1', name: 'Ayesha Khan', phone: '03001234567' }],
  addresses: [{ id: 'addr-1', customerId: 'cust-1', label: 'Home', fullAddress: '12 Market Road', area: 'Gulberg', landmark: null, instructions: null }],
  busyTableIds: [],
}

const orders: OrderDetail[] = []

function snapshotOf(order: OrderDetail): OrderSnapshot {
  return {
    total: order.total,
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    deliveryFee: order.deliveryFee,
    notes: order.notes,
    items: order.items.map((item) => ({
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      notes: item.notes,
    })),
  }
}

function summary(order: OrderDetail): OrderSummary {
  const { notes, subtotal, discount, tax, deliveryFee, customerPhone, address, area, landmark, instructions, restaurantName, restaurantPhone, restaurantAddress, receiptFooter, items, events, ...rest } = order
  void notes; void subtotal; void discount; void tax; void deliveryFee; void customerPhone; void address; void area; void landmark; void instructions; void restaurantName; void restaurantPhone; void restaurantAddress; void receiptFooter; void items; void events
  return rest
}

function status(): AppStatus {
  return {
    configured: true,
    localConnected: true,
    schemaReady: true,
    localError: null,
    pendingCount: orders.filter((order) => order.status !== 'cancelled' && order.syncStatus !== 'synced').length,
    lastSyncedAt: null,
    lastError: null,
    restaurantName: 'BiteZone',
    supabaseReady: false,
  }
}

export function installPreview() {
  const api: DesktopApi = {
    getStatus: async () => status(),
    getConfigForm: async (): Promise<ConfigForm> => ({ supabaseUrl: '', email: '', hasAnonKey: false, hasSupabasePassword: false }),
    saveConfig: async (_input: ConfigInput) => status(),
    loadCounter: async () => counter,
    placeOrder: async (input: PlaceOrderInput) => {
      const lines = input.lines.map((line) => {
        const item = counter.items.find((row) => row.id === line.menuItemId)
        const category = counter.categories.find((row) => row.id === item?.categoryId)?.name ?? ''
        const variant = counter.variants.find((row) => row.id === line.variantId)
        const price = variant?.price ?? item?.price ?? 0
        return { id: crypto.randomUUID(), menuItemId: line.menuItemId, variantId: line.variantId, name: item ? orderItemName(category, item.name) : 'Item', variantName: variant?.name ?? null, unitPrice: price, quantity: line.quantity, lineTotal: money(price * line.quantity), notes: line.notes }
      })
      const fee = input.orderType === 'delivery' ? input.deliveryFee : 0
      const requested = input.discountMode === 'percent' ? lines.reduce((sum, line) => sum + line.lineTotal, 0) * input.discountValue / 100 : input.discountValue
      const totals = estimateTotals(lines.map((line) => ({ quantity: line.quantity, price: line.unitPrice })), requested, 0, fee)
      const id = crypto.randomUUID()
      const order: OrderDetail = {
        id,
        localNumber: orders.length + 1,
        orderNumber: null,
        orderType: input.orderType,
        status: 'placed',
        paymentStatus: 'unpaid',
        total: totals.total,
        syncStatus: 'pending',
        syncError: null,
        origin: 'local',
        createdAt: new Date().toISOString(),
        editedAt: null,
        voidedAt: null,
        tableName: counter.tables.find((table) => table.id === input.tableId)?.name ?? null,
        customerName: input.guest?.name || null,
        notes: input.notes,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        deliveryFee: fee,
        customerPhone: input.guest?.phone || null,
        address: input.guest?.address || null,
        area: input.guest?.area || null,
        landmark: input.guest?.landmark || null,
        instructions: input.guest?.instructions || null,
        restaurantName: counter.settings.name,
        restaurantPhone: '',
        restaurantAddress: '',
        receiptFooter: counter.settings.receiptFooter,
        items: lines,
        events: [],
      }
      order.events = [{
        id: crypto.randomUUID(),
        kind: 'created',
        summary: `Order placed · total ${formatMoney(order.total)}`,
        before: null,
        after: snapshotOf(order),
        createdAt: order.createdAt,
      }]
      orders.unshift(order)
      if (input.tableId) counter.busyTableIds.push(input.tableId)
      return { id }
    },
    listOrders: async (filter: OrderFilter) => orders.filter((order) => {
      if (filter === 'all') return true
      if (filter === 'unsynced') return order.status !== 'cancelled' && order.syncStatus !== 'synced'
      return order.status === 'placed'
    }).map(summary),
    getOrder: async (id: string) => {
      const order = orders.find((row) => row.id === id)
      if (!order) throw new Error('That order is not on this computer.')
      return order
    },
    updateOrder: async (input: UpdateOrderInput) => {
      const order = orders.find((row) => row.id === input.id)
      if (!order) throw new Error('That order is not on this computer.')
      if (order.status !== 'placed') throw new Error('The kitchen already has this order, so the items stay as they are.')
      const before = snapshotOf(order)
      const lines = input.lines.map((line) => {
        const item = counter.items.find((row) => row.id === line.menuItemId)
        const category = counter.categories.find((row) => row.id === item?.categoryId)?.name ?? ''
        const variant = counter.variants.find((row) => row.id === line.variantId)
        const price = variant?.price ?? item?.price ?? 0
        return { id: crypto.randomUUID(), menuItemId: line.menuItemId, variantId: line.variantId, name: item ? orderItemName(category, item.name) : 'Item', variantName: variant?.name ?? null, unitPrice: price, quantity: line.quantity, lineTotal: money(price * line.quantity), notes: line.notes }
      })
      const requested = input.discountMode === 'percent' ? lines.reduce((sum, line) => sum + line.lineTotal, 0) * input.discountValue / 100 : input.discountValue
      const totals = estimateTotals(lines.map((line) => ({ quantity: line.quantity, price: line.unitPrice })), requested, 0, order.deliveryFee)
      order.items = lines
      order.notes = input.notes
      order.subtotal = totals.subtotal
      order.discount = totals.discount
      order.tax = totals.tax
      order.total = totals.total
      order.editedAt = new Date().toISOString()
      const after = snapshotOf(order)
      order.events.unshift({
        id: crypto.randomUUID(),
        kind: 'edited',
        summary: before.total !== after.total
          ? `Items changed · total ${formatMoney(before.total)} → ${formatMoney(after.total)}`
          : `Items changed · total ${formatMoney(after.total)}`,
        before,
        after,
        createdAt: order.editedAt,
      })
      return { id: order.id }
    },
    voidOrder: async (id: string) => {
      const order = orders.find((row) => row.id === id)
      if (!order) return
      if (order.voidedAt || order.status === 'cancelled') throw new Error('This order is already voided.')
      if (order.syncStatus === 'synced' || order.orderNumber != null) throw new Error('This order is already in the online CRM. Cancel it there.')
      const before = snapshotOf(order)
      order.status = 'cancelled'
      order.voidedAt = new Date().toISOString()
      order.syncStatus = 'synced'
      order.events.unshift({
        id: crypto.randomUUID(),
        kind: 'voided',
        summary: `Order voided · was ${formatMoney(before.total)}`,
        before,
        after: null,
        createdAt: order.voidedAt,
      })
    },
    getDaySales: async (day: string): Promise<DaySales> => {
      const rows = orders.filter((order) => businessDate(new Date(order.createdAt)) === day)
      const active = rows.filter((order) => order.status !== 'cancelled')
      const sales = roundMoney(active.reduce((sum, order) => sum + order.total, 0))
      const byTypeMap = new Map<string, { orders: number; sales: number }>()
      for (const order of active) {
        const current = byTypeMap.get(order.orderType) ?? { orders: 0, sales: 0 }
        current.orders += 1
        current.sales = roundMoney(current.sales + order.total)
        byTypeMap.set(order.orderType, current)
      }
      return {
        day,
        sales,
        orders: active.length,
        cancelled: rows.length - active.length,
        average: active.length ? roundMoney(sales / active.length) : 0,
        discounts: roundMoney(active.reduce((sum, order) => sum + order.discount, 0)),
        byType: [...byTypeMap.entries()].map(([type, value]) => ({ type: type as DaySales['byType'][number]['type'], ...value })),
        rows: rows.map((order) => ({
          id: order.id,
          localNumber: order.localNumber,
          orderNumber: order.orderNumber,
          orderType: order.orderType,
          status: order.status,
          total: order.total,
          createdAt: order.createdAt,
          tableName: order.tableName,
          customerName: order.customerName,
        })),
      }
    },
    sync: async () => ({ online: false, message: 'Preview mode has no database. Run the desktop app to sync.', menuItems: counter.items.length, tables: counter.tables.length, ordersPulled: 0, ordersPushed: 0, failures: [] }),
  }
  window.bitezone = api
}
