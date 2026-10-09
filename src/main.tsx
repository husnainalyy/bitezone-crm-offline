import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const savedTheme = localStorage.getItem('bitezone-theme')
document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light'

async function start() {
  if (import.meta.env.DEV && !window.bitezone) {
    const { installPreview } = await import('./preview')
    installPreview()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
