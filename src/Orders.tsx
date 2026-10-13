import { useEffect, useRef, useState } from 'react'
import type { OrderDetail, OrderEvent, OrderFilter, OrderSnapshot, OrderSummary } from '@shared/types'
import { formatMoney, formatWhen, orderLabel, orderTypeLabel, statusLabel } from '@shared/format'
import { PrintSlip } from './slip'

function listBadge(row: OrderSummary) {
  if (row.voidedAt || row.status === 'cancelled') return { text: 'Voided', className: 'bad' }
  if (row.editedAt) return { text: 'Edited', className: 'wait' }
  if (row.syncStatus === 'failed') return { text: 'Could not sync', className: 'bad' }
  if (row.syncStatus === 'pending') return { text: 'Waiting to sync', className: 'wait' }
  return { text: statusLabel(row.status), className: '' }
}

function SnapshotBlock({ title, snapshot }: { title: string; snapshot: OrderSnapshot }) {
  return (
    <div className="history-snap">
      <strong>{title}</strong>
      <ul>
        {snapshot.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>{item.quantity} × {item.name}{item.variantName ? ` · ${item.variantName}` : ''}</span>
            <span className="mono">{formatMoney(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <p className="mono">Total {formatMoney(snapshot.total)}</p>
    </div>
  )
}

function HistoryEvent({ event }: { event: OrderEvent }) {
  const [open, setOpen] = useState(false)
  const canInspect = Boolean(event.before || event.after)
  return (
    <li className={`history-event ${event.kind}`}>
      <button type="button" className="history-toggle" onClick={() => canInspect && setOpen((value) => !value)} disabled={!canInspect}>
        <span>
          <em>{event.kind === 'created' ? 'Created' : event.kind === 'edited' ? 'Edited' : 'Voided'}</em>
          <span>{event.summary}</span>
        </span>
        <span className="mono">{formatWhen(event.createdAt)}</span>
      </button>
      {open && (
        <div className="history-diff">
          {event.before && <SnapshotBlock title="Before" snapshot={event.before} />}
          {event.after && <SnapshotBlock title="After" snapshot={event.after} />}
        </div>
      )}
    </li>
  )
}

export function Orders({ reload, selectedId, printId, onSelect, onChanged, onEdit, onPrinted }: { reload: number; selectedId: string | null; printId: string | null; onSelect: (id: string | null) => void; onChanged: () => void; onEdit: (id: string) => void; onPrinted: () => void }) {
  const [filter, setFilter] = useState<OrderFilter>('open')
  const [rows, setRows] = useState<OrderSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [slip, setSlip] = useState<'kitchen' | 'bill' | null>(null)
  const printRef = useRef(printId)
  printRef.current = printId

  useEffect(() => {
    let cancel = false
    setLoaded(false)
    window.bitezone.listOrders(filter)
      .then((next) => { if (!cancel) setRows(next) })
      .catch((reason: unknown) => { if (!cancel) setError(reason instanceof Error ? reason.message : 'Orders could not be loaded.') })
      .finally(() => { if (!cancel) setLoaded(true) })
    return () => { cancel = true }
  }, [filter, reload])

  useEffect(() => {
    setConfirming(false)
    if (printRef.current !== selectedId) setSlip(null)
    if (!selectedId) { setOrder(null); return }
    let cancel = false
    window.bitezone.getOrder(selectedId)
      .then((next) => { if (!cancel) setOrder(next) })
      .catch((reason: unknown) => { if (!cancel) setError(reason instanceof Error ? reason.message : 'That order could not be opened.') })
    return () => { cancel = true }
  }, [selectedId, reload])

  useEffect(() => {
    if (order && printId === order.id) {
      setSlip('kitchen')
      onPrinted()
    }
  }, [order, printId, onPrinted])

  async function voidOrder(id: string) {
    try {
      await window.bitezone.voidOrder(id)
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The order could not be voided.')
    } finally {
      setConfirming(false)
    }
  }

  const voided = Boolean(order?.voidedAt || order?.status === 'cancelled')

  return (
    <div className="orders">
      <div className="order-list">
        <div className="types">
          {([['open', 'Open'], ['unsynced', 'Waiting to sync'], ['all', 'All']] as const).map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        {!loaded && <p className="hint">Loading orders…</p>}
        {loaded && !rows.length && <div className="empty compact"><h2>{filter === 'unsynced' ? 'Nothing is waiting to sync' : 'No orders yet'}</h2><p>New orders you place on this counter show up here.</p></div>}
        <ul>
          {rows.map((row) => {
            const badge = listBadge(row)
            return (
              <li key={row.id}>
                <button className={selectedId === row.id ? 'selected' : ''} onClick={() => onSelect(row.id)}>
                  <span className="mono">{orderLabel(row.orderNumber, row.localNumber)}</span>
                  <span>{row.customerName || row.tableName || orderTypeLabel(row.orderType)}</span>
                  <em className={badge.className}>{badge.text}</em>
                  <b className="mono">{formatMoney(row.total)}</b>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="ticket">
        {!order && <div className="empty"><h2>Select an order</h2><p>The ticket shows the items, total, edits, and whether it has been sent online.</p></div>}
        {order && (
          <>
            <div className="ticket-head">
              <div>
                <p className="eyebrow">{orderTypeLabel(order.orderType)}{order.tableName ? ` · ${order.tableName}` : ''}</p>
                <h2>{orderLabel(order.orderNumber, order.localNumber)}</h2>
                <p>
                  {formatWhen(order.createdAt)}
                  {order.editedAt ? ` · Edited ${formatWhen(order.editedAt)}` : ''}
                  {order.voidedAt ? ` · Voided ${formatWhen(order.voidedAt)}` : ''}
                </p>
              </div>
              <span className={`pill ${voided ? 'failed' : order.editedAt ? 'pending' : order.syncStatus}`}>
                {voided ? 'Voided' : order.editedAt ? 'Edited' : order.syncStatus === 'pending' ? 'Saved here' : order.syncStatus === 'failed' ? 'Not sent' : 'Sent online'}
              </span>
            </div>
            {order.syncError && <p className="form-error">{order.syncError}</p>}
            {!voided && order.syncStatus === 'pending' && <p className="hint">This order is only on this computer until you press Sync.</p>}
            {voided && <p className="hint">This order was voided on this computer. It stays here in All orders for the record.</p>}
            {(order.customerName || order.address) && (
              <div className="guest-card">
                {order.customerName && <strong>{order.customerName}</strong>}
                {order.customerPhone && <span>{order.customerPhone}</span>}
                {order.address && <span>{order.address}{order.area ? `, ${order.area}` : ''}</span>}
                {order.landmark && <span>Landmark: {order.landmark}</span>}
                {order.instructions && <span>{order.instructions}</span>}
              </div>
            )}
            <ul className="ticket-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span>{item.quantity} × {item.name}{item.variantName ? ` · ${item.variantName}` : ''}</span>
                  <span className="mono">{formatMoney(item.lineTotal)}</span>
                  {item.notes && <small>{item.notes}</small>}
                </li>
              ))}
            </ul>
            <dl>
              <div><dt>Subtotal</dt><dd className="mono">{formatMoney(order.subtotal)}</dd></div>
              <div><dt>Discount</dt><dd className="mono">{formatMoney(order.discount)}</dd></div>
              <div><dt>Tax</dt><dd className="mono">{formatMoney(order.tax)}</dd></div>
              {order.orderType === 'delivery' && <div><dt>Delivery</dt><dd className="mono">{formatMoney(order.deliveryFee)}</dd></div>}
              <div className="grand"><dt>Total</dt><dd className="mono">{formatMoney(order.total)}</dd></div>
            </dl>
            {!voided && (
              <div className="setup-actions">
                <button className="secondary" type="button" onClick={() => setSlip('kitchen')}>Kitchen slip</button>
                <button className="primary" type="button" onClick={() => setSlip('bill')}>Customer bill</button>
              </div>
            )}
            {!voided && order.status === 'placed' ? (
              <button className="secondary" type="button" onClick={() => onEdit(order.id)}>Edit order</button>
            ) : !voided && !['completed', 'cancelled'].includes(order.status) ? (
              <p className="hint">The kitchen already has this order, so the items stay as they are. You can still print the slip.</p>
            ) : null}
            {order.notes && <p className="hint">Note: {order.notes}</p>}
            {order.events.length > 0 && (
              <section className="history">
                <h3>History</h3>
                <ul>
                  {order.events.map((event) => <HistoryEvent key={event.id} event={event} />)}
                </ul>
              </section>
            )}
            {!voided && order.origin === 'local' && order.syncStatus !== 'synced' && (confirming ? (
              <div className="setup-actions">
                <button className="danger" onClick={() => void voidOrder(order.id)}>Void this unsent order</button>
                <button className="secondary" onClick={() => setConfirming(false)}>Keep it</button>
              </div>
            ) : <button className="danger" onClick={() => setConfirming(true)}>Void unsent order</button>)}
          </>
        )}
        {order && slip && <PrintSlip kind={slip} order={order} onClose={() => setSlip(null)} />}
      </div>
    </div>
  )
}
