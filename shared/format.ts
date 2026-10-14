export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function money(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  return roundMoney(n)
}

export function formatMoney(amount: number | string = 0) {
  return `Rs ${money(amount).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function businessDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Service day for token numbers: resets at 6:00 Asia/Karachi (shop night run ends at 2am). */
export function serviceDay(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as { year: string; month: string; day: string; hour: string }
  const calendar = `${parts.year}-${parts.month}-${parts.day}`
  if (Number(parts.hour) < 6) {
    const previous = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)))
    previous.setUTCDate(previous.getUTCDate() - 1)
    return previous.toISOString().slice(0, 10)
  }
  return calendar
}

export function tokenLabel(tokenNumber: number | null | undefined) {
  if (!tokenNumber || tokenNumber < 1) return null
  return `Token ${tokenNumber}`
}

export function formatDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${day}T12:00:00+05:00`))
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function orderLabel(orderNumber: number | null, localNumber: number) {
  return orderNumber ? `#BZ-${orderNumber}` : `Local #${localNumber}`
}

export function orderTypeLabel(value: string) {
  if (value === 'dine_in') return 'Dine-in'
  if (value === 'takeaway') return 'Takeaway'
  if (value === 'delivery') return 'Delivery'
  return value
}

function categoryMentioned(name: string, category: string) {
  const hay = name.toLowerCase()
  const group = category.toLowerCase().trim()
  if (!group) return true
  if (hay.includes(group)) return true
  return group.split(/\s+/).some((word) => {
    if (word.length < 3) return false
    if (hay.includes(word)) return true
    const singular = word.endsWith('s') ? word.slice(0, -1) : word
    return singular.length > 2 && hay.includes(singular)
  })
}

export function orderItemName(categoryName: string, itemName: string) {
  const category = categoryName.trim()
  const name = itemName.trim()
  if (!name) return category || 'Item'
  if (!category || categoryMentioned(name, category)) return name
  return `${name} ${category}`
}

export function statusLabel(value: string) {
  if (value === 'dine_in') return 'Dine-in'
  return value.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function todayDiscountPercent(percent: number, date: string | null, day = businessDate()) {
  const saved = (date ?? '').slice(0, 10)
  if (!saved || saved !== day) return 0
  return Math.min(100, Math.max(0, percent || 0))
}

export function estimateTotals(items: { quantity: number; price: number }[], discount: number, taxRate: number, delivery: number) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.price * item.quantity, 0))
  const safeDiscount = Math.min(subtotal, roundMoney(Math.max(0, discount)))
  const tax = roundMoney(Math.max(0, subtotal - safeDiscount) * taxRate / 100)
  return { subtotal, discount: safeDiscount, tax, total: roundMoney(subtotal - safeDiscount + tax + delivery) }
}

export function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value) return new Date(value).toISOString()
  return new Date().toISOString()
}

export function dateOnly(value: unknown) {
  if (!value) return null
  return String(value).slice(0, 10)
}
