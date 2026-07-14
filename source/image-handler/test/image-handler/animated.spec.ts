import { mockVision } from "../mock";

import sharp from "sharp";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { createAnimatedGif, createImage } from "../helpers";

describe("ImageHandler animated images", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (
    originalImage: Buffer,
    edits: Record<string, unknown>,
    contentType = "image/gif"
  ): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.gif",
    edits,
    originalImage,
    contentType,
  });

  it("preserves all frames when resizing an animated GIF", async () => {
    const gif = await createAnimatedGif(40, 30, 2);
    const output = await handler.process(requestInfo(gif, { resize: { width: 20, height: 15 } }));
    const metadata = await sharp(output, { animated: true }).metadata();
    expect(metadata.pages).toEqual(2);
    expect(metadata.width).toEqual(20);
    expect(metadata.pageHeight).toEqual(15);
    expect(output.subarray(0, 4).toString()).toEqual("GIF8");
  });

  it("skips rotate for animated GIFs", async () => {
    const gif = await createAnimatedGif(40, 30, 2);
    const output = await handler.process(requestInfo(gif, { rotate: 90 }));
    const metadata = await sharp(output, { animated: true }).metadata();
    expect(metadata.pages).toEqual(2);
    expect(metadata.width).toEqual(40); // unchanged — rotate was skipped
    expect(metadata.pageHeight).toEqual(30);
  });

  it("skips smartCrop for animated GIFs without calling Vision", async () => {
    mockVision.faceDetection.mockClear();
    const gif = await createAnimatedGif(40, 30, 2);
    const output = await handler.process(requestInfo(gif, { smartCrop: true }));
    expect(mockVision.faceDetection).not.toHaveBeenCalled();
    const metadata = await sharp(output, { animated: true }).metadata();
    expect(metadata.pages).toEqual(2);
  });

  it("skips contentModeration for animated GIFs without calling Vision", async () => {
    mockVision.safeSearchDetection.mockClear();
    const gif = await createAnimatedGif(40, 30, 2);
    await handler.process(requestInfo(gif, { contentModeration: true }));
    expect(mockVision.safeSearchDetection).not.toHaveBeenCalled();
  });

  it("treats edits.animated=false as non-animated and applies rotate", async () => {
    const gif = await createAnimatedGif(40, 30, 2);
    const output = await handler.process(requestInfo(gif, { animated: false, rotate: 90 }));
    const metadata = await sharp(output, { animated: true }).metadata();
    expect(metadata.pages ?? 1).toEqual(1); // first frame only
    expect(metadata.width).toEqual(30); // rotated
    expect(metadata.height).toEqual(40);
  });

  it("falls back to non-animated for a single-frame GIF (pages<=1) and applies rotate", async () => {
    const gif = await createImage(40, 30, { r: 255, g: 0, b: 0, alpha: 1 }, "gif");
    const output = await handler.process(requestInfo(gif, { rotate: 90 }));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(30);
    expect(metadata.height).toEqual(40);
  });

  it("falls back to non-animated when edits.animated=true but the image has one page", async () => {
    const png = await createImage(40, 30);
    const output = await handler.process(requestInfo(png, { animated: true, rotate: 90 }, "image/png"));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(30);
    expect(metadata.height).toEqual(40);
  });

  it("treats a GIF content type as animated by default (rotate skipped)", async () => {
    const gif = await createAnimatedGif(40, 30, 3);
    const output = await handler.process(requestInfo(gif, { rotate: 90 }));
    const metadata = await sharp(output, { animated: true }).metadata();
    expect(metadata.pages).toEqual(3);
    expect(metadata.width).toEqual(40);
  });
});
