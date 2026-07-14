import {
  givenSecret,
  givenStorageFailure,
  givenStorageObject,
  mockSecretManager,
  mockStorageBucket,
  mockStorageFile,
  restoreStorageWiring,
} from "./mock";

import sharp from "sharp";
import request, { Response } from "supertest";

import { app } from "../src/index";
import { createImage } from "./helpers";

/** Collects binary responses into a Buffer (superagent does not parse image/*). */
const binaryParser = (res: Response, callback: (err: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  (res as unknown as NodeJS.ReadableStream).on("data", (chunk) => chunks.push(chunk as Buffer));
  (res as unknown as NodeJS.ReadableStream).on("end", () => callback(null, Buffer.concat(chunks)));
};

describe("express app end-to-end (supertest)", () => {
  const OLD_ENV = { ...process.env };
  let png: Buffer;

  beforeAll(async () => {
    png = await createImage(100, 80);
  });

  beforeEach(() => {
    givenStorageObject(png, { contentType: "image/png" });
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    restoreStorageWiring();
  });

  it("GET /__health returns 200 ok", async () => {
    const res = await request(app).get("/__health");
    expect(res.status).toEqual(200);
    expect(res.text).toEqual("ok");
  });

  it("serves an unmodified image as passthrough with default headers", async () => {
    const res = await request(app).get("/test.png").buffer(true).parse(binaryParser);
    expect(res.status).toEqual(200);
    expect(res.headers["content-type"]).toEqual("image/png");
    expect(res.headers["cache-control"]).toEqual("max-age=31536000,public");
    expect(res.headers["access-control-allow-methods"]).toEqual("GET");
    expect(res.headers["access-control-allow-headers"]).toEqual("Content-Type, Authorization");
    expect(res.headers["access-control-allow-credentials"]).toEqual("true");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined(); // CORS off by default
    expect((res.body as Buffer).equals(png)).toBe(true);
  });

  it("propagates the source object Cache-Control and Last-Modified", async () => {
    givenStorageObject(png, {
      contentType: "image/png",
      cacheControl: "max-age=60,public",
      updated: "2026-01-02T03:04:05.000Z",
    });
    const res = await request(app).get("/test.png").buffer(true).parse(binaryParser);
    expect(res.headers["cache-control"]).toEqual("max-age=60,public");
    expect(res.headers["last-modified"]).toEqual(new Date("2026-01-02T03:04:05.000Z").toUTCString());
  });

  it("applies query-string edits (resize) to the served image", async () => {
    const res = await request(app).get("/test.png?width=50&height=40").buffer(true).parse(binaryParser);
    expect(res.status).toEqual(200);
    const metadata = await sharp(res.body as Buffer).metadata();
    expect(metadata.width).toEqual(50);
    expect(metadata.height).toEqual(40);
  });

  it("serves webp when AUTO_WEBP=Yes and the client accepts image/webp", async () => {
    process.env.AUTO_WEBP = "Yes";
    const res = await request(app)
      .get("/test.png")
      .set("Accept", "text/html,image/webp,*/*")
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toEqual(200);
    expect(res.headers["content-type"]).toEqual("image/webp");
    expect((res.body as Buffer).subarray(0, 4).toString()).toEqual("RIFF");
    // Cloud CDN caches AUTO_WEBP variants via Vary: Accept (Accept cannot be a
    // cache-key header on GCP; see modules/network-lb/main.tf).
    expect(res.headers["vary"]).toEqual("Accept");
  });

  it("does not emit Vary: Accept when AUTO_WEBP is disabled", async () => {
    const res = await request(app).get("/test.png").buffer(true).parse(binaryParser);
    expect(res.status).toEqual(200);
    expect(res.headers["vary"]).toBeUndefined();
  });

  it("serves a DEFAULT (base64 JSON) request with custom headers", async () => {
    const path = `/${Buffer.from(
      JSON.stringify({ bucket: "source-bucket", key: "test.png", headers: { "X-Custom": "42" } })
    ).toString("base64")}`;
    const res = await request(app).get(path).buffer(true).parse(binaryParser);
    expect(res.status).toEqual(200);
    expect(res.headers["x-custom"]).toEqual("42");
  });

  it("returns the AWS-shaped 404 NoSuchKey JSON for a missing object", async () => {
    givenStorageFailure();
    const res = await request(app).get("/missing.png");
    expect(res.status).toEqual(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["cache-control"]).toEqual("max-age=10,public");
    expect(res.body).toEqual({
      status: 404,
      code: "NoSuchKey",
      message: "The image missing.png does not exist or the request may not be base64 encoded properly.",
    });
  });

  it("returns a 400 JSON error with 4xx Cache-Control for an unsupported request", async () => {
    const res = await request(app).get("/document.txt");
    expect(res.status).toEqual(400);
    expect(res.headers["cache-control"]).toEqual("max-age=10,public");
    expect(res.body.status).toEqual(400);
    expect(res.body.code).toEqual("RequestTypeError");
    expect(typeof res.body.message).toEqual("string");
  });

  it("returns a 400 ImageEdits::NotAllowed JSON for a disallowed edit", async () => {
    const path = `/${Buffer.from(JSON.stringify({ key: "test.png", edits: { hack: true } })).toString("base64")}`;
    const res = await request(app).get(path);
    expect(res.status).toEqual(400);
    expect(res.body).toEqual({ status: 400, code: "ImageEdits::NotAllowed", message: "The edit hack is not allowed." });
  });

  it("returns a 500 JSON error with 5xx Cache-Control when signature validation breaks", async () => {
    process.env.ENABLE_SIGNATURE = "Yes";
    process.env.SECRETS_MANAGER = "does-not-matter";
    process.env.SECRET_KEY = "k";
    mockSecretManager.accessSecretVersion.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/test.png?signature=deadbeef");
    expect(res.status).toEqual(500);
    expect(res.headers["cache-control"]).toEqual("max-age=600,public");
    expect(res.body).toEqual({ status: 500, code: "SignatureValidationFailure", message: "Signature validation failed." });
  });

  it("emits Access-Control-Allow-Origin when CORS_ENABLED=Yes, on success and error", async () => {
    process.env.CORS_ENABLED = "Yes";
    process.env.CORS_ORIGIN = "https://example.com";
    const ok = await request(app).get("/test.png").buffer(true).parse(binaryParser);
    expect(ok.headers["access-control-allow-origin"]).toEqual("https://example.com");

    givenStorageFailure();
    const err = await request(app).get("/missing.png");
    expect(err.headers["access-control-allow-origin"]).toEqual("https://example.com");
  });

  it("honors a valid expires parameter by rewriting Cache-Control", async () => {
    const res = await request(app)
      .get("/test.png?expires=20990101T000000Z")
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toEqual(200);
    expect(res.headers["cache-control"]).toMatch(/^max-age=\d+,public$/);
    expect(res.headers["cache-control"]).not.toEqual("max-age=31536000,public");
  });

  it("rejects an expired request with 400 ImageRequestExpired", async () => {
    const res = await request(app).get("/test.png?expires=20200101T000000Z");
    expect(res.status).toEqual(400);
    expect(res.body.code).toEqual("ImageRequestExpired");
  });

  describe("fallback image", () => {
    const fallbackFile = { getMetadata: jest.fn(), download: jest.fn() };

    beforeEach(async () => {
      process.env.ENABLE_DEFAULT_FALLBACK_IMAGE = "Yes";
      process.env.DEFAULT_FALLBACK_IMAGE_BUCKET = "source-bucket";
      process.env.DEFAULT_FALLBACK_IMAGE_KEY = "fallback.png";
      const fallbackImage = await createImage(10, 10, { r: 0, g: 255, b: 0, alpha: 1 });
      fallbackFile.getMetadata.mockResolvedValue([{ contentType: "image/png", cacheControl: "max-age=100,public" }]);
      fallbackFile.download.mockResolvedValue([fallbackImage]);
      givenStorageFailure(); // the requested image is missing
      mockStorageBucket.file.mockImplementation(((key: string) =>
        key === "fallback.png" ? fallbackFile : mockStorageFile) as never);
    });

    it("serves the fallback image while preserving the original error status code", async () => {
      const res = await request(app).get("/missing.png").buffer(true).parse(binaryParser);
      expect(res.status).toEqual(404); // original NoSuchKey status kept
      expect(res.headers["content-type"]).toEqual("image/png");
      expect(res.headers["cache-control"]).toEqual("max-age=100,public");
      expect((res.body as Buffer).subarray(0, 4).toString("hex").toUpperCase()).toEqual("89504E47");
    });

    it("falls back to the JSON error when the fallback image itself is missing", async () => {
      fallbackFile.getMetadata.mockRejectedValue(new Error("gone"));
      fallbackFile.download.mockRejectedValue(new Error("gone"));
      const res = await request(app).get("/missing.png");
      expect(res.status).toEqual(404);
      expect(res.body.code).toEqual("NoSuchKey");
    });

    it("ignores the fallback when the bucket/key are blank", async () => {
      process.env.DEFAULT_FALLBACK_IMAGE_KEY = "  ";
      const res = await request(app).get("/missing.png");
      expect(res.status).toEqual(404);
      expect(res.body.code).toEqual("NoSuchKey");
    });
  });
});
