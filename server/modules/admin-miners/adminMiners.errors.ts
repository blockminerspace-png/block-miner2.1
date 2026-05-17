export const ADMIN_MINERS_ERROR = {
  INVALID_QUERY: "ADMIN_MINERS_INVALID_QUERY",
  INVALID_ID: "ADMIN_MINERS_INVALID_ID",
  INVALID_PAYLOAD: "ADMIN_MINERS_INVALID_PAYLOAD",
  NOT_FOUND: "ADMIN_MINERS_NOT_FOUND",
  DUPLICATE_SLUG: "ADMIN_MINERS_DUPLICATE_SLUG",
  INTERNAL_ERROR: "ADMIN_MINERS_INTERNAL_ERROR",
} as const;

export type AdminMinersErrorCode = (typeof ADMIN_MINERS_ERROR)[keyof typeof ADMIN_MINERS_ERROR];

export class AdminMinersHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: AdminMinersErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminMinersHttpError";
  }
}

export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
