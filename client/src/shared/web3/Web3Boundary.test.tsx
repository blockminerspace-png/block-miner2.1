import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Web3Boundary from './Web3Boundary';
import Web3ProvidersLight from './Web3ProvidersLight';

vi.mock('../components/Web3Providers', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="web3-full">{children}</div>,
}));

describe('Web3Boundary', () => {
  it('renders children with full Web3 providers when chunk loads', async () => {
    render(
      <Web3Boundary fallback={<div data-testid="loading">loading</div>}>
        <div>child</div>
      </Web3Boundary>,
    );

    expect(await screen.findByTestId('web3-full')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
  });
});

describe('Web3ProvidersLight', () => {
  it('renders children without crashing when used as fallback stack', () => {
    render(
      <Web3ProvidersLight>
        <span>wallet-shell</span>
      </Web3ProvidersLight>,
    );
    expect(screen.getByText('wallet-shell')).toBeTruthy();
  });
});
