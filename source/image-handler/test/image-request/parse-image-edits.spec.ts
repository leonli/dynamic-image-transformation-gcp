import "../mock";

import { ImageRequest } from "../../src/image-request";
import { RequestTypes } from "../../src/lib/enums";
import { SecretProvider } from "../../src/secret-provider";
import { StorageProvider } from "../../src/storage-provider";
import { expectError, toDefaultPath } from "../helpers";

describe("parseImageEdits", () => {
  const OLD_ENV = { ...process.env };
  const imageRequest = new ImageRequest(new StorageProvider(), new SecretProvider());

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("should pass through the edits of a DEFAULT request", () => {
    const path = toDefaultPath({ key: "test.png", edits: { grayscale: true, rotate: 90 } });
    expect(imageRequest.parseImageEdits({ path }, RequestTypes.DEFAULT)).toEqual({ grayscale: true, rotate: 90 });
  });

  it("should return empty edits for a DEFAULT request without edits", () => {
    const path = toDefaultPath({ key: "test.png" });
    expect(imageRequest.parseImageEdits({ path }, RequestTypes.DEFAULT)).toEqual({});
  });

  it("should throw 400 ImageEdits::NotAllowed for a non-allowlisted edit key", async () => {
    const path = toDefaultPath({ key: "test.png", edits: { notAllowedEdit: true } });
    await expectError(
      () => imageRequest.parseImageEdits({ path }, RequestTypes.DEFAULT),
      400,
      "ImageEdits::NotAllowed",
      "The edit notAllowedEdit is not allowed."
    );
  });

  it("should map a THUMBOR path to edits", () => {
    const edits = imageRequest.parseImageEdits({ path: "/100x80/filters:grayscale()/test.jpg" }, RequestTypes.THUMBOR);
    expect(edits).toEqual({ resize: { width: 100, height: 80 }, grayscale: true });
  });

  it("should map a CUSTOM path through the rewrite before extracting edits", () => {
    process.env.REWRITE_MATCH_PATTERN = "/thumb/";
    process.env.REWRITE_SUBSTITUTION = "/100x80/";
    const edits = imageRequest.parseImageEdits({ path: "/thumb/test.jpg" }, RequestTypes.CUSTOM);
    expect(edits).toEqual({ resize: { width: 100, height: 80 } });
  });

  describe("query parameter edits", () => {
    it("should layer query edits on top of path edits (resize merged per-field)", () => {
      const event = {
        path: "/100x80/test.jpg",
        queryStringParameters: { width: "50" },
      };
      expect(imageRequest.parseImageEdits(event, RequestTypes.THUMBOR)).toEqual({
        resize: { width: 50, height: 80 },
      });
    });

    it("should map format=jpg to toFormat jpeg", () => {
      const event = { path: "/test.png", queryStringParameters: { format: "jpg" } };
      expect(imageRequest.parseImageEdits(event, RequestTypes.THUMBOR)).toEqual({ toFormat: "jpeg" });
    });

    it("should map width=0 and empty height to null (auto) dimensions", () => {
      const event = { path: "/test.png", queryStringParameters: { width: "0", height: "" } };
      expect(imageRequest.parseImageEdits(event, RequestTypes.THUMBOR)).toEqual({
        resize: { width: null, height: null },
      });
    });

    it("should map fit onto resize.fit", () => {
      const event = { path: "/test.png", queryStringParameters: { fit: "cover", width: "10" } };
      expect(imageRequest.parseImageEdits(event, RequestTypes.THUMBOR)).toEqual({
        resize: { fit: "cover", width: 10 },
      });
    });

    it("should map empty rotate to null and numeric rotate to a number", () => {
      expect(
        imageRequest.parseImageEdits({ path: "/test.png", queryStringParameters: { rotate: "" } }, RequestTypes.THUMBOR)
      ).toEqual({ rotate: null });
      expect(
        imageRequest.parseImageEdits({ path: "/test.png", queryStringParameters: { rotate: "90" } }, RequestTypes.THUMBOR)
      ).toEqual({ rotate: 90 });
    });

    it("should throw 400 QueryParameterParsingError for a non-numeric rotate", async () => {
      await expectError(
        () =>
          imageRequest.parseImageEdits(
            { path: "/test.png", queryStringParameters: { rotate: "abc" } },
            RequestTypes.THUMBOR
          ),
        400,
        "QueryParameterParsingError",
        "Query parameter parsing failed"
      );
    });

    it("should throw 400 QueryParameterParsingError for a non-numeric width", async () => {
      await expectError(
        () =>
          imageRequest.parseImageEdits(
            { path: "/test.png", queryStringParameters: { width: "abc" } },
            RequestTypes.THUMBOR
          ),
        400,
        "QueryParameterParsingError"
      );
    });

    it("should treat flip/flop '0', 'false' and '' as false and anything else as true", () => {
      const parse = (q: Record<string, string>) =>
        imageRequest.parseImageEdits({ path: "/test.png", queryStringParameters: q }, RequestTypes.THUMBOR);
      expect(parse({ flip: "0" })).toEqual({ flip: false });
      expect(parse({ flip: "false" })).toEqual({ flip: false });
      expect(parse({ flip: "" })).toEqual({ flip: false });
      expect(parse({ flip: "true" })).toEqual({ flip: true });
      expect(parse({ flop: "1" })).toEqual({ flop: true });
    });

    it("should map grayscale and the greyscale alias onto greyscale", () => {
      const parse = (q: Record<string, string>) =>
        imageRequest.parseImageEdits({ path: "/test.png", queryStringParameters: q }, RequestTypes.THUMBOR);
      expect(parse({ grayscale: "true" })).toEqual({ greyscale: true });
      expect(parse({ greyscale: "false" })).toEqual({ greyscale: false });
    });

    it("should override DEFAULT-request edits with query edits", () => {
      const path = toDefaultPath({ key: "test.png", edits: { rotate: 90 } });
      expect(
        imageRequest.parseImageEdits({ path, queryStringParameters: { rotate: "180" } }, RequestTypes.DEFAULT)
      ).toEqual({ rotate: 180 });
    });
  });
});
