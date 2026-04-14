import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickMiniPassI18n } from "../server/services/miniPass/miniPassI18n.js";

describe("pickMiniPassI18n", () => {
  const blob = { en: "Hello", ptBR: "Oi", es: "Hola" };

  it("prefers pt for Portuguese accept-language", () => {
    assert.equal(pickMiniPassI18n(blob, "pt-BR"), "Oi");
    assert.equal(pickMiniPassI18n(blob, "pt"), "Oi");
  });

  it("prefers es for Spanish", () => {
    assert.equal(pickMiniPassI18n(blob, "es-ES"), "Hola");
  });

  it("falls back to en", () => {
    assert.equal(pickMiniPassI18n(blob, "de"), "Hello");
    assert.equal(pickMiniPassI18n(blob, ""), "Hello");
  });
});
