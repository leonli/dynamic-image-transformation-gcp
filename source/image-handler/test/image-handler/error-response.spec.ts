import { ImageHandlerError, INTERNAL_ERROR_BODY } from "../../src/lib/image-handler-error";
import { StatusCodes } from "../../src/lib/enums";

describe("error response shape", () => {
  it("ImageHandlerError serializes to the AWS-compatible {status, code, message} JSON", () => {
    const error = new ImageHandlerError(StatusCodes.BAD_REQUEST, "SomeCode", "Something went wrong.");
    expect(error.toJSON()).toEqual({ status: 400, code: "SomeCode", message: "Something went wrong." });
    expect(JSON.parse(JSON.stringify(error.toJSON()))).toEqual({
      status: 400,
      code: "SomeCode",
      message: "Something went wrong.",
    });
  });

  it("is an instanceof Error with the message propagated", () => {
    const error = new ImageHandlerError(StatusCodes.NOT_FOUND, "NoSuchKey", "missing");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toEqual("missing");
    expect(error.status).toEqual(404);
  });

  it("INTERNAL_ERROR_BODY matches the AWS fallback body byte for byte", () => {
    expect(INTERNAL_ERROR_BODY).toEqual({
      message: "Internal error. Please contact the system administrator.",
      code: "InternalError",
      status: 500,
    });
  });
});
