import axios from 'axios';

export function readAxiosHttpStatus(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const status = error.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Stop background polling after auth failure or repeated server/DB errors. */
export function shouldStopApiPolling(status: number | undefined): boolean {
  return status === 401 || status === 403 || status === 500 || status === 503;
}

export function readAxiosResponseMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback;
  }
  const data = error.response?.data;
  if (data && typeof data === 'object') {
    const msg = (data as { message?: unknown; error?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    const err = (data as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return err;
  }
  return fallback;
}
