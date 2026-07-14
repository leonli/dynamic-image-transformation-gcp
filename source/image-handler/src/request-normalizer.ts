import { NORMALIZED_QUERY_PARAM_ALLOWLIST } from "./lib/constants";
import { Headers, ImageHandlerEvent } from "./lib/types";

/**
 * Port of the AWS CloudFront Function (apig-request-modifier.js) that runs at the edge
 * in the original solution. Because Cloud CDN has no viewer-request function equivalent,
 * the same normalization runs here at the service entrance, BEFORE any parsing:
 *
 *  - Accept header: collapsed to "image/webp" when the client advertises webp, else "".
 *    (Cloud CDN's cache key includes the Accept header via custom cache keys, so this
 *    normalization keeps the cache cardinality at exactly two variants per URL.)
 *  - Query string: only the AWS allowlist survives; for multi-value params the last
 *    value wins; keys are sorted so equivalent URLs share one cache entry.
 */
export function normalizeEvent(rawPath: string, rawQuery: URLSearchParams, rawHeaders: Headers): ImageHandlerEvent {
  const accept = rawHeaders["accept"] ?? rawHeaders["Accept"] ?? "";
  const normalizedAccept = accept.includes("image/webp") ? "image/webp" : "";

  const filtered: Record<string, string> = {};
  for (const key of NORMALIZED_QUERY_PARAM_ALLOWLIST) {
    const values = rawQuery.getAll(key);
    if (values.length > 0) {
      filtered[key] = values[values.length - 1]; // last value wins, per AWS edge function
    }
  }
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(filtered).sort()) {
    sorted[key] = filtered[key];
  }

  return {
    path: rawPath,
    queryStringParameters: Object.keys(sorted).length > 0 ? sorted : null,
    headers: { ...rawHeaders, accept: normalizedAccept },
  };
}
