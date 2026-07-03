import type { UserPowerStatsPayload } from '../stats.api';
import type { ExpiryRow } from '../components/ExpiryProgressList';

export function collectAllBoostRows(power: UserPowerStatsPayload): ExpiryRow[] {
  const rows: ExpiryRow[] = [...(power.overview?.nextExpirations ?? [])];

  for (const y of power.youtube?.activeItems ?? []) {
    rows.push({
      source: 'youtube',
      slug: y.sourceVideoId,
      name: 'YouTube',
      hashRate: y.hashRate,
      expiresAt: y.expiresAt,
    });
  }

  for (const g of power.games?.byGame ?? []) {
    for (const it of g.items) {
      rows.push({
        source: g.slug.includes('checkin') ? 'checkin' : 'game',
        slug: g.slug,
        name: g.name,
        hashRate: it.hashRate,
        expiresAt: it.expiresAt,
      });
    }
  }

  for (const p of power.autoMining?.items ?? []) {
    rows.push({
      source: 'auto_mining',
      slug: null,
      name: 'Auto Mining GPU',
      hashRate: p.gpuHashRate,
      expiresAt: p.expiresAt,
    });
  }

  return rows.sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
}

export function filterBoostRows(rows: ExpiryRow[], filter: string): ExpiryRow[] {
  if (filter === 'all') return rows;
  if (filter === 'games') return rows.filter((r) => r.source === 'game');
  if (filter === 'youtube') return rows.filter((r) => r.source === 'youtube');
  if (filter === 'autoMining') return rows.filter((r) => r.source.startsWith('auto_mining'));
  if (filter === 'faucet') return rows.filter((r) => r.source === 'faucet' || r.slug === 'faucet_power');
  if (filter === 'checkin') return rows.filter((r) => r.source === 'checkin' || r.slug?.includes('checkin'));
  return rows;
}
