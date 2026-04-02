import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Critical Render Error caught by Boundary:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // UI de emergência ultra-simples (sem dependências externas)
            return (
                <div style={{
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
                    zIndex: 999999
                }}>
                    <div style={{ fontSize: '50px', marginBottom: '20px' }}>⚠️</div>
                    <h1 style={{ fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', fontStyle: 'italic', marginBottom: '10px' }}>
                        Erro de Interface
                    </h1>
                    <p style={{ color: '#94a3b8', maxWidth: '400px', marginBottom: '30px', lineHeight: '1.5' }}>
                        Ocorreu um erro crítico na renderização. Isso acontece quando alguns dados da conta estão inconsistentes.
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
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
                            letterSpacing: '1px'
                        }}
                    >
                        Recarregar Plataforma
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
