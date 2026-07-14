import sharp, { OverlayOptions, ResizeOptions, Sharp, SharpOptions } from "sharp";

import {
  ALTERNATE_EDIT_ALLOWLIST_ARRAY,
  AWS_COMPAT_MAX_BASE64_BYTES,
  DEFAULT_WEBP_EFFORT,
  SHARP_EDIT_ALLOWLIST_ARRAY,
} from "./lib/constants";
import { ContentTypes, ImageFormatTypes, RequestTypes, StatusCodes } from "./lib/enums";
import { ImageHandlerError } from "./lib/image-handler-error";
import { BoundingBox, BoxSize, ImageEdits, ImageRequestInfo } from "./lib/types";
import { StorageProvider } from "./storage-provider";
import { VisionClient } from "./vision-client";

/** Edits skipped for animated images, matching AWS behavior. */
const ANIMATED_SKIP_EDITS = new Set(["rotate", "smartCrop", "roundCrop", "contentModeration"]);

/**
 * Applies the requested edits with sharp and produces the output bytes — a port of the
 * AWS ImageHandler class with Rekognition swapped for Cloud Vision.
 */
export class ImageHandler {
  constructor(private readonly storageProvider: StorageProvider, private readonly visionClient: VisionClient) {}

  public async process(request: ImageRequestInfo): Promise<Buffer> {
    const { originalImage, edits, outputFormat } = request;
    const hasEdits = edits && Object.keys(edits).length > 0;

    let output: Buffer;
    if (!hasEdits && !outputFormat) {
      output = originalImage; // passthrough, original bytes untouched
    } else {
      // Quality-key migration must happen BEFORE the edit loop so the migrated
      // quality option is actually applied (AWS runs fixQuality during setup).
      if (outputFormat) this.fixQuality(request, outputFormat);
      let animated = this.isAnimated(request);
      // AWS parity: fall back to non-animated processing when the source has a single
      // page (pages<=1), so edits like rotate are not skipped for still GIFs.
      if (animated) {
        const metadata = await sharp(originalImage, { failOnError: false, animated: true }).metadata();
        if (!metadata.pages || metadata.pages <= 1) animated = false;
      }
      let image = this.instantiateSharpImage(originalImage, edits ?? {}, animated);
      if (hasEdits) {
        image = await this.applyEdits(image, edits as ImageEdits, animated, request);
      }
      image = this.applyOutputFormat(image, request);
      try {
        output = await image.toBuffer();
      } catch (error) {
        if (error instanceof ImageHandlerError) throw error;
        // sharp reports some edit failures only when the pipeline runs; map the two
        // AWS-specified cases onto their 400 error codes here (AWS does the same in
        // its process() catch block).
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("extract_area: bad extract area")) {
          throw new ImageHandlerError(
            StatusCodes.BAD_REQUEST,
            "Crop::AreaOutOfBounds",
            "The cropping area you provided exceeds the boundaries of the original image. Please try choosing a correct cropping value."
          );
        }
        if (message.includes("must have same dimensions or smaller")) {
          throw new ImageHandlerError(StatusCodes.BAD_REQUEST, "BadRequest", message.replace(/composite/gi, "overlay"));
        }
        throw error;
      }
    }

