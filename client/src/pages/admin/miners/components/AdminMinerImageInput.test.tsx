import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminMinerImageInput from './AdminMinerImageInput';

describe('AdminMinerImageInput', () => {
  it('shows placeholder when no imageUrl and no file', () => {
    render(
      <AdminMinerImageInput
        imageUrl=""
        onImageUrlChange={() => {}}
        onImageFileChange={() => {}}
      />,
    );
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('/icon.png');
    expect(img.className).toMatch(/h-14|opacity/);
  });

  it('calls onImageFileChange when a valid file is selected', () => {
    const onFile = vi.fn();
    const { container } = render(
      <AdminMinerImageInput
        imageUrl="/uploads/miners/existing.png"
        onImageUrlChange={() => {}}
        onImageFileChange={onFile}
      />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'gpu.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });
});
