import { ImageFitTypes } from "../../src/lib/enums";
import { ThumborMapper } from "../../src/thumbor-mapper";

describe("ThumborMapper resize", () => {
  const mapper = new ThumborMapper();

  it("should map WxH to a resize edit", () => {
    expect(mapper.mapPathToEdits("/100x80/test.jpg")).toEqual({ resize: { width: 100, height: 80 } });
  });

  it("should map a 0 width to null and force fit inside", () => {
    expect(mapper.mapPathToEdits("/0x80/test.jpg")).toEqual({
      resize: { width: null, height: 80, fit: ImageFitTypes.INSIDE },
    });
  });

  it("should map a 0 height to null and force fit inside", () => {
    expect(mapper.mapPathToEdits("/100x0/test.jpg")).toEqual({
      resize: { width: 100, height: null, fit: ImageFitTypes.INSIDE },
    });
  });

  it("should map fit-in to fit inside on top of the resize dimensions", () => {
    expect(mapper.mapPathToEdits("/fit-in/100x80/test.jpg")).toEqual({
      resize: { width: 100, height: 80, fit: ImageFitTypes.INSIDE },
    });
  });

  it("should map fit-in without dimensions to a fit-only resize", () => {
    expect(mapper.mapPathToEdits("/fit-in/test.jpg")).toEqual({ resize: { fit: ImageFitTypes.INSIDE } });
  });

  it("should not treat dimension-like substrings in file names as resize", () => {
    expect(mapper.mapPathToEdits("/photo-300x200.jpg")).toEqual({});
  });
});
