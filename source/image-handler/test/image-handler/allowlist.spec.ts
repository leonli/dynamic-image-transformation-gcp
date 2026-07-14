import "../mock";

import sharp from "sharp";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { createImage, expectError, pixelAt } from "../helpers";

describe("ImageHandler edit allowlist enforcement", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (originalImage: Buffer, edits: Record<string, unknown>): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    edits,
    originalImage,
    contentType: "image/png",
  });

  it("throws 400 ImageEdits::NotAllowed for an edit key outside both allowlists", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(), { notARealEdit: true })),
      400,
      "ImageEdits::NotAllowed",
      "The edit notARealEdit is not allowed."
    );
  });

  it("applies allowlisted sharp passthrough edits (negate)", async () => {
    const output = await handler.process(requestInfo(await createImage(100, 80), { negate: true }));
    const pixel = await pixelAt(output, 50, 40);
    expect(pixel.r).toEqual(0); // red inverted to cyan
    expect(pixel.g).toEqual(255);
    expect(pixel.b).toEqual(255);
  });

  it("applies flip/flop/grayscale without error", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), { flip: true, flop: true, grayscale: true })
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(100);
    expect(metadata.height).toEqual(80);
  });

  it("applies extend with explicit dimensions", async () => {
    const output = await handler.process(
      requestInfo(await createImage(100, 80), { extend: { top: 5, bottom: 5, left: 5, right: 5 } })
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(110);
    expect(metadata.height).toEqual(90);
  });

  it("applies format options objects (png quality) via the format key", async () => {
    const output = await handler.process(requestInfo(await createImage(), { png: { quality: 50 } }));
    expect(output.subarray(0, 4).toString("hex").toUpperCase()).toEqual("89504E47");
  });

  it("throws 400 InstantiationError when a sharp edit rejects its value synchronously", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(), { blur: 0.1 })), // sigma below sharp's 0.3 minimum
      400,
      "InstantiationError",
      "check the edit blur"
    );
  });
});
