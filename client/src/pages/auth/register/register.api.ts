import type { AxiosResponse } from 'axios';
import { api } from '../../../store/auth';

export async function postAuthRegister(body: Record<string, unknown>): Promise<AxiosResponse<unknown>> {
  return api.post('/auth/register', body);
}
