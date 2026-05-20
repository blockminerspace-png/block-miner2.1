import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminMinerPreview from './AdminMinerPreview';

describe('AdminMinerPreview', () => {
  it('renders label and large preview frame for real imageUrl', () => {
    render(
      <AdminMinerPreview
        imageUrl="/uploads/miners/a.png"
        label="Preview"
        variant="form"
      />,
    );
    expect(screen.getByText('Preview')).toBeTruthy();
    const img = screen.getByRole('img');
    expect(img.className).toContain('h-full');
    expect(img.getAttribute('src')).toContain('/uploads/miners/a.png');
  });
});
