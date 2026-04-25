import { describe, it, expect } from 'vitest';
import { resolveAdminAssetUrl } from './AdminSupportPlayerDossier.jsx';

describe('resolveAdminAssetUrl', () => {
  it('returns null for empty', () => {
    expect(resolveAdminAssetUrl(null)).toBeNull();
    expect(resolveAdminAssetUrl('   ')).toBeNull();
  });

  it('keeps absolute http URLs', () => {
    expect(resolveAdminAssetUrl('https://cdn/x.png')).toBe('https://cdn/x.png');
    expect(resolveAdminAssetUrl('HTTP://HOST/z')).toBe('HTTP://HOST/z');
  });

  it('prefixes origin for root-relative paths when window is defined', () => {
    if (typeof window === 'undefined' || !window.location) return;
    const origin = window.location.origin;
    expect(resolveAdminAssetUrl('/uploads/a.png')).toBe(`${origin}/uploads/a.png`);
  });
});
