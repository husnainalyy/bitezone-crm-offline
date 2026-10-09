import { useRef } from 'react'
import type { OrderDetail } from '@shared/types'
import { formatWhen, orderLabel, orderTypeLabel } from '@shared/format'

const SLIP_CSS = `
.slip{width:72mm;margin:0 auto;color:#000;background:#fff;font-family:"Courier New",Courier,monospace;font-size:12px;line-height:1.35}
.slip *{color:#000;box-sizing:border-box}
.slip-center{text-align:center}
.slip-name{font-size:18px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.slip-title{font-size:13px;font-weight:700;letter-spacing:1px;margin-top:4px}
.slip-meta{font-size:11px;white-space:pre-wrap}
.slip-rule{border:0;border-top:1px dashed #000;margin:6px 0}
.slip-row{display:flex;justify-content:space-between;gap:8px}
.slip-row b{font-weight:700}
.slip-items{width:100%;border-collapse:collapse}
.slip-items th{font-size:11px;text-align:left;font-weight:700;padding:0 0 2px}
.slip-items td{vertical-align:top;padding:3px 0}
.slip-items .num{text-align:right;white-space:nowrap;padding-left:6px}
.slip-note{font-size:11px;padding-left:8px}
.slip-kitem{display:flex;gap:8px;font-size:15px;font-weight:700;padding:3px 0}
.slip-kitem .qty{min-width:1.6em}
.slip-total{font-size:15px;font-weight:700}
.slip-footer{text-align:center;margin-top:8px;font-size:11px;white-space:pre-wrap}
`

function slipAmount(amount: number) {
  const rounded = Math.round(amount * 100) / 100
  const [whole, fraction] = rounded.toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === '00' ? grouped : `${grouped}.${fraction}`
}

function slipPageHeightMm(heightPx: number) {
  if (!Number.isFinite(heightPx) || heightPx <= 0) return 80
  return Math.min(280, Math.max(50, Math.ceil((heightPx * 25.4) / 96) + 4))
}

function slipDocument(markup: string, heightMm: number) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BiteZone</title><style>@page{size:80mm ${heightMm}mm;margin:0}html,body{margin:0;padding:0;width:80mm;height:${heightMm}mm;overflow:hidden;background:#fff}${SLIP_CSS}</style></head><body>${markup}</body></html>`
}

function printThermalSlip(sheet: HTMLElement) {
  const slip = sheet.querySelector('.slip')
  if (!(slip instanceof HTMLElement)) return
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:80mm;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    return
  }
  const markup = slip.outerHTML
  doc.open()
  doc.write(slipDocument(markup, 200))
  doc.close()
  window.setTimeout(() => {
    const printed = doc.querySelector('.slip')
    const heightMm = slipPageHeightMm(printed instanceof HTMLElement ? printed.offsetHeight : slip.offsetHeight)
    doc.open()
    doc.write(slipDocument(markup, heightMm))
    doc.close()
    window.setTimeout(() => {
      win.focus()
      win.print()
      window.setTimeout(() => frame.remove(), 1000)
    }, 50)
  }, 50)
}

export function PrintSlip({ kind, order, onClose }: { kind: 'kitchen' | 'bill'; order: OrderDetail; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null)
  const footer = order.receiptFooter.trim() || 'Thank you. Visit again.'

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={kind === 'kitchen' ? 'Kitchen slip' : 'Customer bill'}>
      <div className="modal-card slip-card">
        <h2>{kind === 'kitchen' ? 'Kitchen slip' : 'Customer bill'}</h2>
        <p>Choose the 80mm printer. Set the paper to the short custom size, margins to None, and scale to 100. Turn headers and footers off.</p>
        <div className="slip-sheet" ref={sheet}>
          <style>{SLIP_CSS}</style>
          <article className="slip">
            <header className="slip-center">
              <div className="slip-name">{order.restaurantName || 'BiteZone'}</div>
              {kind === 'bill' && order.restaurantAddress && <div className="slip-meta">{order.restaurantAddress}</div>}
              {kind === 'bill' && order.restaurantPhone && <div className="slip-meta">{order.restaurantPhone}</div>}
              <div className="slip-title">{kind === 'kitchen' ? 'KITCHEN ORDER' : 'CUSTOMER BILL'}</div>
            </header>
            <hr className="slip-rule" />
            <div className="slip-row"><span>Order</span><b>{orderLabel(order.orderNumber, order.localNumber)}</b></div>
            <div className="slip-row"><span>Time</span><span>{formatWhen(order.createdAt)}</span></div>
            <div className="slip-row"><span>Type</span><span>{orderTypeLabel(order.orderType)}</span></div>
            {order.customerName && <div className="slip-row"><span>Guest</span><span>{order.customerName}</span></div>}
            {order.customerPhone && <div className="slip-row"><span>Phone</span><span>{order.customerPhone}</span></div>}
            {kind === 'bill' && order.address && <div className="slip-meta">{order.address}{order.area ? `, ${order.area}` : ''}</div>}
            <hr className="slip-rule" />
            {kind === 'kitchen' ? (
              <div>
                {order.items.map((item) => (
                  <div key={item.id}>
                    <div className="slip-kitem"><span className="qty">{item.quantity}</span><span>{item.name}{item.variantName ? ` (${item.variantName})` : ''}</span></div>
                    {item.notes && <div className="slip-note">{item.notes}</div>}
                  </div>
                ))}
                {order.notes && <><hr className="slip-rule" /><div className="slip-note">Note: {order.notes}</div></>}
              </div>
            ) : (
              <>
                <table className="slip-items">
                  <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Amt</th></tr></thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}{item.variantName ? ` (${item.variantName})` : ''}{item.notes ? <div className="slip-note">{item.notes}</div> : null}</td>
                        <td className="num">{item.quantity}</td>
                        <td className="num">{slipAmount(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <hr className="slip-rule" />
                <div className="slip-row"><span>Subtotal</span><span>{slipAmount(order.subtotal)}</span></div>
                {order.discount > 0 && <div className="slip-row"><span>Discount</span><span>-{slipAmount(order.discount)}</span></div>}
                {order.tax > 0 && <div className="slip-row"><span>Tax</span><span>{slipAmount(order.tax)}</span></div>}
                {order.deliveryFee > 0 && <div className="slip-row"><span>Delivery</span><span>{slipAmount(order.deliveryFee)}</span></div>}
                <hr className="slip-rule" />
                <div className="slip-row slip-total"><span>TOTAL</span><span>Rs {slipAmount(order.total)}</span></div>
                <div className="slip-footer">{footer}</div>
              </>
            )}
          </article>
        </div>
        <div className="setup-actions">
          <button className="secondary" type="button" onClick={onClose}>Close</button>
          <button className="primary" type="button" onClick={() => sheet.current && printThermalSlip(sheet.current)}>Print</button>
        </div>
      </div>
    </div>
  )
}
