import { mockVision } from "../mock";

import sharp from "sharp";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { createImage, expectError } from "../helpers";

/** Vision face annotation helper: absolute-pixel bounding polygon. */
const face = (x1: number, y1: number, x2: number, y2: number) => ({
  boundingPoly: {
    vertices: [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ],
  },
});

describe("ImageHandler smartCrop (Cloud Vision FACE_DETECTION)", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (originalImage: Buffer, edits: Record<string, unknown>): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    edits,
    originalImage,
    contentType: "image/png",
  });

  beforeEach(() => {
    mockVision.faceDetection.mockReset();
  });

  it("smartCrop:true crops to the largest detected face", async () => {
    mockVision.faceDetection.mockResolvedValue([{ faceAnnotations: [face(20, 20, 60, 60)] }]);
    const output = await handler.process(requestInfo(await createImage(100, 80), { smartCrop: true }));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(40);
    expect(metadata.height).toEqual(40);
  });

  it("applies padding around the face box", async () => {
    mockVision.faceDetection.mockResolvedValue([{ faceAnnotations: [face(20, 20, 60, 60)] }]);
    const output = await handler.process(requestInfo(await createImage(100, 80), { smartCrop: { padding: 2 } }));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(44);
    expect(metadata.height).toEqual(44);
  });

  it("orders faces by bounding-box area descending for deterministic faceIndex", async () => {
    mockVision.faceDetection.mockResolvedValue([
      { faceAnnotations: [face(0, 0, 10, 10), face(20, 20, 60, 60)] },
    ]);
    const large = await handler.process(requestInfo(await createImage(100, 80), { smartCrop: { faceIndex: 0 } }));
    expect((await sharp(large).metadata()).width).toEqual(40);

    const small = await handler.process(requestInfo(await createImage(100, 80), { smartCrop: { faceIndex: 1 } }));
    expect((await sharp(small).metadata()).width).toEqual(10);
    expect((await sharp(small).metadata()).height).toEqual(10);
  });

  it("throws 400 SmartCrop::FaceIndexOutOfRange when faceIndex exceeds the detected faces", async () => {
    mockVision.faceDetection.mockResolvedValue([{ faceAnnotations: [face(20, 20, 60, 60)] }]);
    await expectError(
      handler.process(requestInfo(await createImage(100, 80), { smartCrop: { faceIndex: 5 } })),
      400,
      "SmartCrop::FaceIndexOutOfRange",
      "FaceIndex"
    );
  });

  it("throws 400 SmartCrop::PaddingOutOfBounds when padding pushes the crop outside the image", async () => {
    mockVision.faceDetection.mockResolvedValue([{ faceAnnotations: [face(20, 20, 60, 60)] }]);
    await expectError(
      handler.process(requestInfo(await createImage(100, 80), { smartCrop: { padding: 25 } })),
      400,
      "SmartCrop::PaddingOutOfBounds",
      "padding value you provided exceeds the boundaries"
    );
  });

  it("returns the full image untouched when no faces are detected", async () => {
    mockVision.faceDetection.mockResolvedValue([{ faceAnnotations: [] }]);
    const output = await handler.process(requestInfo(await createImage(100, 80), { smartCrop: true }));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(100);
    expect(metadata.height).toEqual(80);
  });

  it("clamps out-of-frame bounding boxes into the image", async () => {
    // Vision box extends past the right/bottom edge → clamped to the image
    mockVision.faceDetection.mockResolvedValue([{ faceAnnotations: [face(60, 40, 140, 120)] }]);
    const output = await handler.process(requestInfo(await createImage(100, 80), { smartCrop: true }));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toEqual(40); // 100 - 60
    expect(metadata.height).toEqual(40); // 80 - 40
  });

  it("throws 500 SmartCrop::Error when the Vision call fails", async () => {
    mockVision.faceDetection.mockRejectedValue(new Error("vision unavailable"));
    await expectError(
      handler.process(requestInfo(await createImage(100, 80), { smartCrop: true })),
      500,
      "SmartCrop::Error",
      "Smart Crop failed"
    );
  });

  it("converts non-jpeg/png sources for analysis and converts back", async () => {
    mockVision.faceDetection.mockResolvedValue([{ faceAnnotations: [face(20, 20, 60, 60)] }]);
    const webpSource = await createImage(100, 80, { r: 255, g: 0, b: 0, alpha: 1 }, "webp");
    const output = await handler.process({
      requestType: RequestTypes.THUMBOR,
      bucket: "source-bucket",
      key: "test.webp",
      edits: { smartCrop: true },
      originalImage: webpSource,
      contentType: "image/webp",
    });
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toEqual("webp");
    expect(metadata.width).toEqual(40);
  });
});
