import { Storage } from "@google-cloud/storage";

import { StatusCodes } from "./lib/enums";
import { ImageHandlerError } from "./lib/image-handler-error";
import { OriginalImageInfo } from "./lib/types";

/**
 * GCS wrapper standing in for S3 GetObject. Returns the object bytes plus the metadata
 * fields the response builder propagates (Content-Type, Cache-Control, Expires,
 * Last-Modified) — same shape the AWS handler reads off the S3 response.
 */
export class StorageProvider {
  constructor(private readonly storage: Storage = new Storage()) {}

  public async getObject(bucket: string, key: string): Promise<OriginalImageInfo> {
    try {
      const file = this.storage.bucket(bucket).file(key);
      const [metadata] = await file.getMetadata();
      const [contents] = await file.download();
      return {
        originalImage: Buffer.from(contents),
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : undefined,
        cacheControl: typeof metadata.cacheControl === "string" ? metadata.cacheControl : undefined,
        lastModified: metadata.updated ? new Date(metadata.updated as string).toUTCString() : undefined,
        // GCS has no per-object Expires header field; custom metadata "expires" is honored.
        expires:
          metadata.metadata && typeof (metadata.metadata as Record<string, unknown>).expires === "string"
            ? ((metadata.metadata as Record<string, string>).expires as string)
            : undefined,
      };
    } catch (error) {
      if (error instanceof ImageHandlerError) throw error;
      // Any storage failure surfaces as the AWS-identical 404 NoSuchKey.
      throw new ImageHandlerError(
        StatusCodes.NOT_FOUND,
        "NoSuchKey",
        `The image ${key} does not exist or the request may not be base64 encoded properly.`
      );
    }
  }
}
