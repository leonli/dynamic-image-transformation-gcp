import "../mock";

import { ImageRequest } from "../../src/image-request";
import { RequestTypes } from "../../src/lib/enums";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { expectError, toDefaultPath } from "../helpers";

describe("parseImageBucket", () => {
  const OLD_ENV = { ...process.env };
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  describe("DEFAULT requests", () => {
    it("should use the bucket from the request when allowlisted", () => {
      const path = toDefaultPath({ bucket: "bucket-b", key: "test.png" });
      expect(imageRequest.parseImageBucket({ path }, RequestTypes.DEFAULT)).toEqual("bucket-b");
    });

    it("should throw 403 ImageBucket::CannotAccessBucket for a non-allowlisted bucket", async () => {
      const path = toDefaultPath({ bucket: "not-allowed", key: "test.png" });
      await expectError(
        () => imageRequest.parseImageBucket({ path }, RequestTypes.DEFAULT),
        403,
        "ImageBucket::CannotAccessBucket",
        "could not be accessed"
      );
    });

    it("should default to the first allowlisted bucket when the request has none", () => {
      const path = toDefaultPath({ key: "test.png" });
      expect(imageRequest.parseImageBucket({ path }, RequestTypes.DEFAULT)).toEqual("source-bucket");
    });

    it("should resolve a BUCKET_MAP alias to the mapped GCS bucket", () => {
      process.env.BUCKET_MAP = "legacy-s3-bucket=bucket-b";
      const path = toDefaultPath({ bucket: "legacy-s3-bucket", key: "test.png" });
      expect(imageRequest.parseImageBucket({ path }, RequestTypes.DEFAULT)).toEqual("bucket-b");
    });

    it("should reject a BUCKET_MAP alias whose target is not allowlisted", async () => {
      process.env.BUCKET_MAP = "legacy-s3-bucket=not-allowed";
      const path = toDefaultPath({ bucket: "legacy-s3-bucket", key: "test.png" });
      await expectError(
        () => imageRequest.parseImageBucket({ path }, RequestTypes.DEFAULT),
        403,
        "ImageBucket::CannotAccessBucket"
      );
    });
  });

  describe("THUMBOR requests", () => {
    it("should use the gs:<bucket>/ path override when allowlisted", () => {
      expect(imageRequest.parseImageBucket({ path: "/gs:bucket-b/test.png" }, RequestTypes.THUMBOR)).toEqual("bucket-b");
    });

    it("should use the s3:<bucket>/ path override for AWS-compatible URLs", () => {
      expect(imageRequest.parseImageBucket({ path: "/s3:bucket-b/test.png" }, RequestTypes.THUMBOR)).toEqual("bucket-b");
    });

    it("should ignore a non-allowlisted override and fall back to the default bucket", () => {
      expect(imageRequest.parseImageBucket({ path: "/s3:not-allowed/test.png" }, RequestTypes.THUMBOR)).toEqual(
        "source-bucket"
      );
    });

    it("should map an s3: override through BUCKET_MAP", () => {
      process.env.BUCKET_MAP = "legacy-s3-bucket=bucket-b";
      expect(imageRequest.parseImageBucket({ path: "/s3:legacy-s3-bucket/test.png" }, RequestTypes.THUMBOR)).toEqual(
        "bucket-b"
      );
    });

    it("should use the default bucket when no override is present", () => {
      expect(imageRequest.parseImageBucket({ path: "/100x80/test.png" }, RequestTypes.THUMBOR)).toEqual("source-bucket");
    });
  });
});

describe("getAllowedSourceBuckets", () => {
  const OLD_ENV = { ...process.env };
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("should split SOURCE_BUCKETS on commas and strip whitespace", () => {
    expect(imageRequest.getAllowedSourceBuckets()).toEqual(["source-bucket", "bucket-b"]);
  });

  it("should throw 400 GetAllowedSourceBuckets::NoSourceBuckets when empty", async () => {
    process.env.SOURCE_BUCKETS = "";
    await expectError(
      () => imageRequest.getAllowedSourceBuckets(),
      400,
      "GetAllowedSourceBuckets::NoSourceBuckets",
      "SOURCE_BUCKETS"
    );
  });
});
