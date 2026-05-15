import { useRef, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { validateFile, FileValidationError, formatFileSize } from '../lib/fileUtils';
import { FILE_CONFIG } from '../lib/fileUtils';

interface FileUploadInputProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function FileUploadInput({ onFileSelected, disabled = false }: FileUploadInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (file: File) => {
    setError(null);
    try {
      validateFile(file);
      onFileSelected(file);
    } catch (err) {
      const message = err instanceof FileValidationError ? err.message : 'Erreur inconnue';
      setError(message);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        onChange={handleInputChange}
        className="hidden"
        accept={FILE_CONFIG.ALLOWED_MIME_TYPES.join(',')}
        disabled={disabled}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed px-3 py-2 text-xs font-semibold transition ${
          isDragging
            ? 'border-gold-400 bg-gold-500/10 text-gold-200'
            : disabled
              ? 'border-royal-500/20 bg-night-900/40 text-ivory/40 cursor-not-allowed'
              : 'border-royal-500/40 bg-night-800/40 text-ivory/70 hover:border-gold-400/60 hover:bg-gold-500/5'
        }`}
      >
        <Upload className="h-4 w-4 inline mr-1" />
        {isDragging ? 'Dépose le fichier' : 'Ajouter un fichier'}
      </button>

      {error && (
        <div className="rounded-lg bg-rose-900/30 border border-rose-500/30 p-2 flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 text-rose-300 flex-none mt-0.5" />
          <p className="text-xs text-rose-200">{error}</p>
        </div>
      )}

      <p className="text-[10px] text-ivory/50">
        Max {(FILE_CONFIG.MAX_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB • Images, documents, archives
      </p>
    </div>
  );
}
