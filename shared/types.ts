export type OrderType = 'dine_in' | 'takeaway' | 'delivery'
export type SyncStatus = 'pending' | 'synced' | 'failed'
export type OrderFilter = 'open' | 'unsynced' | 'all'

export interface AppStatus {
  configured: boolean
  localConnected: boolean
  schemaReady: boolean
  localError: string | null
  pendingCount: number
  lastSyncedAt: string | null
  lastError: string | null
  restaurantName: string
  supabaseReady: boolean
}

export interface ConfigForm {
  supabaseUrl: string
  email: string
  hasAnonKey: boolean
  hasSupabasePassword: boolean
}

export interface ConfigInput {
  supabaseUrl: string
  anonKey: string
  email: string
  supabasePassword: string
}

export interface CounterSettings {
  name: string
  taxRate: number
  defaultDeliveryFee: number
  dailyDiscountPercent: number
  dailyDiscountDate: string | null
  receiptFooter: string
}

export interface MenuCategory { id: string; name: string; sortOrder: number }
export interface MenuItemRow { id: string; categoryId: string; name: string; description: string; price: number; imageUrl: string | null; sortOrder: number }
export interface VariantRow { id: string; menuItemId: string; name: string; price: number }
export interface TableRow { id: string; name: string; capacity: number; sortOrder: number }
export interface CustomerRow { id: string; name: string; phone: string }
export interface AddressRow { id: string; customerId: string; label: string; fullAddress: string; area: string; landmark: string | null; instructions: string | null }

export interface CounterData {
  settings: CounterSettings
  categories: MenuCategory[]
  items: MenuItemRow[]
  variants: VariantRow[]
  tables: TableRow[]
  customers: CustomerRow[]
  addresses: AddressRow[]
  busyTableIds: string[]
}

export interface PlaceGuest {
  customerId: string
  name: string
  phone: string
  addressId: string
  address: string
  area: string
  landmark: string
  instructions: string
}

export interface PlaceOrderInput {
  orderType: OrderType
  tableId: string | null
  notes: string
  discountMode: 'percent' | 'amount'
  discountValue: number
  deliveryFee: number
  lines: { menuItemId: string; variantId: string | null; quantity: number; notes: string }[]
  guest: PlaceGuest | null
}

export interface OrderSummary {
  id: string
  localNumber: number
  orderNumber: number | null
  orderType: OrderType
  status: string
  paymentStatus: string
  total: number
  syncStatus: SyncStatus
  syncError: string | null
  origin: 'local' | 'server'
  createdAt: string
  tableName: string | null
  customerName: string | null
}

export interface OrderLine {
  id: string
  name: string
  variantName: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  notes: string
}

export interface OrderDetail extends OrderSummary {
  notes: string
  subtotal: number
  discount: number
  tax: number
  deliveryFee: number
  customerPhone: string | null
  address: string | null
  area: string | null
  landmark: string | null
  instructions: string | null
  restaurantName: string
  restaurantPhone: string
  restaurantAddress: string
  receiptFooter: string
  items: OrderLine[]
}

export interface SyncReport {
  online: boolean
  message: string
  menuItems: number
  tables: number
  ordersPulled: number
  ordersPushed: number
  failures: { id: string; label: string; message: string }[]
}

export interface DaySalesOrder {
  id: string
  localNumber: number
  orderNumber: number | null
  orderType: OrderType
  status: string
  total: number
  createdAt: string
  tableName: string | null
  customerName: string | null
}

export interface DaySales {
  day: string
  sales: number
  orders: number
  cancelled: number
  average: number
  discounts: number
  byType: { type: OrderType; orders: number; sales: number }[]
  rows: DaySalesOrder[]
}

export interface DesktopApi {
  getStatus(): Promise<AppStatus>
  getConfigForm(): Promise<ConfigForm>
  saveConfig(input: ConfigInput): Promise<AppStatus>
  loadCounter(): Promise<CounterData>
  placeOrder(input: PlaceOrderInput): Promise<{ id: string }>
  listOrders(filter: OrderFilter): Promise<OrderSummary[]>
  getOrder(id: string): Promise<OrderDetail>
  discardOrder(id: string): Promise<void>
  getDaySales(day: string): Promise<DaySales>
  sync(): Promise<SyncReport>
}
