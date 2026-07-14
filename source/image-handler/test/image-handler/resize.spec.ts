import "../mock";

import sharp from "sharp";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { createImage, expectError } from "../helpers";

describe("ImageHandler resize", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (originalImage: Buffer, edits: Record<string, unknown>): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    edits,
    originalImage,
    contentType: "image/png",
  });

  it("should resize to the exact requested dimensions", async () => {
    const output = await handler.process(requestInfo(await createImage(100, 80), { resize: { width: 50, height: 40 } }));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(50);
    expect(metadata.height).toEqual(40);
  });

  it("should auto-compute a null dimension", async () => {
    const output = await handler.process(requestInfo(await createImage(100, 80), { resize: { width: 50, height: null } }));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(50);
    expect(metadata.height).toEqual(40);
  });

  it("should round fractional dimensions", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), { resize: { width: 49.6, height: 39.7 } })
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(50);
    expect(metadata.height).toEqual(40);
  });

  it("should apply ratio against the source metadata and drop the ratio key", async () => {
    const edits: Record<string, unknown> = { resize: { ratio: 0.5 } };
    const output = await handler.process(requestInfo(await createImage(100, 80), edits));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(50);
    expect(metadata.height).toEqual(40);
    expect((edits.resize as Record<string, unknown>).ratio).toBeUndefined();
  });

  it("should apply ratio on top of explicit dimensions", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), { resize: { width: 80, height: 60, ratio: 0.5 } })
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(40);
    expect(metadata.height).toEqual(30);
  });

  it("should respect fit=inside with both dimensions", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), { resize: { width: 50, height: 50, fit: "inside" } })
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(50);
    expect(metadata.height).toEqual(40);
  });

  it("should throw 400 InvalidResizeException for a zero dimension", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(), { resize: { width: 0, height: 40 } })),
      400,
      "InvalidResizeException",
      "The image size is invalid."
    );
  });

  it("should throw 400 InvalidResizeException for a negative dimension", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(), { resize: { width: 50, height: -10 } })),
      400,
      "InvalidResizeException"
    );
  });

  it("should throw 400 InvalidResizeException for a non-numeric dimension", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(), { resize: { width: "abc" } })),
      400,
      "InvalidResizeException"
    );
  });

  it("should inject fit=inside into empty resize edits and leave the image size unchanged", async () => {
    const edits: Record<string, unknown> = { resize: {}, grayscale: true };
    const output = await handler.process(requestInfo(await createImage(100, 80), edits));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(100);
    expect(metadata.height).toEqual(80);
    expect(edits.resize).toEqual({ fit: "inside" });
  });
});
