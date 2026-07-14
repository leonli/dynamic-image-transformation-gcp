import sharp from "sharp";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export const RED: RGBA = { r: 255, g: 0, b: 0, alpha: 1 };
export const GREEN: RGBA = { r: 0, g: 255, b: 0, alpha: 1 };
export const BLUE: RGBA = { r: 0, g: 0, b: 255, alpha: 1 };

/** Solid-color test image generated on the fly (no binary fixtures in the repo). */
export async function createImage(
  width = 100,
  height = 80,
  background: RGBA = RED,
  format: "png" | "jpeg" | "webp" | "tiff" | "gif" = "png"
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background } })[format]().toBuffer();
}

/** Left half `left` color, right half `right` color — useful for detecting blur. */
export async function createSplitImage(
  width = 100,
  height = 80,
  left: RGBA = RED,
  right: RGBA = BLUE
): Promise<Buffer> {
  const rightHalf = await sharp({
    create: { width: Math.floor(width / 2), height, channels: 4, background: right },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 4, background: left } })
    .composite([{ input: rightHalf, left: width - Math.floor(width / 2), top: 0 }])
    .png()
    .toBuffer();
}

/** Multi-frame animated GIF built with sharp's join feature (no binary fixtures). */
export async function createAnimatedGif(width = 40, height = 30, frames = 2): Promise<Buffer> {
  const palette: RGBA[] = [RED, GREEN, BLUE];
  const frameBuffers: Buffer[] = [];
  for (let i = 0; i < frames; i++) {
    frameBuffers.push(
      await sharp({ create: { width, height, channels: 4, background: palette[i % palette.length] } })
        .png()
        .toBuffer()
    );
  }
  return sharp(frameBuffers as never, { join: { animated: true } })
    .gif()
    .toBuffer();
}

export const SVG_IMAGE = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80"><rect width="100" height="80" fill="#ff0000"/></svg>`
);

/** Reads a single RGBA pixel out of any sharp-readable buffer. */
export async function pixelAt(buffer: Buffer, x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
}

/** Base64-encoded DEFAULT request path helper. */
export function toDefaultPath(request: Record<string, unknown>): string {
  return `/${Buffer.from(JSON.stringify(request)).toString("base64")}`;
}

/**
 * Asserts that a function/promise rejects with an ImageHandlerError carrying the exact
 * status and code (and optionally a message fragment). Fails loudly when nothing throws.
 */
export async function expectError(
  run: (() => unknown) | Promise<unknown>,
  status: number,
  code: string,
  messagePart?: string
): Promise<void> {
  let thrown: unknown = null;
  try {
    await (typeof run === "function" ? run() : run);
  } catch (error) {
    thrown = error;
  }
  if (thrown === null) {
    throw new Error(`Expected error ${code} (status ${status}) but nothing was thrown`);
  }
  expect(thrown).toMatchObject({ status, code });
  if (messagePart !== undefined) {
    expect((thrown as Error).message).toContain(messagePart);
  }
}
