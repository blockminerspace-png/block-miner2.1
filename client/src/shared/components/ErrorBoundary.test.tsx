/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function Bomb({ msg }: { msg: string }): React.JSX.Element {
  throw new Error(msg);
}

describe('ErrorBoundary', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    replaceMock = vi.fn();
    // jsdom location is read-only; override only what we touch.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'https://test.local/page',
        pathname: '/page',
        search: '',
        replace: replaceMock,
      },
    });
    sessionStorage.clear();
    // Silence React's error noise during these tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the static error screen instead of auto-reloading', () => {
    render(
      <ErrorBoundary>
        <Bomb msg="boom render error" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Erro de Interface')).toBeInTheDocument();
    expect(screen.getByText(/Reporte enviado para o administrador/i)).toBeInTheDocument();
    // No auto-reload was triggered
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('POSTs the error report exactly once to /api/track/client-error', () => {
    render(
      <ErrorBoundary>
        <Bomb msg="boom unique error" />
      </ErrorBoundary>,
    );
    const reportCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes('/api/track/client-error'),
    );
    expect(reportCalls).toHaveLength(1);
    const body = JSON.parse(String(reportCalls[0]?.[1]?.body ?? '{}'));
    expect(body.message).toContain('boom unique error');
    expect(body.url).toBe('https://test.local/page');
  });

  it('shows the Telegram report link pointing to t.me', () => {
    render(
      <ErrorBoundary>
        <Bomb msg="boom telegram" />
      </ErrorBoundary>,
    );
    const link = screen.getByRole('link', { name: /reportar via telegram/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('t.me/'));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('reload button is opt-in for non-chunk errors (only fires on click)', async () => {
    render(
      <ErrorBoundary>
        <Bomb msg="boom plain runtime error" />
      </ErrorBoundary>,
    );
    expect(replaceMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /recarregar plataforma/i }));
    await vi.waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    const url = String(replaceMock.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('_bm_build=');
  });

  it('auto-reloads silently on chunk-load errors (no report, no error screen)', async () => {
    render(
      <ErrorBoundary>
        <Bomb msg="Failed to fetch dynamically imported module: /assets/foo.js" />
      </ErrorBoundary>,
    );
    await vi.waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    const url = String(replaceMock.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('_bm_build=');
    const reportCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/track/client-error'));
    expect(reportCalls).toHaveLength(0);
  });

  it('blocks auto-reload on chunk error after max attempts in window', () => {
    const now = Date.now();
    sessionStorage.setItem(
      'blockminer:chunk-reload-at',
      JSON.stringify([now - 5_000, now - 4_000, now - 3_000]),
    );
    render(
      <ErrorBoundary>
        <Bomb msg="ChunkLoadError: Loading chunk failed" />
      </ErrorBoundary>,
    );
    expect(replaceMock).not.toHaveBeenCalled();
    // Falls through to error screen.
    expect(screen.getByText('Erro de Interface')).toBeInTheDocument();
  });

  it('does not throw if the report fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(() =>
      render(
        <ErrorBoundary>
          <Bomb msg="boom fetch fail" />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByText('Erro de Interface')).toBeInTheDocument();
  });
});
