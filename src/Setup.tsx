import { useEffect, useState } from 'react'
import type { AppStatus, ConfigForm } from '@shared/types'

const empty: ConfigForm = { supabaseUrl: '', email: '', hasAnonKey: false, hasSupabasePassword: false }

export function Setup({ status, onSaved }: { status: AppStatus | null; onSaved: (status: AppStatus) => void }) {
  const [form, setForm] = useState<ConfigForm>(empty)
  const [anonKey, setAnonKey] = useState('')
  const [supabasePassword, setSupabasePassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.bitezone.getConfigForm().then(setForm)
  }, [])

  async function save() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const next = await window.bitezone.saveConfig({
        supabaseUrl: form.supabaseUrl,
        anonKey,
        email: form.email,
        supabasePassword,
      })
      setAnonKey('')
      setSupabasePassword('')
      setForm(await window.bitezone.getConfigForm())
      setMessage('Saved on this computer. It stays here after shutdown. Press Sync when the internet is on.')
      onSaved(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup">
      <div className="setup-intro">
        <h1>Online sync</h1>
        <p>Orders are already saved on this computer. Nobody has to install a database. A manager fills in this page once. After that, anyone can take orders and press Sync.</p>
      </div>
      {status?.supabaseReady && !message && <p className="form-ok">Online sync is already saved on this computer.</p>}
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-ok">{message}</p>}
      <section className="panel">
        <h2>Manager setup, one time</h2>
        <p>Use the same website address and admin login as the online BiteZone CRM. Staff do not change this.</p>
        <div className="form-grid">
          <label className="full">Website address<input value={form.supabaseUrl} placeholder="https://your-project.supabase.co" onChange={(event) => setForm({ ...form, supabaseUrl: event.target.value })} /></label>
          <label className="full">Key<textarea value={anonKey} placeholder={form.hasAnonKey ? 'Saved — leave blank to keep it' : 'Paste the anon key'} onChange={(event) => setAnonKey(event.target.value)} /></label>
          <label>Admin email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Admin password<input type="password" value={supabasePassword} placeholder={form.hasSupabasePassword ? 'Saved — leave blank to keep it' : 'Admin password'} onChange={(event) => setSupabasePassword(event.target.value)} /></label>
        </div>
      </section>
      <div className="setup-actions">
        <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}
