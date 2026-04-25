/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { LayoutDashboard, BarChart3, LayoutGrid } from 'lucide-react';
import {
  mapApiCategoriesToMenu,
  normalizeMiniPassOutOfRewardsGroup,
  resolveSidebarIcon,
} from './sidebarNavMap';

describe('sidebarNavMap', () => {
  it('maps API category with group and children', () => {
    const t = (k) => k;
    const menu = mapApiCategoriesToMenu(
      [
        {
          section: 'earn',
          titleKey: 'sidebar.categories.earn',
          items: [
            {
              itemId: 'rewards_group',
              labelKey: 'sidebar.rewards',
              icon: 'Folder',
              children: [
                {
                  itemId: 'faucet',
                  labelKey: 'sidebar.faucet',
                  icon: 'Gift',
                  path: '/faucet',
                },
              ],
            },
          ],
        },
      ],
      t
    );
    expect(menu[0].items[0].type).toBe('group');
    expect(menu[0].items[0].children).toHaveLength(1);
    expect(menu[0].items[0].children[0].path).toBe('/faucet');
  });

  it('resolveSidebarIcon falls back to LayoutDashboard for unknown name', () => {
    expect(resolveSidebarIcon('NotARealLucideIcon')).toBe(LayoutDashboard);
  });

  it('resolveSidebarIcon maps BarChart3 for power stats', () => {
    expect(resolveSidebarIcon('BarChart3')).toBe(BarChart3);
  });

  it('resolveSidebarIcon maps LayoutGrid for internal offerwall', () => {
    expect(resolveSidebarIcon('LayoutGrid')).toBe(LayoutGrid);
  });

  it('normalizeMiniPassOutOfRewardsGroup pulls mini_pass out of Rewards children', () => {
    const raw = [
      {
        section: 'earn',
        titleKey: 'sidebar.categories.earn',
        items: [
          { itemId: 'checkin', labelKey: 'sidebar.checkin', icon: 'Calendar', path: '/checkin' },
          {
            itemId: 'rewards_group',
            labelKey: 'sidebar.rewards',
            icon: 'Folder',
            children: [
              {
                itemId: 'mini_pass',
                labelKey: 'sidebar.mini_pass',
                icon: 'Trophy',
                path: '/mini-pass',
              },
              { itemId: 'faucet', labelKey: 'sidebar.faucet', icon: 'Gift', path: '/faucet' },
            ],
          },
        ],
      },
    ];
    const fixed = normalizeMiniPassOutOfRewardsGroup(raw);
    const items = fixed[0].items;
    const group = items.find((i) => i.itemId === 'rewards_group');
    expect(group.children.some((c) => c.itemId === 'mini_pass')).toBe(false);
    const miniIx = items.findIndex((i) => i.itemId === 'mini_pass');
    const checkIx = items.findIndex((i) => i.itemId === 'checkin');
    expect(miniIx).toBe(checkIx + 1);
  });

  it('normalizeMiniPassOutOfRewardsGroup keeps internal_offerwall inside Rewards children', () => {
    const raw = [
      {
        section: 'earn',
        titleKey: 'sidebar.categories.earn',
        items: [
          { itemId: 'checkin', labelKey: 'sidebar.checkin', icon: 'Calendar', path: '/checkin' },
          {
            itemId: 'rewards_group',
            labelKey: 'sidebar.rewards',
            icon: 'Folder',
            children: [
              {
                itemId: 'internal_offerwall',
                labelKey: 'sidebar.internal_offerwall',
                icon: 'LayoutGrid',
                path: '/internal-offerwall',
              },
              { itemId: 'faucet', labelKey: 'sidebar.faucet', icon: 'Gift', path: '/faucet' },
            ],
          },
        ],
      },
    ];
    const fixed = normalizeMiniPassOutOfRewardsGroup(raw);
    const items = fixed[0].items;
    const group = items.find((i) => i.itemId === 'rewards_group');
    expect(group.children.some((c) => c.itemId === 'internal_offerwall')).toBe(true);
    expect(items.filter((i) => i.itemId === 'internal_offerwall')).toHaveLength(0);
  });

  it('normalizeMiniPassOutOfRewardsGroup pulls daily_tasks out of Rewards children', () => {
    const raw = [
      {
        section: 'earn',
        titleKey: 'sidebar.categories.earn',
        items: [
          { itemId: 'checkin', labelKey: 'sidebar.checkin', icon: 'Calendar', path: '/checkin' },
          {
            itemId: 'rewards_group',
            labelKey: 'sidebar.rewards',
            icon: 'Folder',
            children: [
              {
                itemId: 'daily_tasks',
                labelKey: 'sidebar.daily_tasks',
                icon: 'ListChecks',
                path: '/tasks',
              },
              { itemId: 'faucet', labelKey: 'sidebar.faucet', icon: 'Gift', path: '/faucet' },
            ],
          },
        ],
      },
    ];
    const fixed = normalizeMiniPassOutOfRewardsGroup(raw);
    const items = fixed[0].items;
    const group = items.find((i) => i.itemId === 'rewards_group');
    expect(group.children.some((c) => c.itemId === 'daily_tasks')).toBe(false);
    const dailyIx = items.findIndex((i) => i.itemId === 'daily_tasks');
    const checkIx = items.findIndex((i) => i.itemId === 'checkin');
    expect(dailyIx).toBe(checkIx + 1);
  });
});
