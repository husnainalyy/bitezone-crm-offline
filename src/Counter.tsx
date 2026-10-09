import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Search } from 'lucide-react'
import type { CounterData, MenuItemRow, OrderType } from '@shared/types'
import { estimateTotals, formatMoney, todayDiscountPercent } from '@shared/format'

interface Line { key: string; menuItemId: string; variantId: string | null; quantity: number; notes: string }

const blankGuest = { customerId: '', name: '', phone: '', addressId: '', address: '', area: '', landmark: '', instructions: '' }

export function Counter({ reload, onPlaced }: { reload: number; onPlaced: (id: string) => void }) {
  const [data, setData] = useState<CounterData | null>(null)
  const [error, setError] = useState('')
  const [type, setType] = useState<OrderType>('dine_in')
  const [tableId, setTableId] = useState('')
  const [guest, setGuest] = useState(blankGuest)
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [notes, setNotes] = useState('')
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent')
  const [discountValue, setDiscountValue] = useState(0)
  const [fee, setFee] = useState(0)
  const [picking, setPicking] = useState<MenuItemRow | null>(null)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const seeded = useRef(false)

  useEffect(() => {
    let cancel = false
    window.bitezone.loadCounter()
      .then((next) => {
        if (cancel) return
        setData(next)
        if (!seeded.current) {
          seeded.current = true
          setFee(next.settings.defaultDeliveryFee)
          const offer = todayDiscountPercent(next.settings.dailyDiscountPercent, next.settings.dailyDiscountDate)
          if (offer > 0) {
            setDiscountMode('percent')
            setDiscountValue(offer)
          }
        }
      })
      .catch((reason: unknown) => { if (!cancel) setError(reason instanceof Error ? reason.message : 'The menu could not be loaded.') })
    return () => { cancel = true }
  }, [reload])

  const busyTables = useMemo(() => new Set(data?.busyTableIds ?? []), [data])
  const categories = data?.categories ?? []
  const items = (data?.items ?? []).filter((item) => (category === 'all' || item.categoryId === category) && item.name.toLowerCase().includes(query.trim().toLowerCase()))
  const guestMatches = useMemo(() => {
    if (!data) return []
    const name = guest.name.trim().toLowerCase()
    const phone = guest.phone.trim().toLowerCase()
    const selected = data.customers.find((row) => row.id === guest.customerId)
    if (selected && selected.name === guest.name && selected.phone === guest.phone) return []
    if (name.length < 2 && phone.length < 2) return []
    const rows: { key: string; customerId: string; name: string; phone: string; addressId: string; address: string; area: string; landmark: string; instructions: string }[] = []
    for (const customer of data.customers) {
      const blob = `${customer.name} ${customer.phone}`.toLowerCase()
      const hit = (name.length >= 2 && blob.includes(name)) || (phone.length >= 2 && blob.includes(phone))
      if (!hit) continue
      const addresses = data.addresses.filter((row) => row.customerId === customer.id)
      if (type === 'delivery' && addresses.length) {
        for (const address of addresses) {
          rows.push({
            key: address.id,
            customerId: customer.id,
            name: customer.name,
            phone: customer.phone,
            addressId: address.id,
            address: address.fullAddress,
            area: address.area,
            landmark: address.landmark ?? '',
            instructions: address.instructions ?? '',
          })
        }
      } else {
        const address = addresses[0]
        rows.push({
          key: customer.id,
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          addressId: address?.id ?? '',
          address: address?.fullAddress ?? '',
          area: address?.area ?? '',
          landmark: address?.landmark ?? '',
          instructions: address?.instructions ?? '',
        })
      }
      if (rows.length >= 6) break
    }
    return rows.slice(0, 6)
  }, [data, guest, type])

  function priceOf(line: Line) {
    if (!data) return null
    if (line.variantId) return data.variants.find((row) => row.id === line.variantId && row.menuItemId === line.menuItemId)?.price ?? null
    const item = data.items.find((row) => row.id === line.menuItemId)
    if (!item || data.variants.some((row) => row.menuItemId === item.id)) return null
    return item.price
  }

  function nameOf(line: Line) {
    const item = data?.items.find((row) => row.id === line.menuItemId)
    const variant = data?.variants.find((row) => row.id === line.variantId)
    return variant ? `${item?.name ?? 'Item'} · ${variant.name}` : item?.name ?? 'Unavailable item'
  }

  const priced = lines.map((line) => ({ ...line, price: priceOf(line) }))
  const missing = priced.some((line) => line.price == null)
  const discount = discountMode === 'percent'
    ? (priced.reduce((sum, line) => sum + (line.price ?? 0) * line.quantity, 0) * Math.min(100, Math.max(0, discountValue)) / 100)
    : discountValue
  const totals = estimateTotals(priced.flatMap((line) => line.price == null ? [] : [{ quantity: line.quantity, price: line.price }]), discount, data?.settings.taxRate ?? 0, type === 'delivery' ? fee : 0)

  function add(item: MenuItemRow, variantId: string | null) {
    setLines((current) => {
      const match = current.find((line) => line.menuItemId === item.id && line.variantId === variantId)
      if (match) return current.map((line) => line.key === match.key ? { ...line, quantity: Math.min(999, line.quantity + 1) } : line)
      return [...current, { key: crypto.randomUUID(), menuItemId: item.id, variantId, quantity: 1, notes: '' }]
    })
    setPicking(null)
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line))
  }

  async function place() {
    if (!data || busy) return
    setFormError('')
    if (!lines.length) return setFormError('Add at least one item.')
    if (missing) return setFormError('An item is no longer on the menu. Remove it and choose again.')
    if (type === 'dine_in' && !tableId) return setFormError('Select a table.')
    setBusy(true)
    try {
      const result = await window.bitezone.placeOrder({
        orderType: type,
        tableId: type === 'dine_in' ? tableId : null,
        notes,
        discountMode,
        discountValue,
        deliveryFee: type === 'delivery' ? fee : 0,
        lines: lines.map(({ menuItemId, variantId, quantity, notes: itemNotes }) => ({ menuItemId, variantId, quantity, notes: itemNotes })),
        guest: type === 'dine_in' ? null : guest,
      })
      setLines([])
      setNotes('')
      setGuest(blankGuest)
      setTableId('')
      onPlaced(result.id)
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'The order could not be saved.')
      setBusy(false)
    }
  }

  if (!data) return <div className="empty">{error || 'Loading the menu…'}</div>
  if (!data.items.length) {
    return <div className="empty"><h2>No menu on this computer yet</h2><p>A manager opens Online sync, fills it in once, then presses Sync. After that, orders stay on this computer even when the internet is off or the computer was shut down.</p></div>
  }

  const offer = todayDiscountPercent(data.settings.dailyDiscountPercent, data.settings.dailyDiscountDate)

  return (
    <div className="counter">
      <div className="menu">
        <div className="menu-head">
          <div className="types" role="tablist" aria-label="Order type">
            {(['dine_in', 'takeaway', 'delivery'] as const).map((value) => (
              <button key={value} aria-pressed={type === value} onClick={() => { setType(value); if (value === 'delivery') setFee(data.settings.defaultDeliveryFee) }}>
                {value === 'dine_in' ? 'Dine-in' : value === 'takeaway' ? 'Takeaway' : 'Delivery'}
              </button>
            ))}
          </div>
          {type === 'dine_in' && (
            <div className="choices" role="listbox" aria-label="Tables">
              {data.tables.map((table) => {
                const taken = busyTables.has(table.id)
                return <button key={table.id} aria-pressed={tableId === table.id} disabled={taken} onClick={() => setTableId(table.id)}><strong>{table.name}</strong><span>{taken ? 'Busy' : `${table.capacity} seats`}</span></button>
              })}
              {!data.tables.length && <p className="hint">No tables yet. Add them in the online CRM, then sync.</p>}
            </div>
          )}
          {type !== 'dine_in' && (
            <div className="guest">
              <div className="form-grid">
                <label>Customer name<input aria-label="Customer name" value={guest.name} placeholder="Start typing a saved name" onChange={(event) => setGuest({ ...guest, customerId: '', name: event.target.value })} /></label>
                <label>Phone<input aria-label="Customer phone" value={guest.phone} placeholder="Or a saved phone" onChange={(event) => setGuest({ ...guest, customerId: '', phone: event.target.value })} /></label>
              </div>
              {guestMatches.length > 0 && (
                <div className="matches" role="listbox" aria-label="Saved customers">
                  {guestMatches.map((match) => (
                    <button key={match.key} type="button" onClick={() => setGuest({
                      customerId: match.customerId,
                      name: match.name,
                      phone: match.phone,
                      addressId: match.addressId,
                      address: match.address,
                      area: match.area,
                      landmark: match.landmark,
                      instructions: match.instructions,
                    })}>
                      <strong>{match.name}</strong>
                      <span>{match.area ? `${match.phone} · ${match.area}` : match.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="hint">These names stay on this computer. Press Sync to bring in customers from earlier days and from the online CRM.</p>
              {type === 'delivery' && <div className="form-grid">
                  <label className="full">Address<textarea value={guest.address} onChange={(event) => setGuest({ ...guest, addressId: '', address: event.target.value })} /></label>
                  <label>Area<input value={guest.area} placeholder="Neighbourhood" onChange={(event) => setGuest({ ...guest, addressId: '', area: event.target.value })} /></label>
                  <label>Landmark<input value={guest.landmark} onChange={(event) => setGuest({ ...guest, landmark: event.target.value })} /></label>
                  <label className="full">Instructions<textarea value={guest.instructions} onChange={(event) => setGuest({ ...guest, instructions: event.target.value })} /></label>
                  <label>Delivery fee (Rs)<input type="number" min={0} value={fee} onChange={(event) => setFee(Number(event.target.value))} /></label>
              </div>}
            </div>
          )}
          <div className="types categories" role="tablist" aria-label="Categories">
            <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All</button>
            {categories.map((row) => <button key={row.id} aria-pressed={category === row.id} onClick={() => setCategory(row.id)}>{row.name}</button>)}
          </div>
          <label className="search"><Search size={16} /><input aria-label="Search the menu" placeholder="Search the menu" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="tiles">
          {items.map((item) => {
            const quantity = lines.filter((line) => line.menuItemId === item.id).reduce((sum, line) => sum + line.quantity, 0)
            const categoryName = categories.find((row) => row.id === item.categoryId)?.name
            return (
              <button key={item.id} className="tile" aria-pressed={quantity > 0} onClick={() => {
                const variants = data.variants.filter((row) => row.menuItemId === item.id)
                if (variants.length) setPicking(item)
                else add(item, null)
              }}>
                {quantity > 0 && <span className="qty">{quantity}</span>}
                <span className="eyebrow">{categoryName}</span>
                <strong>{item.name}</strong>
                <span className="mono">{formatMoney(item.price)}</span>
              </button>
            )
          })}
          {!items.length && <p className="hint">Nothing matches that search.</p>}
        </div>
      </div>
      <aside className="cart">
        <h2>This order</h2>
        <div className="cart-lines">
          {!lines.length && <p className="hint">Tap items to add them.</p>}
          {priced.map((line) => (
            <div className="cart-line" key={line.key}>
              <div>
                <strong>{nameOf(line)}</strong>
                <span className="mono">{line.price == null ? 'Unavailable' : formatMoney(line.price)}</span>
              </div>
              <div className="qty-row">
                <button aria-label="Decrease" onClick={() => line.quantity === 1 ? setLines(lines.filter((row) => row.key !== line.key)) : update(line.key, { quantity: line.quantity - 1 })}><Minus size={14} /></button>
                <span className="mono">{line.quantity}</span>
                <button aria-label="Increase" onClick={() => update(line.key, { quantity: Math.min(999, line.quantity + 1) })}><Plus size={14} /></button>
                <b className="mono">{line.price == null ? '' : formatMoney(line.price * line.quantity)}</b>
              </div>
              <input aria-label="Item note" placeholder="Note, optional" value={line.notes} onChange={(event) => update(line.key, { notes: event.target.value })} />
            </div>
          ))}
        </div>
        <div className="cart-foot">
          <div className="discount">
            <label>Discount
              <select value={discountMode} onChange={(event) => setDiscountMode(event.target.value as 'percent' | 'amount')}>
                <option value="percent">Percent</option>
                <option value="amount">Amount</option>
              </select>
            </label>
            <label>{discountMode === 'percent' ? 'Percent' : 'Rs'}
              <input type="number" min={0} value={discountValue} onChange={(event) => setDiscountValue(Number(event.target.value))} />
            </label>
          </div>
          {offer > 0 && <p className="hint">Today’s discount in the online CRM is {offer}%.</p>}
          <label>Order note<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <dl>
            <div><dt>Subtotal</dt><dd className="mono">{formatMoney(totals.subtotal)}</dd></div>
            <div><dt>Discount</dt><dd className="mono">{formatMoney(totals.discount)}</dd></div>
            <div><dt>Tax</dt><dd className="mono">{formatMoney(totals.tax)}</dd></div>
            {type === 'delivery' && <div><dt>Delivery</dt><dd className="mono">{formatMoney(fee || 0)}</dd></div>}
            <div className="grand"><dt>Total</dt><dd className="mono">{formatMoney(totals.total)}</dd></div>
          </dl>
          {formError && <p className="form-error">{formError}</p>}
          <button className="primary place" disabled={busy || !lines.length} onClick={() => void place()}>{busy ? 'Saving…' : 'Place order'}</button>
          <p className="hint">Saved on this computer right away. It is still here after shutdown. Press Sync when the internet is on.</p>
        </div>
      </aside>
      {picking && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={picking.name}>
          <div className="modal-card">
            <h2>{picking.name}</h2>
            <p>Choose one option.</p>
            {data.variants.filter((row) => row.menuItemId === picking.id).map((variant) => (
              <button key={variant.id} className="option" onClick={() => add(picking, variant.id)}>
                <span>{variant.name}</span><span className="mono">{formatMoney(variant.price)}</span>
              </button>
            ))}
            <button className="secondary" onClick={() => setPicking(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
