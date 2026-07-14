// Mirrors aws-solutions/dynamic-image-transformation-for-amazon-cloudfront lib enums.
// Values must stay byte-identical to AWS so that migrated clients see the same API surface.

export enum StatusCodes {
  OK = 200,
  BAD_REQUEST = 400,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  REQUEST_TOO_LONG = 413,
  INTERNAL_SERVER_ERROR = 500,
  TIMEOUT = 503,
}

export enum RequestTypes {
  DEFAULT = "Default",
  CUSTOM = "Custom",
  THUMBOR = "Thumbor",
}

export enum ImageFormatTypes {
  JPG = "jpg",
  JPEG = "jpeg",
  PNG = "png",
  WEBP = "webp",
  TIFF = "tiff",
  HEIF = "heif",
  HEIC = "heic",
  RAW = "raw",
  GIF = "gif",
  AVIF = "avif",
  SVG = "svg",
}

export enum ImageFitTypes {
  COVER = "cover",
  CONTAIN = "contain",
  FILL = "fill",
  INSIDE = "inside",
  OUTSIDE = "outside",
}

export enum ContentTypes {
  PNG = "image/png",
  JPEG = "image/jpeg",
  WEBP = "image/webp",
  TIFF = "image/tiff",
  GIF = "image/gif",
  SVG = "image/svg+xml",
  AVIF = "image/avif",
}
