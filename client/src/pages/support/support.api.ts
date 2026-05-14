import { api } from '../../store/auth';

export function getSupportTickets(params: { page: number; limit: number }) {
  return api.get('/support', { params });
}

export function getSupportTicket(id: string | number) {
  return api.get(`/support/${id}`);
}

export function postSupportUploadImage(formData: FormData, headers?: Record<string, string>) {
  return api.post('/support/upload-image', formData, { headers });
}

export function postSupportReply(id: string | number, body: unknown) {
  return api.post(`/support/${id}/reply`, body);
}

export function postSupportTicket(body: unknown) {
  return api.post('/support', body);
}
