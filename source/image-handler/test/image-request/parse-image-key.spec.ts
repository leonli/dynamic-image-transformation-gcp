import "../mock";

import { ImageRequest } from "../../src/image-request";
import { RequestTypes } from "../../src/lib/enums";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { expectError, toDefaultPath } from "../helpers";

describe("parseImageKey", () => {
  const OLD_ENV = { ...process.env };
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  describe("DEFAULT requests", () => {
    it("should return the key from the decoded request", () => {
      const path = toDefaultPath({ bucket: "source-bucket", key: "folder/test.png" });
      expect(imageRequest.parseImageKey({ path }, RequestTypes.DEFAULT)).toEqual("folder/test.png");
    });

    it("should throw 404 ImageEdits::CannotFindImage when the key is missing", async () => {
      const path = toDefaultPath({ bucket: "source-bucket" });
      await expectError(
        () => imageRequest.parseImageKey({ path }, RequestTypes.DEFAULT),
        404,
        "ImageEdits::CannotFindImage",
        "could not be found"
      );
    });
  });

  describe("THUMBOR requests", () => {
    const parse = (path: string) => imageRequest.parseImageKey({ path }, RequestTypes.THUMBOR);

    it("should return a plain key", () => {
      expect(parse("/test.png")).toEqual("test.png");
    });

    it("should strip resize segments", () => {
      expect(parse("/100x80/folder/test.png")).toEqual("folder/test.png");
    });

    it("should strip crop and resize segments", () => {
      expect(parse("/10x20:110x220/100x80/test.png")).toEqual("test.png");
    });

    it("should strip fit-in", () => {
      expect(parse("/fit-in/100x80/test.png")).toEqual("test.png");
    });

    it("should strip filter segments", () => {
      expect(parse("/filters:grayscale()/filters:rotate(90)/test.png")).toEqual("test.png");
    });

    it("should strip a watermark filter whose arguments contain slashes", () => {
      expect(parse("/filters:watermark(source-bucket,folder/mark.png,10,10,20)/image.jpg")).toEqual("image.jpg");
    });

    it("should strip the s3:<bucket>/ and gs:<bucket>/ prefixes", () => {
      expect(parse("/s3:bucket-b/folder/test.png")).toEqual("folder/test.png");
      expect(parse("/gs:bucket-b/folder/test.png")).toEqual("folder/test.png");
    });

    it("should decode URI-encoded keys", () => {
      expect(parse("/folder/test%20image.png")).toEqual("folder/test image.png");
    });

    it("should not mangle dimension-like substrings inside file names", () => {
      expect(parse("/100x80/photo-300x200.jpg")).toEqual("photo-300x200.jpg");
    });
  });

  describe("CUSTOM requests", () => {
    it("should apply the rewrite substitution before extracting the key", () => {
      process.env.REWRITE_MATCH_PATTERN = "/thumb/";
      process.env.REWRITE_SUBSTITUTION = "images";
      expect(imageRequest.parseImageKey({ path: "/thumb/test.png" }, RequestTypes.CUSTOM)).toEqual("/images/test.png".replace(/^\//, ""));
    });

    it("should support /regex/flags style match patterns", () => {
      process.env.REWRITE_MATCH_PATTERN = "/THUMB/i";
      process.env.REWRITE_SUBSTITUTION = "images";
      expect(imageRequest.parseImageKey({ path: "/thumb/test.png" }, RequestTypes.CUSTOM)).toEqual("images/test.png");
    });
  });

  describe("parseCustomPath", () => {
    it("should throw 500 ParseCustomPath::ParsingError when rewrite variables are missing", async () => {
      delete process.env.REWRITE_MATCH_PATTERN;
      delete process.env.REWRITE_SUBSTITUTION;
      await expectError(() => imageRequest.parseCustomPath("/thumb/test.png"), 500, "ParseCustomPath::ParsingError");
    });
  });
});
