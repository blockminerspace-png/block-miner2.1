import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import AdminMinerPreview from './AdminMinerPreview';

const CONTROL_CLASS =
  'w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-amber-500/50';

type AdminMinerImageInputProps = {
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  onImageFileChange: (file: File | null) => void;
  cacheBust?: string | number | null;
  disabled?: boolean;
};

export default function AdminMinerImageInput({
  imageUrl,
  onImageUrlChange,
  onImageFileChange,
  cacheBust = null,
  disabled = false,
}: AdminMinerImageInputProps) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const onFileSelected = (file: File | undefined) => {
    if (!file || disabled) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Use JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx. 5 MB).');
      return;
    }

    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(URL.createObjectURL(file));
    onImageFileChange(file);
    onImageUrlChange('');
  };

  const onUrlInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    onImageFileChange(null);
    onImageUrlChange(e.target.value);
  };

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
        Imagem
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={imageUrl}
          onChange={onUrlInput}
          disabled={disabled}
          className={CONTROL_CLASS}
          placeholder="/uploads/miners/..."
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl bg-slate-800 px-3 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          aria-label="Enviar imagem"
        >
          <Upload className="h-4 w-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            onFileSelected(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <AdminMinerPreview
          imageUrl={imageUrl}
          localObjectUrl={localPreviewUrl}
          cacheBust={cacheBust}
          variant="form"
        />
      </div>
    </div>
  );
}
