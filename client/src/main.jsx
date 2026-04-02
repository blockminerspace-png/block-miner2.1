import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config' // Import i18n config
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Stale CDN/browser cache: old index references missing chunks → reload once.
window.addEventListener(
  'error',
  (event) => {
    const t = event?.target
    if (t && t.tagName === 'SCRIPT' && t.src) {
      try {
        const k = 'bm_asset_reload_v1'
        if (!sessionStorage.getItem(k)) {
          sessionStorage.setItem(k, '1')
          window.location.reload()
        }
      } catch {
        /* private mode */
      }
    }
  },
  true
)

const el = document.getElementById('root')
if (!el) {
  document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem;color:#fff;background:#020617">Missing #root</p>'
} else {
  createRoot(el).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
}
