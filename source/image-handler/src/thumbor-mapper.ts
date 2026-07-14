import Color from "color";

import { ImageFitTypes, ImageFormatTypes } from "./lib/enums";
import { ImageEdits } from "./lib/types";

/**
 * Maps Thumbor-style paths to sharp edits — a faithful port of the AWS ThumborMapper so
 * that URLs copied from a CloudFront deployment keep working unchanged on Cloud CDN.
 * Path shape: /[fit-in/][AxB:CxD/][WxH/][filters:f1(v):f2(v)/]key
 */
export class ThumborMapper {
  private static readonly EMPTY_IMAGE_EDITS: ImageEdits = {};

  public mapPathToEdits(path: string): ImageEdits {
    const fileFormat = path.substring(path.lastIndexOf(".") + 1) as ImageFormatTypes;

    let edits: ImageEdits = this.mergeEdits(this.mapCrop(path), this.mapResize(path), this.mapFitIn(path));

    // Apply filters in alphabetical order (AWS sorts so `format` lands before `quality`).
    const filters = path.match(/filters:[^)]+\)/g);
    if (filters) {
      const sorted = [...filters].sort();
      for (const filter of sorted) {
        edits = this.mapFilter(filter, fileFormat, edits);
      }
    }
    return edits;
  }

  /** Extracts the storage object key from a Thumbor path (after optional rewrite). */
  public parseImageKey(path: string, bucketPrefixRemoved = true): string {
    let key = path
      .replace(/\d+x\d+:\d+x\d+(\/|%2F)/g, "")
      .replace(/\d+x\d+(\/|%2F)/g, "")
      .replace(/filters:watermark\(.*\)/u, "")
      .replace(/filters:[^/]+/g, "")
      .replace(/(\/|%2F)fit-in(\/|%2F)/g, "")
      .replace(/^\/+/g, "")
      .replace(/^\/+|\/+$/g, "");
    if (bucketPrefixRemoved) {
      key = key.replace(/^(s3|gs):[^/\s]+\/+/, "");
    }
    return decodeURIComponent(key.replace(/\/+/g, "/"));
  }

  /**
   * Returns the bucket override embedded in the path (`s3:<bucket>/` — kept for AWS
   * compatibility — or the GCP-native `gs:<bucket>/`), or null when absent.
   */
  public parseBucketOverride(path: string): string | null {
    const match = path.match(/(?:^|\/)(?:s3|gs):([^/\s]+)\//);
    return match ? match[1] : null;
  }

  private mapCrop(path: string): ImageEdits {
    const cropMatch = path.match(/(\d{1,6})x(\d{1,6}):(\d{1,6})x(\d{1,6})/);
    if (cropMatch) {
      const [, left, top, right, bottom] = cropMatch.map(Number);
      if (!Number.isNaN(left) && !Number.isNaN(top) && !Number.isNaN(right) && !Number.isNaN(bottom)) {
        return { crop: { left, top, width: right - left, height: bottom - top } };
      }
    }
    return ThumborMapper.EMPTY_IMAGE_EDITS;
  }

  private mapResize(path: string): ImageEdits {
    // First WxH (or 0xH / Wx0) segment only, to avoid matching dimensions in file names.
    const resizeMatch = path.match(/\/((\d+x\d+)|(0x\d+)|(\d+x0))\//);
    if (resizeMatch) {
      const [width, height] = resizeMatch[1].split("x").map(Number);
      const resize: ImageEdits = {
        width: width === 0 ? null : width,
        height: height === 0 ? null : height,
      };
      if (width === 0 || height === 0) {
        resize.fit = ImageFitTypes.INSIDE;
      }
      return { resize };
    }
    return ThumborMapper.EMPTY_IMAGE_EDITS;
  }

  private mapFitIn(path: string): ImageEdits {
    return path.includes("fit-in") ? { resize: { fit: ImageFitTypes.INSIDE } } : ThumborMapper.EMPTY_IMAGE_EDITS;
  }

  private mergeEdits(...edits: ImageEdits[]): ImageEdits {
    return edits.reduce((result, current) => {
      for (const [key, value] of Object.entries(current)) {
        if (typeof value === "object" && value !== null && !Array.isArray(value) && typeof result[key] === "object") {
          result[key] = { ...result[key], ...value };
        } else {
          result[key] = value;
        }
      }
      return result;
    }, {} as ImageEdits);
  }

  // eslint-disable-next-line complexity
  private mapFilter(filter: string, fileFormat: ImageFormatTypes, previousEdits: ImageEdits): ImageEdits {
    const [, filterName, filterValue] = filter.match(/filters:(\w+)\((.*)\)/) ?? [];
    const edits: ImageEdits = { ...previousEdits };

    switch (filterName) {
      case "autojpg": {
        edits.toFormat = ImageFormatTypes.JPEG;
        break;
      }
      case "background_color": {
        edits.flatten = { background: this.parseColor(filterValue) };
        break;
      }
      case "blur": {
        const [radius, sigma] = filterValue.split(",").map(Number);
        edits.blur = !Number.isNaN(sigma) && sigma !== undefined ? sigma : radius / 2;
        break;
      }
      case "convolution": {
        const [matrix, width] = filterValue.split(",");
        const kernel = matrix.split(";").map(Number);
        const kernelWidth = Number(width);
        edits.convolve = {
          width: kernelWidth,
          height: Math.ceil(kernel.length / kernelWidth),
          kernel,
        };
        break;
      }
      case "equalize": {
        edits.normalize = true;
        break;
      }
      case "fill": {
        edits.resize = edits.resize ?? {};
        edits.resize.fit = ImageFitTypes.CONTAIN;
        edits.resize.background = this.parseColor(filterValue);
        break;
      }
      case "format": {
        const format = filterValue.replace(/[^0-9a-z]/gi, "").toLowerCase();
        const allowed = ["heic", "heif", "jpeg", "png", "raw", "tiff", "webp", "gif", "avif"];
        const mapped = format === "jpg" ? "jpeg" : format;
        if (allowed.includes(mapped)) {
          edits.toFormat = mapped as ImageFormatTypes;
        }
        break;
      }
      case "grayscale": {
        edits.grayscale = true;
        break;
      }
      case "no_upscale": {
        edits.resize = edits.resize ?? {};
        edits.resize.withoutEnlargement = true;
        break;
      }
      case "proportion": {
        const ratio = Number(filterValue);
        if (edits.resize && typeof edits.resize.width === "number" && typeof edits.resize.height === "number") {
          edits.resize.width = Number(edits.resize.width * ratio);
          edits.resize.height = Number(edits.resize.height * ratio);
        } else {
          edits.resize = edits.resize ?? {};
          edits.resize.ratio = ratio;
        }
        break;
      }
      case "quality": {
        const quality = Number(filterValue);
        if (!Number.isNaN(quality)) {
          const target = edits.toFormat ?? (fileFormat === ImageFormatTypes.JPG ? ImageFormatTypes.JPEG : fileFormat);
          const key = target === ImageFormatTypes.JPG ? ImageFormatTypes.JPEG : target;
          if (["jpeg", "png", "webp", "tiff", "heif", "gif", "avif"].includes(key)) {
            edits[key] = { ...edits[key], quality };
          }
        }
        break;
      }
      case "rgb": {
        const [r, g, b] = filterValue.split(",").map((v) => Math.min(255, Math.max(0, 255 * (Number(v) / 100))));
        edits.tint = { r, g, b };
        break;
      }
      case "rotate": {
        if (filterValue === "" || filterValue === undefined) {
          edits.rotate = undefined; // triggers sharp auto-orientation from EXIF
        } else {
          edits.rotate = Number(filterValue);
        }
        break;
      }
      case "sharpen": {
        const values = filterValue.split(",").map(Number);
        edits.sharpen = 1 + values[1] / 2;
        break;
      }
      case "stretch": {
        edits.resize = edits.resize ?? {};
        if (edits.resize.fit !== ImageFitTypes.INSIDE) {
          edits.resize.fit = ImageFitTypes.FILL;
        }
        break;
      }
      case "strip_exif": {
        edits.stripExif = true;
        break;
      }
      case "strip_icc": {
        edits.stripIcc = true;
        break;
      }
      case "upscale": {
        edits.resize = edits.resize ?? {};
        edits.resize.fit = ImageFitTypes.INSIDE;
        break;
      }
      case "watermark": {
        const parts = filterValue.replace(/\s+/g, "").split(",");
        const [bucket, key, xPos, yPos, alpha, wRatio, hRatio] = parts;
        edits.overlayWith = {
          bucket,
          key,
          alpha,
          wRatio,
          hRatio,
          options: {
            ...(this.parsePosition(xPos) !== undefined && { left: this.parsePosition(xPos) }),
            ...(this.parsePosition(yPos) !== undefined && { top: this.parsePosition(yPos) }),
          },
        };
        break;
      }
      case "animated": {
        edits.animated = filterValue.toLowerCase() !== "false";
        break;
      }
      case "smart_crop": {
        const [faceIndex, padding] = filterValue.split(",").map((v) => parseInt(v, 10));
        edits.smartCrop = {
          faceIndex: Number.isNaN(faceIndex) ? undefined : faceIndex,
          padding: Number.isNaN(padding) ? undefined : padding,
        };
        break;
      }
      default:
        break; // unknown filters are ignored, matching AWS behavior
    }
    return edits;
  }

  private parseColor(value: string): { r: number; g: number; b: number; alpha?: number } {
    try {
      const color = Color(value);
      return { r: color.red(), g: color.green(), b: color.blue(), alpha: 1 };
    } catch {
      const color = Color(`#${value}`);
      return { r: color.red(), g: color.green(), b: color.blue(), alpha: 1 };
    }
  }

  /** Positions accept plain numbers or `NNp` percentages (kept as strings for the handler). */
  private parsePosition(value?: string): number | string | undefined {
    if (value === undefined || value === "") return undefined;
    if (/^(100|[1-9]?\d|-(100|[1-9]\d?))p$/.test(value)) return value;
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  }
}
