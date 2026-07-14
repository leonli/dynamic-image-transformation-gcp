import vision, { ImageAnnotatorClient } from "@google-cloud/vision";

import { StatusCodes } from "./lib/enums";
import { ImageHandlerError } from "./lib/image-handler-error";
import { BoundingBox } from "./lib/types";

export interface ModerationResult {
  /** Matched category names, e.g. ["Adult", "Racy"]. Empty = clean. */
  labels: string[];
}

/**
 * Cloud Vision stand-in for Amazon Rekognition.
 *  - FACE_DETECTION replaces DetectFaces for smartCrop. Vision returns absolute pixel
 *    polygons, so boxes are normalized against the image dimensions to reproduce the
 *    Rekognition BoundingBox contract. Faces are ordered by area (desc) so faceIndex is
 *    deterministic (documented difference: Rekognition orders by largest face too, but
 *    ties may differ).
 *  - SAFE_SEARCH_DETECTION replaces DetectModerationLabels. Likelihood buckets map onto
 *    a 0–100 confidence so AWS-style minConfidence keeps meaning.
 */
export class VisionClient {
  constructor(private readonly client: ImageAnnotatorClient = new vision.ImageAnnotatorClient()) {}

  private static readonly LIKELIHOOD_SCORE: Record<string, number> = {
    UNKNOWN: 0,
    VERY_UNLIKELY: 0,
    UNLIKELY: 25,
    POSSIBLE: 50,
    LIKELY: 75,
    VERY_LIKELY: 100,
  };

  /** Rekognition moderation label aliases accepted for seamless migration. */
  private static readonly LABEL_ALIASES: Record<string, string> = {
    "explicit nudity": "Adult",
    "explicit": "Adult",
    "nudity": "Adult",
    "graphic violence": "Violence",
    "violence": "Violence",
    "suggestive": "Racy",
    "racy": "Racy",
    "adult": "Adult",
    "medical": "Medical",
    "spoof": "Spoof",
    "visually disturbing": "Violence",
  };

  public async detectFaces(imageBuffer: Buffer, imageWidth: number, imageHeight: number): Promise<BoundingBox[]> {
    try {
      const [result] = await this.client.faceDetection({ image: { content: imageBuffer } });
      const faces = result.faceAnnotations ?? [];
      const boxes: BoundingBox[] = faces.map((face) => {
        const vertices = face.boundingPoly?.vertices ?? [];
        const xs = vertices.map((v) => v.x ?? 0);
        const ys = vertices.map((v) => v.y ?? 0);
        const left = Math.min(...xs) / imageWidth;
        const top = Math.min(...ys) / imageHeight;
        const width = (Math.max(...xs) - Math.min(...xs)) / imageWidth;
        const height = (Math.max(...ys) - Math.min(...ys)) / imageHeight;
        return { left, top, width, height };
      });
      return boxes.sort((a, b) => b.width * b.height - a.width * a.height);
    } catch (error) {
      throw new ImageHandlerError(StatusCodes.INTERNAL_SERVER_ERROR, "SmartCrop::Error", "Smart Crop failed");
    }
  }

  public async detectModerationLabels(
    imageBuffer: Buffer,
    minConfidence: number,
    moderationLabels?: string[]
  ): Promise<ModerationResult> {
    try {
      const [result] = await this.client.safeSearchDetection({ image: { content: imageBuffer } });
      const annotation = result.safeSearchAnnotation;
      if (!annotation) return { labels: [] };

      const categories: Record<string, string> = {
        Adult: String(annotation.adult ?? "UNKNOWN"),
        Violence: String(annotation.violence ?? "UNKNOWN"),
        Racy: String(annotation.racy ?? "UNKNOWN"),
        Medical: String(annotation.medical ?? "UNKNOWN"),
        Spoof: String(annotation.spoof ?? "UNKNOWN"),
      };

      const hit = Object.entries(categories)
        .filter(([, likelihood]) => (VisionClient.LIKELIHOOD_SCORE[likelihood] ?? 0) >= minConfidence)
        .map(([name]) => name);

      if (!moderationLabels || moderationLabels.length === 0) {
        return { labels: hit };
      }
      const wanted = new Set(
        moderationLabels.map((label) => VisionClient.LABEL_ALIASES[label.toLowerCase()] ?? label)
      );
      return { labels: hit.filter((name) => wanted.has(name)) };
    } catch (error) {
      // Error code intentionally keeps the AWS name for migrated clients/alerting.
      throw new ImageHandlerError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Rekognition::DetectModerationLabelsError",
        "Content moderation failed"
      );
    }
  }
}
