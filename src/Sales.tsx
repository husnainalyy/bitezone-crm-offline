import { useEffect, useState } from 'react'
import type { DaySales } from '@shared/types'
import { businessDate, formatDay, formatMoney, formatWhen, orderLabel, orderTypeLabel } from '@shared/format'

export function Sales({ reload, onOpenOrder }: { reload: number; onOpenOrder: (id: string) => void }) {
  const today = businessDate()
  const [day, setDay] = useState(today)
  const [report, setReport] = useState<DaySales | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancel = false
    setLoaded(false)
    setError('')
    window.bitezone.getDaySales(day)
      .then((next) => { if (!cancel) setReport(next) })
      .catch((reason: unknown) => {
        if (cancel) return
        setReport(null)
        setError(reason instanceof Error ? reason.message : 'Sales for that day could not be loaded.')
      })
      .finally(() => { if (!cancel) setLoaded(true) })
    return () => { cancel = true }
  }, [day, reload])

  const isToday = day === today
  const dayLabel = isToday ? 'Today' : formatDay(day)

  return (
    <div className="sales">
      <div className="sales-head">
        <div>
          <h1>Sales</h1>
          <p>Orders saved on this computer for {dayLabel}.</p>
        </div>
        <div className="sales-day">
          <button type="button" className="secondary" aria-pressed={isToday} onClick={() => setDay(today)}>Today</button>
          <label className="day-pick">
            <span className="sr-only">Pick a day</span>
            <input
              aria-label="Pick a day"
              type="date"
              max={today}
              value={day}
              onChange={(event) => {
                const next = event.target.value
                if (/^\d{4}-\d{2}-\d{2}$/.test(next) && next <= today) setDay(next)
              }}
            />
          </label>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!loaded && <p className="hint">Loading sales…</p>}
      {loaded && report && (
        <>
          <section className="metric-strip" aria-label={dayLabel}>
            <div className="metric"><span>{isToday ? 'Today’s sales' : 'Sales'}</span><strong className="mono">{formatMoney(report.sales)}</strong><em>Not cancelled</em></div>
            <div className="metric"><span>Orders</span><strong className="mono">{report.orders}</strong><em>{isToday ? 'Placed today' : `Placed ${dayLabel}`}</em></div>
            <div className="metric"><span>Avg order</span><strong className="mono">{formatMoney(report.average)}</strong><em>Across those orders</em></div>
            <div className="metric"><span>Discounts</span><strong className="mono">{formatMoney(report.discounts)}</strong><em>{report.cancelled ? `${report.cancelled} cancelled` : 'On the bill'}</em></div>
          </section>
          <div className="sales-grid">
            <section className="panel">
              <h2>By type</h2>
              {!report.byType.length && <p className="hint">No sales on this day.</p>}
              {report.byType.length > 0 && (
                <ul className="type-sales">
                  {report.byType.map((row) => (
                    <li key={row.type}>
                      <span>{orderTypeLabel(row.type)}</span>
                      <span className="mono">{row.orders}</span>
                      <strong className="mono">{formatMoney(row.sales)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel sales-orders">
              <h2>Orders on this day</h2>
              {!report.rows.length && <p className="hint">No orders on this day.</p>}
              {report.rows.length > 0 && (
                <ul>
                  {report.rows.map((row) => (
                    <li key={row.id}>
                      <button type="button" onClick={() => onOpenOrder(row.id)}>
                        <span className="mono">{orderLabel(row.orderNumber, row.localNumber)}</span>
                        <span>{row.customerName || row.tableName || orderTypeLabel(row.orderType)}</span>
                        <em>{row.status === 'cancelled' ? 'Cancelled' : formatWhen(row.createdAt)}</em>
                        <b className="mono">{formatMoney(row.total)}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
