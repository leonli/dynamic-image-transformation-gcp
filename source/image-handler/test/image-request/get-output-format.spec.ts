import "../mock";

import { ImageRequest } from "../../src/image-request";
import { ImageFormatTypes, RequestTypes } from "../../src/lib/enums";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";

describe("getOutputFormat", () => {
  const OLD_ENV = { ...process.env };
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("should return webp when AUTO_WEBP=Yes and the Accept header includes image/webp", () => {
    process.env.AUTO_WEBP = "Yes";
    const event = { path: "/test.jpg", headers: { accept: "image/webp" } };
    expect(imageRequest.getOutputFormat(event, RequestTypes.THUMBOR)).toEqual(ImageFormatTypes.WEBP);
  });

  it("should honor a capitalized Accept header key", () => {
    process.env.AUTO_WEBP = "Yes";
    const event = { path: "/test.jpg", headers: { Accept: "text/html,image/webp,*/*" } };
    expect(imageRequest.getOutputFormat(event, RequestTypes.THUMBOR)).toEqual(ImageFormatTypes.WEBP);
  });

  it("should return undefined when AUTO_WEBP is not enabled and no format was requested", () => {
    const event = { path: "/test.jpg", headers: { accept: "image/webp" } };
    expect(imageRequest.getOutputFormat(event, RequestTypes.THUMBOR)).toBeUndefined();
  });

  it("should return undefined when AUTO_WEBP=Yes but the client does not accept webp", () => {
    process.env.AUTO_WEBP = "Yes";
    const event = { path: "/test.jpg", headers: { accept: "image/avif" } };
    expect(imageRequest.getOutputFormat(event, RequestTypes.THUMBOR)).toBeUndefined();
  });

  it("should return the requested format of a DEFAULT request", () => {
    const event = { path: "/abc", headers: {} };
    expect(imageRequest.getOutputFormat(event, RequestTypes.DEFAULT, ImageFormatTypes.PNG)).toEqual(
      ImageFormatTypes.PNG
    );
  });

  it("should normalize jpg to jpeg", () => {
    const event = { path: "/abc", headers: {} };
    expect(imageRequest.getOutputFormat(event, RequestTypes.DEFAULT, ImageFormatTypes.JPG)).toEqual(
      ImageFormatTypes.JPEG
    );
  });

  it("should prefer AUTO_WEBP over the DEFAULT request outputFormat", () => {
    process.env.AUTO_WEBP = "Yes";
    const event = { path: "/abc", headers: { accept: "image/webp" } };
    expect(imageRequest.getOutputFormat(event, RequestTypes.DEFAULT, ImageFormatTypes.PNG)).toEqual(
      ImageFormatTypes.WEBP
    );
  });
});