    if (process.env.COMPAT_AWS_LIMITS === "Yes" && output.toString("base64").length > AWS_COMPAT_MAX_BASE64_BYTES) {
      throw new ImageHandlerError(
        StatusCodes.REQUEST_TOO_LONG,
        "TooLargeImageException",
        "The converted image is too large to return."
      );
    }
    return output;
  }

  private isAnimated(request: ImageRequestInfo): boolean {
    const edits = request.edits ?? {};
    if (edits.animated !== undefined) return Boolean(edits.animated);
    return request.contentType === ContentTypes.GIF;
  }

  private instantiateSharpImage(originalImage: Buffer, edits: ImageEdits, animated: boolean): Sharp {
    const options: SharpOptions = { failOnError: false, animated };
    const limit = process.env.SHARP_SIZE_LIMIT ?? "";
    if (limit !== "" && !Number.isNaN(Number(limit))) {
      options.limitInputPixels = Number(limit);
    }
    let image = sharp(originalImage, options);
    // AWS keeps EXIF/ICC by default; strip_exif / strip_icc filters opt out selectively.
    if (edits.stripExif && edits.stripIcc) {
      // neither kept — plain pipeline re-encodes without metadata
    } else if (edits.stripExif) {
      image = image.keepIccProfile();
    } else if (edits.stripIcc) {
      image = image.withIccProfile("srgb").keepExif();
    } else {
      image = image.keepMetadata();
    }
    delete edits.stripExif;
    delete edits.stripIcc;
    return image;
  }

  private async applyEdits(image: Sharp, edits: ImageEdits, animated: boolean, request: ImageRequestInfo): Promise<Sharp> {
    // resize is applied first (AWS: applyResize before the keyed loop)
    image = await this.applyResize(image, edits);

    for (const [edit, value] of Object.entries(edits)) {
      if (edit === "resize" || edit === "animated") continue;
      if (animated && ANIMATED_SKIP_EDITS.has(edit)) continue;

      if (SHARP_EDIT_ALLOWLIST_ARRAY.includes(edit)) {
        image = this.applySharpEdit(image, edit, value);
      } else if (ALTERNATE_EDIT_ALLOWLIST_ARRAY.includes(edit)) {
        image = await this.applyAlternateEdit(image, edit, value, request);
      } else {
        throw new ImageHandlerError(StatusCodes.BAD_REQUEST, "ImageEdits::NotAllowed", `The edit ${edit} is not allowed.`);
      }
    }
    return image;
  }

  private applySharpEdit(image: Sharp, edit: string, value: unknown): Sharp {
    try {
      if (edit === "toFormat") {
        return image.toFormat(value as keyof sharp.FormatEnum);
      }
      if (value === true || value === undefined || value === null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (image as any)[edit]();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (image as any)[edit](value);
    } catch (error) {
      if (error instanceof ImageHandlerError) throw error;
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "InstantiationError",
        `Input image could not be instantiated. Please choose a valid image and check the edit ${edit}.`
      );
    }
  }

  private async applyAlternateEdit(image: Sharp, edit: string, value: unknown, request: ImageRequestInfo): Promise<Sharp> {
    switch (edit) {
      case "crop":
        return this.applyCrop(image, value as sharp.Region);
      case "roundCrop":
        return this.applyRoundCrop(image, value);
      case "overlayWith":
        return this.applyOverlay(image, value as Record<string, unknown>, request);
      case "smartCrop":
        return this.applySmartCrop(image, value);
      case "contentModeration":
        return this.applyContentModeration(image, value);
      default:
        return image;
    }
  }

  private async applyResize(image: Sharp, edits: ImageEdits): Promise<Sharp> {
    if (edits.resize === undefined) {
      edits.resize = { fit: "inside" };
      return image;
    }
    if (edits.resize === null || Object.keys(edits.resize).length === 0) {
      edits.resize = { fit: "inside" };
      return image;
    }
    const resize: ResizeOptions & { ratio?: number } = { ...edits.resize };
    if (resize.width) resize.width = Math.round(Number(resize.width));
    if (resize.height) resize.height = Math.round(Number(resize.height));
    if ((resize.width !== undefined && resize.width !== null && (Number.isNaN(resize.width) || resize.width <= 0)) ||
        (resize.height !== undefined && resize.height !== null && (Number.isNaN(resize.height) || resize.height <= 0))) {
      throw new ImageHandlerError(StatusCodes.BAD_REQUEST, "InvalidResizeException", "The image size is invalid.");
    }
    if (resize.ratio !== undefined) {
      const ratio = resize.ratio;
      const metadata = await image.metadata();
      resize.width = Math.round((resize.width ?? metadata.width ?? 0) * ratio);
      resize.height = Math.round((resize.height ?? metadata.height ?? 0) * ratio);
      delete resize.ratio;
    }
    edits.resize = resize;
    if (resize.width || resize.height) {
      // sharp treats null dimensions as auto
      const { width, height, ...options } = resize;
      return image.resize(width ?? undefined, height ?? undefined, options);
    }
    return image;
  }

  private applyCrop(image: Sharp, region: sharp.Region): Sharp {
    try {
      return image.extract(region);
    } catch {
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "Crop::AreaOutOfBounds",
        "The cropping area you provided exceeds the boundaries of the original image. Please try choosing a correct cropping value."
      );
    }
  }

  private async applyRoundCrop(image: Sharp, value: unknown): Promise<Sharp> {
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const options = typeof value === "object" && value !== null ? (value as Record<string, number>) : {};
    const validated = (n: number | undefined, fallback: number) =>
      typeof n === "number" && n >= 0 ? n : fallback;
    const rx = validated(options.rx, Math.min(width, height) / 2);
    const ry = validated(options.ry, Math.min(width, height) / 2);
    const top = validated(options.top, height / 2);
    const left = validated(options.left, width / 2);

    const ellipse = Buffer.from(`<svg viewBox="0 0 ${width} ${height}"><ellipse cx="${left}" cy="${top}" rx="${rx}" ry="${ry}" /></svg>`);
    const data = await image.composite([{ input: ellipse, blend: "dest-in" }]).toBuffer();
    return sharp(data).withMetadata().trim();
  }

  private async applyOverlay(image: Sharp, overlay: Record<string, unknown>, request: ImageRequestInfo): Promise<Sharp> {
    try {
      const bucket = String(overlay.bucket ?? "");
      const key = String(overlay.key ?? "");
      const allowed = (process.env.SOURCE_BUCKETS ?? "").replace(/\s+/g, "").split(",");
      if (!allowed.includes(bucket)) {
        throw new ImageHandlerError(
          StatusCodes.FORBIDDEN,
          "ImageBucket::CannotAccessBucket",
          "The bucket you specified could not be accessed. Please check that the bucket is specified in your SOURCE_BUCKETS."
        );
      }
      const metadata = await image.metadata();
      const baseSize: BoxSize = await this.getResizedCanvasSize(request, metadata.width ?? 0, metadata.height ?? 0);

      const overlayObject = await this.storageProvider.getObject(bucket, key);
      let overlayImage = sharp(overlayObject.originalImage);

      const wRatio = Number(overlay.wRatio);
      const hRatio = Number(overlay.hRatio);
      const resizeOptions: ResizeOptions = { fit: "inside" };
      if (!Number.isNaN(wRatio) && wRatio > 0 && wRatio <= 100) {
        resizeOptions.width = Math.floor((baseSize.width * wRatio) / 100);
      }
      if (!Number.isNaN(hRatio) && hRatio > 0 && hRatio <= 100) {
        resizeOptions.height = Math.floor((baseSize.height * hRatio) / 100);
      }
      if (resizeOptions.width || resizeOptions.height) {
        overlayImage = overlayImage.resize(resizeOptions);
      }

      const alphaValue = Number(overlay.alpha);
      const alpha = !Number.isNaN(alphaValue) && alphaValue >= 0 && alphaValue <= 100 ? alphaValue : 0;
      const overlayBuffer = await overlayImage
        .composite([
          {
            input: Buffer.from([255, 255, 255, 255 * (1 - alpha / 100)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: "dest-in",
          },
        ])
        .toBuffer();

      const overlayMeta = await sharp(overlayBuffer).metadata();
      const compositeOptions: OverlayOptions = { input: overlayBuffer };
      const posOptions = (overlay.options ?? {}) as Record<string, unknown>;
      const resolve = (pos: unknown, base: number, overlaySize: number): number | undefined => {
        if (pos === undefined || pos === null) return undefined;
        if (typeof pos === "string" && pos.endsWith("p")) {
          const pct = Number(pos.slice(0, -1));
          return pct < 0 ? base + Math.floor((base * pct) / 100) - overlaySize : Math.floor((base * pct) / 100);
        }
        const num = Number(pos);
        if (Number.isNaN(num)) return undefined;
        return num < 0 ? base + num - overlaySize : num;
      };
      const left = resolve(posOptions.left, baseSize.width, overlayMeta.width ?? 0);
      const top = resolve(posOptions.top, baseSize.height, overlayMeta.height ?? 0);
      if (left !== undefined) compositeOptions.left = left;
      if (top !== undefined) compositeOptions.top = top;

      // Composite must run on the resized canvas, so materialize the base first.
      const baseBuffer = await image.toBuffer();
      return sharp(baseBuffer, { failOnError: false }).withMetadata().composite([compositeOptions]);
    } catch (error) {
      if (error instanceof ImageHandlerError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("must have same dimensions or smaller")) {
        throw new ImageHandlerError(
          StatusCodes.BAD_REQUEST,
          "BadRequest",
          message.replace(/composite/gi, "overlay")
        );
      }
      throw new ImageHandlerError(StatusCodes.BAD_REQUEST, "OverlayImageException", "The overlay image could not be applied. Please contact the system administrator.");
    }
  }

  /** Size of the base canvas after any requested resize (overlay ratios use this). */
  private async getResizedCanvasSize(request: ImageRequestInfo, width: number, height: number): Promise<BoxSize> {
    const resize = request.edits?.resize as (ResizeOptions & { ratio?: number }) | undefined;
    if (!resize || (!resize.width && !resize.height)) return { width, height };
    const rw = resize.width ? Math.round(Number(resize.width)) : undefined;
    const rh = resize.height ? Math.round(Number(resize.height)) : undefined;
    if (rw && rh) return { width: rw, height: rh };
    if (rw) return { width: rw, height: Math.round((height * rw) / width) };
    if (rh) return { width: Math.round((width * rh) / height), height: rh };
    return { width, height };
  }

  private async applySmartCrop(image: Sharp, value: unknown): Promise<Sharp> {
    const options = typeof value === "object" && value !== null ? (value as Record<string, number>) : {};
    const faceIndex = typeof options.faceIndex === "number" ? options.faceIndex : 0;
    const padding = typeof options.padding === "number" ? options.padding : 0;

    // Vision needs jpeg/png; convert transparently and convert back afterwards.
    const metadata = await image.metadata();
    const needsConversion = !["jpeg", "png"].includes(metadata.format ?? "");
    const analysisBuffer = needsConversion ? await image.clone().png().toBuffer() : await image.clone().toBuffer();
    const analysisMeta = await sharp(analysisBuffer).metadata();
    const width = analysisMeta.width ?? 0;
    const height = analysisMeta.height ?? 0;

    const faces = await this.visionClient.detectFaces(analysisBuffer, width, height);
    if (faces.length === 0) {
      return image; // no faces: full image, no crop (AWS parity)
    }
    if (faceIndex >= faces.length || faceIndex < 0) {
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "SmartCrop::FaceIndexOutOfRange",
        "You have provided a FaceIndex value that exceeds the length of the zero-based detectedFaces array. Please specify a value that is in-range."
      );
    }
    const box = this.clampBoundingBox(faces[faceIndex]);
    const left = Math.floor(box.left * width - padding);
    const top = Math.floor(box.top * height - padding);
    const cropWidth = Math.floor(box.width * width + padding * 2);
    const cropHeight = Math.floor(box.height * height + padding * 2);
    if (left < 0 || top < 0 || left + cropWidth > width || top + cropHeight > height) {
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "SmartCrop::PaddingOutOfBounds",
        "The padding value you provided exceeds the boundaries of the original image. Please try choosing a smaller value or applying padding via Sharp for greater specificity."
      );
    }
    try {
      const cropped = await sharp(analysisBuffer)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .toBuffer();
      let result = sharp(cropped).withMetadata();
      if (needsConversion && metadata.format) {
        result = result.toFormat(metadata.format as keyof sharp.FormatEnum);
      }
      return result;
    } catch (error) {
      if (error instanceof ImageHandlerError) throw error;
      throw new ImageHandlerError(StatusCodes.INTERNAL_SERVER_ERROR, "SmartCrop::Error", "Smart Crop failed");
    }
  }

  private clampBoundingBox(box: BoundingBox): BoundingBox {
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const left = clamp(box.left);
    const top = clamp(box.top);
    let width = clamp(box.width);
    let height = clamp(box.height);
    if (left + width > 1) width = 1 - left;
    if (top + height > 1) height = 1 - top;
    return { left, top, width, height };
  }

  private async applyContentModeration(image: Sharp, value: unknown): Promise<Sharp> {
    const options = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    const minConfidence = typeof options.minConfidence === "number" ? (options.minConfidence as number) : 75;
    const blurValue = typeof options.blur === "number" ? (options.blur as number) : 50;
    const moderationLabels = Array.isArray(options.moderationLabels) ? (options.moderationLabels as string[]) : undefined;

    const metadata = await image.metadata();
    const needsConversion = !["jpeg", "png"].includes(metadata.format ?? "");
    const analysisBuffer = needsConversion ? await image.clone().png().toBuffer() : await image.clone().toBuffer();

    const result = await this.visionClient.detectModerationLabels(analysisBuffer, minConfidence, moderationLabels);
    if (result.labels.length > 0) {
      const blur = Math.ceil(blurValue);
      if (blur >= 0.3 && blur <= 1000) {
        return image.blur(blur);
      }
    }
    return image;
  }

  private applyOutputFormat(image: Sharp, request: ImageRequestInfo): Sharp {
    const edits = request.edits ?? {};
    let outputFormat = request.outputFormat;

    // SVG source with edits but no explicit format → PNG (AWS parity)
    if (request.contentType === ContentTypes.SVG && Object.keys(edits).length > 0 && !edits.toFormat && !outputFormat) {
      outputFormat = ImageFormatTypes.PNG;
    }
    if (!outputFormat) return image;

    if (outputFormat === ImageFormatTypes.WEBP) {
      const effort = request.effort ?? DEFAULT_WEBP_EFFORT;
      return image.webp({ effort });
    }
    const supported = ["jpeg", "png", "webp", "tiff", "heif", "raw", "gif", "avif"];
    if (!supported.includes(outputFormat)) {
      throw new ImageHandlerError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "UnsupportedOutputImageFormatException",
        `Format to ${outputFormat} not supported`
      );
    }
    return image.toFormat(outputFormat as keyof sharp.FormatEnum);
  }

  /**
   * Thumbor/Custom only: when a quality edit targets a different format than the final
   * output (e.g. filters:quality on .jpg but output webp), migrate the quality setting.
   */
  private fixQuality(request: ImageRequestInfo, outputFormat: ImageFormatTypes): void {
    if (![RequestTypes.THUMBOR, RequestTypes.CUSTOM].includes(request.requestType)) return;
    const edits = request.edits ?? {};
    const qualityFormats = ["jpeg", "png", "webp", "tiff", "heif", "gif", "avif"];
    for (const fmt of qualityFormats) {
      if (fmt !== outputFormat && edits[fmt]?.quality !== undefined) {
        if (qualityFormats.includes(outputFormat)) {
          edits[outputFormat] = { ...edits[outputFormat], quality: edits[fmt].quality };
        }
        delete edits[fmt];
      }
    }
  }
}
