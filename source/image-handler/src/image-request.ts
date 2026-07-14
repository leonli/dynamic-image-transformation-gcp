import { createHmac } from "crypto";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";

import { ALLOWED_EDIT_KEYS, DEFAULT_CACHE_CONTROL, HEADER_DENY_PATTERNS } from "./lib/constants";
import { ImageFormatTypes, RequestTypes, StatusCodes } from "./lib/enums";
import { ImageHandlerError } from "./lib/image-handler-error";
import { DefaultImageRequest, Headers, ImageEdits, ImageHandlerEvent, ImageRequestInfo } from "./lib/types";
import { QueryParamMapper } from "./query-param-mapper";
import { SecretProvider } from "./secret-provider";
import { StorageProvider } from "./storage-provider";
import { ThumborMapper } from "./thumbor-mapper";

dayjs.extend(utc);
dayjs.extend(customParseFormat);

/**
 * Parses and validates the incoming request into an ImageRequestInfo — a faithful port
 * of the AWS ImageRequest class (image-request.ts), swapping S3 for GCS and Secrets
 * Manager for Secret Manager.
 */
export class ImageRequest {
  private static readonly MATCH_DEFAULT = /^(\/?)([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

  constructor(
    private readonly storageProvider: StorageProvider,
    private readonly secretProvider: SecretProvider,
    private readonly thumborMapper: ThumborMapper = new ThumborMapper(),
    private readonly queryParamMapper: QueryParamMapper = new QueryParamMapper()
  ) {}

  public async setup(event: ImageHandlerEvent): Promise<ImageRequestInfo> {
    await this.validateRequestSignature(event);

    const requestType = this.parseRequestType(event);
    const bucket = this.parseImageBucket(event, requestType);
    const key = this.parseImageKey(event, requestType);
    const edits = this.parseImageEdits(event, requestType);
    const headers = this.parseImageHeaders(event, requestType);

    const original = await this.storageProvider.getObject(bucket, key);

    const info: ImageRequestInfo = {
      requestType,
      bucket,
      key,
      edits,
      headers,
      originalImage: original.originalImage,
      contentType: original.contentType ?? this.inferImageType(original.originalImage),
      expires: original.expires,
      lastModified: original.lastModified,
      cacheControl: original.cacheControl ?? DEFAULT_CACHE_CONTROL,
    };

    if (requestType === RequestTypes.DEFAULT) {
      const decoded = this.decodeRequest(event);
      info.outputFormat = this.getOutputFormat(event, requestType, decoded.outputFormat);
      info.effort = this.parseEffort(decoded.effort);
    } else {
      info.outputFormat = this.getOutputFormat(event, requestType);
    }

    // Highest precedence (AWS parity): an explicit edits.toFormat wins over both
    // AUTO_WEBP and the DEFAULT-request outputFormat field.
    if (info.edits?.toFormat) {
      info.outputFormat =
        info.edits.toFormat === ImageFormatTypes.JPG ? ImageFormatTypes.JPEG : (info.edits.toFormat as ImageFormatTypes);
    }

    // ?expires= handling (independent of signatures, may rewrite Cache-Control)
    const expiresParam = event.queryStringParameters?.expires;
    if (expiresParam !== undefined) {
      const expiry = dayjs.utc(expiresParam, "YYYYMMDDTHHmmss[Z]", true);
      if (!expiry.isValid()) {
        throw new ImageHandlerError(
          StatusCodes.BAD_REQUEST,
          "ImageRequestExpiryFormat",
          "Request has invalid expires value. Should be in YYYYMMDDTHHmmssZ format."
        );
      }
      const seconds = expiry.diff(dayjs.utc(), "second");
      if (seconds <= 0) {
        throw new ImageHandlerError(StatusCodes.BAD_REQUEST, "ImageRequestExpired", "Request has expired.");
      }
      info.secondsToExpiry = seconds;
      info.cacheControl = `max-age=${seconds},public`;
    }

    // Content-Type override when a format conversion is requested
    if (info.outputFormat) {
      info.contentType = `image/${info.outputFormat}`;
    }
    return info;
  }

  /** Request-type detection with the AWS precedence: DEFAULT → CUSTOM → THUMBOR → 400. */
  public parseRequestType(event: ImageHandlerEvent): RequestTypes {
    const { path } = event;

    // AWS parity: DEFAULT is decided by the base64 regex ALONE — no decode attempt.
    // A path made purely of base64 characters whose payload is not valid JSON gets
    // 400 DecodeRequest::CannotDecodeRequest later (same quirk as AWS, where such
    // keys are unreachable via Thumbor paths too).
    if (ImageRequest.MATCH_DEFAULT.test(path)) {
      return RequestTypes.DEFAULT;
    }
    const { REWRITE_MATCH_PATTERN, REWRITE_SUBSTITUTION } = process.env;
    if (REWRITE_MATCH_PATTERN && REWRITE_SUBSTITUTION) {
      return RequestTypes.CUSTOM;
    }
    const noExtension = /^((.(?!(\.[^.\\/]+$)))*$)/i;
    const knownExtension = /.*(\.jpg$|\.jpeg$|\.png$|\.webp$|\.tiff$|\.tif$|\.svg$|\.gif$|\.avif$)/i;
    if (noExtension.test(path) || knownExtension.test(path)) {
      return RequestTypes.THUMBOR;
    }
    throw new ImageHandlerError(
      StatusCodes.BAD_REQUEST,
      "RequestTypeError",
      "The type of request you are making could not be processed. Please ensure that your original image is of a supported file type (jpg/jpeg, png, tiff/tif, webp, svg, gif, avif) and that your image request is provided in the correct syntax. Refer to the documentation for additional guidance on forming image requests."
    );
  }

  public decodeRequest(event: ImageHandlerEvent): DefaultImageRequest {
    const { path } = event;
    if (!path) {
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "DecodeRequest::CannotReadPath",
        "The URL path you provided could not be read. Please ensure that it is properly formed according to the solution documentation."
      );
    }
    const decoded = this.tryDecode(path);
    if (decoded === null) {
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "DecodeRequest::CannotDecodeRequest",
        "The image request you provided could not be decoded. Please check that your request is base64 encoded properly and refer to the documentation for additional guidance."
      );
    }
    return decoded;
  }

