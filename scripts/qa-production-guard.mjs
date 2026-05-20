/**
 * Guards QA scripts from polluting production without explicit flags.
 */
import {
  isProductionQaBaseUrl,
  isQaTestUserRecord,
} from "./qa-test-user-patterns.mjs";

export function assertQaProductionUserCreateAllowed(context = "QA script") {
  if (!isProductionQaBaseUrl()) return;
  if (process.env.QA_ALLOW_PRODUCTION_USER_CREATE === "YES") return;
  throw new Error(
    `${context}: abortado — não pode criar usuários em produção (blockminer.space) sem QA_ALLOW_PRODUCTION_USER_CREATE=YES`,
  );
}

export function assertQaSingleUserOnly(context = "QA script") {
  if (!isProductionQaBaseUrl()) return;
  if (process.env.QA_SINGLE_USER_ONLY === "YES") return;
  throw new Error(
    `${context}: abortado — em produção exige QA_SINGLE_USER_ONLY=YES para criar no máximo um usuário QA`,
  );
}

/** @param {{ username?: string | null, email?: string | null }} planned */
export function assertQaUserPrefixAllowed(planned) {
  if (!isQaTestUserRecord(planned)) {
    throw new Error("Abortado: prefixo/email de usuário QA inválido (use qa_chk_* e @qa.blockminer.invalid)");
  }
}

export function resolveQaBaseUrl() {
  return String(process.env.BLOCKMINER_QA_BASE_URL || "https://blockminer.space").replace(/\/$/, "");
}
