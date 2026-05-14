import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "../backend/dist/shared/errors/httpErrors.js";

describe("httpErrors", () => {
  it("exposes stable codes and status for API mapping", () => {
    const cases = [
      [new BadRequestError("x"), 400, "BAD_REQUEST"],
      [new UnauthorizedError("x"), 401, "UNAUTHORIZED"],
      [new ForbiddenError("x"), 403, "FORBIDDEN"],
      [new NotFoundError("x"), 404, "NOT_FOUND"],
      [new ConflictError("x"), 409, "CONFLICT"],
      [new ValidationError("x"), 422, "VALIDATION_ERROR"],
      [new RateLimitedError("x"), 429, "RATE_LIMITED"],
      [new InternalError("x"), 500, "INTERNAL_ERROR"],
    ];
    for (const [err, status, code] of cases) {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, status);
      assert.equal(err.code, code);
    }
  });
});
