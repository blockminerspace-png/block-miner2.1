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
    if (t && 'tagName' in t && t.tagName === 'SCRIPT' && 'src' in t && t.src) {
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

/** Reown/wagmi: no wallet accounts yet (guest login page) — avoid noisy uncaught rejections. */
window.addEventListener('unhandledrejection', (event) => {
  const r = event?.reason as { code?: number | string; message?: string } | string | null | undefined
  if (r && typeof r === 'object') {
    const code = r.code
    const msg = String(r.message || '')
    if (
      code === 4001 ||
      code === '4001' ||
      /wallet must has at least one account/i.test(msg) ||
      /user rejected the request/i.test(msg)
    ) {
      event.preventDefault()
      return
    }
  }
})

/** React.lazy / Vite dynamic import(): failed fetch (404 hash mismatch) does not fire script `error`. */
window.addEventListener('unhandledrejection', (event) => {
  const r = event?.reason
  const msg = typeof r === 'string' ? r : r?.message || String(r || '')
  if (!/Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk [\d]+ failed/i.test(msg)) {
    return
  }
  try {
    const k = 'bm_chunk_reload_v1'
    if (!sessionStorage.getItem(k)) {
      sessionStorage.setItem(k, '1')
      event.preventDefault()
      window.location.reload()
    }
  } catch {
    /* private mode */
  }
})

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
