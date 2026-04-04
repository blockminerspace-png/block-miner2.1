import { useRef, useState } from 'react';
import { Upload, X, Link2, Image } from 'lucide-react';
import { api } from '../store/auth';

/**
 * Componente de upload de imagem.
 * Permite escolher um arquivo do computador OU digitar uma URL manualmente.
 * Props:
 *   value      — imageUrl atual
 *   onChange   — fn(url: string) chamada quando muda
 *   label      — label exibida acima
 *   previewClass — classe CSS opcional para a prévia
 */
export default function ImageUploader({ value, onChange, label = 'Imagem', previewClass = 'max-h-40' }) {
    const inputRef = useRef(null);
    const [mode, setMode] = useState('upload'); // 'upload' | 'url'
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        setUploading(true);
        try {
            const form = new FormData();
            form.append('image', file);
            // Não passar Content-Type — o Axios define automaticamente com o boundary correto
            const res = await api.post('/admin/upload-image', form);
            if (res.data.ok) {
                onChange(res.data.url);
            } else {
                setError(res.data.message || 'Erro no upload.');
            }
        } catch (err) {
            const msg = err?.response?.data?.message
                || (err?.response?.status ? `Erro ${err.response.status} ao enviar imagem.` : 'Erro ao enviar imagem (sem resposta).');
            setError(msg);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            inputRef.current.files = dt.files;
            handleFile({ target: inputRef.current });
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase text-slate-500 font-bold">{label}</label>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => setMode('upload')}
                        className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg font-bold uppercase transition-all ${mode === 'upload' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                    >
                        <Upload className="w-3 h-3" /> Upload
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('url')}
                        className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg font-bold uppercase transition-all ${mode === 'url' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                    >
                        <Link2 className="w-3 h-3" /> URL
                    </button>
                </div>
            </div>

            {mode === 'upload' ? (
                <div
                    className="relative border-2 border-dashed border-slate-700 rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 transition-colors"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => !uploading && inputRef.current?.click()}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={handleFile}
                    />
                    {uploading ? (
                        <p className="text-primary text-xs font-bold animate-pulse">Enviando...</p>
                    ) : (
                        <>
                            <Image className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                            <p className="text-xs text-slate-400 font-medium">Clique ou arraste uma imagem aqui</p>
                            <p className="text-[10px] text-slate-600 mt-1">JPG, PNG, GIF, WEBP, SVG — máx 5 MB</p>
                        </>
                    )}
                </div>
            ) : (
                <input
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:border-primary/50 focus:outline-none"
                    placeholder="https://..."
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}

            {error && <p className="text-red-400 text-xs">{error}</p>}

            {value && (
                <div className="relative inline-block">
                    <img src={value} alt="" className={`${previewClass} rounded-xl border border-slate-800 block`} />
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors"
                    >
                        <X className="w-3 h-3 text-white" />
                    </button>
                </div>
            )}
        </div>
    );
}
