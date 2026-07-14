import "../mock";

import sharp from "sharp";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { createImage, expectError } from "../helpers";

describe("ImageHandler crop", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (originalImage: Buffer, edits: Record<string, unknown>): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    edits,
    originalImage,
    contentType: "image/png",
  });

  it("should extract the requested region", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), { crop: { left: 10, top: 10, width: 50, height: 40 } })
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(50);
    expect(metadata.height).toEqual(40);
  });

  it("should throw 400 Crop::AreaOutOfBounds when the region exceeds the image bounds", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(100, 80), { crop: { left: 0, top: 0, width: 500, height: 500 } })),
      400,
      "Crop::AreaOutOfBounds",
      "exceeds the boundaries"
    );
  });

  it("should throw 400 Crop::AreaOutOfBounds when the offset pushes the region outside", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(100, 80), { crop: { left: 90, top: 70, width: 50, height: 40 } })),
      400,
      "Crop::AreaOutOfBounds"
    );
  });

  it("should throw 400 Crop::AreaOutOfBounds for negative coordinates (sync sharp validation)", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(100, 80), { crop: { left: -1, top: 0, width: 10, height: 10 } })),
      400,
      "Crop::AreaOutOfBounds"
    );
  });
});
