import { describe, it, expect } from 'vitest';
import {
  ADMIN_MINER_IMAGE_PLACEHOLDER,
  isPlaceholderMinerImageUrl,
  normalizePersistableMinerImageUrl,
  resolveAdminMinerPreviewSrc,
} from './adminMiners.image';

describe('adminMiners.image', () => {
  it('prefers local object URL over remote imageUrl', () => {
    expect(resolveAdminMinerPreviewSrc('/uploads/miners/a.png', 'blob:local')).toBe('blob:local');
  });

  it('adds cache bust to relative miner URLs', () => {
    expect(resolveAdminMinerPreviewSrc('/uploads/miners/a.png', null, 99)).toBe('/uploads/miners/a.png?v=99');
  });

  it('returns null when no image configured', () => {
    expect(resolveAdminMinerPreviewSrc('', null)).toBeNull();
    expect(resolveAdminMinerPreviewSrc('/icon.png', null)).toBeNull();
  });

  it('placeholder constant is not an uploads path', () => {
    expect(ADMIN_MINER_IMAGE_PLACEHOLDER).toBe('/icon.png');
    expect(isPlaceholderMinerImageUrl('/icon.png')).toBe(true);
    expect(normalizePersistableMinerImageUrl('/icon.png')).toBeNull();
  });
});
