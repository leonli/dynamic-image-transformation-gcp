import { normalizeEvent } from "../../src/request-normalizer";

describe("normalizeEvent (CloudFront Function port)", () => {
  describe("Accept header normalization", () => {
    it("collapses any Accept advertising webp to exactly image/webp", () => {
      const event = normalizeEvent("/test.png", new URLSearchParams(), {
        accept: "text/html,application/xhtml+xml,image/webp,image/apng,*/*;q=0.8",
      });
      expect(event.headers?.accept).toEqual("image/webp");
    });

    it("collapses a non-webp Accept to the empty string", () => {
      const event = normalizeEvent("/test.png", new URLSearchParams(), { accept: "image/avif,image/*,*/*" });
      expect(event.headers?.accept).toEqual("");
    });

    it("handles a capitalized Accept header key", () => {
      const event = normalizeEvent("/test.png", new URLSearchParams(), { Accept: "image/webp" });
      expect(event.headers?.accept).toEqual("image/webp");
    });

    it("treats a missing Accept header as empty", () => {
      const event = normalizeEvent("/test.png", new URLSearchParams(), {});
      expect(event.headers?.accept).toEqual("");
    });
  });

  describe("query string normalization", () => {
    it("keeps only the AWS allowlisted parameters", () => {
      const query = new URLSearchParams(
        "width=100&height=50&foo=bar&utm_source=x&signature=abc&expires=20990101T000000Z&format=png&fit=cover&rotate=90&flip=1&flop=0&grayscale=true"
      );
      const event = normalizeEvent("/test.png", query, {});
      expect(event.queryStringParameters).toEqual({
        expires: "20990101T000000Z",
        fit: "cover",
        flip: "1",
        flop: "0",
        format: "png",
        grayscale: "true",
        height: "50",
        rotate: "90",
        signature: "abc",
        width: "100",
      });
      expect(event.queryStringParameters).not.toHaveProperty("foo");
      expect(event.queryStringParameters).not.toHaveProperty("utm_source");
    });

    it("sorts the surviving keys alphabetically for cache-key stability", () => {
      const event = normalizeEvent("/t.png", new URLSearchParams("width=1&format=png&height=2"), {});
      expect(Object.keys(event.queryStringParameters ?? {})).toEqual(["format", "height", "width"]);
    });

    it("takes the last value for multi-value parameters", () => {
      const event = normalizeEvent("/t.png", new URLSearchParams("width=100&width=200&width=300"), {});
      expect(event.queryStringParameters).toEqual({ width: "300" });
    });

    it("returns null when no allowlisted parameter survives", () => {
      const event = normalizeEvent("/t.png", new URLSearchParams("foo=bar"), {});
      expect(event.queryStringParameters).toBeNull();
    });

    it("drops the non-allowlisted greyscale spelling (AWS edge function parity)", () => {
      const event = normalizeEvent("/t.png", new URLSearchParams("greyscale=true&grayscale=false"), {});
      expect(event.queryStringParameters).toEqual({ grayscale: "false" });
    });
  });

  it("passes the path through untouched and keeps other headers", () => {
    const event = normalizeEvent("/100x80/test.png", new URLSearchParams(), { "x-custom": "1", accept: "" });
    expect(event.path).toEqual("/100x80/test.png");
    expect(event.headers?.["x-custom"]).toEqual("1");
  });
});
