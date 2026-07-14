import { ParsedQs } from "qs";

import { ImageHandler } from "./image-handler";
import { ImageRequest } from "./image-request";
import { ERROR_CACHE_CONTROL_4XX, ERROR_CACHE_CONTROL_5XX } from "./lib/constants";
import { StatusCodes } from "./lib/enums";
import { ImageHandlerError, INTERNAL_ERROR_BODY } from "./lib/image-handler-error";
import { Headers } from "./lib/types";
import { normalizeEvent } from "./request-normalizer";
import { SecretProvider } from "./secret-provider";
import { StorageProvider } from "./storage-provider";
import { ThumborMapper } from "./thumbor-mapper";
import { VisionClient } from "./vision-client";

export interface HandlerResult {
  statusCode: number;
  headers: Headers;
  body: Buffer | string;
}

// Singletons (one per Cloud Run instance), mirroring Lambda's container reuse.
const storageProvider = new StorageProvider();
const secretProvider = new SecretProvider();
const visionClient = new VisionClient();

/**
 * Orchestrates a single request — the equivalent of the AWS Lambda handler() in
 * source/image-handler/index.ts: normalize → parse/validate → process → respond,
 * with the same header assembly and fallback-image semantics.
 */
export async function handleRequest(
  rawPath: string,
  rawQuery: ParsedQs,
  rawHeaders: Record<string, string>
): Promise<HandlerResult> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawQuery)) {
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)));
    } else if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  }
  const event = normalizeEvent(rawPath, searchParams, rawHeaders);
  const imageRequest = new ImageRequest(storageProvider, secretProvider);
  const imageHandler = new ImageHandler(storageProvider, visionClient);
  const isAlb = false; // Cloud Run behind ALB-equivalent (global LB); keep AWS non-ALB headers

  try {
    const requestInfo = await imageRequest.setup(event);
    const processed = await imageHandler.process(requestInfo);

    const headers: Headers = {};
    headers["Cache-Control"] = requestInfo.cacheControl ?? "max-age=31536000,public";
    if (requestInfo.headers) {
      Object.assign(headers, requestInfo.headers);
    }
    Object.assign(headers, getCorsHeaders(isAlb));
    headers["Content-Type"] = requestInfo.contentType ?? "image";
    if (requestInfo.expires) headers["Expires"] = requestInfo.expires;
    if (requestInfo.lastModified) headers["Last-Modified"] = requestInfo.lastModified;

    return { statusCode: StatusCodes.OK, headers, body: processed };
  } catch (error) {
    console.error(
      JSON.stringify({
        severity: "ERROR",
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof ImageHandlerError ? error.code : "InternalError",
        path: rawPath,
      })
    );

    const { ENABLE_DEFAULT_FALLBACK_IMAGE, DEFAULT_FALLBACK_IMAGE_BUCKET, DEFAULT_FALLBACK_IMAGE_KEY } = process.env;
    if (
      ENABLE_DEFAULT_FALLBACK_IMAGE === "Yes" &&
      DEFAULT_FALLBACK_IMAGE_BUCKET?.trim() &&
      DEFAULT_FALLBACK_IMAGE_KEY?.trim()
    ) {
      try {
        const fallback = await storageProvider.getObject(DEFAULT_FALLBACK_IMAGE_BUCKET, DEFAULT_FALLBACK_IMAGE_KEY);
        const status = error instanceof ImageHandlerError ? error.status : StatusCodes.INTERNAL_SERVER_ERROR;
        const headers: Headers = {
          "Cache-Control": fallback.cacheControl ?? "max-age=31536000,public",
          ...getCorsHeaders(isAlb),
        };
        if (fallback.contentType) headers["Content-Type"] = fallback.contentType;
        if (fallback.lastModified) headers["Last-Modified"] = fallback.lastModified;
        return { statusCode: status, headers, body: fallback.originalImage };
      } catch {
        // fall through to the JSON error response
      }
    }

    if (error instanceof ImageHandlerError) {
      return {
        statusCode: error.status,
        headers: errorHeaders(error.status, isAlb),
        body: JSON.stringify(error.toJSON()),
      };
    }
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      headers: errorHeaders(StatusCodes.INTERNAL_SERVER_ERROR, isAlb),
      body: JSON.stringify(INTERNAL_ERROR_BODY),
    };
  }
}

function getCorsHeaders(isAlb: boolean): Headers {
  const headers: Headers = {
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (!isAlb) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  if (process.env.CORS_ENABLED === "Yes") {
    headers["Access-Control-Allow-Origin"] = process.env.CORS_ORIGIN ?? "*";
  }
  return headers;
}

function errorHeaders(status: number, isAlb: boolean): Headers {
  return {
    ...getCorsHeaders(isAlb),
    "Content-Type": "application/json",
    "Cache-Control": status < 500 ? ERROR_CACHE_CONTROL_4XX : ERROR_CACHE_CONTROL_5XX,
  };
}
