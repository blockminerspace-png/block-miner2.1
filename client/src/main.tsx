import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config' // Import i18n config
import App from './app/App'
import ErrorBoundary from './shared/components/ErrorBoundary'
import { isChunkLoadError, shouldAutoReloadChunkError, forceReloadForNewBuild } from './shared/utils/chunkLoadError'

// Reports that are 100% noise (browser extensions, third-party trackers blocked
// by adblock, anonymous blob URLs) — not our code, not actionable.
const NOISE_PATTERNS = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /\bblob:https?:\/\//i,
  /ss\.mrmnd\.com/i,
  /googletagmanager\.com/i,
  /google-analytics\.com/i,
  /doubleclick\.net/i,
  /facebook\.net/i,
  /metapixel/i,
];

function isNoise(message: string): boolean {
  if (!message) return false;
  return NOISE_PATTERNS.some((re) => re.test(message));
}

function reportClientError(payload: { message: string; stack?: string | null; source?: string }) {
  if (isNoise(payload.message) || isNoise(payload.stack ?? '')) return;
  try {
    void fetch('/api/track/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: payload.message.slice(0, 800),
        stack: payload.stack?.slice(0, 4000) ?? null,
        componentStack: payload.source ? `[${payload.source}]` : null,
        url: window.location.href,
      }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* never throw from reporter */ }
}

// Window-level errors: report to admin but DO NOT auto-reload. The user sees
// whatever broken state results; ErrorBoundary takes over for React render errors.
window.addEventListener(
  'error',
  (event) => {
    const msg = typeof event?.message === 'string' ? event.message : ''
    const isChunk = isChunkLoadError(msg) || /MIME type.*text\/html/i.test(msg)
    const t = event?.target
    const tagFailed =
      t && 'tagName' in t && (t as HTMLElement).tagName === 'SCRIPT' && 'src' in t && (t as HTMLScriptElement).src

    if (isChunk) {
      // Self-heal stale-chunk crashes silently.
      if (shouldAutoReloadChunkError()) {
        forceReloadForNewBuild()
        return
      }
      // Throttled out — don't spam admin, don't break user.
      return
    }
    if (tagFailed) {
      reportClientError({
        message: `Script load failed: ${String((t as HTMLScriptElement).src)}`,
        stack: event?.error instanceof Error ? event.error.stack ?? null : null,
        source: 'window.error',
      })
    }
  },
  true,
)

window.addEventListener('unhandledrejection', (event) => {
  const r = event?.reason as { code?: number | string; message?: string } | string | null | undefined
  if (r && typeof r === 'object') {
    const code = r.code
    const msg = String(r.message || '')
    // Known benign wallet rejections — swallow without report
    if (
      code === 4001 ||
      code === '4001' ||
      /wallet must has at least one account/i.test(msg) ||
      /user rejected the request/i.test(msg) ||
      /connection cancelled by user/i.test(msg)
    ) {
      event.preventDefault()
      return
    }
  }

  const reason = event?.reason
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  if (message && (isChunkLoadError(message) || isChunkLoadError(reason))) {
    event.preventDefault()
    // Self-heal stale chunks silently.
    if (shouldAutoReloadChunkError()) {
      forceReloadForNewBuild()
    }
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
