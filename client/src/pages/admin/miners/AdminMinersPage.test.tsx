import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminMinersPage from './AdminMinersPage';
import { ADMIN_MINERS_SCHEMA_OUT_OF_DATE_MESSAGE } from './adminMiners.validation';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-dom', () => ({ createPortal: (node: unknown) => node }));

vi.mock('./adminMiners.hooks', () => ({
  useAdminMinersList: vi.fn(),
}));

import { useAdminMinersList } from './adminMiners.hooks';

describe('AdminMinersPage', () => {
  beforeEach(() => {
    vi.mocked(useAdminMinersList).mockReturnValue({
      miners: [],
      total: 0,
      loading: false,
      listError: null,
      schemaOutOfDate: false,
      reload: vi.fn(),
    });
  });

  it('renders catalog heading', () => {
    render(<AdminMinersPage />);
    expect(screen.getByText('Catálogo de Mineradoras')).toBeTruthy();
  });

  it('renders schema migration error without crashing', () => {
    vi.mocked(useAdminMinersList).mockReturnValue({
      miners: [],
      total: 0,
      loading: false,
      listError: ADMIN_MINERS_SCHEMA_OUT_OF_DATE_MESSAGE,
      schemaOutOfDate: true,
      reload: vi.fn(),
    });
    render(<AdminMinersPage />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(ADMIN_MINERS_SCHEMA_OUT_OF_DATE_MESSAGE);
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeTruthy();
  });
});
