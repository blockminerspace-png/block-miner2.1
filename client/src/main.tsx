import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config' // Import i18n config
import App from './app/App'
import ErrorBoundary from './shared/components/ErrorBoundary'
import { handleChunkLoadFailure } from './shared/utils/chunkLoadError'

// Stale CDN/browser cache: old index references missing hashed chunks.
window.addEventListener(
  'error',
  (event) => {
    const t = event?.target
    if (t && 'tagName' in t && t.tagName === 'SCRIPT' && 'src' in t && t.src) {
      handleChunkLoadFailure(new Error(`Script load failed: ${String(t.src)}`))
    }
  },
  true,
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

  if (handleChunkLoadFailure(event.reason)) {
    event.preventDefault()
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
