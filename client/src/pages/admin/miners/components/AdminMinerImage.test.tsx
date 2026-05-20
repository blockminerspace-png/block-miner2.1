import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminMinerImage from './AdminMinerImage';

describe('AdminMinerImage', () => {
  it('renders real image with full-size classes on form variant', () => {
    render(
      <AdminMinerImage
        imageUrl="/uploads/miners/gpu.png"
        variant="form"
        alt="GPU"
      />,
    );
    const img = screen.getByRole('img', { name: 'GPU' });
    expect(img.className).toContain('h-full');
    expect(img.className).toContain('w-full');
    expect(img.className).toContain('object-contain');
    expect(img.getAttribute('src')).toContain('/uploads/miners/gpu.png');
  });

  it('shows small placeholder icon when no imageUrl', () => {
    render(<AdminMinerImage imageUrl="" variant="form" />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('/icon.png');
    expect(img.className).toContain('h-14');
  });
});
