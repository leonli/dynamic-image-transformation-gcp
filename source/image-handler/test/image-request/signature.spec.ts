import { givenSecret, givenStorageObject, mockSecretManager } from "../mock";

import { createHmac } from "crypto";

import { ImageRequest } from "../../src/image-request";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { createImage, expectError } from "../helpers";

describe("request signature validation", () => {
  const OLD_ENV = { ...process.env };
  const SECRET = "shhh-secret-value";

  const sign = (stringToSign: string): string => createHmac("sha256", SECRET).update(stringToSign).digest("hex");
  const newImageRequest = () => new ImageRequest(new StorageProvider(), new SecretProvider());

  beforeEach(async () => {
    process.env.ENABLE_SIGNATURE = "Yes";
    process.env.SECRETS_MANAGER = "image-handler-secret";
    process.env.SECRET_KEY = "signature-key";
    givenSecret({ "signature-key": SECRET });
    givenStorageObject(await createImage(), { contentType: "image/png" });
    mockSecretManager.accessSecretVersion.mockClear();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("should accept a request with a valid signature", async () => {
    const event = { path: "/test.png", queryStringParameters: { signature: sign("/test.png") } };
    const info = await newImageRequest().setup(event);
    expect(info.key).toEqual("test.png");
  });

  it("should include sorted non-signature query parameters in the string to sign", async () => {
    const stringToSign = "/test.png?expires=20990101T000000Z";
    const event = {
      path: "/test.png",
      queryStringParameters: { signature: sign(stringToSign), expires: "20990101T000000Z" },
    };
    const info = await newImageRequest().setup(event);
    expect(info.key).toEqual("test.png");
  });

  it("should throw 400 AuthorizationQueryParametersError when the signature parameter is missing", async () => {
    await expectError(
      newImageRequest().setup({ path: "/test.png", queryStringParameters: {} }),
      400,
      "AuthorizationQueryParametersError",
      "Query-string requires the signature parameter."
    );
  });

  it("should throw 403 SignatureDoesNotMatch for a wrong signature", async () => {
    await expectError(
      newImageRequest().setup({ path: "/test.png", queryStringParameters: { signature: "deadbeef" } }),
      403,
      "SignatureDoesNotMatch",
      "Signature does not match."
    );
  });

  it("should throw 500 SignatureValidationFailure when the secret cannot be fetched", async () => {
    mockSecretManager.accessSecretVersion.mockRejectedValue(new Error("permission denied"));
    await expectError(
      newImageRequest().setup({ path: "/test.png", queryStringParameters: { signature: sign("/test.png") } }),
      500,
      "SignatureValidationFailure",
      "Signature validation failed."
    );
  });

  it("should throw 500 SignatureValidationFailure when SECRET_KEY is missing from the secret JSON", async () => {
    givenSecret({ "other-key": SECRET });
    await expectError(
      newImageRequest().setup({ path: "/test.png", queryStringParameters: { signature: sign("/test.png") } }),
      500,
      "SignatureValidationFailure"
    );
  });

  it("should resolve short secret names against GCP_PROJECT with version latest", async () => {
    const event = { path: "/test.png", queryStringParameters: { signature: sign("/test.png") } };
    await newImageRequest().setup(event);
    expect(mockSecretManager.accessSecretVersion).toHaveBeenCalledWith({
      name: "projects/test-project/secrets/image-handler-secret/versions/latest",
    });
  });

  it("should use a full resource path secret id verbatim", async () => {
    process.env.SECRETS_MANAGER = "projects/p/secrets/s/versions/2";
    const event = { path: "/test.png", queryStringParameters: { signature: sign("/test.png") } };
    await newImageRequest().setup(event);
    expect(mockSecretManager.accessSecretVersion).toHaveBeenCalledWith({ name: "projects/p/secrets/s/versions/2" });
  });

  it("should cache the secret per SecretProvider instance", async () => {
    const imageRequestWithSharedProvider = newImageRequest();
    const event = { path: "/test.png", queryStringParameters: { signature: sign("/test.png") } };
    await imageRequestWithSharedProvider.setup(event);
    await imageRequestWithSharedProvider.setup(event);
    expect(mockSecretManager.accessSecretVersion).toHaveBeenCalledTimes(1);
  });
});
