import "../mock";

import { ImageRequest } from "../../src/image-request";
import { RequestTypes } from "../../src/lib/enums";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { expectError, toDefaultPath } from "../helpers";

describe("parseRequestType", () => {
  const OLD_ENV = { ...process.env };
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("should return DEFAULT for a base64-encoded JSON path", () => {
    const path = toDefaultPath({ bucket: "source-bucket", key: "test.png" });
    expect(imageRequest.parseRequestType({ path })).toEqual(RequestTypes.DEFAULT);
  });

  it("should return DEFAULT for a base64-charset path even when the payload is not JSON (AWS regex-only quirk)", () => {
    // AWS decides DEFAULT purely on the base64 regex; decoding fails later with
    // 400 DecodeRequest::CannotDecodeRequest. Kept identical for migrations.
    const path = `/${Buffer.from("hello").toString("base64")}`; // aGVsbG8= — no extension
    expect(imageRequest.parseRequestType({ path })).toEqual(RequestTypes.DEFAULT);
  });

  it("should NOT return DEFAULT when the path contains non-base64 characters", () => {
    expect(imageRequest.parseRequestType({ path: "/folder/extensionless-image" })).toEqual(RequestTypes.THUMBOR);
  });

  it("should return CUSTOM when both rewrite env variables are set", () => {
    process.env.REWRITE_MATCH_PATTERN = "/thumb/";
    process.env.REWRITE_SUBSTITUTION = "/images/";
    expect(imageRequest.parseRequestType({ path: "/thumb/some-image.unknown" })).toEqual(RequestTypes.CUSTOM);
  });

  it("should prefer DEFAULT over CUSTOM when the path is a decodable base64 request", () => {
    process.env.REWRITE_MATCH_PATTERN = "/thumb/";
    process.env.REWRITE_SUBSTITUTION = "/images/";
    const path = toDefaultPath({ key: "test.png" });
    expect(imageRequest.parseRequestType({ path })).toEqual(RequestTypes.DEFAULT);
  });

  it.each([".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".svg", ".gif", ".avif"])(
    "should return THUMBOR for a path ending in %s",
    (ext) => {
      expect(imageRequest.parseRequestType({ path: `/100x80/test-image${ext}` })).toEqual(RequestTypes.THUMBOR);
    }
  );

  it("should match known extensions case-insensitively", () => {
    expect(imageRequest.parseRequestType({ path: "/test.JPG" })).toEqual(RequestTypes.THUMBOR);
  });

  it("should return THUMBOR for a path without an extension", () => {
    expect(imageRequest.parseRequestType({ path: "/folder/extensionless-image" })).toEqual(RequestTypes.THUMBOR);
  });

  it("should throw RequestTypeError for an unsupported extension", async () => {
    await expectError(
      () => imageRequest.parseRequestType({ path: "/image.txt" }),
      400,
      "RequestTypeError",
      "could not be processed"
    );
  });
});
