import React, { type ErrorInfo, type ReactNode } from 'react';
import {
  clearChunkReloadMarkers,
  forceReloadForNewBuild,
  handleChunkLoadFailure,
  isChunkLoadError,
} from '../utils/chunkLoadError';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorDetail?: string;
  errorStack?: string | null;
  staleChunk?: boolean;
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

    if (handleChunkLoadFailure(error)) {
      return;
    }

    const staleChunk = isChunkLoadError(msg) || isChunkLoadError(error);
    console.error('Critical Render Error caught by Boundary:', error, errorInfo);
    this.setState({
      errorDetail: msg,
      errorStack: errorInfo?.componentStack,
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
          <p style={{ color: '#94a3b8', maxWidth: '420px', marginBottom: '30px', lineHeight: '1.5' }}>
            {this.state.staleChunk
              ? 'A plataforma foi atualizada. Recarregue para baixar a versão mais recente.'
              : 'Ocorreu um erro crítico na renderização. Isso acontece quando alguns dados da conta estão inconsistentes.'}
          </p>
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
