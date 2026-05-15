/**
 * Utilitaires sécurisés pour la gestion des fichiers.
 * Valide taille, type MIME, et prepare les uploads.
 */

// Configuration de sécurité
export const FILE_CONFIG = {
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
  ],
  ALLOWED_EXTENSIONS: [
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp',
    // Documents
    'pdf', 'txt', 'doc', 'docx',
    // Archives
    'zip', 'rar',
  ],
};

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/**
 * Valide un fichier avant upload.
 * Vérifie taille, type MIME, et extension.
 */
export function validateFile(file: File): void {
  // Vérifier la taille
  if (file.size > FILE_CONFIG.MAX_SIZE_BYTES) {
    throw new FileValidationError(
      `Fichier trop volumineux. Max ${FILE_CONFIG.MAX_SIZE_BYTES / (1024 * 1024)}MB.`
    );
  }

  // Vérifier le type MIME
  if (!FILE_CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new FileValidationError(
      `Type de fichier non autorisé: ${file.type}`
    );
  }

  // Vérifier l'extension
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!FILE_CONFIG.ALLOWED_EXTENSIONS.includes(extension)) {
    throw new FileValidationError(
      `Extension non autorisée: .${extension}`
    );
  }
}

/**
 * Convertit un fichier en base64 pour stockage.
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extrait le base64 (après le "data:...;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Génère une URL blob à partir de base64 pour preview/téléchargement.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Crée une URL téléchargeable à partir de base64.
 */
export function createDownloadUrl(base64: string, mimeType: string): string {
  const blob = base64ToBlob(base64, mimeType);
  return URL.createObjectURL(blob);
}

/**
 * Formate la taille d'un fichier en chaîne lisible.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Génère un ID unique pour une pièce jointe.
 */
export function generateAttachmentId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Détecte si un fichier est une image.
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Détecte si un contenu peut être problématique (contient des mots-clés suspects).
 * NOTA: implémentation basique. Pour prod, intégrer une API comme AWS Rekognition.
 */
export function isSuspiciousFilename(filename: string): boolean {
  const suspiciousPatterns = [
    /adult/i,
    /porn/i,
    /xxx/i,
    /sex/i,
    /nude/i,
  ];
  return suspiciousPatterns.some(pattern => pattern.test(filename));
}
