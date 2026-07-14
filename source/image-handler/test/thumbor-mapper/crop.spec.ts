import { ThumborMapper } from "../../src/thumbor-mapper";

describe("ThumborMapper crop", () => {
  const mapper = new ThumborMapper();

  it("should map AxB:CxD to a crop edit with width/height deltas", () => {
    expect(mapper.mapPathToEdits("/10x20:110x220/test.jpg")).toEqual({
      crop: { left: 10, top: 20, width: 100, height: 200 },
    });
  });

  it("should combine crop with a following resize segment", () => {
    expect(mapper.mapPathToEdits("/10x20:110x220/50x40/test.jpg")).toEqual({
      crop: { left: 10, top: 20, width: 100, height: 200 },
      resize: { width: 50, height: 40 },
    });
  });

  it("should support up to six digits per coordinate", () => {
    expect(mapper.mapPathToEdits("/0x0:123456x654321/test.jpg")).toEqual({
      crop: { left: 0, top: 0, width: 123456, height: 654321 },
    });
  });

  it("should not produce a crop edit without a crop segment", () => {
    expect(mapper.mapPathToEdits("/test.jpg")).toEqual({});
  });
});
