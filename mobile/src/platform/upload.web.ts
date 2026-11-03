import { ApiError } from '../core/errors';

export async function uploadFile(url: string, uri: string, headers: Record<string, string>) {
  const blob = await (await fetch(uri)).blob();
  const res = await fetch(url, { method: 'PUT', headers, body: blob });
  if (!res.ok) throw new ApiError(res.status, `photo upload HTTP ${res.status}`);
}
