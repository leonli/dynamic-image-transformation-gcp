import { mockVision } from "../mock";

import { ImageHandler } from "../../src/image-handler";
import { RequestTypes } from "../../src/lib/enums";
import { ImageRequestInfo } from "../../src/lib/types";
import { StorageProvider } from "../../src/storage-provider";
import { VisionClient } from "../../src/vision-client";
import { createSplitImage, expectError } from "../helpers";

type Likelihood = "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";

const annotation = (overrides: Partial<Record<"adult" | "violence" | "racy" | "medical" | "spoof", Likelihood>>) => [
  {
    safeSearchAnnotation: {
      adult: "VERY_UNLIKELY",
      violence: "VERY_UNLIKELY",
      racy: "VERY_UNLIKELY",
      medical: "VERY_UNLIKELY",
      spoof: "VERY_UNLIKELY",
      ...overrides,
    },
  },
];

describe("ImageHandler contentModeration (Cloud Vision SafeSearch)", () => {
  const handler = new ImageHandler(new StorageProvider(), new VisionClient());
  let image: Buffer;
  let cleanOutput: Buffer;

  const requestInfo = (edits: Record<string, unknown>): ImageRequestInfo => ({
    requestType: RequestTypes.THUMBOR,
    bucket: "source-bucket",
    key: "test.png",
    edits,
    originalImage: image,
    contentType: "image/png",
  });

  beforeAll(async () => {
    image = await createSplitImage(100, 80);
    mockVision.safeSearchDetection.mockResolvedValue(annotation({}));
    cleanOutput = await handler.process(requestInfo({ contentModeration: true }));
  });

  beforeEach(() => {
    mockVision.safeSearchDetection.mockReset();
  });

  it("blurs the image when a category meets the default minConfidence of 75", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ adult: "VERY_LIKELY" }));
    const output = await handler.process(requestInfo({ contentModeration: true }));
    expect(output.equals(cleanOutput)).toBe(false);
  });

  it("blurs at exactly the threshold (LIKELY=75 vs default minConfidence 75)", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ racy: "LIKELY" }));
    const output = await handler.process(requestInfo({ contentModeration: true }));
    expect(output.equals(cleanOutput)).toBe(false);
  });

  it("does not blur below the confidence threshold", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ adult: "POSSIBLE" }));
    const output = await handler.process(requestInfo({ contentModeration: true }));
    expect(output.equals(cleanOutput)).toBe(true);
  });

  it("respects a custom minConfidence", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ adult: "POSSIBLE" }));
    const output = await handler.process(requestInfo({ contentModeration: { minConfidence: 50 } }));
    expect(output.equals(cleanOutput)).toBe(false);
  });

  it("filters hits by moderationLabels", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ adult: "VERY_LIKELY" }));
    const output = await handler.process(
      requestInfo({ contentModeration: { moderationLabels: ["Violence"] } })
    );
    expect(output.equals(cleanOutput)).toBe(true);
  });

  it("accepts Rekognition label aliases (Explicit Nudity → Adult)", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ adult: "VERY_LIKELY" }));
    const output = await handler.process(
      requestInfo({ contentModeration: { moderationLabels: ["Explicit Nudity"] } })
    );
    expect(output.equals(cleanOutput)).toBe(false);
  });

  it("accepts the Graphic Violence and Suggestive aliases", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ violence: "VERY_LIKELY", racy: "VERY_LIKELY" }));
    const violent = await handler.process(
      requestInfo({ contentModeration: { moderationLabels: ["Graphic Violence"] } })
    );
    expect(violent.equals(cleanOutput)).toBe(false);
    const suggestive = await handler.process(
      requestInfo({ contentModeration: { moderationLabels: ["Suggestive"] } })
    );
    expect(suggestive.equals(cleanOutput)).toBe(false);
  });

  it("uses the custom blur strength", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ adult: "VERY_LIKELY" }));
    const soft = await handler.process(requestInfo({ contentModeration: { blur: 1 } }));
    const hard = await handler.process(requestInfo({ contentModeration: { blur: 100 } }));
    expect(soft.equals(cleanOutput)).toBe(false);
    expect(hard.equals(cleanOutput)).toBe(false);
    expect(soft.equals(hard)).toBe(false);
  });

  it("skips blurring when blur is outside sharp's 0.3-1000 range", async () => {
    mockVision.safeSearchDetection.mockResolvedValue(annotation({ adult: "VERY_LIKELY" }));
    const output = await handler.process(requestInfo({ contentModeration: { blur: 0 } }));
    expect(output.equals(cleanOutput)).toBe(true);
  });

  it("returns the image unchanged when the annotation is missing", async () => {
    mockVision.safeSearchDetection.mockResolvedValue([{}]);
    const output = await handler.process(requestInfo({ contentModeration: true }));
    expect(output.equals(cleanOutput)).toBe(true);
  });

  it("throws 500 Rekognition::DetectModerationLabelsError when the Vision call fails (AWS-compatible code)", async () => {
    mockVision.safeSearchDetection.mockRejectedValue(new Error("vision unavailable"));
    await expectError(
      handler.process(requestInfo({ contentModeration: true })),
      500,
      "Rekognition::DetectModerationLabelsError",
      "Content moderation failed"
    );
  });
});
