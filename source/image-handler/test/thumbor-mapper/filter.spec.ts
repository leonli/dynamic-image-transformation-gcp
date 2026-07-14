import { ImageFitTypes, ImageFormatTypes } from "../../src/lib/enums";
import { ThumborMapper } from "../../src/thumbor-mapper";

describe("ThumborMapper filters (full 20-filter table)", () => {
  const mapper = new ThumborMapper();
  const map = (path: string) => mapper.mapPathToEdits(path);

  it("autojpg() → toFormat jpeg", () => {
    expect(map("/filters:autojpg()/test.png")).toEqual({ toFormat: ImageFormatTypes.JPEG });
  });

  it("background_color(CSS name) → flatten with parsed background", () => {
    expect(map("/filters:background_color(red)/test.png")).toEqual({
      flatten: { background: { r: 255, g: 0, b: 0, alpha: 1 } },
    });
  });

  it("background_color(hex without #) → flatten with parsed background", () => {
    expect(map("/filters:background_color(00ff00)/test.png")).toEqual({
      flatten: { background: { r: 0, g: 255, b: 0, alpha: 1 } },
    });
  });

  it("blur(radius) → sigma radius/2", () => {
    expect(map("/filters:blur(7)/test.jpg")).toEqual({ blur: 3.5 });
  });

  it("blur(radius,sigma) → explicit sigma wins", () => {
    expect(map("/filters:blur(7,2)/test.jpg")).toEqual({ blur: 2 });
  });

  it("convolution(matrix,width) → convolve with computed height", () => {
    expect(map("/filters:convolution(1;2;1;2;4;2;1;2;1,3)/test.png")).toEqual({
      convolve: { width: 3, height: 3, kernel: [1, 2, 1, 2, 4, 2, 1, 2, 1] },
    });
  });

  it("convolution with a non-square matrix rounds the height up", () => {
    expect(map("/filters:convolution(1;2;3;4;5,2)/test.png")).toEqual({
      convolve: { width: 2, height: 3, kernel: [1, 2, 3, 4, 5] },
    });
  });

  it("equalize() → normalize true", () => {
    expect(map("/filters:equalize()/test.png")).toEqual({ normalize: true });
  });

  it("fill(color) → resize fit contain with background", () => {
    expect(map("/100x80/filters:fill(blue)/test.png")).toEqual({
      resize: { width: 100, height: 80, fit: ImageFitTypes.CONTAIN, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    });
  });

  it("format(png) → toFormat png", () => {
    expect(map("/filters:format(png)/test.jpg")).toEqual({ toFormat: ImageFormatTypes.PNG });
  });

  it("format(jpg) → toFormat normalized to jpeg", () => {
    expect(map("/filters:format(jpg)/test.png")).toEqual({ toFormat: ImageFormatTypes.JPEG });
  });

  it("format(<unsupported>) is ignored", () => {
    expect(map("/filters:format(bmp)/test.png")).toEqual({});
  });

  it("grayscale() → grayscale true", () => {
    expect(map("/filters:grayscale()/test.png")).toEqual({ grayscale: true });
  });

  it("no_upscale() → resize.withoutEnlargement true", () => {
    expect(map("/filters:no_upscale()/test.png")).toEqual({ resize: { withoutEnlargement: true } });
  });

  it("proportion(r) multiplies existing width/height", () => {
    expect(map("/200x100/filters:proportion(0.5)/test.png")).toEqual({
      resize: { width: 100, height: 50 },
    });
  });

  it("proportion(r) without dimensions stores resize.ratio for later", () => {
    expect(map("/filters:proportion(0.5)/test.png")).toEqual({ resize: { ratio: 0.5 } });
  });

  it("quality(q) targets the format derived from the URL extension (jpg → jpeg)", () => {
    expect(map("/filters:quality(50)/test.jpg")).toEqual({ jpeg: { quality: 50 } });
  });

  it("quality(q) targets png for a .png URL", () => {
    expect(map("/filters:quality(50)/test.png")).toEqual({ png: { quality: 50 } });
  });

  it("quality(q) targets toFormat when a format filter is present (sorted before quality)", () => {
    expect(map("/filters:format(webp)/filters:quality(50)/test.jpg")).toEqual({
      toFormat: ImageFormatTypes.WEBP,
      webp: { quality: 50 },
    });
  });

  it("quality with a non-numeric value is ignored", () => {
    expect(map("/filters:quality(abc)/test.jpg")).toEqual({});
  });

  it("rgb(r,g,b) converts percentages to 0-255 tint channels", () => {
    const edits = map("/filters:rgb(20,40,60)/test.png");
    expect(Object.keys(edits)).toEqual(["tint"]);
    expect(edits.tint.r).toBeCloseTo(51, 5);
    expect(edits.tint.g).toBeCloseTo(102, 5);
    expect(edits.tint.b).toBeCloseTo(153, 5);
  });

  it("rgb clamps percentages above 100", () => {
    const edits = map("/filters:rgb(200,0,0)/test.png");
    expect(edits.tint.r).toEqual(255);
  });

  it("rotate(d) → rotate number", () => {
    expect(map("/filters:rotate(90)/test.png")).toEqual({ rotate: 90 });
  });

  it("rotate() with empty argument → rotate key present with undefined value (sharp auto-orient)", () => {
    const edits = map("/filters:rotate()/test.png");
    expect(Object.prototype.hasOwnProperty.call(edits, "rotate")).toBe(true);
    expect(edits.rotate).toBeUndefined();
  });

  it("sharpen(a,b) → 1 + b/2", () => {
    expect(map("/filters:sharpen(2,1)/test.png")).toEqual({ sharpen: 1.5 });
    expect(map("/filters:sharpen(2,3)/test.png")).toEqual({ sharpen: 2.5 });
  });

  it("stretch() → resize fit fill", () => {
    expect(map("/100x80/filters:stretch()/test.png")).toEqual({
      resize: { width: 100, height: 80, fit: ImageFitTypes.FILL },
    });
  });

  it("stretch() does not override fit-in's inside fit", () => {
    expect(map("/fit-in/100x80/filters:stretch()/test.png")).toEqual({
      resize: { width: 100, height: 80, fit: ImageFitTypes.INSIDE },
    });
  });

  it("strip_exif() → stripExif true", () => {
    expect(map("/filters:strip_exif()/test.jpg")).toEqual({ stripExif: true });
  });

  it("strip_icc() → stripIcc true", () => {
    expect(map("/filters:strip_icc()/test.jpg")).toEqual({ stripIcc: true });
  });

  it("upscale() → resize fit inside", () => {
    expect(map("/filters:upscale()/test.png")).toEqual({ resize: { fit: ImageFitTypes.INSIDE } });
  });

  it("watermark with all seven arguments", () => {
    expect(map("/filters:watermark(source-bucket,mark.png,10,20,0,30,40)/test.jpg")).toEqual({
      overlayWith: {
        bucket: "source-bucket",
        key: "mark.png",
        alpha: "0",
        wRatio: "30",
        hRatio: "40",
        options: { left: 10, top: 20 },
      },
    });
  });

  it("watermark keeps NNp percentage positions as strings (incl. negatives)", () => {
    expect(map("/filters:watermark(source-bucket,mark.png,50p,-10p,20)/test.jpg")).toEqual({
      overlayWith: {
        bucket: "source-bucket",
        key: "mark.png",
        alpha: "20",
        wRatio: undefined,
        hRatio: undefined,
        options: { left: "50p", top: "-10p" },
      },
    });
  });

  it("watermark drops non-numeric non-percentage positions", () => {
    const edits = map("/filters:watermark(source-bucket,mark.png,left,top,20)/test.jpg");
    expect(edits.overlayWith.options).toEqual({});
  });

  it("animated() defaults to true; animated(false)/animated(FALSE) → false", () => {
    expect(map("/filters:animated()/test.gif")).toEqual({ animated: true });
    expect(map("/filters:animated(true)/test.gif")).toEqual({ animated: true });
    expect(map("/filters:animated(false)/test.gif")).toEqual({ animated: false });
    expect(map("/filters:animated(FALSE)/test.gif")).toEqual({ animated: false });
  });

  it("smart_crop(i,p) → smartCrop with parsed ints", () => {
    expect(map("/filters:smart_crop(2,10)/test.jpg")).toEqual({ smartCrop: { faceIndex: 2, padding: 10 } });
  });

  it("smart_crop() without arguments → smartCrop with undefined fields", () => {
    const edits = map("/filters:smart_crop()/test.jpg");
    expect(edits.smartCrop).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(edits, "smartCrop")).toBe(true);
  });

  it("unknown filters are ignored (AWS parity)", () => {
    expect(map("/filters:does_not_exist(1)/test.png")).toEqual({});
  });

  it("applies multiple filter segments sorted alphabetically", () => {
    expect(map("/filters:quality(50)/filters:format(webp)/test.jpg")).toEqual({
      toFormat: ImageFormatTypes.WEBP,
      webp: { quality: 50 },
    });
  });
});
