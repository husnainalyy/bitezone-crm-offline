import { useEffect, useState } from 'react'
import type { OrderDetail, OrderFilter, OrderSummary } from '@shared/types'
import { formatMoney, formatWhen, orderLabel, orderTypeLabel, statusLabel } from '@shared/format'
import { PrintSlip } from './slip'

export function Orders({ reload, selectedId, onSelect, onChanged }: { reload: number; selectedId: string | null; onSelect: (id: string | null) => void; onChanged: () => void }) {
  const [filter, setFilter] = useState<OrderFilter>('open')
  const [rows, setRows] = useState<OrderSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [slip, setSlip] = useState<'kitchen' | 'bill' | null>(null)

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
    setSlip(null)
    if (!selectedId) { setOrder(null); return }
    let cancel = false
    window.bitezone.getOrder(selectedId)
      .then((next) => { if (!cancel) setOrder(next) })
      .catch((reason: unknown) => { if (!cancel) setError(reason instanceof Error ? reason.message : 'That order could not be opened.') })
    return () => { cancel = true }
  }, [selectedId, reload])

  async function discard(id: string) {
    try {
      await window.bitezone.discardOrder(id)
      onSelect(null)
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The order could not be deleted.')
    }
  }

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
          {rows.map((row) => (
            <li key={row.id}>
              <button className={selectedId === row.id ? 'selected' : ''} onClick={() => onSelect(row.id)}>
                <span className="mono">{orderLabel(row.orderNumber, row.localNumber)}</span>
                <span>{row.customerName || orderTypeLabel(row.orderType)}</span>
                <em className={row.syncStatus === 'failed' ? 'bad' : row.syncStatus === 'pending' ? 'wait' : ''}>{row.syncStatus === 'pending' ? 'Waiting to sync' : row.syncStatus === 'failed' ? 'Could not sync' : statusLabel(row.status)}</em>
                <b className="mono">{formatMoney(row.total)}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="ticket">
        {!order && <div className="empty"><h2>Select an order</h2><p>The ticket shows the items, total, and whether it has been sent online.</p></div>}
        {order && (
          <>
            <div className="ticket-head">
              <div>
                <p className="eyebrow">{orderTypeLabel(order.orderType)}</p>
                <h2>{orderLabel(order.orderNumber, order.localNumber)}</h2>
                <p>{formatWhen(order.createdAt)}</p>
              </div>
              <span className={`pill ${order.syncStatus}`}>{order.syncStatus === 'pending' ? 'Saved here' : order.syncStatus === 'failed' ? 'Not sent' : 'Sent online'}</span>
            </div>
            {order.syncError && <p className="form-error">{order.syncError}</p>}
            {order.syncStatus === 'pending' && <p className="hint">This order is only on this computer until you press Sync.</p>}
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
            <div className="setup-actions">
              <button className="secondary" type="button" onClick={() => setSlip('kitchen')}>Kitchen slip</button>
              <button className="primary" type="button" onClick={() => setSlip('bill')}>Customer bill</button>
            </div>
            {order.notes && <p className="hint">Note: {order.notes}</p>}
            {order.origin === 'local' && order.syncStatus !== 'synced' && (confirming ? (
              <div className="setup-actions">
                <button className="danger" onClick={() => void discard(order.id)}>Delete this unsent order</button>
                <button className="secondary" onClick={() => setConfirming(false)}>Keep it</button>
              </div>
            ) : <button className="danger" onClick={() => setConfirming(true)}>Delete unsent order</button>)}
          </>
        )}
        {order && slip && <PrintSlip kind={slip} order={order} onClose={() => setSlip(null)} />}
      </div>
    </div>
  )
}
