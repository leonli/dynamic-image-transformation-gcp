import { givenStorageObject, mockStorage } from "../mock";

import { ImageRequest } from "../../src/image-request";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { expectError, toDefaultPath } from "../helpers";

describe("decodeRequest", () => {
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  it("should decode a valid base64-encoded JSON request", () => {
    const request = { bucket: "source-bucket", key: "test-image-001.jpg", edits: { grayscale: true } };
    const result = imageRequest.decodeRequest({ path: toDefaultPath(request) });
    expect(result).toEqual(request);
  });

  it("should decode a request without a leading slash", () => {
    const request = { key: "test.png" };
    const encoded = Buffer.from(JSON.stringify(request)).toString("base64");
    expect(imageRequest.decodeRequest({ path: encoded })).toEqual(request);
  });

  it("should throw DecodeRequest::CannotDecodeRequest for a non-decodable path", async () => {
    await expectError(
      () => imageRequest.decodeRequest({ path: "/someNonBase64EncodedContentHere" }),
      400,
      "DecodeRequest::CannotDecodeRequest",
      "could not be decoded"
    );
  });

  it("should throw DecodeRequest::CannotDecodeRequest when the payload is valid base64 but not JSON", async () => {
    const path = `/${Buffer.from("hello world").toString("base64")}`;
    await expectError(() => imageRequest.decodeRequest({ path }), 400, "DecodeRequest::CannotDecodeRequest");
  });

  it("should throw DecodeRequest::CannotDecodeRequest when the payload decodes to a JSON scalar", async () => {
    const path = `/${Buffer.from("123").toString("base64")}`;
    await expectError(() => imageRequest.decodeRequest({ path }), 400, "DecodeRequest::CannotDecodeRequest");
  });

  it("should throw DecodeRequest::CannotReadPath for an empty path", async () => {
    await expectError(() => imageRequest.decodeRequest({ path: "" }), 400, "DecodeRequest::CannotReadPath");
  });

  it("wires the mocked Storage client (sanity check for the shared mocks)", async () => {
    givenStorageObject(Buffer.from("test"), { contentType: "image/png" });
    const provider = new StorageProvider();
    const result = await provider.getObject("source-bucket", "key.png");
    expect(mockStorage.bucket).toHaveBeenCalledWith("source-bucket");
    expect(result.originalImage).toEqual(Buffer.from("test"));
    expect(result.contentType).toEqual("image/png");
  });
});
