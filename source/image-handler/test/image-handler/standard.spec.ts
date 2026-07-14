import "../mock";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { createImage } from "../helpers";

describe("ImageHandler passthrough (no edits, no output format)", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());

  const requestInfo = (originalImage: Buffer, edits?: Record<string, unknown>): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    edits,
    originalImage,
    contentType: "image/png",
  });

  it("returns the original bytes untouched when edits is empty", async () => {
    const image = await createImage();
    const output = await handler.process(requestInfo(image, {}));
    expect(output).toBe(image); // exact same buffer, never re-encoded
  });

  it("returns the original bytes untouched when edits is undefined", async () => {
    const image = await createImage();
    const output = await handler.process(requestInfo(image));
    expect(output.equals(image)).toBe(true);
  });

  it("re-encodes when an outputFormat is present even without edits", async () => {
    const image = await createImage();
    const output = await handler.process({ ...requestInfo(image, {}), outputFormat: "png" as never });
    expect(output.equals(image)).toBe(false); // went through sharp
    expect(output.subarray(0, 4).toString("hex").toUpperCase()).toEqual("89504E47");
  });
});
