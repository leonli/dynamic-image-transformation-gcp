import "../mock";

import { ImageRequest } from "../../src/image-request";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { expectError } from "../helpers";

describe("inferImageType", () => {
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  const withMagic = (hex: string, padTo = 16): Buffer => {
    const magic = Buffer.from(hex, "hex");
    return Buffer.concat([magic, Buffer.alloc(Math.max(0, padTo - magic.length))]);
  };

  it("should detect PNG (89504E47)", () => {
    expect(imageRequest.inferImageType(withMagic("89504E47"))).toEqual("image/png");
  });

  it("should detect WEBP (52494646 / RIFF)", () => {
    expect(imageRequest.inferImageType(withMagic("52494646"))).toEqual("image/webp");
  });

  it("should detect TIFF little-endian (49492A00)", () => {
    expect(imageRequest.inferImageType(withMagic("49492A00"))).toEqual("image/tiff");
  });

  it("should detect TIFF big-endian (4D4D002A)", () => {
    expect(imageRequest.inferImageType(withMagic("4D4D002A"))).toEqual("image/tiff");
  });

  it("should detect GIF (47494638)", () => {
    expect(imageRequest.inferImageType(withMagic("47494638"))).toEqual("image/gif");
  });

  it("should detect JPEG from the FFD8 prefix", () => {
    expect(imageRequest.inferImageType(withMagic("FFD8FFE0"))).toEqual("image/jpeg");
  });

  it("should detect AVIF from ftypavif at offset 4", () => {
    const buffer = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypavif"), Buffer.alloc(8)]);
    expect(imageRequest.inferImageType(buffer)).toEqual("image/avif");
  });

  it("should detect SVG from the document text", () => {
    const buffer = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(imageRequest.inferImageType(buffer)).toEqual("image/svg+xml");
  });

  it("should throw 500 RequestTypeError for an unknown magic number", async () => {
    await expectError(
      () => imageRequest.inferImageType(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])),
      500,
      "RequestTypeError",
      "file type could not be inferred"
    );
  });
});
