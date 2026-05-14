import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractCookieLanguage,
  normalizeBrowserLanguage,
  normalizeExplicitLanguage,
  resolveFallbackLanguages,
  resolveInitialLanguage,
} from "../client/src/i18n/language.ts";

describe("client i18n language resolution", () => {
  it("keeps explicit English choice from app storage", () => {
    assert.equal(resolveInitialLanguage({ storedLanguage: "en-US", storedLanguageUserSet: true, navigatorLanguage: "pt-BR" }), "en");
  });

  it("ignores stale stored language when it was not explicitly chosen by the user", () => {
    assert.equal(resolveInitialLanguage({ storedLanguage: "en-US", navigatorLanguage: "en-US" }), "pt-BR");
  });

  it("defaults first mobile visit to pt-BR even if navigator is English", () => {
    assert.equal(resolveInitialLanguage({ navigatorLanguage: "en-US" }), "pt-BR");
    assert.equal(normalizeBrowserLanguage("en-US"), "pt-BR");
  });

  it("accepts explicit querystring override before stored/browser values", () => {
    assert.equal(
      resolveInitialLanguage({
        search: "?lng=es-ES",
        storedLanguage: "en",
        storedLanguageUserSet: true,
        navigatorLanguage: "pt-BR",
      }),
      "es",
    );
  });

  it("maps Portuguese variants to pt-BR", () => {
    assert.equal(normalizeExplicitLanguage("pt"), "pt-BR");
    assert.equal(normalizeExplicitLanguage("pt-PT"), "pt-BR");
    assert.equal(resolveInitialLanguage({ navigatorLanguages: ["pt-PT", "en-US"] }), "pt-BR");
  });

  it("reads the persisted cookie and resolves locale-specific fallback order", () => {
    assert.equal(extractCookieLanguage("foo=bar; i18next=en; baz=1"), "en");
    assert.deepEqual(resolveFallbackLanguages("es"), ["es", "pt-BR", "en"]);
    assert.deepEqual(resolveFallbackLanguages("en"), ["en", "pt-BR", "es"]);
    assert.deepEqual(resolveFallbackLanguages("pt-BR"), ["pt-BR", "en", "es"]);
  });
});
