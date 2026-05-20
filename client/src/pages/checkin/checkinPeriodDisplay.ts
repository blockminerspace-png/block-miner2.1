import type { TFunction } from 'i18next';
import type { CheckinPeriodInfo } from '../../types/checkin';

function formatInTimezone(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatCheckinPeriodRange(t: TFunction, period: CheckinPeriodInfo | null | undefined): string {
  if (!period?.startsAt || !period.endsAt) return '—';
  const start = formatInTimezone(period.startsAt, period.timezone);
  const end = formatInTimezone(period.endsAt, period.timezone);
  return t('checkin.period.range', { start, end, defaultValue: '{{start}} – {{end}}' });
}

export function formatCheckinNextReset(t: TFunction, period: CheckinPeriodInfo | null | undefined): string {
  if (!period?.nextResetAt) return '—';
  const time = formatInTimezone(period.nextResetAt, period.timezone);
  return t('checkin.period.next_reset_at', {
    time,
    hour: period.resetHour,
    defaultValue: 'Próximo reset: {{time}}',
  });
}

export function formatCheckinAvailableUntil(t: TFunction, period: CheckinPeriodInfo | null | undefined): string {
  if (!period?.endsAt) return '—';
  const time = formatInTimezone(period.endsAt, period.timezone);
  return t('checkin.period.available_until', {
    time,
    defaultValue: 'Disponível até {{time}}',
  });
}
