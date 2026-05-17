import type { AxiosResponse } from 'axios';
import { api } from '../../../store/auth';
import type { AuthLoginRequestBody } from '../shared/auth.types';

export async function postAuthLogin(body: AuthLoginRequestBody): Promise<AxiosResponse<unknown>> {
  return api.post('/auth/login', body);
}
