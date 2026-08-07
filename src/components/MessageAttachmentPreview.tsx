import { Download, X, AlertTriangle } from 'lucide-react';
import type { MessageAttachment } from '../types';
import { isImageFile, createDownloadUrl, formatFileSize } from '../lib/fileUtils';

interface MessageAttachmentPreviewProps {
  attachment: MessageAttachment;
  onRemove?: () => void;
  editable?: boolean;
}

export function MessageAttachmentPreview({
  attachment,
  onRemove,
  editable = false,
}: MessageAttachmentPreviewProps) {
  const isImage = isImageFile(attachment.mimeType);
  const downloadUrl = createDownloadUrl(attachment.base64Data, attachment.mimeType);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isImage) {
    return (
      <div className="relative inline-block max-w-xs rounded-lg overflow-hidden border border-gold-400/40 bg-night-900/60">
        {/* Image preview */}
        <img
          src={`data:${attachment.mimeType};base64,${attachment.base64Data}`}
          alt={attachment.filename}
          className="max-w-xs h-auto block"
        />

        {/* Flagged overlay */}
        {attachment.flagged && (
          <div className="absolute inset-0 bg-rose-900/80 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="h-6 w-6 text-rose-300 mx-auto mb-1" />
              <p className="text-xs text-rose-200 font-semibold">Contenu signalé</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={handleDownload}
            className="rounded-full bg-gold-shine/90 p-1.5 text-night-900 hover:brightness-110 transition"
            aria-label="Télécharger l'image"
          >
            <Download className="h-4 w-4" />
          </button>
          {editable && onRemove && (
            <button
              onClick={onRemove}
              className="rounded-full bg-rose-500/90 p-1.5 text-ivory hover:brightness-110 transition"
              aria-label="Supprimer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Document/file preview
  return (
    <div className="rounded-lg border border-royal-500/30 bg-night-800/60 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ivory truncate">{attachment.filename}</p>
        <p className="text-xs text-ivory/60">{formatFileSize(attachment.size)}</p>
        {attachment.flagged && (
          <div className="flex items-center gap-1 mt-1 text-xs text-rose-300">
            <AlertTriangle className="h-3 w-3" />
            Contenu signalé
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          className="rounded-full bg-gold-shine/90 p-2 text-night-900 hover:brightness-110 transition flex-none"
          aria-label="Télécharger"
        >
          <Download className="h-4 w-4" />
        </button>
        {editable && onRemove && (
          <button
            onClick={onRemove}
            className="rounded-full bg-rose-500/90 p-2 text-ivory hover:brightness-110 transition flex-none"
            aria-label="Supprimer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
