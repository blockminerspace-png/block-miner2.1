/** Visual-only fallback when no miner image is configured (never persist this path as imageUrl). */
export const ADMIN_MINER_IMAGE_PLACEHOLDER = '/icon.png';

const PLACEHOLDER_PATHS = new Set([ADMIN_MINER_IMAGE_PLACEHOLDER, '/icons/logo-placeholder.png']);

export function isPlaceholderMinerImageUrl(value: string | null | undefined): boolean {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed) return false;
  return PLACEHOLDER_PATHS.has(trimmed) || trimmed.includes('logo-placeholder');
}

/** Returns null when the URL must not be sent to the API as imageUrl. */
export function normalizePersistableMinerImageUrl(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || isPlaceholderMinerImageUrl(trimmed)) return null;
  return trimmed;
}

export function resolveAdminMinerPreviewSrc(
  imageUrl: string | null | undefined,
  localObjectUrl: string | null,
  cacheBust?: string | number | null,
): string | null {
  if (localObjectUrl) return localObjectUrl;
  const trimmed = normalizePersistableMinerImageUrl(imageUrl);
  if (!trimmed) return null;
  if (trimmed.startsWith('blob:')) return trimmed;
  if (cacheBust != null && cacheBust !== '' && trimmed.startsWith('/')) {
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${sep}v=${encodeURIComponent(String(cacheBust))}`;
  }
  return trimmed;
}
