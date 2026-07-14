import { ThumborMapper } from "../../src/thumbor-mapper";

describe("ThumborMapper parseImageKey / parseBucketOverride", () => {
  const mapper = new ThumborMapper();

  describe("parseImageKey", () => {
    it("should extract a nested key past crop, resize, fit-in and filters", () => {
      expect(mapper.parseImageKey("/10x20:110x220/fit-in/100x80/filters:grayscale()/folder/test.png")).toEqual(
        "folder/test.png"
      );
    });

    it("should remove a watermark filter containing slashes before generic filter removal", () => {
      expect(mapper.parseImageKey("/filters:watermark(bucket,dir/mark.png,0,0,50)/img.jpg")).toEqual("img.jpg");
    });

    it("should strip s3:<bucket>/ prefixes by default", () => {
      expect(mapper.parseImageKey("/s3:my-bucket/folder/test.png")).toEqual("folder/test.png");
    });

    it("should strip gs:<bucket>/ prefixes by default", () => {
      expect(mapper.parseImageKey("/gs:my-bucket/folder/test.png")).toEqual("folder/test.png");
    });

    it("should keep the bucket prefix when bucketPrefixRemoved=false", () => {
      expect(mapper.parseImageKey("/gs:my-bucket/test.png", false)).toEqual("gs:my-bucket/test.png");
    });

    it("should decode URI-encoded characters", () => {
      expect(mapper.parseImageKey("/folder%20a/test%2Bimage.png")).toEqual("folder a/test+image.png");
    });

    it("should collapse duplicate slashes", () => {
      expect(mapper.parseImageKey("/100x80//folder//test.png")).toEqual("folder/test.png");
    });
  });

  describe("parseBucketOverride", () => {
    it("should return the bucket from a gs: segment", () => {
      expect(mapper.parseBucketOverride("/gs:override-bucket/test.png")).toEqual("override-bucket");
    });

    it("should return the bucket from an s3: segment (AWS-compatible)", () => {
      expect(mapper.parseBucketOverride("/s3:override-bucket/test.png")).toEqual("override-bucket");
    });

    it("should find the override mid-path after other segments", () => {
      expect(mapper.parseBucketOverride("/fit-in/100x80/gs:bucket-x/test.png")).toEqual("bucket-x");
    });

    it("should return null when no override is present", () => {
      expect(mapper.parseBucketOverride("/100x80/test.png")).toBeNull();
    });
  });
});