  private tryDecode(path: string): DefaultImageRequest | null {
    try {
      const encoded = path.startsWith("/") ? path.slice(1) : path;
      if (encoded === "") return null;
      const json = Buffer.from(encoded, "base64").toString();
      const parsed = JSON.parse(json);
      return typeof parsed === "object" && parsed !== null ? (parsed as DefaultImageRequest) : null;
    } catch {
      return null;
    }
  }

  public getAllowedSourceBuckets(): string[] {
    const sourceBuckets = process.env.SOURCE_BUCKETS ?? "";
    const buckets = sourceBuckets
      .replace(/\s+/g, "")
      .split(",")
      .filter((bucket) => bucket !== "");
    if (buckets.length === 0) {
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "GetAllowedSourceBuckets::NoSourceBuckets",
        "The SOURCE_BUCKETS variable could not be read. Please check that it is not empty and contains at least one source bucket, or multiple buckets separated by commas. Spaces can be provided between commas and bucket names, these will be automatically parsed out when decoding."
      );
    }
    return buckets;
  }

  /** Optional S3→GCS bucket alias map (`s3name=gcsname,...`) for zero-touch migrations. */
  private mapBucketAlias(bucket: string): string {
    const map = process.env.BUCKET_MAP ?? "";
    if (!map) return bucket;
    for (const pair of map.replace(/\s+/g, "").split(",")) {
      const [from, to] = pair.split("=");
      if (from === bucket && to) return to;
    }
    return bucket;
  }

  public parseImageBucket(event: ImageHandlerEvent, requestType: RequestTypes): string {
    const allowed = this.getAllowedSourceBuckets();
    if (requestType === RequestTypes.DEFAULT) {
      const { bucket } = this.decodeRequest(event);
      if (bucket) {
        const mapped = this.mapBucketAlias(bucket);
        if (!allowed.includes(mapped) && !allowed.includes(bucket)) {
          throw new ImageHandlerError(
            StatusCodes.FORBIDDEN,
            "ImageBucket::CannotAccessBucket",
            "The bucket you specified could not be accessed. Please check that the bucket is specified in your SOURCE_BUCKETS."
          );
        }
        return allowed.includes(mapped) ? mapped : bucket;
      }
      return allowed[0];
    }
    // THUMBOR / CUSTOM: optional s3:<bucket>/ or gs:<bucket>/ override in the path
    const override = this.thumborMapper.parseBucketOverride(event.path);
    if (override) {
      const mapped = this.mapBucketAlias(override);
      if (allowed.includes(mapped)) return mapped;
      if (allowed.includes(override)) return override;
    }
    return allowed[0];
  }

  public parseImageEdits(event: ImageHandlerEvent, requestType: RequestTypes): ImageEdits {
    let edits: ImageEdits = {};
    if (requestType === RequestTypes.DEFAULT) {
      edits = { ...(this.decodeRequest(event).edits ?? {}) };
    } else if (requestType === RequestTypes.THUMBOR) {
      edits = this.thumborMapper.mapPathToEdits(event.path);
    } else if (requestType === RequestTypes.CUSTOM) {
      edits = this.thumborMapper.mapPathToEdits(this.parseCustomPath(event.path));
    }
    // Query-param edits layer on top for every request type.
    const query = event.queryStringParameters ?? {};
    const queryEdits = this.queryParamMapper.mapQueryParamsToEdits(query as Record<string, string>);
    for (const [key, value] of Object.entries(queryEdits)) {
      if (key === "resize" && typeof edits.resize === "object" && edits.resize !== null) {
        edits.resize = { ...edits.resize, ...value };
      } else {
        edits[key] = value;
      }
    }
    this.validateEditKeys(edits);
    return edits;
  }

  private validateEditKeys(edits: ImageEdits): void {
    for (const key of Object.keys(edits)) {
      if (!ALLOWED_EDIT_KEYS.has(key)) {
        throw new ImageHandlerError(
          StatusCodes.BAD_REQUEST,
          "ImageEdits::NotAllowed",
          `The edit ${key} is not allowed.`
        );
      }
    }
  }

  public parseImageKey(event: ImageHandlerEvent, requestType: RequestTypes): string {
    if (requestType === RequestTypes.DEFAULT) {
      const { key } = this.decodeRequest(event);
      if (!key) {
        throw new ImageHandlerError(
          StatusCodes.NOT_FOUND,
          "ImageEdits::CannotFindImage",
          "The image you specified could not be found. Please check your request syntax as well as the bucket you specified to ensure it exists."
        );
      }
      return key;
    }
    if (requestType === RequestTypes.THUMBOR) {
      return this.thumborMapper.parseImageKey(event.path);
    }
    if (requestType === RequestTypes.CUSTOM) {
      return this.thumborMapper.parseImageKey(this.parseCustomPath(event.path));
    }
    throw new ImageHandlerError(
      StatusCodes.NOT_FOUND,
      "ImageEdits::CannotFindImage",
      "The image you specified could not be found. Please check your request syntax as well as the bucket you specified to ensure it exists."
    );
  }

  public parseCustomPath(path: string): string {
    const { REWRITE_MATCH_PATTERN, REWRITE_SUBSTITUTION } = process.env;
    if (!REWRITE_MATCH_PATTERN || REWRITE_SUBSTITUTION === undefined) {
      throw new ImageHandlerError(StatusCodes.INTERNAL_SERVER_ERROR, "ParseCustomPath::ParsingError", "Parsing error");
    }
    // Pattern may arrive as "/regex/flags" — split flags off, mirroring AWS.
    const patternString = REWRITE_MATCH_PATTERN;
    const lastSlash = patternString.lastIndexOf("/");
    let regExp: RegExp;
    if (patternString.startsWith("/") && lastSlash > 0) {
      regExp = new RegExp(patternString.slice(1, lastSlash), patternString.slice(lastSlash + 1));
    } else {
      regExp = new RegExp(patternString);
    }
    return path.replace(regExp, REWRITE_SUBSTITUTION);
  }

  public parseImageHeaders(event: ImageHandlerEvent, requestType: RequestTypes): Headers | undefined {
    if (requestType !== RequestTypes.DEFAULT) return undefined;
    const { headers } = this.decodeRequest(event);
    if (!headers) return undefined;
    const filtered: Headers = {};
    for (const [name, value] of Object.entries(headers)) {
      if (!HEADER_DENY_PATTERNS.some((pattern) => pattern.test(name))) {
        filtered[name] = value;
      }
    }
    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  /**
   * Output format precedence (AWS-identical): edits.toFormat > AUTO_WEBP (Accept header)
   * > DEFAULT request outputFormat. `jpg` normalizes to `jpeg`.
   */
  public getOutputFormat(
    event: ImageHandlerEvent,
    requestType: RequestTypes,
    requestedFormat?: ImageFormatTypes
  ): ImageFormatTypes | undefined {
    const autoWebP = process.env.AUTO_WEBP === "Yes";
    const accept = event.headers?.accept ?? event.headers?.Accept ?? "";
    let output: ImageFormatTypes | undefined;
    if (autoWebP && accept.includes("image/webp")) {
      output = ImageFormatTypes.WEBP;
    }
    if (requestType === RequestTypes.DEFAULT && requestedFormat) {
      if (!output) output = requestedFormat;
    }
    if (output === ImageFormatTypes.JPG) output = ImageFormatTypes.JPEG;
    return output;
  }

  private parseEffort(effort?: number): number {
    if (effort === undefined || effort === null || Number.isNaN(Number(effort))) return 4;
    const truncated = Math.trunc(Number(effort));
    return truncated >= 0 && truncated <= 6 ? truncated : 4;
  }

  /** Infers Content-Type from magic bytes when the object metadata carries none. */
  public inferImageType(imageBuffer: Buffer): string {
    const hex = imageBuffer.subarray(0, 4).toString("hex").toUpperCase();
    switch (hex) {
      case "89504E47":
        return "image/png";
      case "52494646":
        return "image/webp";
      case "49492A00":
      case "4D4D002A":
        return "image/tiff";
      case "47494638":
        return "image/gif";
      default:
        break;
    }
    if (hex.startsWith("FFD8")) return "image/jpeg";
    if (imageBuffer.subarray(4, 12).toString("hex").toUpperCase() === "6674797061766966") return "image/avif";
    if (imageBuffer.subarray(0, 256).toString().toLowerCase().includes("<svg")) return "image/svg+xml";
    throw new ImageHandlerError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "RequestTypeError",
      "The file does not have an extension and the file type could not be inferred. Please ensure that your original image is of a supported file type (jpg/jpeg, png, tiff/tif, webp, svg, gif, avif). Refer to the documentation for additional guidance on forming image requests."
    );
  }

  /** HMAC-SHA256 request signature validation, byte-compatible with the AWS solution. */
  private async validateRequestSignature(event: ImageHandlerEvent): Promise<void> {
    if (process.env.ENABLE_SIGNATURE !== "Yes") return;

    const query = event.queryStringParameters ?? {};
    if (!query.signature) {
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "AuthorizationQueryParametersError",
        "Query-string requires the signature parameter."
      );
    }
    try {
      const queryString = Object.keys(query)
        .filter((key) => key !== "signature")
        .sort()
        .map((key) => `${key}=${(query as Record<string, string>)[key]}`)
        .join("&");
      const path = event.path.startsWith("/") ? event.path : `/${event.path}`;
      const stringToSign = queryString !== "" ? `${path}?${queryString}` : path;

      const secretString = await this.secretProvider.getSecret(process.env.SECRETS_MANAGER ?? "");
      const secretKey = JSON.parse(secretString)[process.env.SECRET_KEY ?? ""];
      const expected = createHmac("sha256", secretKey).update(stringToSign).digest("hex");
      if (expected !== query.signature) {
        throw new ImageHandlerError(StatusCodes.FORBIDDEN, "SignatureDoesNotMatch", "Signature does not match.");
      }
    } catch (error) {
      if (error instanceof ImageHandlerError && error.code === "SignatureDoesNotMatch") throw error;
      throw new ImageHandlerError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "SignatureValidationFailure",
        "Signature validation failed."
      );
    }
  }
}
