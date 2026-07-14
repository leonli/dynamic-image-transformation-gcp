import { StatusCodes } from "./lib/enums";
import { ImageHandlerError } from "./lib/image-handler-error";
import { ImageEdits } from "./lib/types";

/**
 * Maps allowlisted query string parameters onto edits, layered on top of path-derived
 * edits for every request type. Mirrors AWS QueryParamMapper exactly:
 *   format→toFormat, fit→resize.fit, width/height→resize.* ("0"/empty→null),
 *   rotate (empty→null), flip/flop (falsy strings "0"/"false"/""), grayscale/greyscale.
 */
export class QueryParamMapper {
  private static readonly FALSY = new Set(["0", "false", ""]);

  public mapQueryParamsToEdits(query: Record<string, string>): ImageEdits {
    try {
      const edits: ImageEdits = {};
      const resize: ImageEdits = {};

      if (query.format !== undefined) {
        edits.toFormat = query.format === "jpg" ? "jpeg" : query.format;
      }
      if (query.fit !== undefined) {
        resize.fit = query.fit;
      }
      if (query.width !== undefined) {
        resize.width = this.mapDimension(query.width);
      }
      if (query.height !== undefined) {
        resize.height = this.mapDimension(query.height);
      }
      if (query.rotate !== undefined) {
        edits.rotate = query.rotate === "" ? null : Number(query.rotate);
        if (edits.rotate !== null && Number.isNaN(edits.rotate)) {
          throw new Error(`Invalid rotate value: ${query.rotate}`);
        }
      }
      if (query.flip !== undefined) {
        edits.flip = !QueryParamMapper.FALSY.has(query.flip.toLowerCase());
      }
      if (query.flop !== undefined) {
        edits.flop = !QueryParamMapper.FALSY.has(query.flop.toLowerCase());
      }
      const grayscale = query.grayscale ?? query.greyscale;
      if (grayscale !== undefined) {
        edits.greyscale = !QueryParamMapper.FALSY.has(grayscale.toLowerCase());
      }
      if (Object.keys(resize).length > 0) {
        edits.resize = resize;
      }
      return edits;
    } catch (error) {
      if (error instanceof ImageHandlerError) throw error;
      throw new ImageHandlerError(
        StatusCodes.BAD_REQUEST,
        "QueryParameterParsingError",
        "Query parameter parsing failed"
      );
    }
  }

  private mapDimension(value: string): number | null {
    if (value === "" || value === "0") return null;
    const num = Number(value);
    if (Number.isNaN(num)) {
      throw new Error(`Invalid dimension value: ${value}`);
    }
    return num;
  }
}
