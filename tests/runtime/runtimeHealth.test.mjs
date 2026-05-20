import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrismaAwareErrorBody,
  isPrismaConnectionError,
  isPrismaTransactionRuntimeError,
  prismaAwareHttpStatus,
} from "#server/utils/prismaHttpErrors.js";

/** Mirrors audit classification buckets. */
export function classifyEndpointLatencyMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "timeout/falha";
  if (ms < 300) return "rápido";
  if (ms < 1000) return "aceitável";
  if (ms < 3000) return "lento";
  return "crítico";
}

test("classifyEndpointLatencyMs buckets", () => {
  assert.equal(classifyEndpointLatencyMs(50), "rápido");
  assert.equal(classifyEndpointLatencyMs(500), "aceitável");
  assert.equal(classifyEndpointLatencyMs(2000), "lento");
  assert.equal(classifyEndpointLatencyMs(5000), "crítico");
});

test("Prisma transaction runtime errors map to SERVICE_UNAVAILABLE", () => {
  const err = new Error("Transaction API error: Unable to start a transaction in the given time.");
  assert.equal(isPrismaTransactionRuntimeError(err), true);
  assert.equal(isPrismaConnectionError(err), true);
  assert.equal(prismaAwareHttpStatus(err), 503);
  const body = buildPrismaAwareErrorBody(err, "Serviço ocupado.");
  assert.equal(body.code, "SERVICE_UNAVAILABLE");
});

test("pool connect timeout maps to 503 not INTERNAL_ERROR", () => {
  const err = new Error("timeout exceeded when trying to connect");
  assert.equal(prismaAwareHttpStatus(err), 503);
  assert.equal(buildPrismaAwareErrorBody(err, "fallback").code, "SERVICE_UNAVAILABLE");
});
