import "../mock";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { expectError } from "../helpers";

describe("COMPAT_AWS_LIMITS (API Gateway 6MB response cap)", () => {
  const OLD_ENV = { ...process.env };
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (originalImage: Buffer): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "big.bin",
    edits: {},
    originalImage,
    contentType: "image/png",
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("throws 413 TooLargeImageException when the base64 output exceeds 6MB and COMPAT_AWS_LIMITS=Yes", async () => {
    process.env.COMPAT_AWS_LIMITS = "Yes";
    const fiveMb = Buffer.alloc(5 * 1024 * 1024); // base64 ≈ 6.99MB > 6MB
    await expectError(
      handler.process(requestInfo(fiveMb)),
      413,
      "TooLargeImageException",
      "The converted image is too large to return."
    );
  });

  it("returns the image when the base64 output is under the cap", async () => {
    process.env.COMPAT_AWS_LIMITS = "Yes";
    const oneMb = Buffer.alloc(1024 * 1024);
    const output = await handler.process(requestInfo(oneMb));
    expect(output.length).toEqual(1024 * 1024);
  });

  it("does not enforce the cap when COMPAT_AWS_LIMITS is off (GCP-native default)", async () => {
    delete process.env.COMPAT_AWS_LIMITS;
    const fiveMb = Buffer.alloc(5 * 1024 * 1024);
    const output = await handler.process(requestInfo(fiveMb));
    expect(output.length).toEqual(5 * 1024 * 1024);
  });
});
