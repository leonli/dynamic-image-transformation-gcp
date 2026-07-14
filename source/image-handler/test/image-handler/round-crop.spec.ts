import "../mock";

import sharp from "sharp";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { createImage, pixelAt } from "../helpers";

describe("ImageHandler roundCrop", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (originalImage: Buffer, edits: Record<string, unknown>): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    edits,
    originalImage,
    contentType: "image/png",
  });

  it("roundCrop:true masks the corners with the default centered ellipse", async () => {
    const output = await handler.process(requestInfo(await createImage(100, 80), { roundCrop: true }));
    const metadata = await sharp(output).metadata();
    // Ellipse touches all four edges (rx=ry=min/2 → 40): nothing to trim horizontally beyond the ellipse box
    expect(metadata.width).toBeLessThanOrEqual(100);
    expect(metadata.height).toBeLessThanOrEqual(80);

    const corner = await pixelAt(output, 1, 1);
    expect(corner.a).toEqual(0); // transparent corner
    const center = await pixelAt(output, Math.floor((metadata.width ?? 0) / 2), Math.floor((metadata.height ?? 0) / 2));
    expect(center.a).toEqual(255);
    expect(center.r).toEqual(255); // original red survives inside the ellipse
  });

  it("roundCrop with explicit rx/ry/top/left crops and trims to the ellipse bounds", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), { roundCrop: { rx: 10, ry: 10, top: 40, left: 50 } })
    );
    const metadata = await sharp(output).metadata();
    // 20x20 ellipse (plus ~1px antialiasing) after trim
    expect(metadata.width).toBeGreaterThanOrEqual(18);
    expect(metadata.width).toBeLessThanOrEqual(24);
    expect(metadata.height).toBeGreaterThanOrEqual(18);
    expect(metadata.height).toBeLessThanOrEqual(24);
  });

  it("roundCrop ignores negative options and falls back to defaults", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), { roundCrop: { rx: -5, ry: -5, top: -1, left: -1 } })
    );
    const corner = await pixelAt(output, 1, 1);
    expect(corner.a).toEqual(0);
  });
});
