import { StatusCodes } from "./enums";

/**
 * Error type serialized verbatim into the error response body, matching AWS:
 *   {"status": <number>, "code": "<ErrorCode>", "message": "<...>"}
 */
export class ImageHandlerError extends Error {
  constructor(public readonly status: StatusCodes, public readonly code: string, public readonly message: string) {
    super(message);
  }

  toJSON(): { status: number; code: string; message: string } {
    return { status: this.status, code: this.code, message: this.message };
  }
}

export const INTERNAL_ERROR_BODY = {
  message: "Internal error. Please contact the system administrator.",
  code: "InternalError",
  status: StatusCodes.INTERNAL_SERVER_ERROR,
};
