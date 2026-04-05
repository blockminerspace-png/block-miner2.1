/**
 * TransparencyErrorBoundary.jsx
 *
 * Scoped React error boundary for the Transparency Portal routes.
 * Unlike the global ErrorBoundary (which takes over the entire screen),
 * this renders an in-page card so the rest of the app stays functional.
 *
 * Usage:
 *   <TransparencyErrorBoundary>
 *     <Transparency />
 *   </TransparencyErrorBoundary>
 */
import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class TransparencyErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[TransparencyErrorBoundary]', error, info);
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        className="max-w-5xl mx-auto mt-8 rounded-2xl border border-red-500/20 bg-red-500/5 p-8 flex flex-col items-center gap-4 text-center"
        role="alert"
        data-testid="transparency-boundary-error"
      >
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-400" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-black text-red-300 uppercase tracking-wide mb-1">
            Transparency Portal — Render Error
          </p>
          <p className="text-xs text-gray-500">
            An unexpected error occurred while rendering this page.
          </p>
        </div>
        <button
          onClick={this.handleReset}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
          data-testid="transparency-boundary-retry"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Try Again
        </button>
        {process.env.NODE_ENV !== 'production' && this.state.error && (
          <details className="w-full text-left mt-2">
            <summary className="text-[10px] text-gray-600 cursor-pointer font-mono">Error details (dev only)</summary>
            <pre className="mt-2 text-[10px] text-red-400 bg-black/30 rounded-xl p-3 overflow-auto whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

export default TransparencyErrorBoundary;
