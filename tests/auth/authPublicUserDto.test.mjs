import test from "node:test";
import assert from "node:assert/strict";
import { toAuthPublicUserDto } from "#server/modules/auth/auth.dto.js";

test("toAuthPublicUserDto never exposes password hash field", () => {
  const row = {
    id: 1,
    name: "Test",
    username: "t",
    email: "t@example.com",
    passwordHash: "must-not-leak",
  };
  const dto = toAuthPublicUserDto(row);
  const json = JSON.stringify(dto);
  assert.equal(json.includes("password"), false);
  assert.equal(json.includes("must-not-leak"), false);
  assert.equal(dto.email, "t@example.com");
});
