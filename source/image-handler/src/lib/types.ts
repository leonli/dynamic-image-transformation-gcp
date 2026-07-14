// Type definitions mirroring the AWS solution's image-handler interfaces.

import { ImageFormatTypes, RequestTypes, StatusCodes } from "./enums";

export type Headers = Record<string, string>;

export interface ImageEdits {
  // Free-form edit map; keys are validated against the allowlists in constants.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** JSON body of a DEFAULT (base64-encoded) request — identical to AWS DefaultImageRequest. */
export interface DefaultImageRequest {
  bucket?: string;
  key: string;
  edits?: ImageEdits;
  outputFormat?: ImageFormatTypes;
  effort?: number;
  headers?: Headers;
}

/** Fully parsed request handed to ImageHandler — mirrors AWS ImageRequestInfo. */
export interface ImageRequestInfo {
  requestType: RequestTypes;
  bucket: string;
  key: string;
  edits?: ImageEdits;
  outputFormat?: ImageFormatTypes;
  effort?: number;
  headers?: Headers;
  originalImage: Buffer;
  /** Metadata of the original GCS object (maps S3 GetObject response fields). */
  contentType?: string;
  expires?: string;
  lastModified?: string;
  cacheControl?: string;
  secondsToExpiry?: number;
}

/** Normalized incoming HTTP event, equivalent to the API Gateway proxy event in AWS. */
export interface ImageHandlerEvent {
  path: string;
  queryStringParameters?: Record<string, string> | null;
  requestContext?: Record<string, unknown>;
  headers?: Headers;
}

export interface ImageHandlerExecutionResult {
  statusCode: StatusCodes;
  isBase64Encoded: boolean;
  headers: Headers;
  body: string | Buffer;
}

/** Rekognition-style normalized bounding box (all values in [0,1]). */
export interface BoundingBox {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface BoxSize {
  height: number;
  width: number;
}

/** Original-image fetch result from GCS. */
export interface OriginalImageInfo {
  originalImage: Buffer;
  contentType?: string;
  expires?: string;
  lastModified?: string;
  cacheControl?: string;
}
