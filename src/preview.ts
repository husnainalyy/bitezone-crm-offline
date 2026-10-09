import type { AppStatus, ConfigForm, ConfigInput, CounterData, DesktopApi, OrderDetail, OrderFilter, OrderSummary, PlaceOrderInput } from '@shared/types'
import { estimateTotals, money } from '@shared/format'

const burger = '6d5b6a30-4c1a-4c1a-8c1a-6d5b6a304c1a'
const drink = '7e6c7b41-5d2b-4d2b-9d2b-7e6c7b415d2b'
const table1 = '11111111-1111-4111-8111-111111111111'
const table2 = '22222222-2222-4222-8222-222222222222'

const counter: CounterData = {
  settings: { name: 'BiteZone', taxRate: 0, defaultDeliveryFee: 150, dailyDiscountPercent: 0, dailyDiscountDate: null, receiptFooter: 'Thank you' },
  categories: [
    { id: 'c1', name: 'Burgers', sortOrder: 1 },
    { id: 'c2', name: 'Drinks', sortOrder: 2 },
  ],
  items: [
    { id: burger, categoryId: 'c1', name: 'Zinger Burger', description: '', price: 650, imageUrl: null, sortOrder: 1 },
    { id: 'item-fries', categoryId: 'c1', name: 'Fries', description: '', price: 250, imageUrl: null, sortOrder: 2 },
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

function summary(order: OrderDetail): OrderSummary {
  const { notes, subtotal, discount, tax, deliveryFee, customerPhone, address, area, landmark, instructions, restaurantName, restaurantPhone, restaurantAddress, receiptFooter, items, ...rest } = order
  void notes; void subtotal; void discount; void tax; void deliveryFee; void customerPhone; void address; void area; void landmark; void instructions; void restaurantName; void restaurantPhone; void restaurantAddress; void receiptFooter; void items
  return rest
}

function status(): AppStatus {
  return {
    configured: true,
    localConnected: true,
    schemaReady: true,
    localError: null,
    pendingCount: orders.filter((order) => order.syncStatus !== 'synced').length,
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
        const variant = counter.variants.find((row) => row.id === line.variantId)
        const price = variant?.price ?? item?.price ?? 0
        return { id: crypto.randomUUID(), name: item?.name ?? 'Item', variantName: variant?.name ?? null, unitPrice: price, quantity: line.quantity, lineTotal: money(price * line.quantity), notes: line.notes }
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
      }
      orders.unshift(order)
      if (input.tableId) counter.busyTableIds.push(input.tableId)
      return { id }
    },
    listOrders: async (filter: OrderFilter) => orders.filter((order) => filter === 'all' || (filter === 'unsynced' ? order.syncStatus !== 'synced' : order.status === 'placed')).map(summary),
    getOrder: async (id: string) => {
      const order = orders.find((row) => row.id === id)
      if (!order) throw new Error('That order is not on this computer.')
      return order
    },
    discardOrder: async (id: string) => {
      const index = orders.findIndex((order) => order.id === id)
      if (index >= 0) orders.splice(index, 1)
    },
    sync: async () => ({ online: false, message: 'Preview mode has no database. Run the desktop app to sync.', menuItems: counter.items.length, tables: counter.tables.length, ordersPulled: 0, ordersPushed: 0, failures: [] }),
  }
  window.bitezone = api
}
