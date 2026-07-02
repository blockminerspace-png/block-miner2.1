import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const reportApiFailure = readFileSync(
  new URL("../client/src/shared/utils/reportApiFailure.ts", import.meta.url),
  "utf8",
);
const clientErrorNoise = readFileSync(
  new URL("../client/src/shared/utils/clientErrorNoise.ts", import.meta.url),
  "utf8",
);

describe("api failure noise filter", () => {
  it("reportApiFailure skips 401 and transient gateway statuses", () => {
    assert.match(reportApiFailure, /isApiFailureNoise/);
    assert.match(reportApiFailure, /status === 401/);
    assert.match(reportApiFailure, /522/);
    assert.match(reportApiFailure, /if \(isApiFailureNoise\(payload\)\) return/);
  });

  it("clientErrorNoise treats YouTube Invalid video id as noise", () => {
    assert.match(clientErrorNoise, /isYoutubePlayerNoise/);
    assert.match(clientErrorNoise, /Invalid video id/);
    assert.match(clientErrorNoise, /widgetapi/);
  });
});
