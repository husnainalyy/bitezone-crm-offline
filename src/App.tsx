import { useEffect, useState } from 'react'
import { ClipboardList, ChartColumn, RefreshCw, Settings, UtensilsCrossed } from 'lucide-react'
import type { AppStatus } from '@shared/types'
import { formatWhen } from '@shared/format'
import { Counter } from './Counter'
import { Orders } from './Orders'
import { Sales } from './Sales'
import { Setup } from './Setup'

type View = 'counter' | 'orders' | 'sales' | 'setup'
type Theme = 'light' | 'dark'

function ThemeChoice() {
  const [theme, setTheme] = useState<Theme>(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  function choose(next: Theme) {
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('bitezone-theme', next)
  }
  return (
    <div className="theme" role="group" aria-label="Appearance">
      <button type="button" aria-pressed={theme === 'light'} onClick={() => choose('light')}>Light</button>
      <button type="button" aria-pressed={theme === 'dark'} onClick={() => choose('dark')}>Dark</button>
    </div>
  )
}

export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [view, setView] = useState<View>('counter')
  const [reload, setReload] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!window.bitezone) return
    void window.bitezone.getStatus().then(setStatus)
  }, [reload])

  async function sync() {
    if (syncing) return
    setSyncing(true)
    setNotice('')
    try {
      const report = await window.bitezone.sync()
      setNotice(report.message)
      setNoticeError(!report.online || report.failures.length > 0)
      setReload((value) => value + 1)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sync failed.')
      setNoticeError(true)
      setReload((value) => value + 1)
    } finally {
      setSyncing(false)
    }
  }

  if (!window.bitezone) {
    return <div className="boot">Open BiteZone Counter from the desktop app.</div>
  }

  const ready = Boolean(status?.schemaReady)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">BiteZone</div>
        <p className="brand-note">Counter</p>
        <nav>
          <button className={view === 'counter' ? 'active' : ''} disabled={!ready} onClick={() => setView('counter')}><UtensilsCrossed size={18} />New order</button>
          <button className={view === 'orders' ? 'active' : ''} disabled={!ready} onClick={() => setView('orders')}>
            <ClipboardList size={18} />Orders
            {status && status.pendingCount > 0 ? <span className="count">{status.pendingCount}</span> : null}
          </button>
          <button className={view === 'sales' ? 'active' : ''} disabled={!ready} onClick={() => setView('sales')}><ChartColumn size={18} />Sales</button>
          <button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}><Settings size={18} />Online sync</button>
        </nav>
        <div className="sidebar-foot">
          <strong>{status?.restaurantName || 'BiteZone'}</strong>
          <span>Admin counter</span>
          <ThemeChoice />
        </div>
      </aside>
      <section className="main">
        <header className="topbar">
          <div>
            <strong>{view === 'orders' ? 'Orders' : view === 'sales' ? 'Sales' : view === 'setup' ? 'Online sync' : 'New order'}</strong>
            <p>{status?.lastSyncedAt ? `Last sync ${formatWhen(status.lastSyncedAt)}` : 'Not synced yet'}</p>
          </div>
          <button className="sync" disabled={syncing || !ready} onClick={() => void sync()}>
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
            {syncing ? 'Syncing…' : status?.pendingCount ? `Sync ${status.pendingCount}` : 'Sync'}
          </button>
        </header>
        {notice && <div className={noticeError ? 'banner bad' : 'banner'} role="status">{notice}</div>}
        <div className="stage">
          {!status && <div className="empty">Opening the counter…</div>}
          {status?.localError && view !== 'setup' && <div className="empty"><h2>The counter could not open its saved orders</h2><p>Close BiteZone and open it again. Orders stay on this computer.</p><p>{status.localError}</p></div>}
          {view === 'setup' && <Setup status={status} onSaved={(next) => { setStatus(next); setView('counter') }} />}
          {view === 'counter' && ready && <Counter reload={reload} onPlaced={(id) => { setSelectedId(id); setView('orders'); setReload((value) => value + 1) }} />}
          {view === 'orders' && ready && <Orders reload={reload} selectedId={selectedId} onSelect={setSelectedId} onChanged={() => setReload((value) => value + 1)} />}
          {view === 'sales' && ready && <Sales reload={reload} onOpenOrder={(id) => { setSelectedId(id); setView('orders') }} />}
        </div>
      </section>
    </div>
  )
}
