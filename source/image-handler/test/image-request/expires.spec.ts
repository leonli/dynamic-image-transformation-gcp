import { givenStorageObject } from "../mock";

import { ImageRequest } from "../../src/image-request";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { createImage, expectError } from "../helpers";

describe("?expires= handling", () => {
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  beforeEach(async () => {
    givenStorageObject(await createImage(), { contentType: "image/png" });
  });

  it("should accept a valid future expiry and rewrite Cache-Control with the remaining seconds", async () => {
    const info = await imageRequest.setup({
      path: "/test.png",
      queryStringParameters: { expires: "20990101T000000Z" },
    });
    expect(info.secondsToExpiry).toBeGreaterThan(0);
    expect(info.cacheControl).toEqual(`max-age=${info.secondsToExpiry},public`);
  });

  it("should throw 400 ImageRequestExpired for a past expiry", async () => {
    await expectError(
      imageRequest.setup({ path: "/test.png", queryStringParameters: { expires: "20200101T000000Z" } }),
      400,
      "ImageRequestExpired",
      "Request has expired."
    );
  });

  it.each(["not-a-date", "2099-01-01T00:00:00Z", "20990101", "20991301T000000Z"])(
    "should throw 400 ImageRequestExpiryFormat for malformed expires value %s",
    async (expires) => {
      await expectError(
        imageRequest.setup({ path: "/test.png", queryStringParameters: { expires } }),
        400,
        "ImageRequestExpiryFormat",
        "invalid expires value"
      );
    }
  );

  it("should ignore expires entirely when the parameter is absent", async () => {
    const info = await imageRequest.setup({ path: "/test.png", queryStringParameters: {} });
    expect(info.secondsToExpiry).toBeUndefined();
    expect(info.cacheControl).toEqual("max-age=31536000,public");
  });
});
