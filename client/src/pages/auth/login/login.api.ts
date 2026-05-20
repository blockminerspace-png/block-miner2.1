import type { AxiosResponse } from 'axios';
import { api } from '../../../store/auth';
import { API_TIMEOUT_MS_AUTH } from '../../../shared/utils/apiTimeout';
import type { AuthLoginRequestBody } from '../shared/auth.types';

export async function postAuthLogin(body: AuthLoginRequestBody): Promise<AxiosResponse<unknown>> {
  return api.post('/auth/login', body, { timeout: API_TIMEOUT_MS_AUTH });
}
