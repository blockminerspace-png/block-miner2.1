export type AdminMinerApiRow = Record<string, unknown> & { id?: number | string };

export type AdminMinersQuery = {
  page: number;
  limit: number;
  filter: string;
  sort: string;
  q?: string;
};

export type AdminMinersListResponse = {
  ok?: boolean;
  miners?: AdminMinerApiRow[];
  total?: number | string;
  page?: number | string;
  limit?: number | string;
  totalPages?: number | string;
  code?: string;
  message?: string;
  error?: string;
};

export type MinerMutationResponse = { ok?: boolean; message?: string; error?: string };

export type UploadImageResponse = { ok?: boolean; url?: string; message?: string; error?: string };
