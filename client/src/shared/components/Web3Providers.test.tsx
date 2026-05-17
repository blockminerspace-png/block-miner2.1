import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Web3Providers from './Web3Providers';

describe('Web3Providers', () => {
  it('renders children inside wagmi + query stack', () => {
    render(
      <Web3Providers>
        <span data-testid="wc-child">child</span>
      </Web3Providers>,
    );
    expect(screen.getByTestId('wc-child')).toHaveTextContent('child');
  });
});
