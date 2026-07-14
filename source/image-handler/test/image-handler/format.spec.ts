import "../mock";

import sharp from "sharp";

import { ImageHandler } from "../../src/image-handler";
import { ImageFormatTypes, RequestTypes } from "../../src/lib/enums";
import { ImageEdits, ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { SVG_IMAGE, createImage, expectError } from "../helpers";

describe("ImageHandler output format", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (
    originalImage: Buffer,
    overrides: Partial<ImageRequestInfo> = {}
  ): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    originalImage,
    contentType: "image/png",
    ...overrides,
  });

  it("converts to jpeg when outputFormat=jpeg", async () => {
    const output = await handler.process(
      requestInfo(await createImage(), { outputFormat: ImageFormatTypes.JPEG })
    );
    expect(output.subarray(0, 2).toString("hex").toUpperCase()).toEqual("FFD8");
  });

  it("converts to webp passing the requested effort", async () => {
    const webpSpy = jest.spyOn((sharp as unknown as { prototype: Record<string, unknown> }).prototype, "webp" as never);
    const output = await handler.process(
      requestInfo(await createImage(), { outputFormat: ImageFormatTypes.WEBP, effort: 2 })
    );
    expect(webpSpy).toHaveBeenCalledWith({ effort: 2 });
    expect(output.subarray(0, 4).toString()).toEqual("RIFF");
    webpSpy.mockRestore();
  });

  it("defaults the webp effort to 4 when unset", async () => {
    const webpSpy = jest.spyOn((sharp as unknown as { prototype: Record<string, unknown> }).prototype, "webp" as never);
    await handler.process(requestInfo(await createImage(), { outputFormat: ImageFormatTypes.WEBP }));
    expect(webpSpy).toHaveBeenCalledWith({ effort: 4 });
    webpSpy.mockRestore();
  });

  it("forces PNG for an SVG source with edits but no explicit format", async () => {
    const output = await handler.process(
      requestInfo(SVG_IMAGE, { contentType: "image/svg+xml", edits: { grayscale: true } })
    );
    expect(output.subarray(0, 4).toString("hex").toUpperCase()).toEqual("89504E47");
  });

  it("keeps an SVG untouched without edits or output format (passthrough)", async () => {
    const output = await handler.process(requestInfo(SVG_IMAGE, { contentType: "image/svg+xml" }));
    expect(output.equals(SVG_IMAGE)).toBe(true);
  });

  it("respects an explicit toFormat for an SVG source", async () => {
    const output = await handler.process(
      requestInfo(SVG_IMAGE, {
        contentType: "image/svg+xml",
        edits: { toFormat: "jpeg" },
        outputFormat: ImageFormatTypes.JPEG,
      })
    );
    expect(output.subarray(0, 2).toString("hex").toUpperCase()).toEqual("FFD8");
  });

  it("throws 500 UnsupportedOutputImageFormatException for a format sharp cannot write", async () => {
    await expectError(
      handler.process(requestInfo(await createImage(), { outputFormat: "heic" as ImageFormatTypes })),
      500,
      "UnsupportedOutputImageFormatException",
      "Format to heic not supported"
    );
  });

  describe("fixQuality migration (Thumbor/Custom only)", () => {
    it("migrates a quality edit keyed to another format onto the output format", async () => {
      const edits: ImageEdits = { jpeg: { quality: 50 } };
      const output = await handler.process(
        requestInfo(await createImage(), { edits, outputFormat: ImageFormatTypes.WEBP })
      );
      expect(edits.webp).toEqual({ quality: 50 });
      expect(edits.jpeg).toBeUndefined();
      expect(output.subarray(0, 4).toString()).toEqual("RIFF");
    });

    it("does not migrate quality for DEFAULT requests", async () => {
      const edits: ImageEdits = { jpeg: { quality: 50 } };
      await handler.process(
        requestInfo(await createImage(), { requestType: RequestTypes.DEFAULT, edits, outputFormat: ImageFormatTypes.WEBP })
      );
      expect(edits.jpeg).toEqual({ quality: 50 });
      expect(edits.webp).toBeUndefined();
    });

    it("keeps a quality edit already keyed to the output format", async () => {
      const edits: ImageEdits = { webp: { quality: 33 } };
      await handler.process(requestInfo(await createImage(), { edits, outputFormat: ImageFormatTypes.WEBP }));
      expect(edits.webp).toEqual({ quality: 33 });
    });
  });

  describe("metadata handling", () => {
    it("keeps EXIF by default", async () => {
      const withExif = await sharp({ create: { width: 50, height: 40, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .jpeg()
        .withExif({ IFD0: { Copyright: "test-owner" } })
        .toBuffer();
      const output = await handler.process(
        requestInfo(withExif, { contentType: "image/jpeg", edits: { resize: { width: 25 } } })
      );
      const metadata = await sharp(output).metadata();
      expect(metadata.exif).toBeDefined();
    });

    it("strips EXIF when the stripExif edit is set", async () => {
      const withExif = await sharp({ create: { width: 50, height: 40, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .jpeg()
        .withExif({ IFD0: { Copyright: "test-owner" } })
        .toBuffer();
      const edits: ImageEdits = { stripExif: true, resize: { width: 25 } };
      const output = await handler.process(requestInfo(withExif, { contentType: "image/jpeg", edits }));
      const metadata = await sharp(output).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(edits.stripExif).toBeUndefined(); // consumed before the edit loop
    });

    it("strips both EXIF and ICC when stripExif and stripIcc are set", async () => {
      const withExif = await sharp({ create: { width: 50, height: 40, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .jpeg()
        .withExif({ IFD0: { Copyright: "test-owner" } })
        .toBuffer();
      const edits: ImageEdits = { stripExif: true, stripIcc: true, resize: { width: 25 } };
      const output = await handler.process(requestInfo(withExif, { contentType: "image/jpeg", edits }));
      const metadata = await sharp(output).metadata();
      expect(metadata.exif).toBeUndefined();
    });

    it("replaces the ICC profile but keeps EXIF when stripIcc is set", async () => {
      const withExif = await sharp({ create: { width: 50, height: 40, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .jpeg()
        .withExif({ IFD0: { Copyright: "test-owner" } })
        .toBuffer();
      const edits: ImageEdits = { stripIcc: true, resize: { width: 25 } };
      const output = await handler.process(requestInfo(withExif, { contentType: "image/jpeg", edits }));
      const metadata = await sharp(output).metadata();
      expect(metadata.exif).toBeDefined();
      expect(edits.stripIcc).toBeUndefined();
    });
  });
});
