/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import AdminSidebar from './AdminSidebar.jsx';

const enAdminSidebar = {
  brand_admin: 'Admin',
  brand_panel: 'Panel',
  section_management: 'System management',
  aria_main_nav: 'Main navigation',
  nav: {
    overview: 'Overview',
    users: 'Users',
    fraud_signals: 'Fraud signals',
    miners: 'Miners',
    offers: 'Offers',
    mini_pass: 'Mini Pass',
    finance: 'Finance',
    support: 'Support',
    banners: 'Banners',
    checkin_milestones: 'Check-in milestones',
    daily_tasks: 'Daily tasks',
    read_earn: 'Read & Earn',
    creators: 'Creators',
    transparency: 'Transparency',
    deposit_tickets: 'Deposit tickets',
    backups: 'Backups',
    logs: 'Logs',
    metrics: 'Metrics',
    analytics: 'Analytics',
    broadcast: 'Notifications',
    user_app_sidebar: 'User sidebar',
  },
  logout: 'Sign out',
};

function createTestI18n() {
  const instance = createInstance();
  instance.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    initImmediate: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: { adminSidebar: enAdminSidebar } },
    },
  });
  return instance;
}

function PathProbe() {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
}

function AdminSidebarHarness() {
  return (
    <>
      <PathProbe />
      <AdminSidebar />
    </>
  );
}

function renderSidebar(initialPath = '/admin/dashboard') {
  const i18n = createTestI18n();
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <I18nextProvider i18n={i18n}>
        <Routes>
          <Route path="*" element={<AdminSidebarHarness />} />
        </Routes>
      </I18nextProvider>
    </MemoryRouter>
  );
}

describe('AdminSidebar', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses a scrollable nav region with min-height constraint for flex layouts', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav.className).toMatch(/min-h-0/);
    expect(nav.className).toMatch(/overflow-y-auto/);
    expect(nav.className).toMatch(/scroll-smooth/);
  });

  it('renders translated nav labels and logout', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('navigates when a menu item is activated', () => {
    renderSidebar('/admin/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Users' }));
    expect(screen.getByTestId('pathname')).toHaveTextContent('/admin/users');
  });
});
