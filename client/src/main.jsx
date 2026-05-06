import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'
import { wagmiAdapter, queryClient } from './web3/appKitConfig.js'
import '@reown/appkit-scaffold-ui/w3m-modal'
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
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </QueryClientProvider>
      </WagmiProvider>
    </StrictMode>
  )
}
