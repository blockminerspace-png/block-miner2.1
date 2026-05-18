import { isAxiosError } from 'axios';

export const ADMIN_MINERS_SCHEMA_OUT_OF_DATE = 'ADMIN_MINERS_SCHEMA_OUT_OF_DATE';

export const ADMIN_MINERS_SCHEMA_OUT_OF_DATE_MESSAGE =
  'Catálogo indisponível: o banco ainda precisa da migration do catálogo de mineradoras.';

type ApiErrorBody = {
  code?: string;
  message?: string;
  error?: string;
};

export function readAdminMinersApiError(err: unknown): ApiErrorBody | null {
  if (!isAxiosError(err)) return null;
  const data = err.response?.data;
  if (!data || typeof data !== 'object') return null;
  const body = data as ApiErrorBody;
  return {
    code: typeof body.code === 'string' ? body.code : undefined,
    message: typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : undefined,
    error: typeof body.error === 'string' ? body.error : undefined,
  };
}

export function isAdminMinersSchemaOutOfDate(err: unknown): boolean {
  const body = readAdminMinersApiError(err);
  return body?.code === ADMIN_MINERS_SCHEMA_OUT_OF_DATE;
}

export function adminMinersListErrorMessage(err: unknown): string | null {
  if (isAdminMinersSchemaOutOfDate(err)) return ADMIN_MINERS_SCHEMA_OUT_OF_DATE_MESSAGE;
  const body = readAdminMinersApiError(err);
  return body?.message || body?.error || null;
}
