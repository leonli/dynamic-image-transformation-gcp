import { givenStorageFailure, givenStorageObject, mockStorage, mockStorageBucket } from "../mock";

import { ImageRequest } from "../../src/image-request";
import { ImageFormatTypes, RequestTypes } from "../../src/lib/enums";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { createImage, expectError, toDefaultPath } from "../helpers";

describe("ImageRequest.setup end-to-end", () => {
  const OLD_ENV = { ...process.env };
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("should assemble the full ImageRequestInfo for a DEFAULT request", async () => {
    const image = await createImage();
    givenStorageObject(image, {
      contentType: "image/png",
      cacheControl: "max-age=300,public",
      updated: "2026-01-01T00:00:00.000Z",
      metadata: { expires: "Tue, 01 Jan 2030 00:00:00 GMT" },
    });
    const path = toDefaultPath({
      bucket: "source-bucket",
      key: "test.png",
      edits: { grayscale: true },
      outputFormat: "jpeg",
      effort: 7,
      headers: { "X-Custom": "1", Authorization: "denied" },
    });

    const info = await imageRequest.setup({ path });

    expect(info).toMatchObject({
      requestType: RequestTypes.DEFAULT,
      bucket: "source-bucket",
      key: "test.png",
      edits: { grayscale: true },
      headers: { "X-Custom": "1" },
      outputFormat: ImageFormatTypes.JPEG,
      effort: 4, // 7 is out of range → default 4
      contentType: "image/jpeg", // overridden by the format conversion
      cacheControl: "max-age=300,public",
      expires: "Tue, 01 Jan 2030 00:00:00 GMT",
    });
    expect(info.originalImage).toEqual(image);
    expect(info.lastModified).toEqual(new Date("2026-01-01T00:00:00.000Z").toUTCString());
    expect(mockStorage.bucket).toHaveBeenCalledWith("source-bucket");
    expect(mockStorageBucket.file).toHaveBeenCalledWith("test.png");
  });

  it("should truncate a fractional in-range effort", async () => {
    givenStorageObject(await createImage(), { contentType: "image/png" });
    const path = toDefaultPath({ key: "test.png", outputFormat: "webp", effort: 2.9 });
    const info = await imageRequest.setup({ path });
    expect(info.effort).toEqual(2);
  });

  it("should assemble a THUMBOR request and infer the content type from magic bytes", async () => {
    const jpeg = await createImage(100, 80, { r: 255, g: 0, b: 0, alpha: 1 }, "jpeg");
    givenStorageObject(jpeg, {}); // no contentType metadata
    const info = await imageRequest.setup({ path: "/100x80/filters:grayscale()/test.jpg" });
    expect(info).toMatchObject({
      requestType: RequestTypes.THUMBOR,
      bucket: "source-bucket",
      key: "test.jpg",
      edits: { resize: { width: 100, height: 80 }, grayscale: true },
      contentType: "image/jpeg",
      cacheControl: "max-age=31536000,public",
    });
    expect(info.headers).toBeUndefined();
  });

  it("should let edits.toFormat win over both AUTO_WEBP and the JSON outputFormat", async () => {
    process.env.AUTO_WEBP = "Yes";
    givenStorageObject(await createImage(), { contentType: "image/png" });
    const path = toDefaultPath({ key: "test.png", edits: { toFormat: "jpg" }, outputFormat: "png" });
    const info = await imageRequest.setup({ path, headers: { accept: "image/webp" } });
    expect(info.outputFormat).toEqual(ImageFormatTypes.JPEG); // jpg normalized
    expect(info.contentType).toEqual("image/jpeg");
  });

  it("should let AUTO_WEBP win over the JSON outputFormat", async () => {
    process.env.AUTO_WEBP = "Yes";
    givenStorageObject(await createImage(), { contentType: "image/png" });
    const path = toDefaultPath({ key: "test.png", outputFormat: "png" });
    const info = await imageRequest.setup({ path, headers: { accept: "image/webp" } });
    expect(info.outputFormat).toEqual(ImageFormatTypes.WEBP);
    expect(info.contentType).toEqual("image/webp");
  });

  it("should apply AUTO_WEBP to THUMBOR requests", async () => {
    process.env.AUTO_WEBP = "Yes";
    givenStorageObject(await createImage(), { contentType: "image/png" });
    const info = await imageRequest.setup({ path: "/test.png", headers: { accept: "image/webp" } });
    expect(info.outputFormat).toEqual(ImageFormatTypes.WEBP);
    expect(info.contentType).toEqual("image/webp");
  });

  it("should surface a storage failure as 404 NoSuchKey with the AWS-compatible message", async () => {
    givenStorageFailure();
    await expectError(
      imageRequest.setup({ path: "/missing.png" }),
      404,
      "NoSuchKey",
      "The image missing.png does not exist or the request may not be base64 encoded properly."
    );
  });
});
