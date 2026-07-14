import { givenStorageObject } from "../mock";

import sharp from "sharp";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { BLUE, createImage, expectError, pixelAt } from "../helpers";

describe("ImageHandler overlayWith (watermark)", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (originalImage: Buffer, edits: Record<string, unknown>): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    edits,
    originalImage,
    contentType: "image/png",
  });

  const overlayEdit = (extra: Record<string, unknown> = {}) => ({
    overlayWith: { bucket: "source-bucket", key: "overlay.png", ...extra },
  });

  beforeEach(async () => {
    givenStorageObject(await createImage(20, 20, BLUE), { contentType: "image/png" });
  });

  it("should composite the overlay at the given left/top offsets", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), overlayEdit({ options: { left: 10, top: 10 } }))
    );
    expect(await pixelAt(output, 15, 15)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    expect(await pixelAt(output, 60, 60)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("should measure negative offsets from the right/bottom edge minus the overlay size", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), overlayEdit({ options: { left: -10, top: -10 } }))
    );
    // left = 100 - 10 - 20 = 70, top = 80 - 10 - 20 = 50
    expect(await pixelAt(output, 75, 55)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    expect(await pixelAt(output, 60, 40)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("should resolve NNp percentage positions against the base size", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), overlayEdit({ options: { left: "50p", top: "50p" } }))
    );
    // left = floor(100*50/100) = 50, top = floor(80*50/100) = 40
    expect(await pixelAt(output, 55, 45)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    expect(await pixelAt(output, 45, 35)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("should resolve negative percentages from the right/bottom edge", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), overlayEdit({ options: { left: "-10p", top: "-25p" } }))
    );
    // left = 100 + floor(100*-10/100) - 20 = 70, top = 80 + floor(80*-25/100) - 20 = 40
    expect(await pixelAt(output, 75, 45)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
  });

  it("should apply alpha as overlay transparency (alpha=100 → invisible)", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), overlayEdit({ alpha: 100, options: { left: 10, top: 10 } }))
    );
    expect(await pixelAt(output, 15, 15)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("should blend a 50 percent alpha overlay", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), overlayEdit({ alpha: 50, options: { left: 10, top: 10 } }))
    );
    const pixel = await pixelAt(output, 15, 15);
    expect(pixel.r).toBeGreaterThan(100);
    expect(pixel.r).toBeLessThan(160);
    expect(pixel.b).toBeGreaterThan(100);
    expect(pixel.b).toBeLessThan(160);
  });

  it("should treat an out-of-range alpha as 0 (fully opaque overlay)", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), overlayEdit({ alpha: 250, options: { left: 10, top: 10 } }))
    );
    expect(await pixelAt(output, 15, 15)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
  });

  it("should scale the overlay by wRatio/hRatio percentages of the base canvas", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), overlayEdit({ wRatio: 50, hRatio: 50, options: { left: 0, top: 0 } }))
    );
    // overlay fit-inside into 50x40 → 40x40 square
    expect(await pixelAt(output, 30, 30)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    expect(await pixelAt(output, 45, 30)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("should compute overlay ratios against the resized canvas", async () => {
    const output = await handler.process(
      requestInfo(
        await createImage(100, 80),
        { resize: { width: 50 }, ...overlayEdit({ wRatio: 50, hRatio: 50, options: { left: 0, top: 0 } }) }
      )
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(50);
    expect(metadata.height).toEqual(40);
    // overlay resized into 25x20 box → 20x20
    expect(await pixelAt(output, 10, 10)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    expect(await pixelAt(output, 30, 10)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("should throw 403 ImageBucket::CannotAccessBucket for a non-allowlisted overlay bucket", async () => {
    await expectError(
      handler.process(
        requestInfo(await createImage(), { overlayWith: { bucket: "evil-bucket", key: "overlay.png" } })
      ),
      403,
      "ImageBucket::CannotAccessBucket"
    );
  });

  it("should throw 400 OverlayImageException when the overlay bytes are not an image", async () => {
    givenStorageObject(Buffer.from("not an image"), { contentType: "image/png" });
    await expectError(
      handler.process(requestInfo(await createImage(), overlayEdit())),
      400,
      "OverlayImageException",
      "could not be applied"
    );
  });

  it("should throw 400 BadRequest when the overlay is larger than the base image", async () => {
    givenStorageObject(await createImage(200, 200, BLUE), { contentType: "image/png" });
    await expectError(
      handler.process(requestInfo(await createImage(100, 80), overlayEdit())),
      400,
      "BadRequest",
      "Image to overlay must have same dimensions or smaller"
    );
  });
});
