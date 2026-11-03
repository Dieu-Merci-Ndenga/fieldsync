import { Api, HistoryItem, LocalPhoto, PushResult } from './core/types';

export function createApi(baseUrl: string, userId: string, token = ''): Api {
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const headers = { 'Content-Type': 'application/json', 'x-user-id': userId, ...auth };

  async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }
  const timeout = () => AbortSignal.timeout(15000);

  return {
    push: (ops) =>
      fetch(`${baseUrl}/sync/push`, { method: 'POST', headers, body: JSON.stringify({ ops }), signal: timeout() }).then(
        (r) => json<PushResult[]>(r),
      ),
    pull: (cursor) =>
      fetch(`${baseUrl}/sync/pull?cursor=${cursor}`, { headers, signal: timeout() }).then((r) => json(r)),
    async uploadPhoto(p: LocalPhoto) {
      const blob = await (await fetch(p.uri)).blob();
      const res = await fetch(`${baseUrl}/photos/${p.id}?inspectionId=${p.inspectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': p.mime, 'x-user-id': userId, ...auth },
        body: blob,
      });
      if (!res.ok) throw new Error(`photo upload HTTP ${res.status}`);
    },
    history: (id) =>
      fetch(`${baseUrl}/inspections/${id}/history`, { headers, signal: timeout() }).then((r) => json<HistoryItem[]>(r)),
  };
}
