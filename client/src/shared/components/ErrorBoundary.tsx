import React, { type ErrorInfo, type ReactNode } from 'react';
import {
  clearChunkReloadMarkers,
  forceReloadForNewBuild,
  isChunkLoadError,
  shouldAutoReloadChunkError,
} from '../utils/chunkLoadError';
import { isClientErrorNoise } from '../utils/clientErrorNoise';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorDetail?: string;
  errorStack?: string | null;
  staleChunk?: boolean;
  reportedKey?: string;
}

function reportClientError(payload: {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
}): void {
  if (isClientErrorNoise(payload.message, payload.stack, payload.componentStack)) return;
  try {
    const body = JSON.stringify({
      message: payload.message.slice(0, 800),
      stack: payload.stack?.slice(0, 4000) ?? null,
      componentStack: payload.componentStack?.slice(0, 4000) ?? null,
      url: typeof window !== 'undefined' ? window.location.href : null,
      buildId:
        typeof document !== 'undefined'
          ? document.querySelector('meta[name="bm-build"]')?.getAttribute('content') ?? null
          : null,
    });
    // keepalive so the request goes out even if we navigate / reload
    void fetch('/api/track/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let reporting throw */
  }
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { hasError: true, error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    const msg = String(
      error instanceof Error ? error.message : typeof error === 'string' ? error : (error ?? ''),
    );
    const stack = error instanceof Error ? (error.stack ?? null) : null;
    const componentStack = errorInfo?.componentStack ?? null;
    const staleChunk = isChunkLoadError(msg) || isChunkLoadError(error);

    // Stale chunks (cached old index referencing deleted hashes) are self-healing:
    // try ONE silent reload per 60s — user never sees the error screen, admin
    // never gets a report. If reload throttle blocks, fall through to the screen.
    if (staleChunk && shouldAutoReloadChunkError()) {
      forceReloadForNewBuild();
      return;
    }

    // De-dupe + skip reporting noise (chunks + browser extensions).
    if (!staleChunk) {
      const key = `${msg}\n${stack ?? ''}`;
      if (this.state.reportedKey !== key) {
        reportClientError({ message: msg, stack, componentStack });
        this.setState({ reportedKey: key });
      }
    }

    console.error('Critical Render Error caught by Boundary:', error, errorInfo);
    this.setState({
      errorDetail: msg,
      errorStack: componentStack,
      staleChunk,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100vh',
            width: '100vw',
            backgroundColor: '#0B0F19',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            padding: '20px',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 999999,
          }}
        >
          <div style={{ fontSize: '50px', marginBottom: '20px' }}>⚠️</div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: '900',
              textTransform: 'uppercase',
              fontStyle: 'italic',
              marginBottom: '10px',
            }}
          >
            Erro de Interface
          </h1>
          <p style={{ color: '#94a3b8', maxWidth: '420px', marginBottom: '12px', lineHeight: '1.5' }}>
            {this.state.staleChunk
              ? 'A plataforma foi atualizada. Recarregue para baixar a versão mais recente.'
              : 'Ocorreu um erro crítico na renderização. O time já foi notificado automaticamente.'}
          </p>
          <p style={{ color: '#64748b', fontSize: '11px', marginBottom: '20px' }}>
            Reporte enviado para o administrador.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '8px' }}>
            <button
              type="button"
              onClick={() => {
                clearChunkReloadMarkers();
                forceReloadForNewBuild();
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '900',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontSize: '12px',
                letterSpacing: '1px',
              }}
            >
              Recarregar plataforma
            </button>
            <a
              href="https://t.me/+KPgyUFtKCZ00Y2Vh"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                backgroundColor: '#229ED9',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '900',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontSize: '12px',
                letterSpacing: '1px',
                textDecoration: 'none',
              }}
              aria-label="Reportar via Telegram"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.15-3.07-1.99 1.94c-.23.23-.42.42-.83.42z" />
              </svg>
              Reportar no Telegram
            </a>
          </div>
          <p style={{ color: '#475569', fontSize: '10px', marginTop: '4px', maxWidth: '420px' }}>
            Se o erro persistir, abra o nosso grupo do Telegram e envie a mensagem abaixo (ou um print) ao admin.
          </p>
          <p style={{ color: '#475569', fontSize: '10px', marginTop: '12px', maxWidth: '460px', lineHeight: '1.5' }}>
            <strong style={{ color: '#94a3b8' }}>Dica:</strong> se o erro voltar mesmo após
            recarregar, limpe o cache do seu navegador
            (<kbd style={{ fontFamily: 'monospace', background: '#1e293b', padding: '1px 5px', borderRadius: '4px' }}>Ctrl+Shift+Del</kbd>
            {' '}no PC ou <em>Limpar dados de navegação</em> no celular) e abra a página de novo.
          </p>
          {this.state.errorDetail ? (
            <details style={{ marginTop: '20px', maxWidth: '600px', textAlign: 'left' }}>
              <summary
                style={{ cursor: 'pointer', color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}
              >
                Detalhes do erro (debug)
              </summary>
              <pre
                style={{
                  color: '#f87171',
                  fontSize: '10px',
                  marginTop: '8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  background: '#1e293b',
                  padding: '12px',
                  borderRadius: '8px',
                }}
              >
                {this.state.errorDetail}
                {'\n\n'}
                {this.state.errorStack}
              </pre>
            </details>
          ) : null}
        </div>
      );
    }

    return this.props.children ?? null;
  }
}
