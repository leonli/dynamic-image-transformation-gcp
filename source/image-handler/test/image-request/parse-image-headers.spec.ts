import "../mock";

import { ImageRequest } from "../../src/image-request";
import { RequestTypes } from "../../src/lib/enums";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { toDefaultPath } from "../helpers";

describe("parseImageHeaders", () => {
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  it("should return the custom headers of a DEFAULT request", () => {
    const path = toDefaultPath({ key: "test.png", headers: { "Cache-Control": "max-age=100", "X-Custom": "1" } });
    expect(imageRequest.parseImageHeaders({ path }, RequestTypes.DEFAULT)).toEqual({
      "Cache-Control": "max-age=100",
      "X-Custom": "1",
    });
  });

  it("should return undefined when the request carries no headers", () => {
    const path = toDefaultPath({ key: "test.png" });
    expect(imageRequest.parseImageHeaders({ path }, RequestTypes.DEFAULT)).toBeUndefined();
  });

  it("should return undefined for non-DEFAULT requests", () => {
    expect(imageRequest.parseImageHeaders({ path: "/test.png" }, RequestTypes.THUMBOR)).toBeUndefined();
    expect(imageRequest.parseImageHeaders({ path: "/test.png" }, RequestTypes.CUSTOM)).toBeUndefined();
  });

  it.each([
    "Authorization",
    "connection",
    "Server",
    "transfer-encoding",
    "referrer-policy",
    "permissions-policy",
    "www-authenticate",
    "proxy-authenticate",
    "x-api-key",
    "Set-Cookie",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "x-xss-protection",
    "Strict-Transport-Security",
    "x-amz-meta-custom",
    "x-amzn-trace-id",
    "Access-Control-Allow-Origin",
    "Cross-Origin-Opener-Policy",
    "Content-Type",
  ])("should drop deny-listed header %s (case-insensitive)", (name) => {
    const path = toDefaultPath({ key: "test.png", headers: { [name]: "value", "X-Kept": "yes" } });
    expect(imageRequest.parseImageHeaders({ path }, RequestTypes.DEFAULT)).toEqual({ "X-Kept": "yes" });
  });

  it("should return undefined when every header is deny-listed", () => {
    const path = toDefaultPath({ key: "test.png", headers: { Authorization: "x", "Set-Cookie": "y" } });
    expect(imageRequest.parseImageHeaders({ path }, RequestTypes.DEFAULT)).toBeUndefined();
  });
});
