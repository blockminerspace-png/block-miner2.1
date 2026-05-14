export type CronLogger = {
  info?: (message: string, payload?: Record<string, unknown>) => void;
  warn?: (message: string, payload?: Record<string, unknown>) => void;
  error?: (message: string, payload?: Record<string, unknown>) => void;
  debug?: (message: string, payload?: Record<string, unknown>) => void;
};

export type CronValidationResult = {
  ok: boolean;
  reason?: string | null;
  details?: Record<string, unknown>;
};

export type CronRunParams = {
  action: string;
  prepare?: () => unknown | Promise<unknown>;
  validate?: (prepared: unknown) => CronValidationResult | boolean | Promise<CronValidationResult | boolean>;
  sanitize?: (prepared: unknown) => unknown | Promise<unknown>;
  execute?: (sanitized: unknown, prepared: unknown) => unknown | Promise<unknown>;
  confirm?: (ctx: {
    prepared: unknown;
    sanitized: unknown;
    executionResult: unknown;
  }) => CronValidationResult | boolean | Promise<CronValidationResult | boolean>;
  meta?: Record<string, unknown>;
  allowConcurrent?: boolean;
  logStart?: boolean;
  logSuccess?: boolean;
  skippedLogLevel?: string;
  validateFailureLogLevel?: string;
};

export type CronRunOutcome =
  | { ok: true; durationMs?: number; result?: unknown }
  | { ok: false; reason: string; stage?: string; durationMs?: number };

export function formatError(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function sanitizeMeta(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
      continue;
    }
    if (typeof value === "string") {
      result[key] = value.length > 300 ? `${value.slice(0, 300)}...` : value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.slice(0, 20).map((item) => {
        if (item === null || ["string", "number", "boolean"].includes(typeof item)) return item;
        return "[complex-item]";
      });
      continue;
    }
    result[key] = "[complex]";
  }
  return result;
}

function normalizeValidation(validationResult: CronValidationResult | boolean | null | undefined): {
  ok: boolean;
  reason: string | null;
  details: Record<string, unknown>;
} {
  if (typeof validationResult === "boolean") return { ok: validationResult, reason: null, details: {} };
  if (!validationResult || typeof validationResult !== "object") return { ok: true, reason: null, details: {} };
  const vr = validationResult as CronValidationResult;
  return {
    ok: vr.ok !== false,
    reason: vr.reason ?? null,
    details: sanitizeMeta(vr.details || {}),
  };
}

function normalizeConfirm(confirmResult: CronValidationResult | boolean | null | undefined): {
  ok: boolean;
  reason: string | null;
  details: Record<string, unknown>;
} {
  if (typeof confirmResult === "boolean") return { ok: confirmResult, reason: null, details: {} };
  if (!confirmResult || typeof confirmResult !== "object") return { ok: true, reason: null, details: {} };
  const cr = confirmResult as CronValidationResult;
  return {
    ok: cr.ok !== false,
    reason: cr.reason ?? null,
    details: sanitizeMeta(cr.details || {}),
  };
}

function writeWithLevel(
  logger: CronLogger,
  level: string,
  message: string,
  payload: Record<string, unknown>,
): void {
  const normalizedLevel = String(level || "warn").toLowerCase();
  const fn = logger[normalizedLevel];
  if (typeof fn === "function") {
    (fn as (m: string, p?: Record<string, unknown>) => void)(message, payload);
    return;
  }
  if (typeof logger.warn === "function") {
    logger.warn(message, payload);
  }
}

export function createCronActionRunner({ logger, cronName }: { logger: CronLogger; cronName: string }) {
  const inFlight = new Set<string>();

  return async function runAction(params: CronRunParams): Promise<CronRunOutcome> {
    const {
      action,
      prepare,
      validate,
      sanitize,
      execute,
      confirm,
      meta,
      allowConcurrent = false,
      logStart = true,
      logSuccess = true,
      skippedLogLevel = "warn",
      validateFailureLogLevel = "warn",
    } = params;

    const actionName = String(action || "unnamed_action");
    const lockKey = `${cronName}:${actionName}`;
    const startedAt = Date.now();
    const baseMeta = sanitizeMeta(meta || {});

    if (!allowConcurrent && inFlight.has(lockKey)) {
      writeWithLevel(logger, skippedLogLevel, "Cron action skipped", {
        cron: cronName,
        action: actionName,
        reason: "already_running",
        ...baseMeta,
      });
      return { ok: false, reason: "already_running" };
    }

    inFlight.add(lockKey);
    try {
      if (logStart) {
        logger.info?.("Cron action started", {
          cron: cronName,
          action: actionName,
          ...baseMeta,
        });
      }

      let prepared: unknown;
      let sanitized: unknown;
      let executionResult: unknown;

      try {
        if (typeof prepare === "function") {
          prepared = await prepare();
        }
      } catch (error: unknown) {
        logger.error?.("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "prepare",
          reason: formatError(error),
          ...baseMeta,
        });
        return { ok: false, stage: "prepare", reason: formatError(error) };
      }

      try {
        const validation = normalizeValidation(
          typeof validate === "function" ? await validate(prepared) : { ok: true },
        );

        if (!validation.ok) {
          writeWithLevel(logger, validateFailureLogLevel, "Cron action not executed", {
            cron: cronName,
            action: actionName,
            stage: "validate",
            reason: validation.reason || "validation_failed",
            ...validation.details,
            ...baseMeta,
          });
          return { ok: false, stage: "validate", reason: validation.reason || "validation_failed" };
        }
      } catch (error: unknown) {
        logger.error?.("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "validate",
          reason: formatError(error),
          ...baseMeta,
        });
        return { ok: false, stage: "validate", reason: formatError(error) };
      }

      try {
        sanitized = typeof sanitize === "function" ? await sanitize(prepared) : prepared;
      } catch (error: unknown) {
        logger.error?.("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "sanitize",
          reason: formatError(error),
          ...baseMeta,
        });
        return { ok: false, stage: "sanitize", reason: formatError(error) };
      }

      try {
        executionResult = typeof execute === "function" ? await execute(sanitized, prepared) : undefined;
      } catch (error: unknown) {
        logger.error?.("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "execute",
          reason: formatError(error),
          ...baseMeta,
        });
        return { ok: false, stage: "execute", reason: formatError(error) };
      }

      try {
        const confirmation = normalizeConfirm(
          typeof confirm === "function"
            ? await confirm({ prepared, sanitized, executionResult })
            : { ok: true },
        );

        if (!confirmation.ok) {
          logger.warn?.("Cron action executed but not confirmed", {
            cron: cronName,
            action: actionName,
            stage: "confirm",
            reason: confirmation.reason || "not_confirmed",
            durationMs: Date.now() - startedAt,
            ...confirmation.details,
            ...baseMeta,
          });
          return { ok: false, stage: "confirm", reason: confirmation.reason || "not_confirmed" };
        }

        if (logSuccess) {
          logger.info?.("Cron action completed", {
            cron: cronName,
            action: actionName,
            durationMs: Date.now() - startedAt,
            ...confirmation.details,
            ...baseMeta,
          });
        }

        return { ok: true, durationMs: Date.now() - startedAt, result: executionResult };
      } catch (error: unknown) {
        logger.error?.("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "confirm",
          reason: formatError(error),
          ...baseMeta,
        });
        return { ok: false, stage: "confirm", reason: formatError(error) };
      }
    } finally {
      inFlight.delete(lockKey);
    }
  };
}
