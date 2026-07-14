// Allowlists / deny lists copied from the AWS solution's lib/constants.ts so that the
// accepted edit surface is identical for migrated clients.

export const SHARP_EDIT_ALLOWLIST_ARRAY: string[] = [
  // CHANNEL
  "removeAlpha",
  "ensureAlpha",
  "extractChannel",
  "joinChannel",
  "bandbool",
  // COLOR
  "tint",
  "greyscale",
  "grayscale",
  "pipelineColourspace",
  "pipelineColorspace",
  "toColourspace",
  "toColorspace",
  // OPERATION
  "rotate",
  "flip",
  "flop",
  "affine",
  "sharpen",
  "median",
  "blur",
  "flatten",
  "unflatten",
  "gamma",
  "negate",
  "normalise",
  "normalize",
  "clahe",
  "convolve",
  "threshold",
  "boolean",
  "linear",
  "recomb",
  "modulate",
  // FORMAT (value is the sharp format options object, e.g. { quality: 80 })
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "tiff",
  "heif",
  "toFormat",
  // RESIZE
  "resize",
  "extend",
  "extract",
  "trim",
];

export const ALTERNATE_EDIT_ALLOWLIST_ARRAY: string[] = [
  "overlayWith",
  "smartCrop",
  "roundCrop",
  "contentModeration",
  "crop",
  "animated",
];

export const ALLOWED_EDIT_KEYS = new Set([...SHARP_EDIT_ALLOWLIST_ARRAY, ...ALTERNATE_EDIT_ALLOWLIST_ARRAY]);

/** Custom response headers matching any of these patterns are dropped (case-insensitive). */
export const HEADER_DENY_PATTERNS: RegExp[] = [
  /^authorization$/i,
  /^connection$/i,
  /^server$/i,
  /^transfer-encoding$/i,
  /^referrer-policy$/i,
  /^permissions-policy$/i,
  /^www-authenticate$/i,
  /^proxy-authenticate$/i,
  /^x-api-key$/i,
  /^set-cookie$/i,
  /^x-frame-/i,
  /^x-content-/i,
  /^x-xss-/i,
  /^strict-transport-/i,
  /^permissions-/i,
  /^x-amz-/i,
  /^x-amzn-/i,
  /^access-control-/i,
  /^cross-origin-/i,
  /^content-/i,
];

/**
 * Query params surviving edge normalization — identical to the AWS CloudFront Function
 * allowlist (apig-request-modifier.js). Anything else never reaches the handler.
 */
export const NORMALIZED_QUERY_PARAM_ALLOWLIST: string[] = [
  "signature",
  "expires",
  "format",
  "fit",
  "width",
  "height",
  "rotate",
  "flip",
  "flop",
  "grayscale",
];

/** Default Cache-Control when the source object carries none. */
export const DEFAULT_CACHE_CONTROL = "max-age=31536000,public";

/** Error-response Cache-Control (AWS OL-path convention, adopted here for Cloud CDN). */
export const ERROR_CACHE_CONTROL_4XX = "max-age=10,public";
export const ERROR_CACHE_CONTROL_5XX = "max-age=600,public";

/** AWS API Gateway response limit; enforced only when COMPAT_AWS_LIMITS=Yes. */
export const AWS_COMPAT_MAX_BASE64_BYTES = 6 * 1024 * 1024;

export const DEFAULT_WEBP_EFFORT = 4;
