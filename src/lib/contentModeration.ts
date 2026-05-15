/**
 * Modération de contenu simple côté client.
 * PRODUCTION: Intégrer Google Vision API, AWS Rekognition ou Cloudinary.
 */

import { isSuspiciousFilename } from './fileUtils';

export interface ModerationResult {
  flagged: boolean;
  reason?: string;
  confidence?: number; // 0-1
}

/**
 * Vérifie si un fichier doit être signalé comme potentiellement problématique.
 * Implémentation basique avec vérification de filename + patterns simples.
 */
export async function moderateFile(file: File): Promise<ModerationResult> {
  // Vérification basique du filename
  if (isSuspiciousFilename(file.name)) {
    return {
      flagged: true,
      reason: 'Nom de fichier potentiellement problématique',
      confidence: 0.5,
    };
  }

  // Pour les images, on pourrait faire une analyse basique des pixels
  // MAIS: sans une véritable API de vision, c'est très limité.
  // En production, envoyer à Google Vision API ou AWS Rekognition.
  if (file.type.startsWith('image/')) {
    // Placeholder pour vérification d'image
    // Exemple: analyseImageBuffer(file)
    // Pour maintenant, juste acceptable
    return { flagged: false };
  }

  return { flagged: false };
}

/**
 * Analyse complète d'une image avec Google Vision API.
 * À activer en production avec une clé API valide.
 */
export async function analyzeImageWithVision(
  base64Image: string,
  apiKey?: string
): Promise<ModerationResult> {
  if (!apiKey) {
    // Sans clé API, on ignore (mode dev)
    return { flagged: false };
  }

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [
                { type: 'SAFE_SEARCH_DETECTION' },
                { type: 'EXPLICIT_CONTENT_DETECTION' },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      console.warn('Vision API error:', await response.text());
      return { flagged: false };
    }

    const data = await response.json();
    const annotations = data.responses?.[0]?.safeSearchAnnotation;

    if (!annotations) {
      return { flagged: false };
    }

    // Vérifier les likelihood scores
    // LIKELY / VERY_LIKELY => flagged
    const isAdult = ['LIKELY', 'VERY_LIKELY'].includes(annotations.adult);
    const isViolent = ['LIKELY', 'VERY_LIKELY'].includes(annotations.violence);

    if (isAdult || isViolent) {
      return {
        flagged: true,
        reason: isAdult ? 'Contenu adulte détecté' : 'Contenu violent détecté',
        confidence: 0.9,
      };
    }

    return { flagged: false };
  } catch (error) {
    console.error('Content moderation error:', error);
    return { flagged: false }; // Fail open
  }
}
