// services/drive/transfersClient.ts — Client helpers for Plajah Drive "Send" expiring & passworded transfers.

import { formatBytes } from './client';
import { MULTIPART_FROM } from './transfers';

export interface SendTransferSummary {
  id: string;
  title: string;
  message: string;
  days: number;
  totalBytes: number;
  status: string;
  createdAt: number;
  expiresAt: number;
  maxDownloads: number | null;
  downloadCount: number;
  passwordProtected: boolean;
  files: Array<{ fileId: string; name: string; size: number; mime: string }>;
}

export interface PublicTransferInfo {
  id: string;
  title: string;
  message: string;
  passwordRequired: boolean;
  locked: boolean;
  expiresAt: number;
  totalBytes: number;
  downloadCount: number;
  maxDownloads: number | null;
  unlockToken?: string;
  files: Array<{ fileId: string; name: string; size: number; mime: string; downloadUrl?: string }>;
}

export function createTransfersApi(getToken: () => Promise<string | null>, baseUrl = '') {
  async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (auth) {
      const tok = await getToken();
      if (!tok) throw new Error('Sign in required for Send Transfers.');
      headers.set('Authorization', `Bearer ${tok}`);
    }
    const res = await fetch(`${baseUrl}/api/drive/transfers${path}`, { ...init, headers });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    return data as T;
  }

  return {
    listMine(): Promise<{ transfers: SendTransferSummary[] }> {
      return call('/', {}, true);
    },

    revoke(transferId: string): Promise<{ revoked: true }> {
      return call(`/${encodeURIComponent(transferId)}`, { method: 'DELETE' }, true);
    },

    async sendFiles(opts: {
      files: File[];
      title?: string;
      message?: string;
      days?: number;
      password?: string;
      maxDownloads?: number;
      onProgress?: (pct: number, label: string) => void;
    }): Promise<{ transferId: string; shareUrl: string; expiresAt: number }> {
      const { files, title, message, days = 7, password, maxDownloads, onProgress } = opts;
      if (!files.length) throw new Error('Select at least one file to send.');
      onProgress?.(5, 'Allocating transfer links…');
      const begin = await call<{
        transferId: string;
        expiresAt: number;
        files: Array<{
          fileId: string;
          name: string;
          size: number;
          mime: string;
          mode: 'single' | 'multipart';
          url?: string;
          headers?: Record<string, string>;
          uploadId?: string;
          partSize?: number;
          parts?: number;
        }>;
      }>(
        '/',
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            message,
            days,
            password: password || undefined,
            maxDownloads: maxDownloads || undefined,
            files: files.map(f => ({ name: f.name, size: f.size, mime: f.type || 'application/octet-stream' })),
          }),
        },
        true,
      );

      const totalAll = Math.max(1, files.reduce((s, f) => s + f.size, 0));
      let uploadedSoFar = 0;
      const multiparts: Record<string, Array<{ partNumber: number; etag: string }>> = {};

      for (let i = 0; i < begin.files.length; i++) {
        const plan = begin.files[i];
        const file = files[i];
        onProgress?.(Math.round((uploadedSoFar / totalAll) * 90) + 5, `Uploading ${file.name} (${formatBytes(file.size)})…`);
        if (plan.mode === 'single' && plan.url) {
          const putRes = await fetch(plan.url, {
            method: 'PUT',
            headers: plan.headers || { 'Content-Type': plan.mime },
            body: file,
          });
          if (!putRes.ok) throw new Error(`Upload failed for ${file.name} (${putRes.status})`);
          uploadedSoFar += file.size;
        } else if (plan.mode === 'multipart' && plan.partSize && plan.parts) {
          const completedParts: Array<{ partNumber: number; etag: string }> = [];
          const partNums = Array.from({ length: plan.parts }, (_, idx) => idx + 1);
          for (let batchStart = 0; batchStart < partNums.length; batchStart += 100) {
            const batch = partNums.slice(batchStart, batchStart + 100);
            const signed = await call<{ urls: Array<{ partNumber: number; url: string }> }>(
              `/${encodeURIComponent(begin.transferId)}/parts`,
              { method: 'POST', body: JSON.stringify({ fileId: plan.fileId, partNumbers: batch }) },
              true,
            );
            for (const item of signed.urls) {
              const start = (item.partNumber - 1) * plan.partSize;
              const end = Math.min(file.size, start + plan.partSize);
              const slice = file.slice(start, end);
              const partRes = await fetch(item.url, { method: 'PUT', body: slice });
              if (!partRes.ok) throw new Error(`Part ${item.partNumber} failed for ${file.name}`);
              const etag = partRes.headers.get('etag') || partRes.headers.get('ETag') || '';
              if (!etag) throw new Error(`Missing ETag header from storage for ${file.name}`);
              completedParts.push({ partNumber: item.partNumber, etag });
              uploadedSoFar += end - start;
              onProgress?.(Math.min(95, Math.round((uploadedSoFar / totalAll) * 90) + 5), `Uploading ${file.name}…`);
            }
          }
          multiparts[plan.fileId] = completedParts;
        } else if (file.size >= MULTIPART_FROM) {
          throw new Error(`Invalid transfer upload plan for ${file.name}`);
        }
      }

      onProgress?.(97, 'Finalizing transfer…');
      await call(`/${encodeURIComponent(begin.transferId)}/complete`, {
        method: 'POST',
        body: JSON.stringify({ multiparts }),
      }, true);
      onProgress?.(100, 'Transfer ready');

      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com';
      return {
        transferId: begin.transferId,
        shareUrl: `${origin}/?view=transfer&id=${encodeURIComponent(begin.transferId)}`,
        expiresAt: begin.expiresAt,
      };
    },

    inspectPublic(transferId: string, opts?: { token?: string; countDownload?: boolean; inline?: boolean }): Promise<PublicTransferInfo> {
      const qs = new URLSearchParams();
      if (opts?.countDownload) qs.set('download', '1');
      if (opts?.inline) qs.set('inline', '1');
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return call(`/${encodeURIComponent(transferId)}${query}`, {
        headers: opts?.token ? { 'X-Transfer-Token': opts.token } : undefined,
      }, false);
    },

    verifyPassword(transferId: string, password: string): Promise<PublicTransferInfo & { unlockToken: string }> {
      return call(`/${encodeURIComponent(transferId)}/verify`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }, false);
    },
  };
}
